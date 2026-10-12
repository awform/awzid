/**
 * Madjaliss — cursus par cycle (PLAN_DIRECTEUR, tableau des cycles validé par le client le 12/10/2026). Le cycle
 * conseillé suit le niveau d'arabe de l'élève : cycle 1 (ado1-ado2, ad1-ad3), 2 (ado3-ado4, ad4-ad5),
 * 3 (ad6-ad7), 4 (ad8-ad10). Les enfants étudient ces règles dans leurs livres de religion (aperçu seulement).
 * Un texte s'ouvre en passant son identifiant dans `ACTIFS` quand ses données existent (`static/mutun/<id>.json`).
 */
export type Matiere = 'fiqh' | 'hadith' | 'langue' | 'tajwid' | 'fondements';

export interface TexteCursus {
  id: string;
  /** titre arabe (nom d'usage de l'ouvrage) */
  ar: string;
  matiere: Matiere;
}

export const CYCLES: ReadonlyArray<{ n: number; textes: readonly TexteCursus[] }> = [
  {
    n: 1,
    textes: [
      { id: 'akhdari', ar: 'مختصر الأخضري', matiere: 'fiqh' },
      { id: 'ashmawiyya', ar: 'العشماوية', matiere: 'fiqh' },
      { id: 'nawawi', ar: 'الأربعون النووية', matiere: 'hadith' },
      { id: 'tuhfa', ar: 'تحفة الأطفال', matiere: 'tajwid' },
    ],
  },
  {
    n: 2,
    textes: [
      { id: 'ibn-ashir', ar: 'المرشد المعين', matiere: 'fiqh' },
      { id: 'izziyya', ar: 'العزية', matiere: 'fiqh' },
      { id: 'bayquniyya', ar: 'البيقونية', matiere: 'hadith' },
      { id: 'ajurrumiyya', ar: 'الآجرومية', matiere: 'langue' },
    ],
  },
  {
    n: 3,
    textes: [
      { id: 'risala', ar: 'الرسالة', matiere: 'fiqh' },
      { id: 'lamiyya', ar: 'لامية الأفعال', matiere: 'langue' },
      { id: 'jazariyya', ar: 'الجزرية', matiere: 'tajwid' },
    ],
  },
  {
    n: 4,
    textes: [
      { id: 'khalil', ar: 'مختصر خليل', matiere: 'fiqh' },
      { id: 'alfiyya', ar: 'ألفية ابن مالك', matiere: 'langue' },
      { id: 'waraqat', ar: 'الورقات', matiere: 'fondements' },
    ],
  },
];

/** Textes ouverts (données présentes). */
export const ACTIFS: ReadonlySet<string> = new Set(['akhdari']);

export const texteDuCursus = (id: string): TexteCursus | null =>
  CYCLES.flatMap((c) => c.textes).find((x) => x.id === id) ?? null;

/** Cycle conseillé pour un profil (null : enfant, ou profil inconnu sans niveau). */
export function cycleConseille(
  p: { kind: 'enfant' | 'ado' | 'adulte'; levelCode: string | null } | null,
): number | null {
  if (!p || p.kind === 'enfant') return null;
  const m = /^(ado|ad)(\d+)$/.exec(p.levelCode ?? '');
  if (!m) return 1;
  const n = Number(m[2]);
  if (m[1] === 'ado') return n <= 2 ? 1 : 2;
  return n <= 3 ? 1 : n <= 5 ? 2 : n <= 7 ? 3 : 4;
}
