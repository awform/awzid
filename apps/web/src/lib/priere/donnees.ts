/**
 * « La prière de A à Z » (25/10/2026) — données du parcours : fichiers par écran (`/priere-data/<nom>.json`, générés
 * par scripts/priere-donnees.mjs depuis packages/content/data/priere/), chargés À LA DEMANDE (jamais préchargés) et
 * gardés sur l'appareil à la première ouverture ; progression de l'élève gardée SUR L'APPAREIL (IndexedDB, par profil,
 * comme les autres progressions). Aucun texte n'est écrit ici : tout vient des données. L'arabe n'est jamais modifié.
 */
import { kvGet, kvSet } from '$lib/idb';
import type { Calage } from './calendrier';

export interface Niveau {
  code: string;
  libelle: string;
}
export interface MotAMot {
  ar: string;
  fr: string;
}
export interface Verset {
  ref: string;
  ar: string;
  audio?: string;
  sens?: string;
  reponse_d_allah?: string;
}
/** élément de contenu (parole, règle, preuve, liste, tableau, groupe, étape…) : champs facultatifs, selon le type */
export interface Element {
  id: string;
  type: string;
  titre?: string;
  fr?: string;
  ar?: string;
  ar_fr?: string;
  sens?: string;
  nature?: string;
  niveau?: Niveau | Niveau[];
  voix?: string;
  repetition?: string;
  explication?: string;
  autres_ecoles?: string;
  note?: string;
  notes?: string[];
  reference?: string;
  authenticite?: string;
  traduction?: string;
  sources?: string[];
  audio?: string | string[];
  audio_note?: string;
  extrait?: boolean;
  mot_a_mot?: MotAMot[];
  ar_versets?: Verset[];
  partie?: Array<{
    nom: string;
    refs_hafs: string[];
    debut?: { ar: string };
    fin?: { ar: string };
    fr: string;
  }>;
  partie_source?: string;
  numerotation?: string;
  note_basmala?: { fr: string; sources?: string[] };
  variante?: { ar: string; fr?: string; audio?: string };
  intro?: string;
  items?: string[];
  colonnes?: string[];
  lignes?: string[][];
  textes?: Array<{ ar: string; fr?: string; audio?: string }>;
  geste?: string;
  erreurs_frequentes?: string[];
  paroles?: Element[];
  preuves?: Element[];
  etapes?: Element[];
  elements?: Element[];
  sous_sections?: Element[];
}
export interface Section {
  id: string;
  titre: string;
  statut: string;
  intro: string;
  elements?: Element[];
  sous_sections?: Element[];
}
export interface BeatVideo {
  r: number;
  pose: string;
  etape: string;
  attente?: number;
  takbir?: boolean;
  paroles?: string[];
  coran?: string;
  sourate?: boolean;
}
export interface Animation {
  accueil: { citation: string; stations: Record<string, string>; ecrans: Record<string, string> };
  pas: {
    rakaat: number;
    etapes: Record<string, { pose: string; rakaa: number; suite?: string[] }>;
  };
  video: { sourates: Record<string, number>; beats: BeatVideo[] };
  ablutions: Record<
    string,
    { geste: string; fois?: number; homme_seulement?: boolean; regle?: string }
  >;
  pictos: Record<string, string>;
  entrainement: Array<{ id: string; parole: string }>;
  apres: { compteur: string[]; suite: string[]; centaine: string[] };
  situations: Record<string, { pose: string; theme: string; genre?: 'homme' | 'femme' }>;
}
export interface Plan {
  format: 1;
  v: string;
  genere: string;
  meta: {
    titre: string;
    public: string;
    ecole: string;
    statut: string;
    niveaux: Record<string, string>;
  };
  sections: Array<{ id: string; titre: string; statut: string; intro: string }>;
  /** unités à parcourir par section (identifiants), calculées à la génération */
  unites: Record<string, string[]>;
  citation: Element | null;
  animation: Animation;
}
export interface Sourate {
  numero: number;
  nom_ar: string;
  nom_fr: string;
  nombre_versets: number;
  revelation?: string;
  note_revelation?: string;
  basmala_de_tete: { ar: string; audio: string; note?: string } | null;
  versets: Array<{
    ref: string;
    ar: string;
    audio: string;
    mot_a_mot: MotAMot[];
    sens: string;
    note?: string;
    recite_dans_la_priere_obligatoire?: boolean;
    basmala?: boolean;
  }>;
  sens_general?: string;
  apport_pour_la_priere?: string;
  tafsir?: Array<{ point: string; explication: string; sources?: string[] }>;
  sources?: string[];
  traduction?: string;
  statut: string;
  numerotation?: string;
  note_priere?: { fr: string; sources?: string[] };
}
export interface DonneesSourate {
  format: 1;
  v: string;
  basmala: { ar: string; sens: string; note?: string; mot_a_mot: MotAMot[] };
  sourate: Sourate;
}
export interface DonneesSection {
  format: 1;
  v: string;
  section: Section;
}

export const urlPriere = (nom: string) => `/priere-data/${encodeURIComponent(nom)}.json`;
export const clePriere = (nom: string) => `priere-data:${nom}`;

const valide = (c: unknown): c is { format: 1; v: string } =>
  !!c && (c as { format?: number }).format === 1 && typeof (c as { v?: unknown }).v === 'string';

async function reseau<T>(nom: string, fetchFn: typeof fetch): Promise<T | null> {
  try {
    const r = await fetchFn(urlPriere(nom), { cache: 'no-cache' });
    if (!r.ok) return null;
    const c: unknown = await r.json();
    if (!valide(c)) return null;
    await kvSet(clePriere(nom), c).catch(() => {});
    return c as T;
  } catch {
    return null;
  }
}

/** Un fichier de données : copie de l'appareil d'abord (hors ligne), rafraîchie en arrière-plan ; null si rien. */
export async function charger<T extends { v: string }>(
  nom: string,
  fetchFn: typeof fetch = fetch,
): Promise<T | null> {
  const local = await kvGet<T>(clePriere(nom)).catch(() => undefined);
  if (valide(local)) {
    void reseau<T>(nom, fetchFn);
    return local;
  }
  return reseau<T>(nom, fetchFn);
}

export const chargerPlan = (f?: typeof fetch) => charger<Plan>('plan', f);
export async function chargerSection(id: string, f?: typeof fetch): Promise<Section | null> {
  return (await charger<DonneesSection>(id.toLowerCase(), f))?.section ?? null;
}
export const chargerSourate = (n: number, f?: typeof fetch) =>
  charger<DonneesSourate>(`sourate-${n}`, f);

/** Calage mesuré des fichiers de synthèse (clé = nom du fichier) ; vide s'il est absent. */
export async function chargerCalage(f: typeof fetch = fetch): Promise<Record<string, Calage>> {
  try {
    const r = await f(urlPriere('calage'));
    if (!r.ok) return {};
    const j = (await r.json()) as { calage?: Record<string, Calage> };
    return j.calage ?? {};
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ parcours dans les données

/** Parcourt récursivement un contenu et appelle `f` sur chaque objet. */
export function parcourir(o: unknown, f: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(o)) for (const x of o) parcourir(x, f);
  else if (o && typeof o === 'object') {
    f(o as Record<string, unknown>);
    for (const v of Object.values(o)) parcourir(v, f);
  }
}
/** Premier élément portant cet identifiant (une même parole peut revenir à plusieurs étapes : même contenu). */
export function trouver(racine: unknown, id: string): Element | null {
  let r: Element | null = null;
  parcourir(racine, (o) => {
    if (!r && o.id === id) r = o as unknown as Element;
  });
  return r;
}
/** Étapes du pas à pas d'un type (`S5.subh`, `S2A.etapes`…) */
export function etapesDe(s: Section | null, idPasAPas: string): Element[] {
  return trouver(s, idPasAPas)?.etapes ?? [];
}

export const listeNiveaux = (e: { niveau?: Niveau | Niveau[] }): Niveau[] =>
  e.niveau ? (Array.isArray(e.niveau) ? e.niveau : [e.niveau]) : [];

/** classe de pastille selon le code de niveau du référent */
export const CLASSE_NIVEAU: Record<string, string> = {
  FARD: 'obligatoire',
  SHART: 'obligatoire',
  SUNNA: 'sunna',
  MANDUB: 'recommande',
  JAIZ: 'permis',
  MAKRUH: 'deconseille',
  HARAM: 'interdit',
  MUBTIL: 'interdit',
};

/** Nombre de répétitions d'une parole : « 33 fois » → 33 ; 1 par défaut. */
export const repetitions = (e: { repetition?: string }): number => {
  const n = Number(/\d+/.exec(e.repetition ?? '')?.[0]);
  return n > 0 ? n : 1;
};

/** Parties de la voix : « imam : à voix haute ; seul : à voix basse » → une ligne par partie. */
export const lignesVoix = (
  voix: string | undefined,
): Array<{ texte: string; haute: boolean; basse: boolean }> =>
  (voix ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((texte) => ({ texte, haute: /haute/i.test(texte), basse: /basse/i.test(texte) }));

// ------------------------------------------------------------------ texte français qui cite de l'arabe

// classes de signes combinants voulues (harakāt)
/* eslint-disable no-misleading-character-class */
const RX_PASSAGE =
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFC][\u0600-\u06FF\u0750-\u077F\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFC\u064B-\u065F\u0670\s\u060C\u061B\u061F·…]*/g;
/* eslint-enable no-misleading-character-class */
export type Morceau = { fr: string } | { ar: string };

/**
 * Un texte français qui cite de l'arabe est découpé : l'arabe passe sur sa propre ligne (règle de l'application).
 * Le symbole \uFDFA (U+FDFA) reste dans le français. Aucun caractère n'est modifié, seuls les guillemets ou parenthèses
 * laissés vides autour d'un passage arabe sont retirés de l'affichage.
 */
export function decouper(txt: string): Morceau[] {
  const m: Morceau[] = [];
  let dernier = 0;
  RX_PASSAGE.lastIndex = 0;
  for (let x = RX_PASSAGE.exec(txt); x; x = RX_PASSAGE.exec(txt)) {
    m.push({ fr: txt.slice(dernier, x.index) });
    m.push({ ar: x[0].trim() });
    dernier = x.index + x[0].length;
  }
  m.push({ fr: txt.slice(dernier) });
  return m
    .map((k, i) => {
      if (!('fr' in k)) return k;
      let t = k.fr;
      if ('ar' in (m[i + 1] ?? {})) t = t.replace(/\s*[«(]\s*$/, '').replace(/\s+$/, '');
      if ('ar' in (m[i - 1] ?? {})) t = t.replace(/^\s*[»)]\s*/, '').replace(/^\s*,\s*/, '');
      return { fr: t };
    })
    .filter((k) => ('fr' in k ? k.fr.trim() !== '' : true));
}

// ------------------------------------------------------------------ progression de l'élève

export interface Progres {
  /** identifiants d'unités vues (étapes, situations, sourates, invocations…) */
  vus: string[];
  /** silhouette choisie */
  genre: 'homme' | 'femme';
  /** traduction visible (Voir / Cacher la traduction) */
  trad: boolean;
  /** entraînement : cran de masquage et prochaine révision, par texte */
  entr: Record<string, { niveau: number; revision?: string }>;
}
export const progresVide = (): Progres => ({ vus: [], genre: 'homme', trad: true, entr: {} });
export const cleProgres = (profil: string | null | undefined) =>
  `priere:progres:${profil ?? 'compte'}`;

export async function lireProgres(profil: string | null | undefined): Promise<Progres> {
  const p = await kvGet<Progres>(cleProgres(profil)).catch(() => undefined);
  return { ...progresVide(), ...(p ?? {}) };
}
export async function ecrireProgres(profil: string | null | undefined, p: Progres): Promise<void> {
  // copie simple : les objets réactifs de Svelte ne se rangent pas tels quels dans IndexedDB
  await kvSet(cleProgres(profil), JSON.parse(JSON.stringify(p)) as Progres).catch(() => {});
}

export interface Station {
  id: string;
  fait: boolean;
  /** unités vues / unités à voir */
  n: number;
  total: number;
}
/** Avancement par section : une section est faite quand toutes ses unités sont vues. */
export function stations(plan: Plan, vus: readonly string[]): Station[] {
  return plan.sections.map((s) => {
    const u = plan.unites[s.id] ?? [s.id];
    const n = u.filter((x) => vus.includes(x)).length;
    return { id: s.id, fait: u.length > 0 && n >= u.length, n, total: u.length };
  });
}
/** Section en cours : la première qui n'est pas faite. */
export const ici = (st: readonly Station[]): string | null => st.find((s) => !s.fait)?.id ?? null;

/** Ajoute une unité vue (sans doublon) ; renvoie le même objet si rien ne change. */
export const marquerVu = (p: Progres, id: string): Progres =>
  p.vus.includes(id) ? p : { ...p, vus: [...p.vus, id] };
