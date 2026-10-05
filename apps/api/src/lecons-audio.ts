/**
 * Audio des leçons (chantier A3) : fichiers de synthèse vocale des textes « à écouter » des livres, importés
 * par l'outil `lecons-audio` dans un stockage monté en LECTURE SEULE (AWFORM_LECONS_AUDIO_DIR).
 *
 *  - GET /api/v1/lecons-audio/niveaux : taille de l'audio de chaque niveau ;
 *  - GET /api/v1/lecons-audio/niveaux/:level : fichiers du niveau (SHA-1 de la clé `audioKey` du texte),
 *    taille totale, mention « voix de synthèse (provisoire) » et crédit des voix ;
 *  - GET /api/v1/lecons-audio/fichiers/:file : le fichier (Range, ETag, 304), cache public
 *    (le nom dépend du texte, l'ETag du contenu).
 *
 * Jamais de texte coranique : l'import écarte tout extrait du Coran (garde coranique).
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { LECONS_AUDIO_MANIFEST, readLeconsManifest, type LeconsAudioManifest } from '@awform/db';
import { sendAudioFile } from './coran-audio.js';

export interface LeconsAudioLevel {
  niveau: string;
  fichiers: string[];
  octets: number;
  mention: string;
  credits: string[];
}

export function registerLeconsAudio(app: FastifyInstance, dir: string | null): void {
  let loaded: {
    mtime: number;
    m: LeconsAudioManifest | null;
    levels: Map<string, LeconsAudioLevel>;
  } | null = null;
  let checkedAt = 0;
  /** manifeste relu quand il change (nouvel import), vérifié au plus toutes les 30 s */
  const manifest = () => {
    if (!dir) return null;
    const now = Date.now();
    if (loaded && now - checkedAt < 30_000) return loaded;
    checkedAt = now;
    let mtime = 0;
    try {
      mtime = statSync(join(dir, LECONS_AUDIO_MANIFEST)).mtimeMs;
    } catch {
      /* rien d'importé */
    }
    if (!loaded || loaded.mtime !== mtime) {
      const m = mtime ? readLeconsManifest(dir) : null;
      const levels = new Map<string, LeconsAudioLevel>();
      for (const [sha, f] of Object.entries(m?.fichiers ?? {}))
        for (const n of f.n) {
          let l = levels.get(n);
          if (!l) {
            l = { niveau: n, fichiers: [], octets: 0, mention: m!.mention, credits: m!.credits };
            levels.set(n, l);
          }
          l.fichiers.push(sha);
          l.octets += f.o;
        }
      for (const l of levels.values()) l.fichiers.sort();
      loaded = { mtime, m, levels };
    }
    return loaded;
  };

  // taille de l'audio de chaque niveau (option « avec l'audio » des téléchargements), sans les fichiers
  app.get('/api/v1/lecons-audio/niveaux', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      niveaux: [...(manifest()?.levels.values() ?? [])]
        .map((l) => ({ niveau: l.niveau, fichiers: l.fichiers.length, octets: l.octets }))
        .sort((a, b) => (a.niveau < b.niveau ? -1 : 1)),
    };
  });

  app.get<{ Params: { level: string } }>(
    '/api/v1/lecons-audio/niveaux/:level',
    async (req, reply) => {
      const lv = /^[a-z0-9-]{1,40}$/.test(req.params.level)
        ? manifest()?.levels.get(req.params.level)
        : undefined;
      reply.header('Cache-Control', 'public, max-age=300');
      // niveau sans audio : liste vide (aucun bouton), jamais une erreur pour l'élève
      return lv ?? { niveau: req.params.level, fichiers: [], octets: 0, mention: '', credits: [] };
    },
  );

  app.get<{ Params: { file: string } }>(
    '/api/v1/lecons-audio/fichiers/:file',
    async (req, reply) => {
      const sha = /^([0-9a-f]{40})\.mp3$/.exec(req.params.file)?.[1];
      const f = sha ? manifest()?.m?.fichiers[sha] : undefined;
      if (!sha || !f || !dir) return reply.code(404).send({ error: 'introuvable' });
      return sendAudioFile(req, reply, join(dir, `${sha}.mp3`), {
        size: f.o,
        etag: f.e,
        type: 'audio/mpeg',
        // nom = texte, contenu remplaçable (voix humaine plus tard) : une semaine, puis revalidation par ETag
        cache: 'public, max-age=604800',
      });
    },
  );
}
