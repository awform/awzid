/**
 * « Famille de mots » du Coran (3/11/2026, interrupteur `racines_coran`, coupé par défaut) — cartes par racine, niveaux 1 à 12.
 * Les fichiers compacts (`packages/content/racines/`, fabriqués par `packages/content/scripts/racines-compact.mjs` depuis les fichiers
 * du référent, arabe recopié octet pour octet, livrés avec le paquet `@awform/content`) ne sont JAMAIS dans le code du client :
 *  - `GET /api/v1/racines/index` : la liste des familles (racine, niveau, mot d'accroche, mots et fréquences pour la pastille) ;
 *  - `GET /api/v1/racines/familles/:id` : UNE famille à la fois.
 * Personne connectée (401) ; fonction ouverte pour elle (403 « fonction_coupee ») ; profil proposé par `x-profil`, retenu seulement
 * s'il appartient à la personne. PUBLIC ENFANT décidé ici : seulement les familles marquées enfant (404 pour les autres), réduites à
 * leurs 2 ou 3 mots, sans moule ; rien d'autre n'est envoyé au navigateur d'un enfant.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Db } from '@awform/db';
import { contexteDe, exigeFonction, profilDe } from './f5.js';
import { err } from './guards.js';

/** Dossier des fichiers : livré avec le paquet `@awform/content` (champ `files`) ; `AWFORM_RACINES_DIR` pour les essais. */
export function racinesDir(): string {
  if (process.env.AWFORM_RACINES_DIR) return process.env.AWFORM_RACINES_DIR;
  const main = fileURLToPath(import.meta.resolve('@awform/content'));
  return join(dirname(main), '..', 'racines');
}

interface MotFamille {
  n: number;
  m?: string;
  ml?: unknown;
  me?: string;
  [k: string]: unknown;
}
export interface FamilleRacine {
  i: number;
  k?: number[];
  o: number[];
  a: number;
  l?: unknown;
  mots: MotFamille[];
  [k: string]: unknown;
}
interface IndexRacines {
  total: number;
  f: Array<{ i: number; e: number; [k: string]: unknown }>;
}

/** Profil enfant : les 2 ou 3 mots marqués, sans moule (6 étapes au lieu de 7), pas de lien vers la famille suivante. */
export function pourEnfant(f: FamilleRacine): FamilleRacine | null {
  if (!f.k || f.k.length === 0) return null;
  const garde = new Set(f.k);
  const mots = f.mots.filter((m) => garde.has(m.n)).map((m) => ({ ...m, m: '', ml: [], me: '' }));
  const o = f.k.filter((n) => mots.some((m) => m.n === n));
  const { l: _l, ...reste } = f;
  void _l;
  return { ...reste, o, a: o.includes(f.a) ? f.a : o[0]!, mots };
}

export function registerRacines(
  app: FastifyInstance,
  db: Db,
  dossier: string = racinesDir(),
): void {
  const cache = new Map<string, string>();
  const lire = async (nom: string) => {
    let c = cache.get(nom);
    if (c === undefined) {
      c = await readFile(join(dossier, `${nom}.json`), 'utf8');
      cache.set(nom, c);
    }
    return c;
  };
  const entete = (reply: import('fastify').FastifyReply, corps: string) =>
    reply
      .header('Cache-Control', 'private, no-store')
      .header('Vary', 'Cookie, X-Profil')
      .type('application/json; charset=utf-8')
      .send(corps);

  app.get('/api/v1/racines/index', async (req, reply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    const pid = await profilDe(db, req, req.headers['x-profil']);
    if (!(await exigeFonction(db, req, reply, 'racines_coran', pid))) return reply;
    const ctx = await contexteDe(db, req, pid);
    // `?p=enfant` : le client demande le public enfant (jamais l'inverse : on ne fait que RESTREINDRE)
    const enfant = ctx.age === 'enfant' || (req.query as { p?: string }).p === 'enfant';
    let corps: string;
    try {
      corps = await lire('index');
    } catch {
      return err(reply, 404, 'introuvable');
    }
    if (!enfant) return entete(reply, corps.replace(/^\{/, '{"p":"adulte",'));
    const idx = JSON.parse(corps) as IndexRacines;
    return entete(
      reply,
      JSON.stringify({ p: 'enfant', total: idx.total, f: idx.f.filter((x) => x.e === 1) }),
    );
  });

  app.get<{ Params: { id: number } }>(
    '/api/v1/racines/familles/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'integer', minimum: 1, maximum: 999 } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const pid = await profilDe(db, req, req.headers['x-profil']);
      if (!(await exigeFonction(db, req, reply, 'racines_coran', pid))) return reply;
      const ctx = await contexteDe(db, req, pid);
      let corps: string;
      try {
        corps = await lire(String(req.params.id).padStart(3, '0'));
      } catch {
        return err(reply, 404, 'introuvable');
      }
      if (ctx.age !== 'enfant' && (req.query as { p?: string }).p !== 'enfant')
        return entete(reply, corps);
      const e = pourEnfant(JSON.parse(corps) as FamilleRacine);
      if (!e) return err(reply, 404, 'introuvable');
      return entete(reply, JSON.stringify(e));
    },
  );
}
