/**
 * Repères NUMÉRIQUES de l'audio du Coran (aucun texte coranique ici) :
 *  - nombre de versets de chaque sourate dans la riwāya Ḥafṣ ʿan ʿĀṣim (compte koufi, 6 236 au total),
 *    vérifié contre le fichier Tanzil des livres quand il est présent (test) ;
 *  - riwāyāt reconnues (identifiants de la base) et étiquettes d'écoute.
 * Pour les autres riwāyāt, le compte et la numérotation diffèrent : l'import accepte le compte DÉCLARÉ.
 */

export const HAFS_SURA_VERSES: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

export const HAFS_TOTAL_VERSES = 6236;

/** riwāyāt des dix lectures (identifiants de la base, contrainte `quran_reciter_riwaya`) */
export const RIWAYAT = [
  'hafs',
  'shuba',
  'warsh',
  'qalun',
  'bazzi',
  'qunbul',
  'duri',
  'susi',
  'hisham',
  'ibn_dhakwan',
  'khalaf',
  'khallad',
  'abu_al_harith',
  'duri_kisai',
  'ibn_wardan',
  'ibn_jammaz',
  'ruways',
  'rawh',
  'ishaq',
  'idris',
] as const;
export type Riwaya = (typeof RIWAYAT)[number];

export const SPEEDS = ['lente', 'moyenne', 'rapide'] as const;
export const STYLES = ['murattal', 'mujawwad', 'muallim'] as const;

/**
 * Comptes RÉELS d'autres riwāyāt, relevés sur les textes officiels du Complexe du Roi Fahd (plateforme
 * développeurs, fichiers JSON « kfgqpc_*_v30 », 04/10/2026) : seules les sourates dont le compte diffère de
 * Ḥafṣ sont listées. Shuʿba : compte koufi, identique à Ḥafṣ (6 236). as-Sūsī : 6 218 (texte « susi_v30 ») ;
 * ad-Dūrī ʿan Abī ʿAmr : même lecture d'Abū ʿAmr, même compte (6 218, conforme aux fichiers audio du
 * Complexe ; le texte « UthmanicDouri v2 » compte al-Mulk en 30 versets, soit 6 217). Qālūn et Warsh :
 * compte madanī II, 6 214 (« qalun_v30 », « warsh_v30 »).
 */
const ABU_AMR: Readonly<Record<number, number>> = {
  2: 285,
  4: 175,
  5: 122,
  6: 167,
  8: 76,
  9: 130,
  11: 122,
  13: 44,
  14: 54,
  17: 110,
  18: 105,
  20: 134,
  21: 111,
  22: 76,
  23: 119,
  24: 62,
  27: 95,
  31: 33,
  36: 82,
  38: 86,
  39: 72,
  40: 84,
  41: 53,
  42: 50,
  44: 56,
  45: 36,
  46: 34,
  47: 39,
  52: 47,
  53: 61,
  55: 77,
  56: 99,
  57: 28,
  67: 31,
  71: 30,
  75: 39,
  79: 45,
  86: 16,
  89: 32,
  91: 16,
  96: 20,
  101: 10,
  106: 5,
  107: 6,
};
const MADANI_II: Readonly<Record<number, number>> = {
  2: 285,
  4: 175,
  5: 122,
  6: 167,
  8: 76,
  9: 130,
  11: 121,
  13: 44,
  14: 54,
  17: 110,
  18: 105,
  19: 99,
  20: 134,
  21: 111,
  22: 76,
  23: 119,
  24: 62,
  26: 226,
  27: 95,
  30: 59,
  31: 33,
  35: 46,
  36: 82,
  38: 86,
  39: 72,
  40: 84,
  41: 53,
  42: 50,
  44: 56,
  45: 36,
  46: 34,
  47: 39,
  52: 47,
  53: 61,
  55: 77,
  56: 99,
  57: 28,
  58: 21,
  67: 31,
  71: 30,
  73: 18,
  74: 55,
  75: 39,
  79: 45,
  89: 32,
  96: 20,
  99: 9,
  101: 10,
  106: 5,
  107: 6,
};
const RIWAYA_DIFF: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  hafs: {},
  shuba: {},
  susi: ABU_AMR,
  duri: ABU_AMR,
  qalun: MADANI_II,
  warsh: MADANI_II,
};

/** Versets de chaque sourate pour une riwāya dont le compte est connu ; null sinon (compte à déclarer). */
export function riwayaSuraVerses(riwaya: string): readonly number[] | null {
  const d = RIWAYA_DIFF[riwaya];
  return d ? HAFS_SURA_VERSES.map((n, i) => d[i + 1] ?? n) : null;
}

/** Nombre de versets attendus pour un ensemble de sourates (Ḥafṣ). */
export function hafsVersesFor(suras: readonly number[]): number {
  return suras.reduce((n, s) => n + (HAFS_SURA_VERSES[s - 1] ?? 0), 0);
}

/** « 1,112-114 » → [1, 112, 113, 114] (sourates 1 à 114, triées, sans doublon). */
export function parseSuraList(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(part);
    if (!m) throw new Error(`sourates : « ${part} » illisible (ex. 1,112-114)`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 114 || a > b) throw new Error(`sourates : « ${part} » hors de 1-114`);
    for (let s = a; s <= b; s++) out.add(s);
  }
  return [...out].sort((x, y) => x - y);
}
