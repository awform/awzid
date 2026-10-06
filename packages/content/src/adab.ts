/**
 * Chantier A37 — « Vivre l'islam », onglet BON COMPORTEMENT : modèle partagé (API et application).
 *
 * Deux sources, rien d'écrit ici :
 *  - les RUBRIQUES déjà dans les livres gelés (bloc `fiqh_adab` des leçons de langue ; rubriques `adab`, `fiqh`,
 *    `usra`, `muamalat` des leçons de sciences) — rangées par cercle et par lieu (classement automatique prudent
 *    `adab-classer.ts`, corrigeable, remplacé par l'index officiel des livres `data/akhlaq/index-adab.json`) ;
 *  - les FICHES du livret « Bon comportement » (`data/akhlaq/fiches/*.json`, voir `akhlaq.ts`).
 * Ce module ne contient que des listes d'identifiants et des fonctions pures (filtres par âge et par niveau,
 * regroupement, défi de la semaine), testées dans `test/adab.test.ts`.
 */

export type Kind = 'enfant' | 'ado' | 'adulte';
export const KINDS: readonly Kind[] = ['enfant', 'ado', 'adulte'];

/** Cercles (« avec qui ? »), dans l'ordre d'affichage ; `ages` : publics qui les voient. */
export const CERCLES = [
  { id: 'soi', ages: KINDS },
  { id: 'allah_prophete', ages: KINDS },
  { id: 'parents', ages: KINDS },
  { id: 'fratrie', ages: KINDS },
  { id: 'epoux', ages: ['adulte'] },
  { id: 'enfants', ages: ['adulte'] },
  { id: 'famille', ages: KINDS },
  { id: 'voisins', ages: KINDS },
  { id: 'amis', ages: KINDS },
  { id: 'ecole', ages: KINDS },
  { id: 'travail', ages: ['ado', 'adulte'] },
  { id: 'societe', ages: KINDS },
  { id: 'rue', ages: KINDS },
  { id: 'fragiles', ages: KINDS },
  { id: 'musulmans', ages: KINDS },
  { id: 'religions', ages: KINDS },
  { id: 'nature', ages: KINDS },
  { id: 'ecrans', ages: KINDS },
] as const satisfies ReadonlyArray<{ id: string; ages: readonly Kind[] }>;
export type CercleId = (typeof CERCLES)[number]['id'];

/** Lieux (« où ? »), dans l'ordre d'affichage. */
export const LIEUX = [
  { id: 'maison', ages: KINDS },
  { id: 'chambre', ages: KINDS },
  { id: 'cuisine', ages: KINDS },
  { id: 'toilettes', ages: KINDS },
  { id: 'mosquee', ages: KINDS },
  { id: 'ecole', ages: KINDS },
  { id: 'rue', ages: KINDS },
  { id: 'transports', ages: KINDS },
  { id: 'travail', ages: ['ado', 'adulte'] },
] as const satisfies ReadonlyArray<{ id: string; ages: readonly Kind[] }>;
export type LieuId = (typeof LIEUX)[number]['id'];

export const CERCLE_IDS: readonly string[] = CERCLES.map((c) => c.id);
export const LIEU_IDS: readonly string[] = LIEUX.map((l) => l.id);
export const isCercle = (x: unknown): x is CercleId =>
  typeof x === 'string' && CERCLE_IDS.includes(x);
export const isLieu = (x: unknown): x is LieuId => typeof x === 'string' && LIEU_IDS.includes(x);

/** Statut d'un point d'une fiche (étiquette de couleur à l'affichage). */
export const STATUTS = ['obligatoire', 'recommande', 'permis', 'deconseille', 'interdit'] as const;
export type Statut = (typeof STATUTS)[number];
export const isStatut = (x: unknown): x is Statut =>
  typeof x === 'string' && (STATUTS as readonly string[]).includes(x);

/** Origine du rangement d'une rubrique : index officiel des livres > correction manuelle > automatique. */
export type Rangement = 'index' | 'correction' | 'auto';

/** Rubrique d'un livre gelé, rangée par cercle et par lieu (le texte reste dans la leçon). */
export interface AdabEntry {
  /** `<leçon>.<chemin>` : « en1.l05.fiqh_adab », « ra1.l01.rubriques.3 » */
  id: string;
  unit: string;
  level: string;
  n: number;
  /** chemin du bloc dans la leçon (projection élève) */
  path: string;
  /** nature du bloc : bloc des leçons de langue, ou code de la rubrique de sciences */
  code: 'fiqh_adab' | 'adab' | 'fiqh' | 'usra' | 'muamalat';
  titre_fr: string;
  titre_ar: string;
  cercles: CercleId[];
  lieux: LieuId[];
  rangement: Rangement;
  /** défi possible : point du livre à la première personne (« Je … »), recopié tel quel */
  defi?: { ar?: string; fr: string };
  /** situations « Que fais-tu si… ? » du livre (rubriques de sciences) */
  situations?: number;
}

/** Point d'une fiche : texte, statut (étiquette), arabe et source facultatifs. */
export interface FichePoint {
  fr: string;
  statut?: Statut;
  ar?: string;
  source_fr?: string;
}
/** Ce qu'on dit : arabe sur sa ligne, traduction dessous, source. */
export interface FicheDire {
  ar: string;
  fr: string;
  source_fr?: string;
}
/** Fiche du livret « Bon comportement » (format de `data/akhlaq/fiches/*.json`, voir `akhlaq.ts`). */
export interface Fiche {
  id: string;
  titre_fr: string;
  titre_ar?: string;
  cercles: CercleId[];
  lieux: LieuId[];
  ages: Kind[];
  /** leçons (identifiants d'unité) à avoir atteintes ; vide : fiche de l'âge, sans condition */
  prerequis: string[];
  situation_fr: string;
  etapes: { avant: FichePoint[]; pendant: FichePoint[]; apres: FichePoint[] };
  dire: FicheDire[];
  pourquoi_fr?: string;
  vraie_vie_fr?: string;
  /** ados et adultes : « Que fais-tu si… ? » */
  situations: Array<{ question_fr: string; reponse_fr: string }>;
  defi_fr?: string;
  /** fiche d'ESSAI (tests seulement, jamais servie en démonstration ni en production) */
  test?: boolean;
}

/** Résumé d'une fiche pour les listes. */
export type FicheResume = Pick<
  Fiche,
  'id' | 'titre_fr' | 'titre_ar' | 'cercles' | 'lieux' | 'ages'
> & {
  test?: boolean;
};

/** Ce que voit l'élève : son âge et les leçons déjà atteintes (`null` : aucun filtre de niveau). */
export interface Learner {
  kind: Kind | null;
  units: ReadonlySet<string> | null;
}

const okAge = (ages: readonly Kind[], kind: Kind | null) => !kind || ages.includes(kind);
const cercleOk = (id: CercleId, kind: Kind | null) =>
  okAge(CERCLES.find((c) => c.id === id)?.ages ?? KINDS, kind);
const lieuOk = (id: LieuId, kind: Kind | null) =>
  okAge(LIEUX.find((l) => l.id === id)?.ages ?? KINDS, kind);

/** Cercles et lieux proposés à un public. */
export const cerclesFor = (kind: Kind | null) => CERCLES.filter((c) => okAge(c.ages, kind));
export const lieuxFor = (kind: Kind | null) => LIEUX.filter((l) => okAge(l.ages, kind));

/**
 * Rubriques visibles : celles des leçons que l'élève a déjà atteintes (ses livres les ont enseignées), sans les
 * cercles et lieux d'un autre âge (une rubrique rangée SEULEMENT dans un cercle d'adulte n'est pas montrée à un
 * enfant).
 */
export function visibleEntries(entries: readonly AdabEntry[], who: Learner): AdabEntry[] {
  const out: AdabEntry[] = [];
  for (const e of entries) {
    if (who.units && !who.units.has(e.unit)) continue;
    const cercles = e.cercles.filter((c) => cercleOk(c, who.kind));
    if (e.cercles.length && !cercles.length) continue;
    out.push({ ...e, cercles, lieux: e.lieux.filter((l) => lieuOk(l, who.kind)) });
  }
  return out;
}

/** Fiches visibles : de son âge, prérequis atteints ; fiches d'essai seulement si `essai`. */
export function visibleFiches<F extends FicheResume & { prerequis?: string[] }>(
  fiches: readonly F[],
  who: Learner,
  essai = false,
): F[] {
  return fiches.filter(
    (f) =>
      (essai || !f.test) &&
      okAge(f.ages, who.kind) &&
      (!who.units || (f.prerequis ?? []).every((u) => who.units!.has(u))),
  );
}

/** Rubriques et fiches d'un cercle ou d'un lieu. */
export function inGroup<T extends { cercles: readonly string[]; lieux: readonly string[] }>(
  list: readonly T[],
  by: 'cercle' | 'lieu',
  id: string,
): T[] {
  return list.filter((x) => (by === 'cercle' ? x.cercles : x.lieux).includes(id));
}

/** Nombre d'éléments par cercle ou par lieu (tuiles sans contenu masquées par l'interface). */
export function countBy(
  list: ReadonlyArray<{ cercles: readonly string[]; lieux: readonly string[] }>,
  by: 'cercle' | 'lieu',
): Record<string, number> {
  const n: Record<string, number> = {};
  for (const x of list)
    for (const id of by === 'cercle' ? x.cercles : x.lieux) n[id] = (n[id] ?? 0) + 1;
  return n;
}

/** Semaine ISO (année et numéro) d'une date : le défi change chaque lundi. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((+t - +y0) / 86_400_000 + 1) / 7) };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Defi =
  | { kind: 'fiche'; fiche: string; titre_fr: string; fr: string }
  | { kind: 'rubrique'; entry: string; unit: string; titre_fr: string; ar?: string; fr: string };

/**
 * Défi de la semaine : le même toute la semaine pour un élève (graine = profil), différent d'un élève à l'autre ;
 * pris d'abord dans les fiches visibles qui en ont un, sinon dans un point « Je … » d'une rubrique déjà étudiée.
 */
export function weeklyChallenge(
  entries: readonly AdabEntry[],
  fiches: ReadonlyArray<FicheResume & { defi_fr?: string }>,
  date: Date,
  seed = '',
): Defi | null {
  const { year, week } = isoWeek(date);
  const k = hash(`${seed}:${year}:${week}`);
  const withDefi = fiches.filter((f) => f.defi_fr);
  if (withDefi.length) {
    const f = withDefi[k % withDefi.length]!;
    return { kind: 'fiche', fiche: f.id, titre_fr: f.titre_fr, fr: f.defi_fr! };
  }
  const pool = entries.filter((e) => e.defi);
  if (!pool.length) return null;
  const e = pool[k % pool.length]!;
  return {
    kind: 'rubrique',
    entry: e.id,
    unit: e.unit,
    titre_fr: e.titre_fr,
    ...(e.defi!.ar ? { ar: e.defi!.ar } : {}),
    fr: e.defi!.fr,
  };
}

/** Leçon et chemin d'un identifiant de rubrique (« ra1.l01.rubriques.3 » → ra1.l01, rubriques.3). */
export function splitEntryId(id: string): { unit: string; path: string } | null {
  const m = /^([a-z]+\d+\.[a-z]\d+)\.(fiqh_adab|rubriques\.\d+)$/.exec(id);
  return m ? { unit: m[1]!, path: m[2]! } : null;
}
