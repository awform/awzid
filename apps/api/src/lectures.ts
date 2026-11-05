/**
 * Lectures (4/11/2026) — deux contenus servis à la demande, une partie à la fois, jamais dans le code du client :
 *  - Mukhtaṣar Khalīl (interrupteur `khalil`) : `GET /api/v1/khalil/index` (sommaire) et `/chapitres/:k` (un chapitre).
 *    Fichiers fabriqués par `packages/content/scripts/khalil-compact.mjs` : le chapitre du jihād n'y est JAMAIS écrit (ni titre,
 *    ni unité, ni numéro : renumérotation sans trou). Réservé aux adultes (profil enfant ou ado : 403 « reserve_adultes »).
 *  - « Histoire, de la création à nos jours » (interrupteur `histoires`) : `GET /api/v1/histoires/index` et `/recits/:id`.
 *    Profil enfant : seulement la version enfant et les questions (la version adulte et sa fiche ne partent jamais).
 *    `GET /api/v1/histoires/acces` (204) : contrôle demandé par le serveur web avant de servir un MP3 de la narration.
 * Personne connectée (401) ; fonction ouverte pour elle (403 « fonction_coupee ») ; profil proposé par `x-profil`, retenu
 * seulement s'il appartient à la personne.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@awform/db';
import { contexteDe, exigeFonction, profilDe } from './f5.js';
import { err } from './guards.js';

const contenu = (nom: string) => {
  const main = fileURLToPath(import.meta.resolve('@awform/content'));
  return join(dirname(main), '..', nom);
};
/** Dossiers livrés avec le paquet `@awform/content` ; `AWFORM_KHALIL_DIR` / `AWFORM_HISTOIRES_DIR` pour les essais. */
export const khalilDir = (): string => process.env.AWFORM_KHALIL_DIR || contenu('khalil');
export const histoiresDir = (): string => process.env.AWFORM_HISTOIRES_DIR || contenu('histoires');

/** Récit réduit pour un enfant : ni version adulte, ni fiche, ni audio adulte. */
export function recitPourEnfant(r: Record<string, unknown>): Record<string, unknown> {
  const { adulte: _a, fiche: _f, ...reste } = r;
  void _a;
  void _f;
  const audio = r.audio as { e?: unknown } | undefined;
  const illus = (r.illus as Array<{ v: string }> | undefined)?.filter((x) => x.v === 'enfant');
  return {
    ...reste,
    p: 'enfant',
    ...(audio?.e ? { audio: { e: audio.e } } : { audio: undefined }),
    ...(illus ? { illus } : {}),
  };
}

function lecteur(dossier: string) {
  const cache = new Map<string, string>();
  return async (nom: string) => {
    let c = cache.get(nom);
    if (c === undefined) {
      c = await readFile(join(dossier, `${nom}.json`), 'utf8');
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
      cache.set(nom, c);
    }
    return c;
  };
}
const entete = (reply: FastifyReply, corps: string) =>
  reply
    .header('Cache-Control', 'private, no-store')
    .header('Vary', 'Cookie, X-Profil')
    .type('application/json; charset=utf-8')
    .send(corps);

export function registerLectures(
  app: FastifyInstance,
  db: Db,
  dirs: { khalil?: string; histoires?: string } = {},
): void {
  const lireK = lecteur(dirs.khalil ?? khalilDir());
  const lireH = lecteur(dirs.histoires ?? histoiresDir());
  let chapitres: Set<string> | null = null;
  let recits: Set<string> | null = null;

  /** session, interrupteur, public ; null si la réponse est déjà partie */
  async function garde(req: FastifyRequest, reply: FastifyReply, cle: 'khalil' | 'histoires') {
    if (!req.auth) {
      void err(reply, 401, 'non_connecte');
      return null;
    }
    const pid = await profilDe(db, req, req.headers['x-profil']);
    if (!(await exigeFonction(db, req, reply, cle, pid))) return null;
    const ctx = await contexteDe(db, req, pid);
    const enfant = ctx.age === 'enfant' || (req.query as { p?: string }).p === 'enfant';
    return { age: ctx.age, enfant };
  }

  // ---------------------------------------------------------------- Mukhtaṣar Khalīl
  const khalilOuvert = async (req: FastifyRequest, reply: FastifyReply) => {
    const g = await garde(req, reply, 'khalil');
    if (!g) return false;
    if (g.enfant || g.age === 'ado') {
      void err(reply, 403, 'reserve_adultes');
      return false;
    }
    return true;
  };
  app.get('/api/v1/khalil/index', async (req, reply) => {
    if (!(await khalilOuvert(req, reply))) return reply;
    try {
      return entete(reply, await lireK('index'));
    } catch {
      return err(reply, 404, 'introuvable');
    }
  });
  app.get<{ Params: { k: string } }>(
    '/api/v1/khalil/chapitres/:k',
    {
      schema: {
        params: {
          type: 'object',
          properties: { k: { type: 'string', pattern: '^[a-z]{2,12}$' } },
          required: ['k'],
        },
      },
    },
    async (req, reply) => {
      if (!(await khalilOuvert(req, reply))) return reply;
      try {
        chapitres ??= new Set(
          (JSON.parse(await lireK('index')) as { c: Array<{ k: string }> }).c.map((c) => c.k),
        );
        if (!chapitres.has(req.params.k)) return err(reply, 404, 'introuvable');
        return entete(reply, await lireK(req.params.k));
      } catch {
        return err(reply, 404, 'introuvable');
      }
    },
  );

  // ---------------------------------------------------------------- Histoires
  app.get('/api/v1/histoires/acces', async (req, reply) => {
    if (!(await garde(req, reply, 'histoires'))) return reply;
    return reply.header('Cache-Control', 'private, no-store').code(204).send();
  });
  app.get('/api/v1/histoires/index', async (req, reply) => {
    const g = await garde(req, reply, 'histoires');
    if (!g) return reply;
    try {
      const corps = await lireH('index');
      return entete(reply, corps.replace(/^\{/, `{"p":"${g.enfant ? 'enfant' : 'adulte'}",`));
    } catch {
      return err(reply, 404, 'introuvable');
    }
  });
  app.get<{ Params: { id: string } }>(
    '/api/v1/histoires/recits/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: '^[0-9A-Za-z_]{3,60}$' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const g = await garde(req, reply, 'histoires');
      if (!g) return reply;
      try {
        if (!recits) {
          const ix = JSON.parse(await lireH('index')) as {
            av?: { id: string };
            livres: Array<{ r: Array<{ id: string }> }>;
          };
          // récits des livres + l'avertissement au lecteur (en tête de chaque livre)
          recits = new Set([
            ...ix.livres.flatMap((l) => l.r.map((r) => r.id)),
            ...(ix.av ? [ix.av.id] : []),
          ]);
        }
        if (!recits.has(req.params.id)) return err(reply, 404, 'introuvable');
        const corps = await lireH(req.params.id);
        if (!g.enfant) return entete(reply, corps.replace(/^\{/, '{"p":"adulte",'));
        return entete(
          reply,
          JSON.stringify(recitPourEnfant(JSON.parse(corps) as Record<string, unknown>)),
        );
      } catch {
        return err(reply, 404, 'introuvable');
      }
    },
  );
}
