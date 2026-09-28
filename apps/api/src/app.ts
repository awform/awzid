/**
 * API REST v1 — squelette du lot 1 : santé, niveaux, leçons (projection élève seulement).
 * Les routes d'écriture, l'authentification, les politiques d'accès et l'OpenAPI arrivent aux lots 3-4.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import {
  currentEdition,
  getUnitForStudent,
  listLevels,
  listUnits,
  ping,
  type Db,
} from '@awform/db';

export interface AppOptions {
  db: Db;
  /** code d'édition imposé (sinon : l'édition publiée) */
  editionCode?: string;
  logger?: boolean;
  version?: string;
}

const LEVEL_CODE = '^[a-z]{2,3}[0-9]{1,2}$';
const UNIT_ID = '^[a-z]{2,3}[0-9]{1,2}\\.l[0-9]{2}$';

function notFound(message: string) {
  return { error: { code: 'introuvable', message } };
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: opts.logger
      ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
    // l'API ne sert que du JSON ; limite prudente pour les futurs envois d'événements
    bodyLimit: 1_048_576,
  });
  const { db } = opts;

  // en-têtes de sécurité de base (la CSP stricte sera posée par Caddy / SvelteKit)
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send(notFound(`route inconnue : ${req.method} ${req.url}`));
  });

  app.setErrorHandler(
    (err: { statusCode?: number; validation?: unknown; message: string }, req, reply) => {
      if (err.validation)
        return reply.code(400).send({ error: { code: 'requete_invalide', message: err.message } });
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
      version: opts.version ?? '0.1.0',
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
      return { edition: ed.code, unit };
    },
  );

  return app;
}
