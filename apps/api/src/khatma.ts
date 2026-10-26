/**
 * Khatma et wird (26/10/2026, interrupteur `khatma_wird`, coupé par défaut) :
 *  - plan d'une personne (durée, ou pages par jour) ou wird quotidien ; avancement et POSITION EXACTE (sourate, verset)
 *    gardés sur le serveur : la reprise est la même sur tous les appareils ;
 *  - khatma en FAMILLE (parts réparties entre les profils d'un compte) ou en CLASSE (entre les élèves) : parts en juzʾ
 *    entiers (30 au plus) sinon en tranches de pages, fin commune ; le participant ne voit que le TOTAL du groupe, jamais
 *    la part des autres ; seul le responsable (parent, enseignant) voit les parts, sans pourcentage en « mode serein » ;
 *    aucun classement, nulle part ;
 *  - rappel discret : une notification à l'heure choisie, une fois par jour au plus, jamais pendant les heures calmes
 *    (travailleur, `dueNotifications`), seulement si le titulaire l'a accepté (`PUT /api/v1/khatma/rappel`).
 * Le texte coranique n'est jamais touché ici : seulement des numéros de pages et de versets.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  classMembers,
  confierPartKhatma,
  createKhatma,
  classEvalMode,
  effectiveEvalMode,
  getKhatma,
  getKhatmaPart,
  KHATMA_JOURS_MAX,
  KHATMA_PPD_MAX,
  khatmaGroupSummary,
  patchKhatma,
  profileKhatmas,
  recordKhatmaProgress,
  schema as t,
  suiviKhatma,
  teacherClass,
  type Db,
  type KhatmaInput,
  type KhatmaPartRow,
  type KhatmaRow,
} from '@awform/db';
import { ownsProfile } from './auth/routes.js';
import { audit, staffOnly } from './auth/service.js';
import { exigeFonction } from './f5.js';
import { err, familyProfile, needTeacher, parentGate, UUID } from './guards.js';

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const ERREURS: Record<string, number> = {
  plan_invalide: 400,
  date_invalide: 400,
  duree_invalide: 400,
  rythme_invalide: 400,
  participants_invalides: 400,
  classe_requise: 400,
  rappel_invalide: 400,
  rappel_accord_requis: 400,
  titre_invalide: 400,
  avancement_invalide: 400,
  trop_de_plans: 409,
};

/** erreurs métier connues → réponse 4xx ; autre erreur : relancée */
const metier = (reply: FastifyReply, e: unknown) => {
  const code = e instanceof Error ? e.message : '';
  if (code in ERREURS) return err(reply, ERREURS[code]!, code);
  throw e;
};

function vuePlan(k: KhatmaRow, p: KhatmaPartRow, moi: string, groupe: unknown) {
  return {
    id: k.id,
    kind: k.kind,
    scope: k.scope,
    mode: k.mode,
    title: k.title,
    startDate: k.startDate,
    endDate: k.endDate,
    pagesPerDay: k.pagesPerDay,
    status: k.status,
    reminderHour: k.reminderHour,
    doneAt: k.doneAt,
    responsable: k.ownerAccountId === moi,
    classId: k.classId,
    part: {
      firstPage: p.firstPage,
      lastPage: p.lastPage,
      done: p.done,
      doneDayStart: p.doneDayStart,
      dayMark: p.dayMark,
      sura: p.posSura,
      aya: p.posAya,
      finished: !!p.finishedAt,
    },
    groupe,
  };
}

export function registerKhatma(app: FastifyInstance, db: Db): void {
  const needAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
  };
  /** profil de la famille + fonction ouverte ; sinon le refus est envoyé et on renvoie null */
  const famille = async (req: FastifyRequest, reply: FastifyReply, id: string) => {
    const p = await familyProfile(db, req, reply, id);
    if (!p) return null;
    if (!(await exigeFonction(db, req, reply, 'khatma_wird', p.id))) return null;
    return p;
  };
  const sereinDe = async (profileId: string) =>
    (await effectiveEvalMode(db, profileId, 'coran'))?.mode === 'serein';

  // ---------------------------------------------------------------- une personne

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/khatma',
    {
      preHandler: needAuth,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const p = await famille(req, reply, req.params.id);
      if (!p) return reply;
      const moi = req.auth!.accountId;
      const plans = await profileKhatmas(db, p.id);
      const [pref] = await db
        .select({ khatma: t.notificationPref.khatma })
        .from(t.notificationPref)
        .where(eq(t.notificationPref.accountId, moi));
      return {
        plans: plans.map((x) => vuePlan(x.khatma, x.part, moi, x.groupe)),
        serein: await sereinDe(p.id),
        rappel: pref?.khatma ?? false,
        limites: { joursMax: KHATMA_JOURS_MAX, pagesParJourMax: KHATMA_PPD_MAX },
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      kind: 'khatma' | 'wird';
      mode: 'duree' | 'pages' | 'wird';
      startDate: string;
      endDate?: string;
      pagesPerDay?: number;
      title?: string;
      reminderHour?: number | null;
      seedDone?: number;
      seedSura?: number;
      seedAya?: number;
    };
  }>(
    '/api/v1/profiles/:id/khatma',
    {
      preHandler: needAuth,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['kind', 'mode', 'startDate'],
          additionalProperties: false,
          properties: {
            kind: { enum: ['khatma', 'wird'] },
            mode: { enum: ['duree', 'pages', 'wird'] },
            startDate: { type: 'string', pattern: DAY },
            endDate: { type: 'string', pattern: DAY },
            pagesPerDay: { type: 'integer', minimum: 1, maximum: KHATMA_PPD_MAX },
            title: { type: 'string', maxLength: 40 },
            reminderHour: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 23 }, { type: 'null' }],
            },
            seedDone: { type: 'integer', minimum: 0, maximum: 603 },
            seedSura: { type: 'integer', minimum: 1, maximum: 114 },
            seedAya: { type: 'integer', minimum: 1, maximum: 286 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await famille(req, reply, req.params.id);
      if (!p) return reply;
      const b = req.body;
      const input: KhatmaInput = {
        kind: b.kind,
        scope: 'profil',
        ownerAccountId: req.auth!.accountId,
        title: b.title ?? null,
        mode: b.mode,
        startDate: b.startDate,
        endDate: b.endDate ?? null,
        pagesPerDay: b.pagesPerDay ?? null,
        reminderHour: b.reminderHour ?? null,
        profileIds: [p.id],
        seedDone: b.seedDone ?? 0,
        seedSura: b.seedSura ?? null,
        seedAya: b.seedAya ?? null,
      };
      try {
        const r = await createKhatma(db, input);
        await audit(db, req.auth!.accountId, 'khatma.creation', r.khatma.id, {
          kind: b.kind,
          mode: b.mode,
          profil: p.id,
        });
        return reply
          .code(201)
          .send({ plan: vuePlan(r.khatma, r.parts[0]!, req.auth!.accountId, null) });
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  app.put<{
    Params: { id: string; kid: string };
    Body: { done: number; day: string; sura?: number; aya?: number; corrige?: boolean };
  }>(
    '/api/v1/profiles/:id/khatma/:kid/progression',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          required: ['id', 'kid'],
          properties: { id: UUID, kid: UUID },
        },
        body: {
          type: 'object',
          required: ['done', 'day'],
          additionalProperties: false,
          properties: {
            done: { type: 'integer', minimum: 0, maximum: 604 * 400 },
            day: { type: 'string', pattern: DAY },
            sura: { type: 'integer', minimum: 1, maximum: 114 },
            aya: { type: 'integer', minimum: 1, maximum: 286 },
            corrige: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await famille(req, reply, req.params.id);
      if (!p) return reply;
      try {
        const r = await recordKhatmaProgress(db, req.params.kid, p.id, {
          done: req.body.done,
          day: req.body.day,
          sura: req.body.sura ?? null,
          aya: req.body.aya ?? null,
          corrige: req.body.corrige === true,
        });
        if (!r) return err(reply, 404, 'introuvable');
        return { plan: vuePlan(r.khatma, r.part, req.auth!.accountId, r.groupe) };
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  /** modifier (fin, rythme, rappel, titre) ou archiver : le responsable du plan, c'est-à-dire son créateur */
  app.patch<{
    Params: { id: string; kid: string };
    Body: {
      endDate?: string;
      pagesPerDay?: number;
      reminderHour?: number | null;
      title?: string | null;
      status?: 'archivee';
    };
  }>(
    '/api/v1/profiles/:id/khatma/:kid',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          required: ['id', 'kid'],
          properties: { id: UUID, kid: UUID },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            endDate: { type: 'string', pattern: DAY },
            pagesPerDay: { type: 'integer', minimum: 1, maximum: KHATMA_PPD_MAX },
            reminderHour: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 23 }, { type: 'null' }],
            },
            title: { anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }] },
            status: { enum: ['archivee'] },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await famille(req, reply, req.params.id);
      if (!p) return reply;
      const part = await getKhatmaPart(db, req.params.kid, p.id);
      const k = part ? await getKhatma(db, req.params.kid) : null;
      if (!k) return err(reply, 404, 'introuvable');
      // un participant d'un groupe peut seulement changer SON rappel ; le reste est au responsable du plan
      const mine = k.ownerAccountId === req.auth!.accountId;
      const keys = Object.keys(req.body);
      if (!mine && !(keys.length === 1 && keys[0] === 'reminderHour'))
        return err(reply, 403, 'reserve_au_responsable');
      try {
        const row = await patchKhatma(db, k.id, req.body);
        if (!row) return err(reply, 404, 'introuvable');
        await audit(db, req.auth!.accountId, 'khatma.modification', k.id, keys);
        return {
          plan: vuePlan(
            row,
            part!,
            req.auth!.accountId,
            row.scope === 'profil' ? null : await khatmaGroupSummary(db, row.id),
          ),
        };
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  // ---------------------------------------------------------------- rappel discret (compte)

  app.put<{ Body: { actif: boolean; accord?: boolean; profileId?: string } }>(
    '/api/v1/khatma/rappel',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          required: ['actif'],
          additionalProperties: false,
          properties: {
            actif: { type: 'boolean' },
            accord: { type: 'boolean' },
            profileId: UUID,
          },
        },
      },
    },
    async (req, reply) => {
      if (staffOnly(req.auth) || (req.auth!.kind === 'ecole' && !req.auth!.tablet))
        return err(reply, 403, 'reserve_aux_familles');
      if (!(await exigeFonction(db, req, reply, 'khatma_wird'))) return reply;
      // 26/10/2026 : pas de rappel sans accord. Activer exige ccord: true (écran de consentement) ; pour un enfant,
      // c'est le parent qui accepte (code parent s'il existe). Désactiver est toujours permis, sans condition.
      if (req.body.actif) {
        if (req.body.accord !== true) return err(reply, 400, 'rappel_accord_requis');
        if (req.body.profileId) {
          const p = await familyProfile(db, req, reply, req.body.profileId);
          if (!p) return reply;
          if (!(await parentGate(db, req, reply, p.kind))) return reply;
        }
      }
      await db
        .insert(t.notificationPref)
        .values({ accountId: req.auth!.accountId, khatma: req.body.actif })
        .onConflictDoUpdate({
          target: t.notificationPref.accountId,
          set: { khatma: req.body.actif, updatedAt: new Date() },
        });
      await audit(db, req.auth!.accountId, 'khatma.rappel', req.auth!.accountId, {
        actif: req.body.actif,
        accord: req.body.actif ? true : undefined,
      });
      return { ok: true, actif: req.body.actif };
    },
  );

  // ---------------------------------------------------------------- famille

  const corpsGroupe = {
    type: 'object',
    required: ['startDate', 'endDate'],
    additionalProperties: false,
    properties: {
      startDate: { type: 'string', pattern: DAY },
      endDate: { type: 'string', pattern: DAY },
      title: { type: 'string', maxLength: 40 },
      reminderHour: { anyOf: [{ type: 'integer', minimum: 0, maximum: 23 }, { type: 'null' }] },
    },
  } as const;

  app.post<{
    Body: {
      startDate: string;
      endDate: string;
      title?: string;
      reminderHour?: number | null;
      profileIds: string[];
    };
  }>(
    '/api/v1/khatma/famille',
    {
      preHandler: needAuth,
      schema: {
        body: {
          ...corpsGroupe,
          required: [...corpsGroupe.required, 'profileIds'],
          properties: {
            ...corpsGroupe.properties,
            profileIds: {
              type: 'array',
              items: UUID,
              minItems: 2,
              maxItems: 60,
              uniqueItems: true,
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (staffOnly(req.auth) || (req.auth!.kind === 'ecole' && !req.auth!.tablet))
        return err(reply, 403, 'reserve_aux_familles');
      for (const id of req.body.profileIds)
        if (!(await ownsProfile(db, req.auth, id))) return err(reply, 404, 'introuvable');
      if (!(await exigeFonction(db, req, reply, 'khatma_wird', req.body.profileIds[0]!)))
        return reply;
      try {
        const r = await createKhatma(db, {
          kind: 'khatma',
          scope: 'famille',
          ownerAccountId: req.auth!.accountId,
          title: req.body.title ?? null,
          mode: 'duree',
          startDate: req.body.startDate,
          endDate: req.body.endDate,
          reminderHour: req.body.reminderHour ?? null,
          profileIds: req.body.profileIds,
        });
        await audit(db, req.auth!.accountId, 'khatma.creation', r.khatma.id, {
          scope: 'famille',
          parts: r.parts.length,
        });
        return reply.code(201).send({ id: r.khatma.id, parts: r.parts.length });
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  // ---------------------------------------------------------------- classe (enseignant)

  app.post<{
    Params: { id: string };
    Body: { startDate: string; endDate: string; title?: string; reminderHour?: number | null };
  }>(
    '/api/v1/ecole/classes/:id/khatma',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: corpsGroupe,
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls || cls.status !== 'active') return err(reply, 404, 'introuvable');
      if (!(await exigeFonction(db, req, reply, 'khatma_wird', null))) return reply;
      const membres = await classMembers(db, cls.id);
      try {
        const r = await createKhatma(db, {
          kind: 'khatma',
          scope: 'classe',
          ownerAccountId: req.auth!.accountId,
          classId: cls.id,
          title: req.body.title ?? cls.name.slice(0, 40),
          mode: 'duree',
          startDate: req.body.startDate,
          endDate: req.body.endDate,
          reminderHour: req.body.reminderHour ?? null,
          profileIds: membres.map((m) => m.id),
        });
        await audit(db, req.auth!.accountId, 'khatma.creation', r.khatma.id, {
          scope: 'classe',
          classe: cls.id,
          parts: r.parts.length,
        });
        return reply.code(201).send({ id: r.khatma.id, parts: r.parts.length });
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/khatma',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      if (!(await exigeFonction(db, req, reply, 'khatma_wird', null))) return reply;
      const rows = await db.select().from(t.khatma).where(eq(t.khatma.classId, cls.id));
      const out = [];
      for (const k of rows.filter((x) => x.status !== 'archivee'))
        out.push({
          id: k.id,
          title: k.title,
          startDate: k.startDate,
          endDate: k.endDate,
          status: k.status,
          groupe: await khatmaGroupSummary(db, k.id),
        });
      return {
        khatmas: out,
        serein: (await classEvalMode(db, cls.id)) === 'serein',
        // élèves inscrits : ceux qui recevront une part d'une nouvelle khatma
        eleves: (await classMembers(db, cls.id)).length,
      };
    },
  );

  // ---------------------------------------------------------------- suivi par le responsable

  /** le responsable d'un groupe : parent (famille), enseignant de la classe (classe) */
  const responsable = async (req: FastifyRequest, k: KhatmaRow) => {
    if (k.scope === 'famille') return k.ownerAccountId === req.auth!.accountId;
    if (k.scope === 'classe' && k.classId)
      return !!(await teacherClass(db, req.auth!.accountId, k.classId));
    return false;
  };

  app.get<{ Params: { kid: string } }>(
    '/api/v1/khatma/:kid/suivi',
    {
      preHandler: needAuth,
      schema: { params: { type: 'object', required: ['kid'], properties: { kid: UUID } } },
    },
    async (req, reply) => {
      const k = await getKhatma(db, req.params.kid);
      if (!k || !(await responsable(req, k))) return err(reply, 404, 'introuvable');
      if (k.scope === 'classe') {
        if (!req.auth!.mfaVerified)
          return err(reply, 403, req.auth!.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
      }
      if (!(await exigeFonction(db, req, reply, 'khatma_wird', null))) return reply;
      const membres = await suiviKhatma(db, k.id);
      const serein =
        k.scope === 'classe' && k.classId
          ? (await classEvalMode(db, k.classId)) === 'serein'
          : false;
      // profils du groupe qui n'ont pas de part (une part peut leur être confiée)
      const prises = new Set(membres.map((m) => m.profileId));
      const candidats =
        k.scope === 'classe' && k.classId
          ? (await classMembers(db, k.classId)).map((m) => ({ id: m.id, pseudonym: m.pseudonym }))
          : await db
              .select({ id: t.profile.id, pseudonym: t.profile.pseudonym })
              .from(t.profile)
              .where(eq(t.profile.ownerAccountId, k.ownerAccountId));
      return {
        id: k.id,
        title: k.title,
        status: k.status,
        startDate: k.startDate,
        endDate: k.endDate,
        groupe: await khatmaGroupSummary(db, k.id),
        disponibles: candidats
          .filter((p) => !prises.has(p.id))
          .map((p) => ({ profileId: p.id, pseudonym: p.pseudonym })),
        serein,
        // « mode serein » : aucune part chiffrée, seulement lue ou en cours ; jamais de classement (ordre du Muṣḥaf)
        membres: membres.map((m) => ({
          profileId: m.profileId,
          pseudonym: m.pseudonym,
          firstPage: m.firstPage,
          lastPage: m.lastPage,
          terminee: m.terminee,
          ...(serein ? {} : { done: m.done }),
        })),
      };
    },
  );

  app.post<{ Params: { kid: string }; Body: { de: string; vers: string } }>(
    '/api/v1/khatma/:kid/confier',
    {
      preHandler: needAuth,
      schema: {
        params: { type: 'object', required: ['kid'], properties: { kid: UUID } },
        body: {
          type: 'object',
          required: ['de', 'vers'],
          additionalProperties: false,
          properties: { de: UUID, vers: UUID },
        },
      },
    },
    async (req, reply) => {
      const k = await getKhatma(db, req.params.kid);
      if (!k || !(await responsable(req, k))) return err(reply, 404, 'introuvable');
      if (!(await exigeFonction(db, req, reply, 'khatma_wird', null))) return reply;
      // le nouveau titulaire de la part est déjà un profil du groupe (classe : élève inscrit ; famille : profil du compte)
      const ok =
        k.scope === 'famille'
          ? await ownsProfile(db, req.auth, req.body.vers)
          : !!k.classId && (await classMembers(db, k.classId)).some((m) => m.id === req.body.vers);
      if (!ok) return err(reply, 404, 'introuvable');
      if (!(await confierPartKhatma(db, k.id, req.body.de, req.body.vers)))
        return err(reply, 409, 'part_non_transferable');
      await audit(db, req.auth!.accountId, 'khatma.part_confiee', k.id);
      return { ok: true };
    },
  );

  app.delete<{ Params: { kid: string } }>(
    '/api/v1/khatma/:kid',
    {
      preHandler: needAuth,
      schema: { params: { type: 'object', required: ['kid'], properties: { kid: UUID } } },
    },
    async (req, reply) => {
      const k = await getKhatma(db, req.params.kid);
      if (!k || !(await responsable(req, k))) return err(reply, 404, 'introuvable');
      if (!(await exigeFonction(db, req, reply, 'khatma_wird', null))) return reply;
      await patchKhatma(db, k.id, { status: 'archivee' });
      await audit(db, req.auth!.accountId, 'khatma.archivee', k.id);
      return { ok: true };
    },
  );
}
