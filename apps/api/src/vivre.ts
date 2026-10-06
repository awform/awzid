/**
 * Chantier A37 — « Vivre l'islam », onglet Bon comportement.
 *  - `GET /api/v1/vivre` (public, identique pour tous, ETag) : rubriques des livres rangées par cercle et par lieu
 *    (titres et rangement seulement ; le texte se lit dans la leçon, `GET /api/v1/units/:id`) et fiches du livret
 *    « Bon comportement ». Les fiches d'ESSAI ne sont servies qu'avec `AWFORM_AKHLAQ_ESSAI=on` (tests de bout en
 *    bout), jamais en démonstration ni en production.
 *  - `GET /api/v1/profiles/:id/vivre` (famille de l'élève) : son âge et les leçons déjà atteintes qui ont une
 *    rubrique — l'application filtre elle-même (fonctions pures de `@awform/content/adab`).
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { FICHES_ESSAI } from '@awform/content/akhlaq';
import { adabEntries, akhlaqFiches, reachedUnits, type Db } from '@awform/db';
import { familyProfile, UUID } from './guards.js';
import { notFound, type Edition } from './routes-common.js';

export function registerVivre(app: FastifyInstance, db: Db, edition: Edition): void {
  const essai = process.env.AWFORM_AKHLAQ_ESSAI === 'on';
  let memo: { edition: string; etag: string; body: string; units: Set<string> } | null = null;

  async function catalogue(ed: { id: string; code: string }) {
    if (memo?.edition === ed.id) return memo;
    const entrees = await adabEntries(db, ed.id);
    const fiches = [...(essai ? FICHES_ESSAI : []), ...(await akhlaqFiches(db, ed.id))];
    const body = JSON.stringify({
      edition: ed.code,
      rangement: entrees.some((e) => e.rangement === 'index') ? 'index' : 'auto',
      entrees,
      fiches,
    });
    memo = {
      edition: ed.id,
      etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`,
      body,
      units: new Set(entrees.map((e) => e.unit)),
    };
    return memo;
  }

  app.get('/api/v1/vivre', async (req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    const m = await catalogue(ed);
    reply.header('ETag', m.etag).header('Cache-Control', 'public, max-age=3600');
    if (req.headers['if-none-match'] === m.etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(m.body);
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/vivre',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: UUID },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const m = await catalogue(ed);
      const reached = await reachedUnits(db, ed.id, p.id);
      reply.header('Cache-Control', 'private, no-store');
      return {
        edition: ed.code,
        kind: p.kind,
        units: [...reached].filter((u) => m.units.has(u)).sort(),
      };
    },
  );
}
