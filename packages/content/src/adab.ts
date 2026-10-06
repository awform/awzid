/**
 * Chantier A37 — « Vivre l'islam », onglet BON COMPORTEMENT : modèle partagé (API et application).
 *
 * Deux sources, rien d'écrit ici :
 *  - les RUBRIQUES déjà dans les livres gelés (bloc `fiqh_adab` des leçons de langue ; rubriques `adab`, `usra`,
 *    `muamalat` des leçons de religion), rangées par cercle et par lieu par l'INDEX OFFICIEL des livres
 *    (`data/akhlaq/index-adab.json`, chantier B9) ; à défaut, classement automatique prudent (`adab-classer.ts`) ;
 *  - les FICHES du livret « Bon comportement » (`data/akhlaq/fiches/akh.fNNN.json`, format des livres :
 *    `ids/akhlaq-SCHEMA-B9.md`, lu par `akhlaq.ts`).
 * Ce module ne contient que des listes d'identifiants (ceux des livres) et des fonctions pures (filtres par âge
 * et par niveau, texte d'un point selon l'âge, regroupement, défi de la semaine), testées dans `test/adab.test.ts`.
 */

export type Kind = 'enfant' | 'ado' | 'adulte';
export const KINDS: readonly Kind[] = ['enfant', 'ado', 'adulte'];

/**
 * Cercles (« avec qui ? ») : identifiants des livres (index B9), dans l'ordre d'affichage ; `ages` : publics qui
 * les voient (décision du référent : Époux et Enfants — éduquer — aux adultes, Travail aux ados et adultes).
 */
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
  { id: 'autorites', ages: KINDS },
  { id: 'espace_public', ages: KINDS },
  { id: 'fragiles', ages: KINDS },
  { id: 'musulmans_avis', ages: KINDS },
  { id: 'autres_religions', ages: KINDS },
  { id: 'animaux_nature', ages: KINDS },
  { id: 'numerique', ages: KINDS },
] as const satisfies ReadonlyArray<{ id: string; ages: readonly Kind[] }>;
export type CercleId = (typeof CERCLES)[number]['id'];

/** Lieux (« où ? »), identifiants des livres, dans l'ordre d'affichage. */
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
export const isKind = (x: unknown): x is Kind => typeof x === 'string' && KINDS.includes(x as Kind);

/**
 * Statut d'un point (acte dont parle le point, avis le plus connu de l'école de l'imam Mālik). Les cinq premiers
 * sont des étiquettes religieuses ; `conseil` = conseil pratique SANS statut religieux (pastille neutre).
 */
export const STATUTS = [
  'obligatoire',
  'recommande',
  'permis',
  'deconseille',
  'interdit',
  'conseil',
] as const;
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
  /** nature du bloc : bloc des leçons de langue, ou code de la rubrique de religion */
  code: 'fiqh_adab' | 'adab' | 'fiqh' | 'usra' | 'muamalat';
  titre_fr: string;
  titre_ar: string;
  cercles: CercleId[];
  lieux: LieuId[];
  rangement: Rangement;
  /** fiches liées par l'index officiel */
  fiches?: string[];
  /** défi possible : point du livre à la première personne (« Je … »), recopié tel quel */
  defi?: { ar?: string; fr: string };
  /** situations « Que fais-tu si… ? » du livre (rubriques de religion) */
  situations?: number;
}

/** Point d'étape d'une fiche (format des livres). */
export interface FichePoint {
  id: string;
  fr: string;
  enfant_fr?: string;
  ado_fr?: string;
  adulte_fr?: string;
  /** restreint le point à certains âges de la fiche */
  ages?: Kind[];
  statut: Statut;
  /** `forte` : sunna fortement recommandée (affichée « Recommandé · sunna ») */
  force?: 'forte';
  note_fr?: string;
  /** sources lisibles (ouvrages, recueils de hadiths, versets), résolues à l'import */
  sources_fr?: string[];
}

/** Ce qu'on dit (formule à prononcer) ou ce qu'on retient (hadith, verset à méditer). */
export interface FicheDire {
  id: string;
  moment?: 'avant' | 'pendant' | 'apres';
  role: 'dire' | 'rappel';
  type: 'hadith' | 'coran' | 'formule';
  ar: string;
  fr: string;
  enfant_fr?: string;
  ages?: Kind[];
  /** verset : référence « s:v » ou « s:v-w » (texte Tanzil, récitant humain, jamais de voix de synthèse) */
  src?: string;
  recitation?: string;
  /** source lisible (« Rapporté par al-Bukhārī (142) », « Coran 7:31 »…), résolue à l'import */
  source_fr?: string;
}

/** Fiche du livret « Bon comportement » (format des livres, champs utiles à l'application). */
export interface Fiche {
  id: string;
  theme?: string;
  titre_fr: string;
  titre_ar?: string;
  cercles: CercleId[];
  lieux: LieuId[];
  ages: Kind[];
  situation: Partial<Record<Kind | 'tous', string>>;
  etapes: { avant: FichePoint[]; pendant: FichePoint[]; apres: FichePoint[] };
  dire: FicheDire[];
  pourquoi_fr?: string;
  pourquoi_enfant_fr?: string;
  attention_fr?: string;
  vraie_vie: Array<{ pays: string[]; fr: string }>;
  religion_coutume_fr?: string;
  defi_fr?: string;
  defi_enfant_fr?: string;
  liens: { lecons: string[]; fiches: string[]; gp: string[] };
  /** fiche d'ESSAI (tests seulement, jamais servie en démonstration ni en production) */
  test?: boolean;
}

/** Résumé d'une fiche pour les listes et le défi (la fiche entière se charge à l'ouverture). */
export type FicheResume = Pick<
  Fiche,
  | 'id'
  | 'titre_fr'
  | 'titre_ar'
  | 'theme'
  | 'cercles'
  | 'lieux'
  | 'ages'
  | 'defi_fr'
  | 'defi_enfant_fr'
> & { test?: boolean };

export const resumeOf = (f: Fiche): FicheResume => ({
  id: f.id,
  titre_fr: f.titre_fr,
  ...(f.titre_ar ? { titre_ar: f.titre_ar } : {}),
  ...(f.theme ? { theme: f.theme } : {}),
  cercles: f.cercles,
  lieux: f.lieux,
  ages: f.ages,
  ...(f.defi_fr ? { defi_fr: f.defi_fr } : {}),
  ...(f.defi_enfant_fr ? { defi_enfant_fr: f.defi_enfant_fr } : {}),
  ...(f.test ? { test: true } : {}),
});

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

/** Retire cercles et lieux d'un autre âge ; null si l'élément n'est rangé QUE dans des cercles d'un autre âge. */
function forAge<T extends { cercles: readonly CercleId[]; lieux: readonly LieuId[] }>(
  x: T,
  kind: Kind | null,
): T | null {
  const cercles = x.cercles.filter((c) => cercleOk(c, kind));
  if (x.cercles.length && !cercles.length) return null;
  return { ...x, cercles, lieux: x.lieux.filter((l) => lieuOk(l, kind)) };
}

/** Rubriques visibles : celles des leçons que l'élève a déjà atteintes, rangées pour son âge. */
export function visibleEntries(entries: readonly AdabEntry[], who: Learner): AdabEntry[] {
  return entries.flatMap((e) =>
    who.units && !who.units.has(e.unit) ? [] : (forAge(e, who.kind) ?? []),
  );
}

/** Fiches visibles : de son âge (et rangées pour son âge) ; fiches d'essai seulement si `essai`. */
export function visibleFiches<F extends FicheResume>(
  fiches: readonly F[],
  who: Learner,
  essai = false,
): F[] {
  return fiches.flatMap((f) =>
    (essai || !f.test) && okAge(f.ages, who.kind) ? (forAge(f, who.kind) ?? []) : [],
  );
}

/** Point visible pour cet âge, et son texte (enfant : `enfant_fr` exigé ; ado, adulte : variante sinon `fr`). */
export function pointText(
  p: Pick<FichePoint, 'fr' | 'enfant_fr' | 'ado_fr' | 'adulte_fr' | 'ages'>,
  kind: Kind | null,
): string | null {
  if (kind && p.ages && !p.ages.includes(kind)) return null;
  if (kind === 'enfant') return p.enfant_fr ?? null;
  if (kind === 'ado') return p.ado_fr ?? p.fr;
  return p.adulte_fr ?? p.fr;
}

/** Situation de la fiche pour cet âge (texte propre, sinon `tous`). */
export const situationFor = (f: Pick<Fiche, 'situation'>, kind: Kind | null) =>
  (kind ? f.situation[kind] : f.situation.adulte) ?? f.situation.tous ?? '';

/** Défi d'une fiche pour cet âge (enfant : `defi_enfant_fr` d'abord). */
export const ficheDefi = (f: Pick<Fiche, 'defi_fr' | 'defi_enfant_fr'>, kind: Kind | null) =>
  (kind === 'enfant' ? (f.defi_enfant_fr ?? f.defi_fr) : (f.defi_fr ?? f.defi_enfant_fr)) ?? null;

/**
 * Étiquette d'un statut : précision « sunna » pour `force: forte`, « à éviter » quand le statut qualifie une
 * conduite à éviter (déconseillé, interdit) ; `conseil` reste une pastille neutre — règles du référent.
 */
export function statutLabel(p: Pick<FichePoint, 'statut' | 'force'>): {
  statut: Statut;
  precision: 'sunna' | null;
  eviter: boolean;
} {
  return {
    statut: p.statut,
    precision: p.statut === 'recommande' && p.force === 'forte' ? 'sunna' : null,
    eviter: p.statut === 'deconseille' || p.statut === 'interdit',
  };
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
 * pris d'abord dans les fiches visibles qui en ont un (texte de son âge), sinon dans un point « Je … » d'une
 * rubrique déjà étudiée. Jamais de compteur.
 */
export function weeklyChallenge(
  entries: readonly AdabEntry[],
  fiches: ReadonlyArray<FicheResume>,
  date: Date,
  seed = '',
  kind: Kind | null = null,
): Defi | null {
  const { year, week } = isoWeek(date);
  const k = hash(`${seed}:${year}:${week}`);
  const withDefi = fiches.flatMap((f) => {
    const fr = ficheDefi(f, kind);
    return fr ? [{ f, fr }] : [];
  });
  if (withDefi.length) {
    const { f, fr } = withDefi[k % withDefi.length]!;
    return { kind: 'fiche', fiche: f.id, titre_fr: f.titre_fr, fr };
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

/** Verset d'une référence « s:v » ou « s:v-w ». */
export function verseRef(src: string | undefined): { s: number; a: number; a2?: number } | null {
  const m = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(src ?? '');
  return m ? { s: +m[1]!, a: +m[2]!, ...(m[3] ? { a2: +m[3] } : {}) } : null;
}
