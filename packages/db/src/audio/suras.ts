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
