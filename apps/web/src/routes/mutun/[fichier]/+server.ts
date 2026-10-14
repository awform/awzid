/**
 * Madjaliss — FICHIERS GARDÉS de `/mutun/` (lot 5) : notes de l'enseignant, séances en publication différée, parties de
 * phrases de la Risāla. Servis seulement après authentification, avec le droit adapté (`$lib/server/mutun-acces`) :
 * 401 sans session, 403 sans le droit (invité de la bêta), 404 pour tout autre nom. Les fichiers publics (`<texte>.json`)
 * restent dans `static/mutun` et ne passent pas ici.
 * Les fichiers sont dans `src/lib/server/mutun/` (écrits par `scripts/madjaliss.mjs`) et intégrés à la construction du
 * serveur (chargement paresseux : un fichier n'est lu qu'à la première demande autorisée).
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { decider, type CompteMutun } from '$lib/server/mutun-acces';
import type { RequestHandler } from './$types';

const fichiers = import.meta.glob('../../../lib/server/mutun/*.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const api = () => env.API_URL ?? 'http://127.0.0.1:3000';

const reponse = (status: number, corps: string, extra: Record<string, string> = {}) =>
  new Response(corps, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      vary: 'Cookie',
      ...extra,
    },
  });

/** Le compte de la session (cookie transmis tel quel à l'API), ou null sans session valide. */
async function compte(cookie: string | null): Promise<CompteMutun | null> {
  if (!cookie) return null;
  try {
    const r = await fetch(`${api()}/api/v1/auth/me`, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    return r.ok ? ((await r.json()) as CompteMutun) : null;
  } catch {
    return null; // API injoignable : aucun droit (jamais d'ouverture par défaut)
  }
}

export const GET: RequestHandler = async ({ params, request }) => {
  const nom = params.fichier;
  const me = await compte(request.headers.get('cookie'));
  const d = decider(nom, me);
  if (d === 404) error(404, 'introuvable');
  if (d === 401) return reponse(401, JSON.stringify({ error: { code: 'non_authentifie' } }));
  if (d === 403) return reponse(403, JSON.stringify({ error: { code: 'droit_insuffisant' } }));
  const charge = fichiers[`../../../lib/server/mutun/${nom}`];
  if (!charge) error(404, 'introuvable');
  return reponse(200, await charge());
};
