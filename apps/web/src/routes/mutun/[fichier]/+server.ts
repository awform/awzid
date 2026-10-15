/**
 * Madjaliss — FICHIERS GARDÉS de `/mutun/` (lot 5) : notes de l'enseignant, séances en publication différée, parties de
 * phrases de la Risāla. Servis seulement après authentification, avec le droit adapté (`$lib/server/mutun-acces`) :
 * 401 sans session, 403 sans le droit (invité de la bêta), 404 pour tout autre nom. Les fichiers publics (`<texte>.json`)
 * restent dans `static/mutun` et ne passent pas ici.
 * Les fichiers sont dans `src/lib/server/mutun/` (écrits par `scripts/madjaliss.mjs`) et intégrés à la construction du
 * serveur (chargement paresseux : un fichier n'est lu qu'à la première demande autorisée).
 */
import { error } from '@sveltejs/kit';
import { compteSession } from '$lib/server/compte-session';
import { decider } from '$lib/server/mutun-acces';
import type { RequestHandler } from './$types';

const fichiers = import.meta.glob('../../../lib/server/mutun/*.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

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

export const GET: RequestHandler = async ({ params, request }) => {
  const nom = params.fichier;
  const me = await compteSession(request.headers.get('cookie'));
  const d = decider(nom, me);
  if (d === 404) error(404, 'introuvable');
  if (d === 401) return reponse(401, JSON.stringify({ error: { code: 'non_authentifie' } }));
  if (d === 403) return reponse(403, JSON.stringify({ error: { code: 'droit_insuffisant' } }));
  const charge = fichiers[`../../../lib/server/mutun/${nom}`];
  if (!charge) error(404, 'introuvable');
  return reponse(200, await charge());
};
