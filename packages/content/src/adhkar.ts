/**
 * Chantier A12 — adhkār de l'espace « Au quotidien » (matin, soir, après la prière, appel à la prière, coucher).
 *
 * RÈGLE ABSOLUE : aucun texte religieux n'est écrit ici. Ce module ne contient qu'une SÉLECTION (leçon d'un livre
 * gelé + chemin dans la leçon) ; les textes (arabe, sens, moment, source) sont LUS dans la leçon, tels quels, sans
 * normalisation. Les récitations coraniques (āyat al-kursī, les trois sourates protectrices) ne recopient aucun
 * verset : seules leurs références sont données, le texte est celui de Tanzil (servi par l'API du Coran).
 * Le classement par moment suit le texte du livre (« le matin et le soir, trois fois », « quand je me couche »…) ;
 * le nombre de répétitions est celui que dit le livre (sinon, aucun compteur imposé).
 * Ce qui manque est listé dans docs/projet/A12_ADHKAR_A_COMPLETER.md (références seulement, pour le référent).
 */

export type AdhkarCategory = 'matin' | 'soir' | 'apres_priere' | 'adhan' | 'coucher';
export const ADHKAR_CATEGORIES: readonly AdhkarCategory[] = [
  'matin',
  'soir',
  'apres_priere',
  'adhan',
  'coucher',
];

export interface VerseRange {
  s: number;
  from: number;
  to: number;
}

interface PickBase {
  /** identifiant stable (compteurs, ancres) */
  id: string;
  /** leçon du livre gelé (identifiant d'unité de l'édition) */
  unit: string;
  /** chemin dans la leçon, clés séparées par des points (indices compris) */
  path: string;
  /** répétitions DITES PAR LE LIVRE (texte du moment ou du paragraphe cité) ; absent : pas de compteur */
  repetitions?: number;
}
/** Invocation d'une rubrique « duas » du livre : moment, arabe, sens, source et degré recopiés tels quels. */
export interface DuaPick extends PickBase {
  kind: 'dua';
}
/**
 * Récitation coranique recommandée par le livre : le paragraphe de l'élève qui la recommande (chemin `path`,
 * une chaîne en français) + les versets (références, texte Tanzil chargé à part) + le hadith qui la fonde
 * (recueil et numéro, contrôlés VERIFIE au registre par le test des livres).
 */
export interface RecitationPick extends PickBase {
  kind: 'recitation';
  refs: readonly VerseRange[];
  hadiths: ReadonlyArray<{ recueil: string; numero: number }>;
}
export type AdhkarPick = DuaPick | RecitationPick;

const QULS: readonly VerseRange[] = [
  { s: 112, from: 1, to: 4 },
  { s: 113, from: 1, to: 5 },
  { s: 114, from: 1, to: 6 },
];

/** Sélection (05/10/2026, chef de projet ; à relire par le référent). */
export const ADHKAR_PICKS: readonly AdhkarPick[] = [
  // matin
  { id: 'reveil', kind: 'dua', unit: 're1.l23', path: 'rubriques.2.duas.3' },
  { id: 'bika-asbahna', kind: 'dua', unit: 're4.l02', path: 'rubriques.1.duas.1' },
  // matin et soir
  {
    id: 'bismillah-la-yadurr',
    kind: 'dua',
    unit: 're3.l05',
    path: 'rubriques.1.duas.0',
    repetitions: 3,
  },
  {
    id: 'trois-sourates-matin-soir',
    kind: 'recitation',
    unit: 're3.l05',
    path: 'rubriques.1.texte.1.fr',
    refs: QULS,
    hadiths: [
      { recueil: 'Abū Dāwūd', numero: 5082 },
      { recueil: 'at-Tirmidhī', numero: 3575 },
    ],
    repetitions: 3,
  },
  { id: 'sayyid-al-istighfar', kind: 'dua', unit: 'ra2.l22', path: 'rubriques.1.duas.2' },
  {
    id: 'subhanallah-wa-bihamdih',
    kind: 'dua',
    unit: 'ra2.l22',
    path: 'rubriques.1.duas.1',
    repetitions: 100,
  },
  { id: 'ajz-kasal', kind: 'dua', unit: 're5.l25', path: 'rubriques.3.duas.0' },
  // soir
  { id: 'bika-amsayna', kind: 'dua', unit: 're4.l02', path: 'rubriques.1.duas.2' },
  { id: 'amsayna', kind: 'dua', unit: 'ra2.l22', path: 'rubriques.1.duas.0' },
  // après la prière
  {
    id: 'istighfar-apres-salam',
    kind: 'dua',
    unit: 're3.l21',
    path: 'rubriques.2.duas.0',
    repetitions: 3,
  },
  { id: 'anta-salam', kind: 'dua', unit: 're3.l21', path: 'rubriques.2.duas.1' },
  { id: 'tasbih-33', kind: 'dua', unit: 're3.l21', path: 'rubriques.2.duas.2', repetitions: 33 },
  { id: 'tahlil-100', kind: 'dua', unit: 're3.l21', path: 'rubriques.2.duas.3' },
  { id: 'muqima-salat', kind: 'dua', unit: 'ra1.l23', path: 'rubriques.2.duas.0' },
  { id: 'rabbi-rhamhuma', kind: 'dua', unit: 're1.l22', path: 'rubriques.2.duas.0' },
  // appel à la prière
  { id: 'hawqala-adhan', kind: 'dua', unit: 're4.l19', path: 'rubriques.3.duas.0' },
  { id: 'apres-adhan', kind: 'dua', unit: 're4.l19', path: 'rubriques.3.duas.1' },
  // coucher
  {
    id: 'ayat-al-kursi',
    kind: 'recitation',
    unit: 're3.l03',
    path: 'rubriques.1.intro_fr',
    refs: [{ s: 2, from: 255, to: 255 }],
    hadiths: [{ recueil: 'al-Bukhārī', numero: 2311 }],
  },
  {
    id: 'trois-sourates-coucher',
    kind: 'recitation',
    unit: 're1.l23',
    path: 'coran.lecons.2.fr',
    refs: QULS,
    hadiths: [{ recueil: 'al-Bukhārī', numero: 5017 }],
  },
  { id: 'bismika-amutu', kind: 'dua', unit: 're3.l03', path: 'rubriques.1.duas.0' },
  { id: 'antal-awwal', kind: 'dua', unit: 're5.l01', path: 'rubriques.2.duas.1' },
];

/** Ordre d'affichage par moment (une invocation peut servir à plusieurs moments). */
export const ADHKAR_ORDER: Readonly<Record<AdhkarCategory, readonly string[]>> = {
  matin: [
    'reveil',
    'bika-asbahna',
    'trois-sourates-matin-soir',
    'bismillah-la-yadurr',
    'sayyid-al-istighfar',
    'subhanallah-wa-bihamdih',
    'ajz-kasal',
  ],
  soir: [
    'bika-amsayna',
    'amsayna',
    'trois-sourates-matin-soir',
    'bismillah-la-yadurr',
    'sayyid-al-istighfar',
    'subhanallah-wa-bihamdih',
  ],
  apres_priere: [
    'istighfar-apres-salam',
    'anta-salam',
    'tasbih-33',
    'tahlil-100',
    'muqima-salat',
    'rabbi-rhamhuma',
  ],
  adhan: ['hawqala-adhan', 'apres-adhan'],
  coucher: ['ayat-al-kursi', 'trois-sourates-coucher', 'bismika-amutu', 'antal-awwal'],
};

/** Champs d'une invocation du livre, recopiés tels quels (chaînes du livre, rien d'autre). */
export interface DuaText {
  moment_fr: string;
  moment_ar: string;
  ar: string;
  fr: string;
  source_fr: string;
  ref_fr: string;
  grade: string;
  coranique: boolean;
}
export interface AdhkarItem {
  id: string;
  kind: 'dua' | 'recitation';
  /** leçon d'origine (lien « voir la leçon ») */
  unit: string;
  repetitions: number | null;
  dua?: DuaText;
  recitation?: {
    /** paragraphe de l'élève qui recommande la récitation, tel quel */
    note_fr: string;
    refs: readonly VerseRange[];
    /** « al-Bukhārī (2311) » : recueil et numéro du registre */
    sources: string[];
  };
}
export interface AdhkarSet {
  categories: Array<{ id: AdhkarCategory; items: AdhkarItem[] }>;
  /** sélections introuvables dans l'édition (livre absent, chemin vide) */
  missing: string[];
}

type Obj = Record<string, unknown>;

/** Valeur au chemin `a.b.0.c` (null si absent). */
export function atPath(root: unknown, path: string): unknown {
  let v: unknown = root;
  for (const k of path.split('.')) {
    if (v === null || typeof v !== 'object') return null;
    v = Array.isArray(v) ? v[Number(k)] : (v as Obj)[k];
  }
  return v ?? null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Lecture d'une sélection dans sa leçon ; null si le livre ne contient pas (ou plus) ce texte. */
export function readPick(pick: AdhkarPick, lesson: unknown): AdhkarItem | null {
  const v = atPath(lesson, pick.path);
  const base = {
    id: pick.id,
    kind: pick.kind,
    unit: pick.unit,
    repetitions: pick.repetitions ?? null,
  };
  if (pick.kind === 'recitation') {
    if (typeof v !== 'string' || !v) return null;
    return {
      ...base,
      recitation: {
        note_fr: v,
        refs: pick.refs,
        sources: pick.hadiths.map((h) => `${h.recueil} (${h.numero})`),
      },
    };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Obj;
  if (!str(d.ar) || !str(d.fr)) return null;
  return {
    ...base,
    dua: {
      moment_fr: str(d.moment_fr),
      moment_ar: str(d.moment_ar),
      ar: str(d.ar),
      fr: str(d.fr),
      source_fr: str(d.source_fr),
      ref_fr: str(d.ref_fr),
      grade: str(d.grade),
      coranique: d.coranique === true || str(d.grade) === 'coran',
    },
  };
}

/** Jeu complet, à partir d'un lecteur de leçons (base de données, fichiers des livres ou test). */
export async function buildAdhkar(
  lessonOf: (unit: string) => Promise<unknown> | unknown,
): Promise<AdhkarSet> {
  const cache = new Map<string, unknown>();
  const items = new Map<string, AdhkarItem>();
  const missing: string[] = [];
  for (const p of ADHKAR_PICKS) {
    if (!cache.has(p.unit)) cache.set(p.unit, (await lessonOf(p.unit)) ?? null);
    const it = readPick(p, cache.get(p.unit));
    if (it) items.set(p.id, it);
    else missing.push(`${p.id} (${p.unit} ${p.path})`);
  }
  return {
    categories: ADHKAR_CATEGORIES.map((id) => ({
      id,
      items: ADHKAR_ORDER[id].map((x) => items.get(x)).filter((x): x is AdhkarItem => !!x),
    })),
    missing,
  };
}

/** « Ibrāhīm 14:40 », « Al-Isrāʾ 17:24 (fin du verset) » → { s, a } (référence d'un verset cité). */
export function parseVerseRef(ref: string): { s: number; a: number } | null {
  const m = /(\d{1,3}):(\d{1,3})/.exec(ref);
  if (!m) return null;
  const s = Number(m[1]);
  const a = Number(m[2]);
  return s >= 1 && s <= 114 && a >= 1 ? { s, a } : null;
}
