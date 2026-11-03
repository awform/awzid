/**
 * « Sens et explication » (tafsīr abrégé et mot à mot) — chargement À LA DEMANDE d'UNE sourate à la fois, gardée sur l'appareil
 * (IndexedDB) pour le hors ligne. Le contenu vient de l'API (`/api/v1/tafsir/sourates/:n`), déjà FILTRÉ par public côté serveur
 * (rien de réservé pour l'élève, segments « niveau adulte » aux seuls profils adultes) : le navigateur ne filtre rien lui-même.
 *  - en ligne : la réponse du serveur, gardée pour la prochaine fois ;
 *  - sans réseau : la dernière copie gardée POUR CE PROFIL (la clé porte le profil : l'appareil d'une famille ne ressert jamais
 *    à un enfant ce qui a été reçu pour un adulte) ;
 *  - interrupteur coupé (403) ou non connecté (401) : rien, et la copie gardée est effacée.
 * Types seulement depuis `@awform/content/tafsir` (aucun code du paquet n'entre dans le client).
 */
import { kvGet, kvSet } from '$lib/idb';
import type { SourateTafsir } from '@awform/content/tafsir';

export type { SourateTafsir, PointTafsir, VersetTafsir } from '@awform/content/tafsir';

export type EtatSourate = 'ok' | 'hors_ligne' | 'ferme' | 'indisponible';
export interface ResultatSourate {
  etat: EtatSourate;
  data: SourateTafsir | null;
}

const API = '/api/v1/tafsir/sourates';
const enMemoire = new Map<string, SourateTafsir>();
const enCours = new Map<string, Promise<ResultatSourate>>();

/** Clé de la copie gardée : le profil y figure toujours. */
export const cleCopie = (n: number, profil?: string | null) => `tf:${profil ?? 'compte'}:${n}`;

async function charger(n: number, profil?: string | null): Promise<ResultatSourate> {
  const cle = cleCopie(n, profil);
  const hit = enMemoire.get(cle);
  if (hit) return { etat: 'ok', data: hit };
  let r: Response;
  try {
    r = await fetch(`${API}/${n}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(profil ? { 'x-profil': profil } : {}) },
    });
  } catch {
    // aucun réseau : la copie de l'appareil, pour ce profil
    const copie = await kvGet<SourateTafsir | null>(cle).catch(() => undefined);
    if (copie) {
      enMemoire.set(cle, copie);
      return { etat: 'ok', data: copie };
    }
    return { etat: 'hors_ligne', data: null };
  }
  if (r.ok) {
    const data = (await r.json()) as SourateTafsir;
    enMemoire.set(cle, data);
    void kvSet(cle, data).catch(() => undefined);
    return { etat: 'ok', data };
  }
  if (r.status === 401 || r.status === 403) {
    enMemoire.delete(cle);
    void kvSet(cle, null).catch(() => undefined);
    return { etat: 'ferme', data: null };
  }
  return { etat: 'indisponible', data: null };
}

/** Une seule requête à la fois pour une même sourate et un même profil. */
export function chargerSourate(n: number, profil?: string | null): Promise<ResultatSourate> {
  const cle = cleCopie(n, profil);
  let p = enCours.get(cle);
  if (!p) {
    p = charger(n, profil).finally(() => enCours.delete(cle));
    enCours.set(cle, p);
  }
  return p;
}

/** Vide les copies en mémoire (déconnexion : l'appareil partagé ne garde rien du profil précédent). */
export function viderMemoire(): void {
  enMemoire.clear();
  enCours.clear();
}

// Déconnexion (`logout()` de session.ts annonce l'événement) : la mémoire est vidée sans que la session importe ce module.
if (typeof window !== 'undefined') window.addEventListener('awzid:logout', viderMemoire);

/** Pour les tests. */
export const _viderPourTests = viderMemoire;
