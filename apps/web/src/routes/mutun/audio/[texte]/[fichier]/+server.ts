/**
 * Madjaliss — AUDIO DE SYNTHÈSE des textes de fiqh (lot 9, décision du client des 13 et 14/10/2026 : voix de synthèse
 * autorisée pour le fiqh des cycles 1 et 2, JAMAIS pour le Coran). Les MP3 ne sont pas dans `static/` : servis ici
 * seulement d'après le manifeste écrit par `scripts/madjaliss.mjs` (`$lib/server/madjaliss-audio.json` : une entrée
 * par phrase dont le texte servi est celui de la génération), après authentification :
 *  - 401 sans session (ou session à moitié ouverte), 404 pour tout fichier absent du manifeste ;
 *  - droit « differe » (phrase d'une séance en publication différée) : mêmes droits que le fichier gardé (`voitDiffere`),
 *    403 sinon ;
 *  - fichiers lus dans `MADJALISS_AUDIO_DIR` (stockage en lecture seule, défaut `/madjaliss-audio`) : Range (206),
 *    ETag (empreinte du contenu) et 304 ; cache PRIVÉ (réponse liée à la session).
 */
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { env } from '$env/dynamic/private';
import manifeste from '$lib/server/madjaliss-audio.json';
import { deciderAudio } from '$lib/server/mutun-acces';
import { compteSession } from '$lib/server/compte-session';
import type { RequestHandler } from './$types';

const fichiers = (manifeste as { fichiers: Record<string, { o: number; e: string; d: string }> })
  .fichiers;
const dossier = () => env.MADJALISS_AUDIO_DIR || '/madjaliss-audio';

const json = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      vary: 'Cookie',
    },
  });

export const GET: RequestHandler = async ({ params, request }) => {
  const chemin = `${params.texte}/${params.fichier}`;
  const f = /^[a-z][a-z-]{1,30}\/[A-Z]{3}-\d{4}\.mp3$/.test(chemin) ? fichiers[chemin] : undefined;
  if (!f) return json(404, 'introuvable');
  const me = await compteSession(request.headers.get('cookie'));
  const d = deciderAudio(f.d, me);
  if (d === 401) return json(401, 'non_authentifie');
  if (d === 403) return json(403, 'droit_insuffisant');
  const p = join(dossier(), chemin);
  let taille: number;
  try {
    taille = statSync(p).size;
  } catch {
    return json(404, 'introuvable'); // fichier pas encore copié sur ce serveur : pas d'audio, jamais d'erreur 500
  }
  const etag = `"${f.e}"`;
  const base: Record<string, string> = {
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    etag,
    // nom = phrase, contenu remplaçable (voix humaine plus tard) : une semaine, puis revalidation par ETag
    'cache-control': 'private, max-age=604800',
    vary: 'Cookie',
  };
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers: base });
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    let debut = range[1] ? Number(range[1]) : taille - Number(range[2]);
    let fin = range[1] && range[2] ? Number(range[2]) : taille - 1;
    debut = Math.max(0, debut);
    fin = Math.min(fin, taille - 1);
    if (debut > fin || debut >= taille)
      return new Response(null, {
        status: 416,
        headers: { ...base, 'content-range': `bytes */${taille}` },
      });
    return new Response(
      Readable.toWeb(createReadStream(p, { start: debut, end: fin })) as ReadableStream,
      {
        status: 206,
        headers: {
          ...base,
          'content-range': `bytes ${debut}-${fin}/${taille}`,
          'content-length': String(fin - debut + 1),
        },
      },
    );
  }
  return new Response(Readable.toWeb(createReadStream(p)) as ReadableStream, {
    status: 200,
    headers: { ...base, 'content-length': String(taille) },
  });
};
