/**
 * Lectures (Khalīl, Histoires) — chargement À LA DEMANDE d'une partie à la fois (`/api/v1/khalil/…`, `/api/v1/histoires/…`), déjà
 * filtrée par public côté serveur. Copie en mémoire seulement (vidée à la fermeture de l'onglet) ; 401/403 : « ferme ».
 */
export type Etat = 'ok' | 'hors_ligne' | 'ferme' | 'adultes' | 'indisponible';
export interface Resultat<T> {
  etat: Etat;
  data: T | null;
}
const memoire = new Map<string, unknown>();

export async function charger<T>(
  chemin: string,
  profil?: string | null,
  enfant = false,
): Promise<Resultat<T>> {
  const k = `${profil ?? 'compte'}:${enfant ? 'e' : 'a'}:${chemin}`;
  const hit = memoire.get(k) as T | undefined;
  if (hit) return { etat: 'ok', data: hit };
  let r: Response;
  try {
    r = await fetch(`/api/v1/${chemin}${enfant ? '?p=enfant' : ''}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(profil ? { 'x-profil': profil } : {}) },
    });
  } catch {
    return { etat: 'hors_ligne', data: null };
  }
  if (r.ok) {
    const data = (await r.json()) as T;
    memoire.set(k, data);
    return { etat: 'ok', data };
  }
  if (r.status === 403) {
    const code = ((await r.json().catch(() => null)) as { error?: { code?: string } } | null)?.error
      ?.code;
    return { etat: code === 'reserve_adultes' ? 'adultes' : 'ferme', data: null };
  }
  if (r.status === 401) return { etat: 'ferme', data: null };
  return { etat: 'indisponible', data: null };
}

/** Pour les tests. */
export const _vider = (): void => memoire.clear();
