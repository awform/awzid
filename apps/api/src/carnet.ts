/**
 * Lot 22 (V1-c) — carnet de pratique et suivi des sourates (CDC §2.3, collection Religion).
 *
 *  - Carnet de pratique : les lignes et le nombre de jours viennent UNIQUEMENT de l'exercice `carnet` du livre
 *    (édition servie) ; l'enfant coche ses cases, le parent signe la semaine avec son code parent, vérifié ici
 *    (jamais sur l'appareil). Une semaine signée est close. Jamais de note ni de message culpabilisant.
 *  - Suivi des sourates : la liste vient des livres (`book.js` → `sourates`), jamais saisie ; la famille coche
 *    « j'écoute », « je répète », « je récite seul » ; seul l'enseignant de la classe pose « validé ».
 *    L'application ne reproduit pas la sourate : elle renvoie au lecteur (texte Tanzil tel quel).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { schema as t, teacherClass, type Db } from '@awform/db';
import { audit } from './auth/service.js';
import { err, familyProfile, needTeacher, parentGate, UUID } from './guards.js';
import { mondayOf } from './today.js';

type Edition = () => Promise<{ id: string; code: string } | null>;

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const EXO = '^[a-z0-9]+\\.l\\d{2,3}\\.ex\\d{1,3}$';

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Lignes et jours d'un exercice `carnet` du livre (formes tolérées : `lignes[{ar, fr}]` ou chaînes). */
export function carnetShape(content: unknown): {
  jours: number;
  lignes: Array<{ ar: string; fr: string }>;
} {
  const c = (content ?? {}) as Obj;
  const n = Number(c.jours);
  const jours = Number.isInteger(n) && n >= 1 && n <= 7 ? n : 7;
  const raw = Array.isArray(c.lignes) ? c.lignes : [];
  const lignes = raw
    .slice(0, 50)
    .map((l) =>
      typeof l === 'string'
        ? { ar: '', fr: l }
        : { ar: str((l as Obj)?.ar), fr: str((l as Obj)?.fr) },
    );
  return { jours, lignes };
}

/**
 * Numéros des sourates d'un livre (`book.js` → `sourates`), lus de façon tolérante (nombres, ou objets
 * `{num|n|sourate}`) : format réel à vérifier sur les vrais livres (VM). Rien d'inventé : hors 1-114, ignoré.
 */
export function bookSuras(book: unknown): number[] {
  const raw = ((book ?? {}) as Obj).sourates;
  const list = Array.isArray(raw) ? raw : [];
  const out: number[] = [];
  for (const x of list) {
    const v =
      typeof x === 'number' || typeof x === 'string'
        ? Number(x)
        : Number((x as Obj)?.num ?? (x as Obj)?.n ?? (x as Obj)?.sourate);
    if (Number.isInteger(v) && v >= 1 && v <= 114 && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Une semaine est un lundi (AAAA-MM-JJ), pas plus tard que la semaine en cours (avec un jour de marge). */
export function validWeek(week: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || Number.isNaN(Date.parse(`${week}T00:00:00Z`)))
    return false;
  if (mondayOf(week) !== week) return false;
  const latest = mondayOf(new Date(now + 86_400_000).toISOString().slice(0, 10));
  return week <= latest;
}

export const SURA_STEPS = ['ecoute', 'repete', 'recite', 'valide'] as const;

export function registerCarnet(app: FastifyInstance, db: Db, edition: Edition): void {
  /** exercice `carnet` de l'édition servie, ou null */
  const carnetOf = async (exerciseId: string) => {
    const ed = await edition();
    if (!ed) return null;
    const [x] = await db
      .select({ id: t.exercise.id, unitId: t.exercise.unitId, content: t.exerciseVersion.content })
      .from(t.exercise)
      .innerJoin(t.exerciseVersion, eq(t.exerciseVersion.exerciseId, t.exercise.id))
      .where(
        and(
          eq(t.exercise.id, exerciseId),
          eq(t.exercise.type, 'carnet'),
          eq(t.exerciseVersion.editionId, ed.id),
        ),
      );
    return x ? { ...x, ...carnetShape(x.content) } : null;
  };

  const weekState = async (profileId: string, exerciseId: string, week: string) => {
    const checks = await db
      .select({ line: t.practiceCheck.line, day: t.practiceCheck.day })
      .from(t.practiceCheck)
      .where(
        and(
          eq(t.practiceCheck.profileId, profileId),
          eq(t.practiceCheck.exerciseId, exerciseId),
          eq(t.practiceCheck.week, week),
        ),
      );
    const [s] = await db
      .select({ signedAt: t.practiceSignature.signedAt })
      .from(t.practiceSignature)
      .where(
        and(
          eq(t.practiceSignature.profileId, profileId),
          eq(t.practiceSignature.exerciseId, exerciseId),
          eq(t.practiceSignature.week, week),
        ),
      );
    return { cases: checks.map((c) => [c.line, c.day]), signe: s ? s.signedAt : null };
  };

  const params = {
    type: 'object',
    required: ['id', 'exo'],
    properties: { id: UUID, exo: { type: 'string', pattern: EXO } },
  } as const;

  /** carnets d'une leçon (lignes du livre) et état de la semaine */
  app.get<{ Params: { id: string }; Querystring: { unit: string; week: string } }>(
    '/api/v1/profiles/:id/carnet',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        querystring: {
          type: 'object',
          required: ['unit', 'week'],
          additionalProperties: false,
          properties: {
            unit: { type: 'string', pattern: '^[a-z0-9]+\\.l\\d{2,3}$' },
            week: { type: 'string', pattern: DAY },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!validWeek(req.query.week)) return err(reply, 400, 'semaine_invalide');
      const ed = await edition();
      if (!ed) return err(reply, 503, 'aucune_edition');
      const xs = await db
        .select({ id: t.exercise.id, content: t.exerciseVersion.content })
        .from(t.exercise)
        .innerJoin(t.exerciseVersion, eq(t.exerciseVersion.exerciseId, t.exercise.id))
        .where(
          and(
            eq(t.exercise.unitId, req.query.unit),
            eq(t.exercise.type, 'carnet'),
            eq(t.exerciseVersion.editionId, ed.id),
          ),
        )
        .orderBy(t.exercise.position);
      return {
        semaine: req.query.week,
        carnets: await Promise.all(
          xs.map(async (x) => ({
            id: x.id,
            ...carnetShape(x.content),
            ...(await weekState(p.id, x.id, req.query.week)),
          })),
        ),
      };
    },
  );

  /** l'enfant coche ou décoche une case (semaine non signée) */
  app.put<{
    Params: { id: string; exo: string };
    Body: { week: string; line: number; day: number; checked: boolean };
  }>(
    '/api/v1/profiles/:id/carnet/:exo',
    {
      schema: {
        params,
        body: {
          type: 'object',
          required: ['week', 'line', 'day', 'checked'],
          additionalProperties: false,
          properties: {
            week: { type: 'string', pattern: DAY },
            line: { type: 'integer', minimum: 0, maximum: 49 },
            day: { type: 'integer', minimum: 0, maximum: 6 },
            checked: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const { week, line, day, checked } = req.body;
      if (!validWeek(week)) return err(reply, 400, 'semaine_invalide');
      const c = await carnetOf(req.params.exo);
      if (!c) return err(reply, 404, 'introuvable');
      if (line >= c.lignes.length || day >= c.jours) return err(reply, 400, 'case_hors_carnet');
      const st = await weekState(p.id, c.id, week);
      if (st.signe) return err(reply, 409, 'semaine_signee');
      const key = and(
        eq(t.practiceCheck.profileId, p.id),
        eq(t.practiceCheck.exerciseId, c.id),
        eq(t.practiceCheck.week, week),
        eq(t.practiceCheck.line, line),
        eq(t.practiceCheck.day, day),
      );
      if (checked)
        await db
          .insert(t.practiceCheck)
          .values({ profileId: p.id, exerciseId: c.id, week, line, day })
          .onConflictDoNothing();
      else await db.delete(t.practiceCheck).where(key);
      return weekState(p.id, c.id, week);
    },
  );

  /** signature du parent : compte parent, code parent défini ET vérifié par le serveur */
  app.post<{ Params: { id: string; exo: string }; Body: { week: string } }>(
    '/api/v1/profiles/:id/carnet/:exo/signer',
    {
      schema: {
        params,
        body: {
          type: 'object',
          required: ['week'],
          additionalProperties: false,
          properties: { week: { type: 'string', pattern: DAY } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (req.auth!.kind !== 'parent' || p.kind === 'adulte')
        return err(reply, 403, 'signature_parent_seulement');
      if (!validWeek(req.body.week)) return err(reply, 400, 'semaine_invalide');
      const c = await carnetOf(req.params.exo);
      if (!c) return err(reply, 404, 'introuvable');
      const [a] = await db
        .select({ h: t.account.parentPinHash })
        .from(t.account)
        .where(eq(t.account.id, req.auth!.accountId));
      if (!a?.h) return err(reply, 409, 'code_parent_a_definir');
      if (!(await parentGate(db, req, reply, 'enfant'))) return reply;
      const ins = await db
        .insert(t.practiceSignature)
        .values({
          profileId: p.id,
          exerciseId: c.id,
          week: req.body.week,
          signedBy: req.auth!.accountId,
        })
        .onConflictDoNothing()
        .returning({ at: t.practiceSignature.signedAt });
      if (!ins.length) return err(reply, 409, 'deja_signe');
      await audit(db, req.auth!.accountId, 'carnet.signature', p.id, {
        exo: c.id,
        week: req.body.week,
      });
      return weekState(p.id, c.id, req.body.week);
    },
  );

  // ------------------------------------------------------------------ suivi des sourates

  /** sourates des livres de l'édition servie, avec le niveau qui les porte */
  const editionSuras = async (): Promise<Array<{ sura: number; niveau: string }>> => {
    const ed = await edition();
    if (!ed) return [];
    const books = await db
      .select({ code: t.levelVersion.levelCode, book: t.levelVersion.book })
      .from(t.levelVersion)
      .where(eq(t.levelVersion.editionId, ed.id))
      .orderBy(t.levelVersion.levelCode);
    const out: Array<{ sura: number; niveau: string }> = [];
    for (const b of books)
      for (const s of bookSuras(b.book))
        if (!out.some((o) => o.sura === s)) out.push({ sura: s, niveau: b.code });
    return out;
  };

  const progressOf = async (profileIds: string[]) =>
    profileIds.length
      ? db.select().from(t.suraProgress).where(inArray(t.suraProgress.profileId, profileIds))
      : [];

  const view = (
    list: Array<{ sura: number; niveau: string }>,
    rows: Array<{ profileId: string; sura: number; step: number; updatedAt: Date }>,
    profileId: string,
  ) =>
    list.map((s) => {
      const r = rows.find((x) => x.profileId === profileId && x.sura === s.sura);
      return { ...s, etape: r ? SURA_STEPS[r.step - 1] : null, le: r?.updatedAt ?? null };
    });

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/sourates',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const list = await editionSuras();
      return { sourates: view(list, await progressOf([p.id]), p.id) };
    },
  );

  /** la famille avance (ou reprend) une étape 1 à 3 ; « validé » n'appartient qu'à l'enseignant */
  app.put<{
    Params: { id: string; sura: number };
    Body: { etape: 'ecoute' | 'repete' | 'recite' };
  }>(
    '/api/v1/profiles/:id/sourates/:sura',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'sura'],
          properties: { id: UUID, sura: { type: 'integer', minimum: 1, maximum: 114 } },
        },
        body: {
          type: 'object',
          required: ['etape'],
          additionalProperties: false,
          properties: { etape: { type: 'string', enum: ['ecoute', 'repete', 'recite'] } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const sura = req.params.sura;
      if (!(await editionSuras()).some((s) => s.sura === sura))
        return err(reply, 400, 'sourate_hors_livre');
      const [cur] = await db
        .select({ step: t.suraProgress.step })
        .from(t.suraProgress)
        .where(and(eq(t.suraProgress.profileId, p.id), eq(t.suraProgress.sura, sura)));
      if (cur?.step === 4) return err(reply, 409, 'deja_validee');
      const step = SURA_STEPS.indexOf(req.body.etape) + 1;
      await db
        .insert(t.suraProgress)
        .values({ profileId: p.id, sura, step })
        .onConflictDoUpdate({
          target: [t.suraProgress.profileId, t.suraProgress.sura],
          set: { step, updatedAt: new Date() },
        });
      return { sura, etape: req.body.etape };
    },
  );

  // ------------------------------------------------------------------ côté enseignant

  const pupilOf = async (
    req: FastifyRequest,
    reply: FastifyReply,
    classId: string,
    profileId: string,
  ) => {
    const cls = await teacherClass(db, req.auth!.accountId, classId);
    if (!cls) return void err(reply, 404, 'introuvable');
    const [m] = await db
      .select({ p: t.classMember.profileId })
      .from(t.classMember)
      .where(and(eq(t.classMember.classId, cls.id), eq(t.classMember.profileId, profileId)));
    if (!m) return void err(reply, 404, 'eleve_hors_classe');
    return cls;
  };

  /** suivi des sourates de toute la classe (pseudonymes seulement) */
  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/sourates',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const members = await db
        .select({ id: t.profile.id, pseudonym: t.profile.pseudonym })
        .from(t.classMember)
        .innerJoin(t.profile, eq(t.profile.id, t.classMember.profileId))
        .where(eq(t.classMember.classId, cls.id));
      const list = await editionSuras();
      const rows = await progressOf(members.map((m) => m.id));
      return {
        sourates: list,
        eleves: members.map((m) => ({
          profileId: m.id,
          pseudonym: m.pseudonym,
          suivi: view(list, rows, m.id),
        })),
      };
    },
  );

  /** validation par l'enseignant (écoute en classe) */
  app.post<{ Params: { id: string; profileId: string; sura: number } }>(
    '/api/v1/ecole/classes/:id/eleves/:profileId/sourates/:sura/valider',
    {
      preHandler: needTeacher,
      schema: {
        params: {
          type: 'object',
          required: ['id', 'profileId', 'sura'],
          properties: {
            id: UUID,
            profileId: UUID,
            sura: { type: 'integer', minimum: 1, maximum: 114 },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await pupilOf(req, reply, req.params.id, req.params.profileId);
      if (!cls) return reply;
      const sura = req.params.sura;
      if (!(await editionSuras()).some((s) => s.sura === sura))
        return err(reply, 400, 'sourate_hors_livre');
      const values = { step: 4, validatedBy: req.auth!.accountId, updatedAt: new Date() };
      await db
        .insert(t.suraProgress)
        .values({ profileId: req.params.profileId, sura, ...values })
        .onConflictDoUpdate({
          target: [t.suraProgress.profileId, t.suraProgress.sura],
          set: values,
        });
      await audit(db, req.auth!.accountId, 'sourate.validation', req.params.profileId, { sura });
      return { sura, etape: 'valide' };
    },
  );
}
