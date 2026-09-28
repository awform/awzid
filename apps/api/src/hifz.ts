/**
 * Routes du hifẓ (lot 5) :
 *  - texte coranique : UNIQUEMENT la table Tanzil importée (contrôlée octet par octet), jamais retouché ;
 *  - carnets E1/N1 (paquet hors ligne : carnet + versets cités) ;
 *  - plan d'un profil (carnet ou rythme 3 à 7 ans), décidé par le titulaire du profil ou par l'enseignant
 *    de sa classe ;
 *  - validation officielle par l'enseignant (relevés → note /20 du barème des carnets) ;
 *  - classes : le PARENT inscrit lui-même son enfant avec le code donné par l'enseignant (consentement
 *    « partage_enseignant », retirable à tout moment).
 * Aucun audio n'est servi (aucune récitation sans licence écrite).
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  allVerses,
  classByCode,
  classMembers,
  createClass,
  getHifzBook,
  getPlan,
  joinClass,
  leaveClass,
  listClasses,
  listHifzBooks,
  listHifzEvents,
  profileClasses,
  recordHifzEvents,
  savePlan,
  schema as t,
  teacherHasProfile,
  versesOf,
  type Db,
  type HifzEventInput,
} from '@awform/db';
import { bookVerseRefs, buildMeta, note, qualityOf, type HifzBookData } from '@awform/hifz';
import { ownsProfile } from './auth/routes.js';
import { audit, clearFailures, lockedUntil, recordFailure } from './auth/service.js';
import { TEXT_VERSION } from './auth/policy.js';

const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });

const UUID_PARAM = { type: 'string', format: 'uuid' } as const;
const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const COUNT = { type: 'integer', minimum: 0, maximum: 50 } as const;

type Edition = () => Promise<{ id: string; code: string } | null>;

export function registerHifz(app: FastifyInstance, db: Db, edition: Edition): void {
  const isTeacher = (req: FastifyRequest) =>
    !!req.auth && (req.auth.kind === 'enseignant' || req.auth.kind === 'admin');

  const needAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (isTeacher(req) && !req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  const needTeacher = async (req: FastifyRequest, reply: FastifyReply) => {
    const r = await needAuth(req, reply);
    if (r) return r;
    if (!isTeacher(req)) return err(reply, 403, 'reserve_aux_enseignants');
  };
  /** accès au hifẓ d'un profil : son titulaire, ou l'enseignant d'une de ses classes */
  const canSee = async (req: FastifyRequest, profileId: string) =>
    !!req.auth &&
    ((await ownsProfile(db, req.auth.accountId, profileId)) ||
      (isTeacher(req) && (await teacherHasProfile(db, req.auth.accountId, profileId))));

  // ---------------------------------------------------------------- texte coranique (Tanzil)

  let metaCache: { etag: string; body: string } | null = null;
  app.get('/api/v1/quran/meta', async (req, reply) => {
    if (!metaCache) {
      const tanzil = await allVerses(db);
      if (tanzil.size !== 6236) return err(reply, 503, 'coran_absent');
      const meta = buildMeta(tanzil);
      const body = JSON.stringify({ basmala: tanzil.get('1:1'), ...meta });
      metaCache = {
        etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`,
        body,
      };
    }
    reply.header('ETag', metaCache.etag).header('Cache-Control', 'public, max-age=86400');
    if (req.headers['if-none-match'] === metaCache.etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(metaCache.body);
  });

  app.get<{ Querystring: { s: number; from: number; to: number } }>(
    '/api/v1/quran/verses',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['s', 'from', 'to'],
          properties: {
            s: { type: 'integer', minimum: 1, maximum: 114 },
            from: { type: 'integer', minimum: 1, maximum: 286 },
            to: { type: 'integer', minimum: 1, maximum: 286 },
          },
        },
      },
    },
    async (req, reply) => {
      const { s, from, to } = req.query;
      if (to < from || to - from > 300) return err(reply, 400, 'requete_invalide');
      reply.header('Cache-Control', 'public, max-age=86400');
      return {
        source: 'Tanzil quran-uthmani (Ḥafṣ ʿan ʿĀṣim)',
        verses: await versesOf(db, s, from, to),
      };
    },
  );

  // ---------------------------------------------------------------- carnets

  app.get<{ Params: { code: string } }>(
    '/api/v1/hifz/books/:code',
    {
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' } },
          required: ['code'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return err(reply, 404, 'introuvable');
      const book = (await getHifzBook(db, ed.id, req.params.code)) as HifzBookData | null;
      if (!book) return err(reply, 404, 'introuvable');
      const tanzil = await allVerses(db);
      const verses: Record<string, string> = {};
      for (const r of bookVerseRefs(book)) {
        const v = tanzil.get(r);
        if (v !== undefined) verses[r] = v;
      }
      return { edition: ed.code, book, verses, basmala: tanzil.get('1:1') ?? '' };
    },
  );

  app.get('/api/v1/hifz/books', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return err(reply, 404, 'introuvable');
    return { edition: ed.code, books: await listHifzBooks(db, ed.id) };
  });

  // ---------------------------------------------------------------- plan et journal d'un profil

  app.get<{ Params: { id: string } }>(
    '/api/v1/hifz/profiles/:id',
    {
      preHandler: needAuth,
      schema: { params: { type: 'object', properties: { id: UUID_PARAM }, required: ['id'] } },
    },
    async (req, reply) => {
      if (!(await canSee(req, req.params.id))) return err(reply, 404, 'introuvable');
      return {
        plan: await getPlan(db, req.params.id),
        events: await listHifzEvents(db, req.params.id),
        classes: await profileClasses(db, req.params.id),
      };
    },
  );

  app.put<{
    Params: { id: string };
    Body: {
      mode: 'carnet' | 'rythme';
      bookCode?: string;
      rhythmYears?: number;
      suraOrder?: 'rebours' | 'juz30';
      startDate: string;
      trial?: boolean;
      newFactor?: number;
      reliefUntil?: string | null;
    };
  }>(
    '/api/v1/hifz/profiles/:id/plan',
    {
      preHandler: needAuth,
      schema: {
        params: { type: 'object', properties: { id: UUID_PARAM }, required: ['id'] },
        body: {
          type: 'object',
          required: ['mode', 'startDate'],
          additionalProperties: false,
          properties: {
            mode: { enum: ['carnet', 'rythme'] },
            bookCode: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
            rhythmYears: { type: 'integer', minimum: 3, maximum: 7 },
            suraOrder: { enum: ['rebours', 'juz30'] },
            startDate: { type: 'string', pattern: DAY },
            trial: { type: 'boolean' },
            newFactor: { enum: [0.5, 1] },
            reliefUntil: { anyOf: [{ type: 'string', pattern: DAY }, { type: 'null' }] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await canSee(req, req.params.id))) return err(reply, 404, 'introuvable');
      const b = req.body;
      if (b.mode === 'carnet') {
        const ed = await edition();
        if (!b.bookCode || !ed || !(await getHifzBook(db, ed.id, b.bookCode)))
          return err(reply, 400, 'carnet_inconnu');
      }
      const plan = await savePlan(db, req.params.id, b, req.auth!.accountId);
      await audit(db, req.auth!.accountId, 'hifz.plan', req.params.id, {
        mode: b.mode,
        rhythm: b.rhythmYears ?? null,
        trial: b.trial ?? false,
      });
      return { plan };
    },
  );

  // ---------------------------------------------------------------- validation par l'enseignant

  app.post<{
    Body: {
      id: string;
      profileId: string;
      day: string;
      part: string;
      counters: {
        aides: number;
        hesitations: number;
        sauts: number;
        oublis: number;
        claires: number;
        discretes: number;
        fluidite: number;
      };
      remarque?: string;
    };
  }>(
    '/api/v1/teacher/hifz/validations',
    {
      preHandler: needTeacher,
      schema: {
        body: {
          type: 'object',
          required: ['id', 'profileId', 'day', 'part', 'counters'],
          additionalProperties: false,
          properties: {
            id: UUID_PARAM,
            profileId: UUID_PARAM,
            day: { type: 'string', pattern: DAY },
            part: { type: 'string', maxLength: 20 },
            counters: {
              type: 'object',
              required: [
                'aides',
                'hesitations',
                'sauts',
                'oublis',
                'claires',
                'discretes',
                'fluidite',
              ],
              additionalProperties: false,
              properties: {
                aides: COUNT,
                hesitations: COUNT,
                sauts: COUNT,
                oublis: COUNT,
                claires: COUNT,
                discretes: COUNT,
                fluidite: { type: 'integer', minimum: 0, maximum: 4 },
              },
            },
            remarque: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (!(await teacherHasProfile(db, req.auth!.accountId, b.profileId)))
        return err(reply, 404, 'introuvable');
      const n = note(b.counters);
      const ev: HifzEventInput = {
        id: b.id,
        profileId: b.profileId,
        day: b.day,
        part: b.part,
        kind: 'revision',
        q: qualityOf(n),
        source: 'enseignant',
        details: { counters: b.counters, note: n, remarque: b.remarque ?? null },
        deviceAt: new Date().toISOString(),
      };
      const r = await recordHifzEvents(db, [ev], req.auth!.accountId, true);
      if (r.rejected.length)
        return err(reply, 400, 'requete_invalide', { raison: r.rejected[0]!.reason });
      await audit(db, req.auth!.accountId, 'hifz.validation', b.profileId, {
        part: b.part,
        total: n.total,
      });
      return { note: n, q: ev.q, duplicate: r.duplicates.length > 0 };
    },
  );

  // ---------------------------------------------------------------- classes (enseignant)

  app.get('/api/v1/teacher/classes', { preHandler: needTeacher }, async (req) => {
    const classes = await listClasses(db, req.auth!.accountId);
    const out = [];
    for (const c of classes) out.push({ ...c, members: (await classMembers(db, c.id)).length });
    return { classes: out };
  });

  app.post<{ Body: { name: string } }>(
    '/api/v1/teacher/classes',
    {
      preHandler: needTeacher,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: { type: 'string', minLength: 1, maxLength: 60 } },
        },
      },
    },
    async (req, reply) => {
      const c = await createClass(db, req.auth!.accountId, req.body.name.trim());
      await audit(db, req.auth!.accountId, 'classe.creation', c.id);
      return reply.code(201).send({ class: c });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/teacher/classes/:id',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', properties: { id: UUID_PARAM }, required: ['id'] } },
    },
    async (req, reply) => {
      const [c] = await db
        .select()
        .from(t.classGroup)
        .where(
          and(
            eq(t.classGroup.id, req.params.id),
            eq(t.classGroup.teacherAccountId, req.auth!.accountId),
          ),
        );
      if (!c) return err(reply, 404, 'introuvable');
      const members = [];
      for (const m of await classMembers(db, c.id))
        members.push({
          ...m,
          plan: await getPlan(db, m.id),
          events: await listHifzEvents(db, m.id),
        });
      return { class: c, members };
    },
  );

  // ---------------------------------------------------------------- classes (famille)

  app.post<{ Params: { id: string }; Body: { code: string; consent: boolean } }>(
    '/api/v1/profiles/:id/classes',
    {
      preHandler: needAuth,
      schema: {
        params: { type: 'object', properties: { id: UUID_PARAM }, required: ['id'] },
        body: {
          type: 'object',
          required: ['code', 'consent'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 12 },
            consent: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const accountId = req.auth!.accountId;
      if (isTeacher(req) || !(await ownsProfile(db, accountId, req.params.id)))
        return err(reply, 404, 'introuvable');
      if (req.body.consent !== true) return err(reply, 400, 'consentement_requis');
      // essais de codes limités (un code de classe ne se devine pas)
      const key = `classe:${accountId}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      const c = await classByCode(db, req.body.code);
      if (!c) {
        await recordFailure(db, key);
        return err(reply, 404, 'code_classe_inconnu');
      }
      await clearFailures(db, key);
      await joinClass(db, c.id, req.params.id, accountId);
      await db.insert(t.consent).values({
        accountId,
        profileId: req.params.id,
        type: 'partage_enseignant',
        textVersion: TEXT_VERSION,
        country: req.auth!.country,
        evidence: {
          methode: 'declaration_du_titulaire',
          classe: c.id,
          date: new Date().toISOString(),
        },
      });
      await audit(db, accountId, 'classe.inscription', req.params.id, { classe: c.id });
      return reply.code(201).send({ class: { id: c.id, name: c.name } });
    },
  );

  app.delete<{ Params: { id: string; classId: string } }>(
    '/api/v1/profiles/:id/classes/:classId',
    {
      preHandler: needAuth,
      schema: {
        params: {
          type: 'object',
          properties: { id: UUID_PARAM, classId: UUID_PARAM },
          required: ['id', 'classId'],
        },
      },
    },
    async (req, reply) => {
      const accountId = req.auth!.accountId;
      if (!(await ownsProfile(db, accountId, req.params.id))) return err(reply, 404, 'introuvable');
      await leaveClass(db, req.params.classId, req.params.id);
      if ((await profileClasses(db, req.params.id)).length === 0)
        await db
          .update(t.consent)
          .set({ withdrawnAt: new Date() })
          .where(
            and(
              eq(t.consent.profileId, req.params.id),
              eq(t.consent.type, 'partage_enseignant'),
              isNull(t.consent.withdrawnAt),
            ),
          );
      await audit(db, accountId, 'classe.retrait', req.params.id, { classe: req.params.classId });
      return { ok: true };
    },
  );
}
