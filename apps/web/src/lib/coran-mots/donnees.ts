/**
 * « Mots du Coran » — chargement À LA DEMANDE des données (une sourate à la fois), gardées sur l'appareil pour le hors
 * ligne. Les données viennent de l'API (`/api/v1/coran-mots/…`), jamais du code de l'application (elles sont sous une
 * autre licence : GNU GPL v3, voir le paquet `@awform/coran-mots-data`).
 *  - en ligne : la réponse du serveur, gardée (IndexedDB) pour la prochaine fois ;
 *  - sans réseau : la dernière copie gardée ;
 *  - interrupteur coupé (403) ou non connecté (401) : rien (la fonction est invisible), et la copie gardée est effacée.
 */
import { kvGet, kvSet } from '$lib/idb';
import type { Connaissance, Entree, Rangs } from './calcul';

const API = '/api/v1/coran-mots';

export interface DonneesSourate {
  s: number;
  v: Entree[][];
}
export type Connus =
  ({ disponible: true; piste: string } & Connaissance) | { disponible: false; raison: string };

export interface Lemme {
  bw: string;
  ar: string;
  nature: string;
  racine: string;
  n: number;
}
export interface Occurrence {
  ref: string;
  s: number;
  a: number;
  /** texte du verset tel que l'affiche le lecteur (basmala d'en-tête retirée) */
  texte: string;
  /** position du mot trouvé dans `texte.split(' ')` */
  i: number;
  forme: string;
  lemme: string;
}
export interface Recherche {
  q: string;
  mode: 'mot' | 'racine';
  approx: boolean;
  racine: string | null;
  total: number;
  page: number;
  parPage: number;
  lemmes: Lemme[];
  racines: string[];
  items: Occurrence[];
}
export interface FamilleLemme extends Lemme {
  rang: number | null;
  unite: string | null;
}
export interface FicheRacine {
  racine: string;
  frequence: number;
  famille: FamilleLemme[];
  /** présent SEULEMENT si le sens est validé (jamais un sens « à vérifier ») */
  sens?: string;
  sources?: string[];
  attribution: string;
}

/** Appel de l'API : le JSON, ou null (interrupteur coupé, non connecté, erreur) ; `reseau` : pas de réponse du tout. */
async function appeler<T>(
  url: string,
  profil?: string,
): Promise<{ data: T | null; status: number; reseau: boolean }> {
  try {
    const r = await fetch(url, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(profil ? { 'x-profil': profil } : {}) },
    });
    return { data: r.ok ? ((await r.json()) as T) : null, status: r.status, reseau: false };
  } catch {
    return { data: null, status: 0, reseau: true };
  }
}

const enCours = new Map<string, Promise<unknown>>();
/** Données gardées : réseau d'abord, copie de l'appareil sans réseau ; copie effacée si la fonction est coupée. */
async function garde<T>(url: string, cle: string, profil?: string): Promise<T | null> {
  const r = await appeler<T>(url, profil);
  if (r.data) {
    void kvSet(cle, r.data).catch(() => undefined);
    return r.data;
  }
  if (r.status === 401 || r.status === 403) {
    void kvSet(cle, null).catch(() => undefined);
    return null;
  }
  return (await kvGet<T>(cle).catch(() => undefined)) ?? null;
}
/** Une seule requête à la fois pour une même adresse (la bande et le lecteur la demandent ensemble). */
function unique<T>(cle: string, f: () => Promise<T>): Promise<T> {
  let p = enCours.get(cle) as Promise<T> | undefined;
  if (!p) {
    p = f().finally(() => enCours.delete(cle));
    enCours.set(cle, p);
  }
  return p;
}

const sourates = new Map<number, DonneesSourate>();
export async function chargerSourate(n: number, profil?: string): Promise<DonneesSourate | null> {
  const hit = sourates.get(n);
  if (hit) return hit;
  const d = await unique(`s${n}`, () =>
    garde<DonneesSourate>(`${API}/sourates/${n}`, `cm:s:${n}`, profil),
  );
  if (d) sourates.set(n, d);
  return d;
}

let rangs: Rangs | null = null;
export async function chargerRangs(profil?: string): Promise<Rangs | null> {
  rangs ??= await unique('rangs', () => garde<Rangs>(`${API}/rangs`, 'cm:rangs', profil));
  return rangs;
}

/** Ce que l'élève a appris (sa progression dans les livres) : redemandé à chaque ouverture du lecteur (au plus 1 fois / minute). */
let connus: { at: number; profil: string; v: Connus | null } | null = null;
export async function chargerConnus(profil: string, force = false): Promise<Connus | null> {
  if (!force && connus && connus.profil === profil && Date.now() - connus.at < 60_000)
    return connus.v;
  const v = await unique(`c${profil}`, () =>
    garde<Connus>(`/api/v1/profiles/${profil}/coran-mots/connus`, `cm:c:${profil}`, profil),
  );
  connus = { at: Date.now(), profil, v };
  return v;
}

export async function rechercher(
  q: string,
  mode: 'mot' | 'racine',
  page = 1,
  lemme?: string,
  profil?: string,
): Promise<Recherche | null | 'reseau'> {
  const p = new URLSearchParams({ q, mode, page: String(page) });
  if (lemme) p.set('lemme', lemme);
  const r = await appeler<Recherche>(`${API}/recherche?${p}`, profil);
  return r.reseau ? 'reseau' : r.data;
}

export async function ficheRacine(
  racine: string,
  profil?: string,
): Promise<FicheRacine | null | 'reseau'> {
  // les lettres de la racine dans la requête : le serveur retrouve la racine (« ك ت ب ») d'après ses lettres
  const r = await appeler<FicheRacine>(`${API}/racine?r=${encodeURIComponent(racine)}`, profil);
  return r.reseau ? 'reseau' : r.data;
}

/** Pour les tests : vide les copies en mémoire. */
export function _viderPourTests(): void {
  sourates.clear();
  rangs = null;
  connus = null;
  enCours.clear();
}
