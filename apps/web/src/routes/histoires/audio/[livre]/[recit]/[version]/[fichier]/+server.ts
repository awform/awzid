/**
 * « Histoire, de la création à nos jours » — NARRATION des récits (voix de synthèse sur le français seulement ; jamais sur l'arabe).
 * Les MP3 ne sont ni dans `static/` ni dans le paquet de l'appli, ni précachés par le service worker : servis ici depuis
 * `${MADJALISS_AUDIO_DIR}/histoires/<livre>/<récit>/<enfant|adulte>/p###.mp3` (stockage en lecture seule du serveur), après
 * contrôle par l'API (`GET /api/v1/histoires/acces` : session et interrupteur `histoires`) :
 *  401 sans session, 403 fonction coupée, 404 pour tout nom hors du gabarit ou fichier absent ; Range (206), cache PRIVÉ.
 */
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const api = () => env.API_URL ?? 'http://127.0.0.1:3000';
const dossier = () => join(env.MADJALISS_AUDIO_DIR || '/madjaliss-audio', 'histoires');
const LIVRES = new Set(['prophetes', 'livre2', 'livre4', 'livre5']);

const json = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      vary: 'Cookie',
    },
  });

async function acces(cookie: string | null): Promise<number> {
  if (!cookie) return 401;
  try {
    const r = await fetch(`${api()}/api/v1/histoires/acces`, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    return r.status === 204 ? 204 : r.status === 403 ? 403 : 401;
  } catch {
    return 401; // API injoignable : aucun droit
  }
}

export const GET: RequestHandler = async ({ params, request }) => {
  const { livre, recit, version, fichier } = params;
  if (
    !LIVRES.has(livre) ||
    !/^[0-9]{2}[A-Za-z]?_[a-z0-9_]{1,60}$|^[HCV][0-9]{2}[A-Za-z]?_[a-z0-9_]{1,60}$/.test(recit) ||
    (version !== 'enfant' && version !== 'adulte') ||
    !/^p\d{3}\.mp3$/.test(fichier)
  )
    return json(404, 'introuvable');
  const a = await acces(request.headers.get('cookie'));
  if (a === 401) return json(401, 'non_authentifie');
  if (a === 403) return json(403, 'fonction_coupee');
  const p = join(dossier(), livre, recit, version, fichier);
  let taille: number;
  let mtime: number;
  try {
    const s = statSync(p);
    taille = s.size;
    mtime = s.mtimeMs;
  } catch {
    return json(404, 'introuvable');
  }
  const etag = `"${taille.toString(36)}-${Math.round(mtime).toString(36)}"`;
  const base: Record<string, string> = {
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    etag,
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
