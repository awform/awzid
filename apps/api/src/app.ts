/**
 * API REST v1 : santé, niveaux, leçons (projection élève + illustrations utilisées), tentatives, progression.
 * L'authentification, les politiques d'accès et l'OpenAPI arrivent au lot 4 : d'ici là, les routes
 * d'écriture (tentatives) ne sont actives qu'en DÉVELOPPEMENT (`devAttempts`) et ne connaissent que les
 * profils fictifs de démonstration.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import type { Lesson } from '@awform/content';
import { neededIllustrations } from './needed.js';
import { getPack } from './packs.js';

export { neededIllustrations };
import {
  currentEdition,
  DEMO,
  getUnitForStudent,
  illustrationsFor,
  levelProgress,
  listLevels,
  listUnits,
  ping,
  recordAttempts,
  type AttemptInput,
  type Db,
} from '@awform/db';

export interface AppOptions {
  db: Db;
  /** code d'édition imposé (sinon : l'édition publiée) */
  editionCode?: string;
  logger?: boolean;
  version?: string;
  /** routes de tentatives et profils de démonstration (développement seulement, avant le lot 4) */
  devAttempts?: boolean;
}

const LEVEL_CODE = '^[a-z]{2,3}[0-9]{1,2}$';
const UNIT_ID = '^[a-z]{2,3}[0-9]{1,2}\\.l[0-9]{2}$';
const UUID = '^[0-9a-fA-F-]{36}$';

function notFound(message: string) {
  return { error: { code: 'introuvable', message } };
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: opts.logger
      ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
    bodyLimit: 1_048_576,
  });
  const { db } = opts;

  // en-têtes de sécurité de base (la CSP stricte est posée par SvelteKit / Caddy)
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send(notFound(`route inconnue : ${req.method} ${req.url}`));
  });

  app.setErrorHandler(
    (err: { statusCode?: number; validation?: unknown; message: string }, req, reply) => {
      if (err.validation)
        return reply.code(400).send({ error: { code: 'requete_invalide', message: err.message } });
      if (err.statusCode && err.statusCode < 500)
        return reply
          .code(err.statusCode)
          .send({ error: { code: 'requete_invalide', message: err.message } });
      req.log.error(err);
      return reply.code(500).send({ error: { code: 'erreur_interne', message: 'erreur interne' } });
    },
  );

  const edition = async () => currentEdition(db, opts.editionCode);

  app.get('/api/v1/health', async () => {
    const dbOk = await ping(db).catch(() => false);
    const ed = dbOk ? await edition() : null;
    return {
      status: dbOk ? 'ok' : 'degrade',
      db: dbOk,
      edition: ed?.code ?? null,
      version: opts.version ?? '0.2.0',
    };
  });

  app.get('/api/v1/levels', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    return { edition: ed.code, levels: await listLevels(db, ed.id) };
  });

  app.get<{ Params: { code: string } }>(
    '/api/v1/levels/:code/units',
    {
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string', pattern: LEVEL_CODE } },
          required: ['code'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const units = await listUnits(db, ed.id, req.params.code);
      if (units.length === 0)
        return reply.code(404).send(notFound(`niveau ${req.params.code} absent de l'édition`));
      return { edition: ed.code, level: req.params.code, units };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/units/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UNIT_ID } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const unit = await getUnitForStudent(db, ed.id, req.params.id);
      if (!unit) return reply.code(404).send(notFound(`leçon ${req.params.id} introuvable`));
      const illustrations = await illustrationsFor(
        db,
        ed.id,
        neededIllustrations(unit.lesson as Lesson),
      );
      return { edition: ed.code, unit, illustrations };
    },
  );

  // ---------------------------------------------------------------- paquets de niveau (hors ligne)

  /** Manifeste : pour chaque niveau, empreinte du paquet, poids compressé, empreinte de chaque leçon. */
  app.get('/api/v1/packs', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    const levels = await listLevels(db, ed.id);
    const packs = [];
    for (const l of levels) {
      const p = await getPack(db, ed.id, ed.code, l.code);
      if (!p) continue;
      packs.push({
        level: l.code,
        titleFr: l.titleFr,
        codeFr: l.codeFr,
        hash: p.pack.hash,
        units: p.perUnit,
        illustrations: Object.keys(p.pack.illustrations).length,
        rawBytes: p.rawBytes,
        bytes: p.brotliBytes,
      });
    }
    return { edition: ed.code, packs };
  });

  /** Paquet complet d'un niveau (ETag = empreinte ; 304 si l'appareil l'a déjà). */
  app.get<{ Params: { code: string } }>(
    '/api/v1/packs/:code',
    {
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string', pattern: LEVEL_CODE } },
          required: ['code'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const p = await getPack(db, ed.id, ed.code, req.params.code);
      if (!p)
        return reply.code(404).send(notFound(`niveau ${req.params.code} absent de l'édition`));
      const etag = `"${p.pack.hash}"`;
      reply.header('ETag', etag).header('Cache-Control', 'no-cache');
      if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      reply.type('application/json; charset=utf-8').header('Vary', 'Accept-Encoding');
      // paquet déjà compressé en Brotli (qualité 11) une fois pour toutes
      if (/\bbr\b/.test(String(req.headers['accept-encoding'] ?? '')))
        return reply.header('Content-Encoding', 'br').send(p.brotli);
      return reply.send(p.json);
    },
  );

  if (opts.devAttempts) {
    app.get('/api/v1/dev/profiles', async () => ({
      profiles: [
        { id: DEMO.enfant, kind: 'enfant', pseudonym: 'Profil de démonstration (enfant)' },
        { id: DEMO.adulte, kind: 'adulte', pseudonym: 'Profil de démonstration (adulte)' },
      ],
    }));

    app.post<{ Body: { events: AttemptInput[] } }>(
      '/api/v1/attempts',
      {
        schema: {
          body: {
            type: 'object',
            required: ['events'],
            properties: { events: { type: 'array', maxItems: 500, items: { type: 'object' } } },
          },
        },
      },
      async (req, reply) => {
        const ed = await edition();
        if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
        const allowed = new Set<string>([DEMO.enfant, DEMO.adulte]);
        const events = req.body.events.filter((e) => allowed.has(String(e?.profileId)));
        const refused = req.body.events
          .filter((e) => !allowed.has(String(e?.profileId)))
          .map((e) => ({ id: String(e?.id ?? ''), reason: 'profil non autorisé' }));
        const r = await recordAttempts(db, ed.id, events);
        return { edition: ed.code, ...r, rejected: [...r.rejected, ...refused] };
      },
    );

    app.get<{ Querystring: { profile: string; level: string } }>(
      '/api/v1/progress',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['profile', 'level'],
            properties: {
              profile: { type: 'string', pattern: UUID },
              level: { type: 'string', pattern: LEVEL_CODE },
            },
          },
        },
      },
      async (req, reply) => {
        const ed = await edition();
        if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
        const units = await listUnits(db, ed.id, req.query.level);
        const rows = await levelProgress(
          db,
          req.query.profile,
          units.map((u) => u.id),
        );
        return { profile: req.query.profile, level: req.query.level, progress: rows };
      },
    );
  }

  return app;
}
