/**
 * A34 — Muṣḥaf de Médine « à l'identique » : sert la copie SYNCHRONISÉE des lignes (Quran Foundation, Content
 * Sync, `infra/outils/qf-lignes`) et les polices « par page » du Complexe du Roi Fahd (servies telles quelles).
 *  - lignes : une page à la fois, aux utilisateurs CONNECTÉS seulement (affichage dans l'application, jamais une
 *    API de données ouverte : conditions QF « not … redistributed … through the Developer's own API ») ;
 *    publication absente → 404 et l'application garde la mise en page fluide ;
 *  - état : version, date de synchronisation, retard (> 7 jours : à relancer, conditions QF), crédit ;
 *  - polices : QCF_P001…604 et QCF_BSML, octet pour octet, ETag = SHA-256 (SHA256SUMS de l'installation).
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { err } from './guards.js';
import { exigeFonction } from './f5.js';
import type { Db } from '@awform/db';

const PAGE = { type: 'integer', minimum: 1, maximum: 604 } as const;
const FONT = { type: 'string', pattern: '^QCF_(P[0-9]{3}|BSML)\\.ttf$' } as const;
const WEEK_MS = 7 * 24 * 3600 * 1000;

interface Manifest {
  format: number;
  sha256: string;
  version: string;
  generatedAt: string;
  pages: number;
  source: { syncedAt?: string; env?: string; mushafName?: string } | null;
  credit: string;
  terms: string;
  partiel?: boolean;
  pagesPubliees?: number[];
}

export function registerMushafExact(
  app: FastifyInstance,
  dataDir: string | null,
  fontsDir: string | null,
  now: () => number = Date.now,
  /** F5 : base (interrupteur « mushaf_exact ») ; absente : pas de contrôle (tests du module seul) */
  db?: Db,
) {
  const live = dataDir ? join(dataDir, 'publie') : null;
  const manifest = (): Manifest | null => {
    if (!live || !existsSync(join(live, 'manifeste.json'))) return null;
    try {
      return JSON.parse(readFileSync(join(live, 'manifeste.json'), 'utf8')) as Manifest;
    } catch {
      return null;
    }
  };
  let sums: Map<string, string> | null = null;
  const fontSha = (f: string) => {
    if (!sums) {
      sums = new Map();
      const p = fontsDir ? join(fontsDir, 'SHA256SUMS') : null;
      if (p && existsSync(p))
        for (const l of readFileSync(p, 'utf8').split('\n')) {
          const [h, n] = l.trim().split(/\s+/);
          if (h && n) sums.set(n, h);
        }
    }
    return sums.get(f) ?? null;
  };

  app.get('/api/v1/quran/mushaf-exact', async (_req, reply) => {
    const m = manifest();
    reply.header('Cache-Control', 'no-cache');
    // complet (604 pages) ; ou PARTIEL (prélancement : seules les pages reçues et contrôlées sont servies)
    if (!m || (m.pages !== 604 && !m.partiel))
      return { disponible: false, polices: Boolean(fontsDir) };
    const synced = Date.parse(m.source?.syncedAt ?? m.generatedAt);
    return {
      disponible: Boolean(fontsDir),
      polices: Boolean(fontsDir),
      partiel: Boolean(m.partiel),
      pages: m.partiel ? (m.pagesPubliees ?? []) : null,
      version: m.version,
      synchroniseLe: m.source?.syncedAt ?? m.generatedAt,
      enRetard: !(now() - synced <= WEEK_MS),
      credit: m.credit,
      conditions: m.terms,
    };
  });

  app.get<{ Params: { p: number } }>(
    '/api/v1/quran/mushaf-exact/pages/:p',
    { schema: { params: { type: 'object', properties: { p: PAGE } } } },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      // F5 : interrupteur « Muṣḥaf exact » (profil actif proposé par l'en-tête x-profil)
      if (db && !(await exigeFonction(db, req, reply, 'mushaf_exact'))) return reply;
      const m = manifest();
      if (!m || !live) return err(reply, 404, 'mushaf_exact_indisponible');
      const f = join(live, 'pages', `${String(req.params.p).padStart(3, '0')}.json`);
      if (!existsSync(f)) return err(reply, 404, 'mushaf_exact_indisponible');
      const etag = `"${m.version}-${req.params.p}"`;
      reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
      if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      reply.type('application/json');
      return reply.send(readFileSync(f));
    },
  );

  app.get<{ Params: { file: string } }>(
    '/api/v1/quran/mushaf-exact/polices/:file',
    { schema: { params: { type: 'object', properties: { file: FONT } } } },
    async (req, reply) => {
      if (!fontsDir) return err(reply, 404, 'polices_indisponibles');
      const f = join(fontsDir, req.params.file);
      if (!existsSync(f)) return err(reply, 404, 'introuvable');
      const sha = fontSha(req.params.file);
      if (sha) {
        const etag = `"${sha.slice(0, 32)}"`;
        reply.header('ETag', etag);
        if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      }
      reply
        .header('Cache-Control', 'public, max-age=2592000')
        .header('Content-Length', statSync(f).size)
        .type('font/ttf');
      return reply.send(createReadStream(f));
    },
  );
}
