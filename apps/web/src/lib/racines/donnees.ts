/**
 * « Famille de mots » — chargement À LA DEMANDE de l'index puis d'UNE famille à la fois (`/api/v1/racines/…`), déjà filtrés par public
 * côté serveur (l'enfant ne reçoit que ses familles et ses mots, sans moule). Gardés sur l'appareil (IndexedDB), par profil, pour le
 * hors ligne ; interrupteur coupé (403) ou non connecté (401) : rien, et la copie gardée est effacée.
 */
import { kvGet, kvSet } from '$lib/idb';
import type { Famille, Index } from './logique';

export type Etat = 'ok' | 'hors_ligne' | 'ferme' | 'indisponible';
export interface Resultat<T> {
  etat: Etat;
  data: T | null;
}
const API = '/api/v1/racines';
const memoire = new Map<string, unknown>();

async function charger<T>(
  chemin: string,
  cle: string,
  profil?: string | null,
  enfant = false,
): Promise<Resultat<T>> {
  const k = `rc:${profil ?? 'compte'}:${enfant ? 'e' : 'a'}:${cle}`;
  const hit = memoire.get(k) as T | undefined;
  if (hit) return { etat: 'ok', data: hit };
  let r: Response;
  try {
    r = await fetch(`${API}/${chemin}${enfant ? '?p=enfant' : ''}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(profil ? { 'x-profil': profil } : {}) },
    });
  } catch {
    const copie = await kvGet<T | null>(k).catch(() => undefined);
    if (copie) {
      memoire.set(k, copie);
      return { etat: 'ok', data: copie };
    }
    return { etat: 'hors_ligne', data: null };
  }
  if (r.ok) {
    const data = (await r.json()) as T;
    memoire.set(k, data);
    void kvSet(k, data).catch(() => undefined);
    return { etat: 'ok', data };
  }
  if (r.status === 401 || r.status === 403) {
    memoire.delete(k);
    void kvSet(k, null).catch(() => undefined);
    return { etat: 'ferme', data: null };
  }
  return { etat: 'indisponible', data: null };
}

export const chargerIndex = (profil?: string | null, enfant = false) =>
  charger<Index>('index', 'index', profil, enfant);
export const chargerFamille = (id: number, profil?: string | null, enfant = false) =>
  charger<Famille>(`familles/${id}`, String(id), profil, enfant);

/** Pour les tests. */
export const _vider = (): void => memoire.clear();
