/**
 * Tafsīr du niveau — TABLE DE CORRESPONDANCE niveau → sourates (UN SEUL FICHIER DE CONFIGURATION, à ajuster ici et nulle part ailleurs).
 *
 * Découpage « Lawḥ, version 2 » validé par le client (PARKING_IDEES, idée 22) : 12 niveaux, par ḥizb, À REBOURS. Le tafsīr des mêmes
 * sourates se trouve au même niveau :
 *  - N1 : sourates 93 à 114 (avec al-Fātiḥa, proposée en premier) ; N2 : 72 à 92 ; N3 : 58 à 71 ;
 *  - N4 à N12 : trois juzʾ par niveau, de N4 = juzʾ 27-25 jusqu'à N12 = juzʾ 3-1. Une sourate va au niveau du juzʾ où elle COMMENCE
 *    (par exemple al-Fatḥ, qui commence au juzʾ 26, est en N4) ; al-Fātiḥa reste en N1 avec le juzʾ ʿAmma, donc N12 = sourates 2 et 3.
 * Ce découpage est RECOMMANDÉ, JAMAIS OBLIGATOIRE : le parcours propose sa portion en premier, ne bloque rien, et la consultation d'un
 * verset est libre dans le lecteur pour tout le monde. Pour les ENFANTS, le parcours se limite au juzʾ ʿAmma (portion N1).
 * Sans dépendance : utilisable par le serveur, l'application et les tests.
 */
export interface NiveauTafsir {
  /** numéro du niveau (1 à 12) */
  n: number;
  /** portion du Coran, pour l'affichage et la relecture de la table */
  juz: string;
  /** sourates, DANS L'ORDRE de lecture du parcours (à rebours : de la plus haute à la plus basse) */
  sourates: readonly number[];
}

/** Sourates `de` à `a` (inclus), à rebours : `a` d'abord. */
const arebours = (de: number, a: number): number[] =>
  Array.from({ length: a - de + 1 }, (_, i) => a - i);

export const NIVEAUX_TAFSIR: readonly NiveauTafsir[] = [
  { n: 1, juz: 'juzʾ ʿAmma, avec al-Fātiḥa', sourates: [1, ...arebours(93, 114)] },
  { n: 2, juz: 'sourates 72 à 92, à partir d’al-Jinn', sourates: arebours(72, 92) },
  { n: 3, juz: 'sourates 58 à 71, ḥizb « Qad samiʿa »', sourates: arebours(58, 71) },
  { n: 4, juz: 'juzʾ 27-25', sourates: arebours(42, 57) },
  { n: 5, juz: 'juzʾ 24-22', sourates: arebours(34, 41) },
  { n: 6, juz: 'juzʾ 21-19', sourates: arebours(26, 33) },
  { n: 7, juz: 'juzʾ 18-16', sourates: arebours(19, 25) },
  { n: 8, juz: 'juzʾ 15-13', sourates: arebours(13, 18) },
  { n: 9, juz: 'juzʾ 12-10', sourates: arebours(9, 12) },
  { n: 10, juz: 'juzʾ 9-7', sourates: arebours(6, 8) },
  { n: 11, juz: 'juzʾ 6-4', sourates: arebours(4, 5) },
  { n: 12, juz: 'juzʾ 3-1', sourates: arebours(2, 3) },
];

/** Niveau (1 à 12) dont une sourate fait partie. */
export function niveauDeSourate(s: number): number | null {
  return NIVEAUX_TAFSIR.find((x) => x.sourates.includes(s))?.n ?? null;
}

/** Sourates d'un niveau, dans l'ordre du parcours (vide si le niveau n'existe pas). */
export function souratesDuNiveau(n: number): readonly number[] {
  return NIVEAUX_TAFSIR.find((x) => x.n === n)?.sourates ?? [];
}

/** Numéro de niveau d'un code de niveau des livres (en3 → 3, ado2 → 2, ad7 → 7) ; null si le code n'a pas ce format. */
export function niveauDeCode(code: string | null | undefined): number | null {
  const m = /^(?:en|ado|ad)(\d{1,2})$/.exec(code ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= NIVEAUX_TAFSIR.length ? n : null;
}

/** Première sourate du parcours des ADOS : Tabārak (67) ; ils vont jusqu'à an-Nās (114), avec al-Fātiḥa (juzʾ 29 et 30). */
export const PREMIERE_SOURATE_ADO = 67;

/** Sourates d'une portion que le parcours propose à ce public : enfant = juzʾ ʿAmma (N1) ; ado = 67 à 114 et al-Fātiḥa ; adulte = tout. */
export function souratesProposees(kind: string, n: number): readonly number[] {
  const toutes = souratesDuNiveau(n);
  if (kind === 'enfant') return n === 1 ? toutes : [];
  if (kind === 'ado') return toutes.filter((s) => s === 1 || s >= PREMIERE_SOURATE_ADO);
  return toutes;
}

export interface ProposeTafsir {
  /** portion conseillée (sa propre portion), proposée EN PREMIER ; jamais obligatoire */
  recommande: number;
  /** tous les niveaux proposés, la portion conseillée d'abord, puis les autres par numéro */
  niveaux: number[];
}

/**
 * Ce que le parcours propose à un profil : un ENFANT ne voit que la portion N1 (juzʾ ʿAmma) ; un ADO les sourates 67 à 114 et al-Fātiḥa
 * (N1, N2 et la fin de N3), les autres niveaux ne lui sont pas proposés ; un ADULTE les 12 portions. Pour chacun, la sienne d'abord (N1 sans
 * niveau choisi). Rien n'est bloquant : la consultation d'un verset reste libre dans le lecteur, avec les filtres habituels.
 */
export function proposerTafsir(profil: {
  kind: string;
  levelCode: string | null | undefined;
}): ProposeTafsir {
  const ouvrables = NIVEAUX_TAFSIR.map((x) => x.n).filter(
    (n) => souratesProposees(profil.kind, n).length > 0,
  );
  const voulu = niveauDeCode(profil.levelCode) ?? 1;
  // niveau hors de ce qui est proposé (ado de niveau 4, enfant de niveau 3…) : le plus proche proposé
  const recommande = ouvrables.includes(voulu)
    ? voulu
    : Math.max(...ouvrables.filter((n) => n <= voulu), ouvrables[0]!);
  return { recommande, niveaux: [recommande, ...ouvrables.filter((n) => n !== recommande)] };
}
