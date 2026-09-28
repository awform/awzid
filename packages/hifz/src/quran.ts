/**
 * Repères du Muṣḥaf (riwāya Ḥafṣ ʿan ʿĀṣim) utilisés par le plan de mémorisation.
 *  - le TEXTE vient toujours de Tanzil (table `quran_verse`, contrôlée octet par octet) : ce module ne
 *    contient AUCUN texte coranique ;
 *  - noms des sourates en translittération française (affichage) [À RELIRE par le référent] ;
 *  - débuts des 30 parties (juzʾ) selon les métadonnées Tanzil (quran-data) [À VÉRIFIER avec le
 *    Muṣḥaf imprimé de l'école] ;
 *  - les « pages » sont ESTIMÉES à partir du nombre de lettres du texte Tanzil (604 pages au total) :
 *    la mise en page ligne à ligne de Médine n'est pas utilisée tant que sa licence n'est pas vérifiée
 *    (ARCHITECTURE_V2 § 2.1).
 */

export const SURA_NAMES: readonly string[] = [
  'Al-Fātiḥa',
  'Al-Baqara',
  'Āl ʿImrān',
  'An-Nisāʾ',
  'Al-Māʾida',
  'Al-Anʿām',
  'Al-Aʿrāf',
  'Al-Anfāl',
  'At-Tawba',
  'Yūnus',
  'Hūd',
  'Yūsuf',
  'Ar-Raʿd',
  'Ibrāhīm',
  'Al-Ḥijr',
  'An-Naḥl',
  'Al-Isrāʾ',
  'Al-Kahf',
  'Maryam',
  'Ṭā-Hā',
  'Al-Anbiyāʾ',
  'Al-Ḥajj',
  'Al-Muʾminūn',
  'An-Nūr',
  'Al-Furqān',
  'Ash-Shuʿarāʾ',
  'An-Naml',
  'Al-Qaṣaṣ',
  'Al-ʿAnkabūt',
  'Ar-Rūm',
  'Luqmān',
  'As-Sajda',
  'Al-Aḥzāb',
  'Sabaʾ',
  'Fāṭir',
  'Yā-Sīn',
  'Aṣ-Ṣāffāt',
  'Ṣād',
  'Az-Zumar',
  'Ghāfir',
  'Fuṣṣilat',
  'Ash-Shūrā',
  'Az-Zukhruf',
  'Ad-Dukhān',
  'Al-Jāthiya',
  'Al-Aḥqāf',
  'Muḥammad',
  'Al-Fatḥ',
  'Al-Ḥujurāt',
  'Qāf',
  'Adh-Dhāriyāt',
  'Aṭ-Ṭūr',
  'An-Najm',
  'Al-Qamar',
  'Ar-Raḥmān',
  'Al-Wāqiʿa',
  'Al-Ḥadīd',
  'Al-Mujādila',
  'Al-Ḥashr',
  'Al-Mumtaḥana',
  'Aṣ-Ṣaff',
  'Al-Jumuʿa',
  'Al-Munāfiqūn',
  'At-Taghābun',
  'Aṭ-Ṭalāq',
  'At-Taḥrīm',
  'Al-Mulk',
  'Al-Qalam',
  'Al-Ḥāqqa',
  'Al-Maʿārij',
  'Nūḥ',
  'Al-Jinn',
  'Al-Muzzammil',
  'Al-Muddaththir',
  'Al-Qiyāma',
  'Al-Insān',
  'Al-Mursalāt',
  'An-Nabaʾ',
  'An-Nāziʿāt',
  'ʿAbasa',
  'At-Takwīr',
  'Al-Infiṭār',
  'Al-Muṭaffifīn',
  'Al-Inshiqāq',
  'Al-Burūj',
  'Aṭ-Ṭāriq',
  'Al-Aʿlā',
  'Al-Ghāshiya',
  'Al-Fajr',
  'Al-Balad',
  'Ash-Shams',
  'Al-Layl',
  'Aḍ-Ḍuḥā',
  'Ash-Sharḥ',
  'At-Tīn',
  'Al-ʿAlaq',
  'Al-Qadr',
  'Al-Bayyina',
  'Az-Zalzala',
  'Al-ʿĀdiyāt',
  'Al-Qāriʿa',
  'At-Takāthur',
  'Al-ʿAṣr',
  'Al-Humaza',
  'Al-Fīl',
  'Quraysh',
  'Al-Māʿūn',
  'Al-Kawthar',
  'Al-Kāfirūn',
  'An-Naṣr',
  'Al-Masad',
  'Al-Ikhlāṣ',
  'Al-Falaq',
  'An-Nās',
];

/** Début de chaque partie (juzʾ 1 à 30) : [sourate, verset]. */
export const JUZ_STARTS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 142],
  [2, 253],
  [3, 93],
  [4, 24],
  [4, 148],
  [5, 82],
  [6, 111],
  [7, 88],
  [8, 41],
  [9, 93],
  [11, 6],
  [12, 53],
  [15, 1],
  [17, 1],
  [18, 75],
  [21, 1],
  [23, 1],
  [25, 21],
  [27, 56],
  [29, 46],
  [33, 31],
  [36, 28],
  [39, 32],
  [41, 47],
  [46, 1],
  [51, 31],
  [58, 1],
  [67, 1],
  [78, 1],
];

export const TOTAL_PAGES = 604;

export function suraName(n: number): string {
  return SURA_NAMES[n - 1] ?? `Sourate ${n}`;
}

/** Partie (juzʾ) contenant le verset s:a. */
export function juzOf(s: number, a: number): number {
  let j = 1;
  for (let i = 0; i < JUZ_STARTS.length; i++) {
    const [js, ja] = JUZ_STARTS[i]!;
    if (s > js || (s === js && a >= ja)) j = i + 1;
  }
  return j;
}

/**
 * Métadonnées calculées depuis Tanzil : pour chaque sourate, le poids (nombre de lettres arabes de base)
 * de chaque verset. La basmala en tête du verset 1 (hors sourates 1 et 9) n'est pas comptée.
 */
export interface QuranMeta {
  /** weights[s-1][a-1] = nombre de lettres du verset */
  weights: number[][];
  totalWeight: number;
}

/** Lettres arabes de base (hamza à yāʾ, alif waṣla) — pas les voyelles ni les signes. */
export function letterCount(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x0621 && c <= 0x064a) || c === 0x0671) n++;
  }
  return n;
}

/** Construit les métadonnées à partir du texte Tanzil (`s:a` → texte). */
export function buildMeta(tanzil: ReadonlyMap<string, string>): QuranMeta {
  const bism = tanzil.get('1:1') ?? '';
  const weights: number[][] = [];
  let total = 0;
  for (let s = 1; s <= 114; s++) {
    const row: number[] = [];
    for (let a = 1; ; a++) {
      const text = tanzil.get(`${s}:${a}`);
      if (text === undefined) break;
      const w = Math.max(1, letterCount(splitBasmala(s, a, text, bism).rest));
      row.push(w);
      total += w;
    }
    weights.push(row);
  }
  return { weights, totalWeight: total };
}

/** Pages estimées d'un poids. */
export function pagesOf(meta: QuranMeta, weight: number): number {
  return (weight / meta.totalWeight) * TOTAL_PAGES;
}

const CHADDA = /ّ/g;

/**
 * Sépare la basmala d'en-tête du verset 1 (sourates 2 à 114 sauf 9) pour l'affichage : les deux morceaux
 * sont des sous-chaînes EXACTES du texte Tanzil et leur concaténation (avec l'espace) le redonne. La
 * basmala de certaines sourates porte une chadda de liaison (بِّسْمِ) : elle est reconnue sans être
 * modifiée (règle reprise de fix-versets.ps1).
 */
export function splitBasmala(
  s: number,
  a: number,
  text: string,
  basmala: string,
): { basmala: string | null; rest: string } {
  if (a === 1 && s !== 1 && s !== 9 && basmala) {
    const words = text.split(' ');
    const head = words.slice(0, 4).join(' ');
    if (words.length > 4 && head.replace(CHADDA, '') === basmala.replace(CHADDA, ''))
      return { basmala: head, rest: words.slice(4).join(' ') };
  }
  return { basmala: null, rest: text };
}
