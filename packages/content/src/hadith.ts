/**
 * Numéros de hadiths visibles de l'élève : un numéro n'est montré que si le registre canonique
 * (registre/hadiths.json) porte ce recueil et ce numéro au statut « VERIFIE » (décision du pilote, lot 8).
 * Sinon le numéro est RETIRÉ du texte affiché (le recueil reste nommé). Rien d'autre n'est modifié.
 */

/** Noms de recueils tels qu'écrits dans les livres → nom du registre. */
const ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/al-Bukhārī|Bukhārī/, 'al-Bukhārī'],
  [/Muslim/, 'Muslim'],
  [/at-Tirmidhī|Tirmidhī/, 'at-Tirmidhī'],
  [/Abū Dāwūd/, 'Abū Dāwūd'],
  [/Ibn Mājah?|Ibn Māja/, 'Ibn Māja'],
  [/an-Nasāʾī|Nasāʾī/, 'an-Nasāʾī'],
  [/Aḥmad/, 'Aḥmad'],
  [/al-Adab al-mufrad/, 'al-Adab al-mufrad'],
  [/ad-Dārimī/, 'ad-Dārimī'],
];

const NAMES =
  'al-Bukhārī|Bukhārī|Muslim|at-Tirmidhī|Tirmidhī|Abū Dāwūd|Ibn Mājah|Ibn Māja|an-Nasāʾī|Nasāʾī|Aḥmad|al-Adab al-mufrad|ad-Dārimī';
/** « Muslim (1907, avec…) », « Muslim (54) », « al-Bukhārī 1894 », « Abū Dāwūd n° 30 » */
const REF = new RegExp(`(${NAMES})(\\s*\\(\\s*|\\s+(?:n°\\s*)?)(\\d{1,5})(?![\\d,.]\\d)`, 'g');

export type VerifiedSet = ReadonlySet<string>;

export function canonicalCollection(name: string): string {
  return ALIASES.find(([re]) => re.test(name))?.[1] ?? name;
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
    if (verified.has(`${canonicalCollection(name)}#${num}`)) return all;
    masked++;
    // « Muslim (54) » → « Muslim » ; « Muslim (1907, avec…) » → « Muslim (avec… » ; « al-Bukhārī 1894 » → « al-Bukhārī »
    return sep.includes('(') ? `${name} (` : name;
  });
  return { text: out.replace(/\s*\(\s*\)/g, '').replace(/\(\s*[,;]\s*/g, '('), masked };
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
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]),
      );
    return v;
  };
  return { value: walk(value) as T, masked };
}
