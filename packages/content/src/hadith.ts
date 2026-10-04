/**
 * Numéros de hadiths visibles de l'élève : un numéro n'est montré que si le registre canonique
 * (registre/hadiths.json) porte ce recueil et ce numéro au statut « VERIFIE » (décision du pilote, lot 8).
 * Sinon le numéro est RETIRÉ du texte affiché (le recueil reste nommé). Rien d'autre n'est modifié.
 */

// Graphies tolérées (audit CON-3) : avec ou sans macrons et points souscrits, francisées, en arabe (avec ou sans
// voyelles). On RECONNAÎT seulement : le texte n'est jamais normalisé, on n'en retire que le numéro.
const A = '[aāâàáä]';
const I = '[iīîïí]';
const U = '(?:ou|[uūûùúü])';
const H = '[hḥ]';
const T = '[tṭ]';
const Q = "[ʾʿ'’`]?";
const MARKS = '[\\u064B-\\u065F\\u0670]*';
const AR_LETTER: Record<string, string> = {
  ا: '[اأإآ]',
  أ: '[اأإآ]',
  ي: '[يى]',
  ه: '[هة]',
  ة: '[هة]',
};
/** mot arabe, voyelles et variantes d'alif, de yāʾ et de tāʾ marbūṭa tolérées */
const ar = (w: string) =>
  [...w].map((c) => (c === ' ' ? '\\s+' : `${AR_LETTER[c] ?? c}${MARKS}`)).join('');
const AL = `(?:${ar('ال')})?`;

/** motif du nom → nom du registre */
const COLLECTIONS: ReadonlyArray<readonly [string, string]> = [
  [`B${U}kh${A}r${I}|${AL}${ar('بخاري')}`, 'al-Bukhārī'],
  [`Muslim|${ar('مسلم')}`, 'Muslim'],
  [`T${I}rmidh?${I}|${AL}${ar('ترمذي')}`, 'at-Tirmidhī'],
  [`Ab${U}\\s+D${A}(?:w${U}|ou)d|${ar('أبو داود')}|${ar('أبي داود')}`, 'Abū Dāwūd'],
  [`Ibn\\s+M${A}d?j${A}h?|${ar('ابن ماجه')}`, 'Ibn Māja'],
  [`N${A}ss?${A}${Q}${I}|${AL}${ar('نسائي')}`, 'an-Nasāʾī'],
  [`${A}${H}m(?:${A}|e)d|${ar('أحمد')}`, 'Aḥmad'],
  [`Adab\\s+al-M${U}fr${A}d`, 'al-Adab al-mufrad'],
  [`D${A}r${I}m${I}|${AL}${ar('دارمي')}`, 'ad-Dārimī'],
  [`M${A}lik|M${U}w${A}${T}${T}?${A}${Q}|${ar('مالك')}|${AL}${ar('موطأ')}`, 'Mālik'],
  [`B(?:${A}|e)yh${A}q${I}|${AL}${ar('بيهقي')}`, 'al-Bayhaqī'],
  [`D${A}r${A}q${U}${T}n${I}|${AL}${ar('دارقطني')}`, 'ad-Dāraquṭnī'],
  [`${H}${A}k${I}m|${AL}${ar('حاكم')}`, 'al-Ḥākim'],
  [`${T}${A}b${A}r${A}n${I}|${AL}${ar('طبراني')}`, 'aṭ-Ṭabarānī'],
];
const ALIASES = COLLECTIONS.map(([re, name]) => [new RegExp(`^(?:${re})$`, 'iu'), name] as const);
const NAMES = COLLECTIONS.map(([re]) => re).join('|');
const DIGIT = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]';
/** « Muslim (54) », « Muslim, 54 », « al-Bukhārī 1894 », « Abū Dāwūd n° 30 », « Mālik, hadith n° 12 », « مسلم رقم ٥٤ » */
const SEP = `\\s*[(,،:]?\\s*(?:(?:ḥadīth|hadith|hadîth|${ar('حديث')}|${ar('رقم')})\\s*)?(?:n[°º]\\.?|no\\.?|n\\.)?\\s*`;
const REF = new RegExp(
  `(?<![\\p{L}\\p{M}])(${NAMES})(${SEP})(${DIGIT}{1,5})(?!${DIGIT}|[,.:]${DIGIT})`,
  'giu',
);
/**
 * Forme inversée (vérification sur les vrais livres, 04/10/2026) : le numéro AVANT le recueil —
 * « hadith 6410 d'al-Bukhārī », « ḥadīth n° 54 de Muslim », « hadith 30 chez Abū Dāwūd ».
 */
const INV = new RegExp(
  `(?<![\\p{L}\\p{M}])(ḥadīth|hadith|hadîth|${ar('حديث')})\\s*(?:n[°º]\\.?|no\\.?|n\\.)?\\s*(${DIGIT}{1,5})(?!${DIGIT}|[,.:]${DIGIT})` +
    `(\\s+(?:d['’]|de\\s+|du\\s+|chez\\s+|dans\\s+)?(?:(?:al|an|at|ad|as|aṭ|aḍ|aṣ|el)-)?)(${NAMES})(?![\\p{L}\\p{M}])`,
  'giu',
);

/** chiffres arabes (٠-٩, ۰-۹) → chiffres latins, pour chercher au registre */
const latinDigits = (n: string) =>
  n.replace(/[٠-٩۰-۹]/g, (d) => String(((d.codePointAt(0)! - 0x0660) % 0x90) % 10));

export type VerifiedSet = ReadonlySet<string>;

export function canonicalCollection(name: string): string {
  const n = name.trim().replace(/^(?:al|an|at|ad|as|aṭ|aḍ|aṣ|el)-/i, '');
  return ALIASES.find(([re]) => re.test(n) || re.test(name.trim()))?.[1] ?? name;
}

/** Index « recueil#numéro » des hadiths VERIFIE du registre. */
export function verifiedHadiths(registry: Record<string, Record<string, unknown>>): Set<string> {
  const out = new Set<string>();
  for (const h of Object.values(registry))
    if (h.statut === 'VERIFIE' && typeof h.recueil === 'string' && h.numero !== undefined)
      out.add(`${canonicalCollection(h.recueil)}#${String(h.numero)}`);
  return out;
}

/** Retire d'un texte les numéros de hadiths non vérifiés ; renvoie le texte et le nombre de retraits. */
export function maskHadithNumbers(
  text: string,
  verified: VerifiedSet,
): { text: string; masked: number } {
  let masked = 0;
  const out = text.replace(REF, (all, name: string, sep: string, num: string) => {
    if (verified.has(`${canonicalCollection(name)}#${latinDigits(num)}`)) return all;
    masked++;
    // « Muslim (54) » → « Muslim » ; « Muslim (1907, avec…) » → « Muslim (avec… » ; « al-Bukhārī 1894 » → « al-Bukhārī »
    return sep.includes('(') ? `${name} (` : name;
  });
  // forme inversée : « hadith 6410 d'al-Bukhārī » → « hadith d'al-Bukhārī »
  const out2 = out.replace(INV, (all, word: string, num: string, link: string, name: string) => {
    if (verified.has(`${canonicalCollection(name)}#${latinDigits(num)}`)) return all;
    masked++;
    return `${word}${link}${name}`;
  });
  if (!masked) return { text, masked };
  return { text: out2.replace(/\s*\(\s*\)/g, '').replace(/\(\s*[,;]\s*/g, '('), masked };
}

/** Applique le masquage à toutes les chaînes d'une leçon (copie) ; compte les retraits. */
export function maskTree<T>(value: T, verified: VerifiedSet): { value: T; masked: number } {
  let masked = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = maskHadithNumbers(v, verified);
      masked += r.masked;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        // versets du Coran : jamais touchés (texte Tanzil octet par octet)
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [
          k,
          k === 'versets' ? x : walk(x),
        ]),
      );
    return v;
  };
  return { value: walk(value) as T, masked };
}

/** Références « recueil + numéro » non vérifiées encore présentes (contrôle bloquant de l'import). */
export function unmaskedHadithRefs(value: unknown, verified: VerifiedSet): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(REF))
        if (!verified.has(`${canonicalCollection(m[1]!)}#${latinDigits(m[3]!)}`))
          out.push(m[0].trim());
      for (const m of v.matchAll(INV))
        if (!verified.has(`${canonicalCollection(m[4]!)}#${latinDigits(m[2]!)}`))
          out.push(m[0].trim());
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        if (k !== 'versets') walk(x);
  };
  walk(value);
  return out;
}
