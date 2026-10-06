/**
 * Chantier A37 — « Vivre l'islam », onglet Bon comportement (contenu public, identique pour tous, ETag) :
 *  - `GET /api/v1/vivre` : rubriques des livres rangées par cercle et par lieu par l'index officiel (titres et
 *    rangement seulement ; le texte se lit dans la leçon, `GET /api/v1/units/:id`) et RÉSUMÉS des fiches du livret
 *    « Bon comportement » (titres, cercles, lieux, âges, défi) ;
 *  - `GET /api/v1/vivre/fiches/:id` : une fiche entière (format des livres, sources lisibles) ;
 *  - `GET /api/v1/vivre/guide` : chapitre du guide des parents « Transmettre les valeurs » (`gp.c18`), s'il existe ;
 *  - `GET /api/v1/profiles/:id/vivre` (famille de l'élève) : son âge et les leçons déjà atteintes qui ont une
 *    rubrique — l'application filtre elle-même (fonctions pures de `@awform/content/adab`).
 * Les fiches d'ESSAI ne sont servies qu'avec `AWFORM_AKHLAQ_ESSAI=on` (tests de bout en bout), jamais en
 * démonstration ni en production.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resumeOf, type Fiche } from '@awform/content/adab';
import { FICHES_ESSAI } from '@awform/content/akhlaq';
import { adabCatalog, akhlaqFiches, guideChapter, reachedUnits, type Db } from '@awform/db';
import { familyProfile, UUID } from './guards.js';
import { notFound, type Edition } from './routes-common.js';

interface Memo {
  edition: string;
  units: Set<string>;
  fiches: Map<string, Fiche>;
  bodies: Map<string, { etag: string; body: string }>;
}

export function registerVivre(app: FastifyInstance, db: Db, edition: Edition): void {
  const essai = process.env.AWFORM_AKHLAQ_ESSAI === 'on';
  let memo: Memo | null = null;

  const body = (m: Memo, key: string, value: unknown) => {
    let b = m.bodies.get(key);
    if (!b) {
      const s = JSON.stringify(value);
      b = { etag: `"${createHash('sha256').update(s).digest('hex').slice(0, 32)}"`, body: s };
      m.bodies.set(key, b);
    }
    return b;
  };
  async function load(ed: { id: string; code: string }): Promise<Memo> {
    if (memo?.edition === ed.id) return memo;
    const cat = await adabCatalog(db, ed.id);
    const fiches = [...(essai ? FICHES_ESSAI : []), ...(await akhlaqFiches(db, ed.id))];
    const m: Memo = {
      edition: ed.id,
      units: new Set(cat.entries.map((e) => e.unit)),
      fiches: new Map(fiches.map((f) => [f.id, f])),
      bodies: new Map(),
    };
    body(m, 'catalogue', {
      edition: ed.code,
      rangement: cat.index ? 'index' : 'auto',
      entrees: cat.entries,
      fiches: fiches.map(resumeOf),
    });
    memo = m;
    return m;
  }
  const send = (req: FastifyRequest, reply: FastifyReply, b: { etag: string; body: string }) => {
    reply.header('ETag', b.etag).header('Cache-Control', 'public, max-age=3600');
    if (req.headers['if-none-match'] === b.etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(b.body);
  };

  app.get('/api/v1/vivre', async (req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    return send(req, reply, (await load(ed)).bodies.get('catalogue')!);
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/vivre/fiches/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{1,80}$' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const m = await load(ed);
      const f = m.fiches.get(req.params.id);
      if (!f) return reply.code(404).send(notFound(`fiche ${req.params.id} introuvable`));
      return send(req, reply, body(m, `fiche:${f.id}`, { edition: ed.code, fiche: f }));
    },
  );

  app.get('/api/v1/vivre/guide', async (req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    const m = await load(ed);
    const c = await guideChapter(db, ed.id, 'gp.c18');
    if (!c) return reply.code(404).send(notFound('chapitre du guide des parents à venir'));
    return send(req, reply, body(m, 'guide', { edition: ed.code, chapitre: c }));
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/vivre',
    {
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const m = await load(ed);
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
