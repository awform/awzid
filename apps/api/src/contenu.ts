/**
 * Contenu servi (QUA-3, découpé de app.ts sans changement de comportement) : niveaux, leçons en projection
 * élève (droits appliqués, audit PAY-4), paquets hors ligne (ETag, Brotli) et page publique du QR code.
 */
import type { FastifyInstance } from 'fastify';
import type { Lesson } from '@awform/content';
import {
  getUnitForStudent,
  illustrationsFor,
  listLevels,
  listUnits,
  publicUnit,
  type Db,
} from '@awform/db';
import type { ContentRights } from './billing.js';
import { neededIllustrations } from './needed.js';
import { getPack } from './packs.js';
import { LEVEL_CODE, notFound, UNIT_ID, type Edition } from './routes-common.js';

export function registerContent(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  rights: ContentRights,
): void {
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
      // audit PAY-4 : droits appliqués au contenu quand AWFORM_DROITS=on (leçons ouvertes de la formule)
      const e = await rights.of(req.auth);
      if (!rights.canOpen(e, unit))
        return reply.code(403).send({ error: { code: 'droits_insuffisants', plan: e?.plan } });
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
      // audit PAY-4 : le paquet hors ligne (niveau entier) est réservé aux formules qui l'incluent
      const e = await rights.of(req.auth);
      // lot 23 : un code d'activation ouvre aussi le paquet hors ligne de SON niveau (livre acheté)
      if (e && !e.droits.horsLigne && !e.packs?.includes(req.params.code))
        return reply.code(403).send({ error: { code: 'hors_ligne_reserve', plan: e.plan } });
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

  // ---------------------------------------------------------------- page publique du QR code (sans compte)

  app.get<{ Params: { slug: string } }>(
    '/api/v1/public/l/:slug',
    {
      schema: {
        params: {
          type: 'object',
          properties: { slug: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}-[0-9]{2}$' } },
          required: ['slug'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const u = await publicUnit(db, ed.id, req.params.slug);
      if (!u) return reply.code(404).send(notFound(`leçon ${req.params.slug} introuvable`));
      reply.header('Cache-Control', 'public, max-age=3600');
      return { edition: ed.code, ...u };
    },
  );
}
