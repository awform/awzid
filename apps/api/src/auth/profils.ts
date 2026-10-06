/**
 * Profils de la famille et code parent (QUA-3, découpé de auth/routes.ts sans changement de comportement) :
 * profil d'enfant avec consentement parental (ré-authentification du parent), modification, suppression ;
 * code parent de l'appareil partagé.
 */
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { addParentCustodian, canActForProfile, schema as t, setProfileLevel } from '@awform/db';
import { profileKindFromYear } from '@awform/content';
import { hashSecret, verifySecret } from './crypto.js';
import {
  ageFromYear,
  closedForAge,
  lawEvidence,
  requiredChildConsents,
  type ConsentType,
} from './policy.js';
import { audit, clearFailures, failAttempt, reserveAttempt, lockedUntil } from './service.js';

import { AVATARS, err, OPTIONAL_CONSENTS, YEAR, type AuthKit } from './common.js';

export function registerProfiles(app: FastifyInstance, kit: AuthKit): void {
  const { db, needAuth, needParent, passwordOk, insertConsents, me } = kit;
  // ---------------------------------------------------------------- profils

  app.get('/api/v1/profiles', { preHandler: needAuth }, async (req) => {
    const m = await me(req.auth!.accountId, req.auth!.mfaVerified, req.auth!.tablet);
    return { profiles: m?.profiles ?? [] };
  });

  app.post<{
    Body: {
      pseudonym: string;
      birthYear: number;
      avatar?: string;
      levelCode?: string;
      password: string;
      consents: string[];
    };
  }>(
    '/api/v1/profiles',
    {
      preHandler: needParent,
      schema: {
        body: {
          type: 'object',
          required: ['pseudonym', 'birthYear', 'password', 'consents'],
          additionalProperties: false,
          properties: {
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
            birthYear: YEAR,
            avatar: { enum: AVATARS },
            levelCode: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
            password: { type: 'string', maxLength: 512 },
            consents: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 40 } },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const accountId = req.auth!.accountId;
      const [a] = await db.select().from(t.account).where(eq(t.account.id, accountId));
      // vérification du parent : il ressaisit son mot de passe (preuve jointe au consentement)
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, b.password))) return reply;
      const age = ageFromYear(b.birthYear);
      if (age < 3) return err(reply, 400, 'annee_naissance_invalide');
      if (age >= 18) return err(reply, 400, 'adulte_compte_personnel');
      const country = a.country ?? '';
      // lot F3 (revue G3) : États-Unis, moins de 13 ans : fermé au lancement
      if (closedForAge(country, age))
        return err(reply, 403, 'ferme_moins_13', { age: 13, pays: country });
      const missing = requiredChildConsents(country, age).filter((c) => !b.consents.includes(c));
      if (missing.length) return err(reply, 400, 'consentement_requis', { missing });
      if (b.levelCode) {
        const lv = await db
          .select({ c: t.level.code })
          .from(t.level)
          .where(eq(t.level.code, b.levelCode));
        if (!lv[0]) return err(reply, 400, 'niveau_inconnu');
      }
      const [p] = await db
        .insert(t.profile)
        .values({
          ownerAccountId: accountId,
          kind: profileKindFromYear(b.birthYear) === 'enfant' ? 'enfant' : 'ado',
          pseudonym: b.pseudonym.trim(),
          birthYear: b.birthYear,
          avatar: b.avatar ?? 'etoile',
          levelCode: b.levelCode ?? null,
        })
        .returning({ id: t.profile.id });
      if (!p) throw new Error('création du profil impossible');
      // lot F2 (revue E3, E4) : le parent est responsable « actif » (profile_custodian, lu par les autorisations)
      await addParentCustodian(
        db,
        p.id,
        accountId,
        { methode: 'reauthentification_mot_de_passe+declaration', date: new Date().toISOString() },
        accountId,
      );
      if (b.levelCode) await setProfileLevel(db, p.id, b.levelCode, 'inscription', accountId);
      const evidence = {
        methode: 'reauthentification_mot_de_passe+declaration',
        date: new Date().toISOString(),
        age_declare: age,
        // audit MIN-17 : règles du pays appliquées aux profils
        ...lawEvidence(country),
      };
      await insertConsents(
        accountId,
        b.consents.filter(
          (c) =>
            requiredChildConsents(country, age).includes(c as ConsentType) ||
            OPTIONAL_CONSENTS.has(c),
        ),
        country,
        p.id,
        evidence,
      );
      await audit(db, accountId, 'profil.creation', p.id, { age, country });
      return reply.code(201).send({ id: p.id });
    },
  );

  const ownProfile = async (accountId: string, profileId: string) => {
    const [p] = await db
      .select()
      .from(t.profile)
      .where(and(eq(t.profile.id, profileId), eq(t.profile.ownerAccountId, accountId)));
    return p ?? null;
  };
  /** lot F2 : titulaire OU parent responsable (second parent) — modification du profil */
  const guardedProfile = async (accountId: string, profileId: string) => {
    if (!(await canActForProfile(db, accountId, profileId))) return null;
    const [p] = await db.select().from(t.profile).where(eq(t.profile.id, profileId));
    return p ?? null;
  };

  app.patch<{
    Params: { id: string };
    Body: { pseudonym?: string; avatar?: string; levelCode?: string; explanationLocale?: string };
  }>(
    '/api/v1/profiles/:id',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
            avatar: { enum: AVATARS },
            levelCode: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
            // lot F1 (G1) : langue des explications du contenu (« fr » tant qu'aucune traduction n'est validée)
            explanationLocale: { type: 'string', pattern: '^[a-z]{2,3}(-[A-Z]{2})?$' },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.auth!.tablet || req.auth!.kind === 'ecole')
        return err(reply, 403, 'reserve_aux_familles');
      const p = await guardedProfile(req.auth!.accountId, req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      // lot F2 (revue E8) : le niveau choisi par la famille est historisé (matière déduite du niveau)
      if (req.body.levelCode && req.body.levelCode !== p.levelCode) {
        if (!(await setProfileLevel(db, p.id, req.body.levelCode, 'parent', req.auth!.accountId)))
          return err(reply, 400, 'niveau_inconnu');
      }
      await db
        .update(t.profile)
        .set({
          pseudonym: req.body.pseudonym ?? p.pseudonym,
          avatar: req.body.avatar ?? p.avatar,
          levelCode: req.body.levelCode ?? p.levelCode,
          explanationLocale: req.body.explanationLocale ?? p.explanationLocale,
        })
        .where(eq(t.profile.id, p.id));
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string }; Body: { password: string } }>(
    '/api/v1/profiles/:id',
    {
      preHandler: needParent,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['password'],
          properties: { password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      const p = await ownProfile(a.id, req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      await db.delete(t.attempt).where(eq(t.attempt.profileId, p.id));
      await db.delete(t.progress).where(eq(t.progress.profileId, p.id));
      await db.delete(t.profile).where(eq(t.profile.id, p.id)); // tutelle et consentements en cascade
      await audit(db, a.id, 'profil.suppression', p.id);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- code parent (appareil partagé)

  app.post<{ Body: { pin: string; password: string } }>(
    '/api/v1/account/pin',
    {
      // code parent (ou code de l'enseignant / de l'adulte) : protège les réglages d'un appareil partagé
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['pin', 'password'],
          properties: {
            pin: { type: 'string', pattern: '^[0-9]{4}$' },
            password: { type: 'string', maxLength: 512 },
          },
        },
      },
    },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      await db
        .update(t.account)
        .set({ parentPinHash: await hashSecret(req.body.pin) })
        .where(eq(t.account.id, a.id));
      await audit(db, a.id, 'code_parent.definition');
      return { ok: true };
    },
  );

  app.post<{ Body: { pin: string } }>(
    '/api/v1/account/pin/verify',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['pin'],
          properties: { pin: { type: 'string', maxLength: 8 } },
        },
      },
    },
    async (req, reply) => {
      const key = `pin:${req.auth!.accountId}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a?.parentPinHash) return err(reply, 400, 'code_parent_absent');
      // audit SEC-2 : essai réservé atomiquement avant la vérification (pas de salve)
      if (!(await reserveAttempt(db, key))) return err(reply, 429, 'verrouille');
      if (!(await verifySecret(req.body.pin, a.parentPinHash))) {
        await failAttempt(db, key);
        return err(reply, 401, 'code_parent_incorrect');
      }
      await clearFailures(db, key);
      return { ok: true };
    },
  );
}
