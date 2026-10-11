/**
 * Droits RGPD (QUA-3, découpé de auth/routes.ts sans changement de comportement) : règles du pays,
 * consentements et retrait, export complet des données, suppression du compte.
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import {
  deleteProfileRecitations,
  profileFreeAnswers,
  profileRecitations,
  exportPersonalData,
  leaveClass,
  schema as t,
  withdrawAccount,
} from '@awform/db';
import { countryRules, COUNTRY_CODE, isCountry } from './policy.js';
import { audit, clearCookie, revokeAll } from './service.js';

import { err, OPTIONAL_CONSENTS, WITHDRAWABLE_CONSENTS, type AuthKit } from './common.js';

export function registerPrivacy(app: FastifyInstance, kit: AuthKit): void {
  const { db, needAuth, passwordOk, secureFor } = kit;
  // ---------------------------------------------------------------- droits RGPD

  // règles du pays (public) : âge, accords obligatoires, loi applicable et autorité de contrôle (lot 17)
  // lot F3 (revue M9) : ?region=CA-QC — âge du consentement de la subdivision
  app.get<{ Params: { code: string }; Querystring: { region?: string } }>(
    '/api/v1/pays/:code/regles',
    async (req, reply) => {
      if (!COUNTRY_CODE.test(req.params.code) || !isCountry(req.params.code))
        return err(reply, 400, 'pays_invalide');
      reply.header('Cache-Control', 'public, max-age=3600');
      const region = typeof req.query.region === 'string' ? req.query.region.slice(0, 6) : null;
      return countryRules(req.params.code, region);
    },
  );

  app.get('/api/v1/account/consents', { preHandler: needAuth }, async (req) => {
    const rows = await db
      .select({
        id: t.consent.id,
        type: t.consent.type,
        profileId: t.consent.profileId,
        textVersion: t.consent.textVersion,
        givenAt: t.consent.givenAt,
        withdrawnAt: t.consent.withdrawnAt,
      })
      .from(t.consent)
      .where(eq(t.consent.accountId, req.auth!.accountId))
      .orderBy(asc(t.consent.givenAt));
    return {
      consents: rows.map((c) => ({
        ...c,
        optional: OPTIONAL_CONSENTS.has(c.type),
        // lot F3 : l'accord « article 9 » se retire aussi (le compte ou le profil est alors en pause)
        retirable: WITHDRAWABLE_CONSENTS.has(c.type),
      })),
    };
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/account/consents/:id/withdraw',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const [c] = await db
        .select()
        .from(t.consent)
        .where(and(eq(t.consent.id, req.params.id), eq(t.consent.accountId, req.auth!.accountId)));
      if (!c) return err(reply, 404, 'introuvable');
      // un consentement nécessaire au service se retire en supprimant le profil ou le compte — sauf l'accord
      // « article 9 » (lot F3) : retirable, il met le compte ou le profil en pause (page « Accords »)
      if (!WITHDRAWABLE_CONSENTS.has(c.type)) return err(reply, 409, 'consentement_necessaire');
      if (c.withdrawnAt) return { ok: true };
      await db.update(t.consent).set({ withdrawnAt: new Date() }).where(eq(t.consent.id, c.id));
      // retrait du partage avec l'enseignant : le profil quitte ses classes
      if (c.type === 'partage_enseignant' && c.profileId) {
        // départ de TOUTES les classes (liste, registre, réponses, copies, récitations envoyées — audit
        // MIN-11 : rien ne réapparaît chez l'enseignant après une nouvelle inscription)
        const pid = c.profileId;
        const classes = new Set([
          ...(
            await db
              .select({ c: t.classMember.classId })
              .from(t.classMember)
              .where(eq(t.classMember.profileId, pid))
          ).map((x) => x.c),
          ...(
            await db
              .select({ c: t.classPupil.classId })
              .from(t.classPupil)
              .where(eq(t.classPupil.profileId, pid))
          ).map((x) => x.c),
        ]);
        for (const cl of classes) await leaveClass(db, cl, pid);
        await deleteProfileRecitations(db, pid);
      }
      // audit MIN-9 : retrait des rappels — préférences coupées, abonnements de l'appareil effacés
      if (c.type === 'rappels') {
        await db
          .update(t.notificationPref)
          .set({ devoirs: false, rapport: false, enfants: false, updatedAt: new Date() })
          .where(eq(t.notificationPref.accountId, req.auth!.accountId));
        await db
          .delete(t.pushSubscription)
          .where(eq(t.pushSubscription.accountId, req.auth!.accountId));
      }
      // retrait de l'accord d'envoi : les récitations déjà envoyées sont effacées
      if (c.type === 'envoi_recitation' && c.profileId)
        await deleteProfileRecitations(db, c.profileId);
      await audit(db, req.auth!.accountId, 'consentement.retrait', c.id, { type: c.type });
      return { ok: true };
    },
  );

  /** Export de TOUTES les données du compte (RGPD art. 15 et 20) : fichier JSON. */
  app.get('/api/v1/account/export', { preHandler: needAuth }, async (req, reply) => {
    const id = req.auth!.accountId;
    const [a] = await db.select().from(t.account).where(eq(t.account.id, id));
    const profiles = await db.select().from(t.profile).where(eq(t.profile.ownerAccountId, id));
    const ids = profiles.map((p) => p.id);
    const attempts = [];
    const progress = [];
    const hifzPlans = [];
    const hifzEvents = [];
    const classes = [];
    const practice = [];
    const carnets = [];
    const sourates = [];
    const recitations = [];
    const freeAnswers = [];
    const recitals = [];
    for (const pid of ids) {
      // récitations envoyées : métadonnées et note (l'audio chiffré se télécharge depuis l'application)
      recitations.push(...(await profileRecitations(db, pid)));
      freeAnswers.push(...(await profileFreeAnswers(db, pid)));
      attempts.push(...(await db.select().from(t.attempt).where(eq(t.attempt.profileId, pid))));
      progress.push(...(await db.select().from(t.progress).where(eq(t.progress.profileId, pid))));
      hifzPlans.push(...(await db.select().from(t.hifzPlan).where(eq(t.hifzPlan.profileId, pid))));
      hifzEvents.push(
        ...(await db.select().from(t.hifzEvent).where(eq(t.hifzEvent.profileId, pid))),
      );
      practice.push(
        ...(await db.select().from(t.practiceEvent).where(eq(t.practiceEvent.profileId, pid))),
      );
      classes.push(
        ...(await db.select().from(t.classMember).where(eq(t.classMember.profileId, pid))),
      );
      // lot 22 : carnet de pratique (cases et signatures) et suivi des sourates
      carnets.push(
        ...(await db.select().from(t.practiceCheck).where(eq(t.practiceCheck.profileId, pid))),
        ...(await db
          .select()
          .from(t.practiceSignature)
          .where(eq(t.practiceSignature.profileId, pid))),
      );
      sourates.push(
        ...(await db.select().from(t.suraProgress).where(eq(t.suraProgress.profileId, pid))),
      );
      // suite V1-b : passages au récital de hifẓ (tirage, compteurs, note)
      recitals.push(
        ...(await db
          .select({
            titre: t.hifzRecital.title,
            jour: t.hifzRecital.day,
            publie: t.hifzRecital.publishedAt,
            parcours: t.hifzRecitalEntry.parcours,
            tires: t.hifzRecitalEntry.drawn,
            choix: t.hifzRecitalEntry.choice,
            compteurs: t.hifzRecitalEntry.counters,
            note: t.hifzRecitalEntry.note,
          })
          .from(t.hifzRecitalEntry)
          .innerJoin(t.hifzRecital, eq(t.hifzRecital.id, t.hifzRecitalEntry.recitalId))
          .innerJoin(t.classPupil, eq(t.classPupil.id, t.hifzRecitalEntry.pupilId))
          .where(eq(t.classPupil.profileId, pid))),
      );
    }
    const consents = await db.select().from(t.consent).where(eq(t.consent.accountId, id));
    const sessions = await db
      .select({
        createdAt: t.session.createdAt,
        expiresAt: t.session.expiresAt,
        revokedAt: t.session.revokedAt,
      })
      .from(t.session)
      .where(eq(t.session.accountId, id));
    await audit(db, id, 'donnees.export');
    reply
      .header('Content-Disposition', `attachment; filename="awform-mes-donnees.json"`)
      .type('application/json; charset=utf-8');
    return {
      exporteLe: new Date().toISOString(),
      compte: {
        id: a?.id,
        type: a?.kind,
        email: a?.email,
        pays: a?.country,
        langue: a?.locale,
        anneeNaissance: a?.birthYear,
        creeLe: a?.createdAt,
        deuxFacteurs: a?.totpEnabled,
        // lot F3 : adresse vérifiée le, subdivision, fuseau horaire, région d'hébergement des données
        emailVerifieLe: a?.emailVerifiedAt ?? null,
        region: a?.region ?? null,
        fuseauHoraire: a?.tz ?? null,
        regionDesDonnees: a?.dataRegion,
      },
      profils: profiles,
      consentements: consents,
      progression: progress,
      reponses: attempts,
      hifz: { plans: hifzPlans, journal: hifzEvents, classes },
      entrainement: practice,
      carnetDePratique: carnets,
      suiviDesSourates: sourates,
      recitalsDeHifz: recitals,
      accesParCode: await db
        .select({
          niveau: t.levelPass.levelCode,
          debut: t.levelPass.startsAt,
          fin: t.levelPass.endsAt,
        })
        .from(t.levelPass)
        .where(eq(t.levelPass.accountId, id)),
      recitationsEnvoyees: recitations,
      reponsesLibres: freeAnswers,
      notifications: await db
        .select()
        .from(t.notificationPref)
        .where(eq(t.notificationPref.accountId, id)),
      sessions,
      // audit MIN-6 : toutes les tables rattachées à la personne, découvertes depuis le schéma
      donnees: await exportPersonalData(db, id),
    };
  });

  /** Suppression du compte : immédiate pour l'accès, effacement définitif sous 30 jours (purge). */
  app.post<{ Body: { password: string } }>(
    '/api/v1/account/delete',
    {
      preHandler: needAuth,
      schema: {
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
      // audit MIN-14 : l'adresse e-mail est effacée AUSSITÔT (réinscription possible, rien à deviner pendant
      // les 30 jours qui précèdent l'effacement définitif)
      await db
        .update(t.account)
        .set({ deletedAt: new Date(), email: null })
        .where(eq(t.account.id, a.id));
      await withdrawAccount(db, a.id);
      await revokeAll(db, a.id);
      // lot F3 : plus aucun lien envoyé par e-mail ne vaut (réinitialisation, vérification)
      await db.delete(t.accountToken).where(eq(t.accountToken.accountId, a.id));
      await audit(db, a.id, 'compte.suppression_demandee');
      reply.header('Set-Cookie', clearCookie(secureFor(req)));
      return { ok: true, effacementDefinitif: new Date(Date.now() + 30 * 86400_000).toISOString() };
    },
  );
}
