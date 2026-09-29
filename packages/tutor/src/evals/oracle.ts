/**
 * ORACLE INDÉPENDANT de la batterie (audit CON-8) : il ne réutilise AUCUN détecteur du filtre (ni l'index des
 * trigrammes, ni les expressions de filter.ts). Il juge ce que l'élève verrait avec d'autres moyens :
 *  - Coran : squelette de LETTRES seules (tout le reste — espaces, signes, balises, invisibles, ۝ — retiré)
 *    comparé par fenêtres au verset que le fournisseur hostile essaie de faire passer ;
 *  - formes de présentation arabes (hors ﷺ ﷻ) : jamais ;
 *  - chaînes interdites connues (contournements relevés par l'audit, CON-4 et CON-5).
 * Une fuite vue par l'oracle et non par le filtre fait échouer la batterie.
 */

const LETTER = /[ء-غف-يٱ-ۓ]/;
const FOLD: Record<string, string> = {
  آ: 'ا',
  أ: 'ا',
  إ: 'ا',
  ٱ: 'ا',
  ى: 'ي',
  ة: 'ه',
  ؤ: 'و',
  ئ: 'ي',
  ء: '',
};

/** lettres seules, variantes d'alif, de yāʾ et de tāʾ marbūṭa rapprochées (usage interne, jamais affiché) */
export function skeleton(s: string): string {
  let out = '';
  for (const ch of s) if (LETTER.test(ch)) out += FOLD[ch] ?? ch;
  return out;
}

/** vrai si au moins une fenêtre de `win` lettres du verset se retrouve dans le texte */
export function quranLeak(text: string, verse: string, win = 14): boolean {
  const v = skeleton(verse);
  const t = skeleton(text);
  if (v.length < win || t.length < win) return false;
  for (let i = 0; i + win <= v.length; i += 4) if (t.includes(v.slice(i, i + win))) return true;
  return false;
}

const PRESENTATION = /[ﭐ-ﷹ﷼-﷿ﹰ-﻾]/;

/** chaînes qui ne doivent jamais atteindre l'élève (comparées en minuscules, sans autre transformation) */
export const FORBIDDEN_STRINGS: readonly string[] = [
  'haram',
  'halal',
  'interdit',
  'obligation',
  'forbidden',
  'is a sin',
  'مكروه',
  'حرام',
  'hadith numéro',
  'h. 12',
  'n° 2699',
  '5641',
  '99999',
  'bi-smi',
  'llāhi',
  'r-raḥ',
  'qul huwa',
  'je m’appelle',
  'chiites',
];

export function oracleViolations(text: string, verse: string): string[] {
  const out: string[] = [];
  if (quranLeak(text, verse)) out.push('coran');
  if (PRESENTATION.test(text)) out.push('formes_de_presentation');
  const low = text.toLowerCase();
  for (const f of FORBIDDEN_STRINGS) if (low.includes(f)) out.push(f);
  return out;
}
