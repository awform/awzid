/**
 * Texte bidirectionnel (arabe et français sur la même ligne) : découpe un texte en segments d'une seule
 * écriture, SANS JAMAIS LE MODIFIER (la concaténation des segments redonne le texte octet pour octet).
 *
 * - base « fr » (texte français, de gauche à droite) : chaque segment arabe est isolé (rtl) ;
 * - base « ar » (texte arabe, de droite à gauche) : chaque segment latin est isolé (ltr).
 *
 * Règles de découpe (base fr) :
 * - un segment arabe commence et finit par un caractère arabe ; à l'intérieur, il garde les espaces,
 *   tirets, chiffres, la ponctuation ARABE (، ؛ ؟) et les parenthèses ÉQUILIBRÉES ;
 * - la ponctuation latine (, ; : / = + . « ») sépare les segments : une liste écrite à la française
 *   (« ثَ / تَ / سَ ») se lit dans l'ordre du texte français ; les parenthèses, guillemets et la
 *   ponctuation qui entourent un terme arabe restent dans le français, donc du bon côté ;
 * - « … » collé à la fin d'un segment arabe lui appartient (citation interrompue) ;
 * - un segment arabe d'au moins LONG_WORDS mots (de deux lettres ou plus) est « long » : il passe sur sa
 *   propre ligne, aligné à droite, la suite (traduction) en dessous — règle du client : jamais une phrase
 *   arabe (ni sa fin) sur la même ligne que le français, même au milieu d'une phrase ; entre parenthèses ou
 *   entre guillemets, les signes qui l'entourent passent avec lui sur sa ligne (jamais une parenthèse seule).
 */
export type BidiBase = 'fr' | 'ar';
export type BidiKind = 'plain' | 'ar' | 'ar-long' | 'ltr';
export interface BidiSegment {
  text: string;
  kind: BidiKind;
}

/** Nombre de mots arabes à partir duquel une phrase arabe passe sur sa propre ligne (1 ou 2 mots : dans la ligne). */
export const LONG_WORDS = 3;

const AR_ANY = /\p{scx=Arabic}/u; // lettres, signes (ḥarakāt), ponctuation et chiffres arabes, ﷺ
const AR_LETTER = /(?=\p{L})\p{sc=Arabic}/u;
const LAT_LETTER = /(?=\p{L})(?!\p{scx=Arabic})/u;
const LAT_ANY = /[\p{L}\p{M}\p{N}]/u; // dans un segment latin : lettres, accents, chiffres
/** neutres admis À L'INTÉRIEUR d'un segment arabe (entre deux caractères arabes) */
const AR_INNER = /[\s\-‐‑–‌‏0-9()[\]]|‍/u;
/** neutres admis à l'intérieur d'un segment latin (dans un texte arabe) */
const LAT_INNER = /[\s\-‐‑'’.,:;/()[\]&+]/u;
const OPEN = '([';
const CLOSE = ')]';

/** Teste vite si le texte contient l'autre écriture (cas le plus courant : rien à faire). */
export function hasArabic(s: string): boolean {
  return AR_LETTER.test(s);
}

/** Coupe `end` avant la première parenthèse non appariée de text[start, end). */
function balancedEnd(text: string, start: number, end: number): number {
  const stack: number[] = [];
  for (let k = start; k < end; k++) {
    const ch = text[k]!;
    if (OPEN.includes(ch)) stack.push(k);
    else if (CLOSE.includes(ch)) {
      const o = stack.pop();
      if (o === undefined || OPEN.indexOf(text[o]!) !== CLOSE.indexOf(ch)) return k;
    }
  }
  return stack.length ? stack[0]! : end;
}

/** Mots arabes d'au moins deux lettres. */
export function arabicWords(s: string): number {
  let n = 0;
  for (const w of s.split(/\s+/)) {
    let letters = 0;
    for (const ch of w) if (AR_LETTER.test(ch)) letters++;
    if (letters >= 2) n++;
  }
  return n;
}

export function bidiSegments(text: string, base: BidiBase = 'fr'): BidiSegment[] {
  if (!text) return [];
  const rtl = base === 'ar';
  const isStart = rtl ? LAT_LETTER : AR_LETTER;
  const isCore = rtl
    ? (ch: string) => LAT_ANY.test(ch) && !AR_ANY.test(ch)
    : (ch: string) => AR_ANY.test(ch);
  const inner = rtl ? LAT_INNER : AR_INNER;
  if (!isStart.test(text)) return [{ text, kind: 'plain' }];

  const out: BidiSegment[] = [];
  let plainFrom = 0;
  let i = 0;
  while (i < text.length) {
    if (!isStart.test(text[i]!)) {
      i++;
      continue;
    }
    // segment candidat : du premier caractère de l'écriture au dernier, neutres internes compris
    let end = i + 1;
    let k = i + 1;
    while (k < text.length) {
      const ch = text[k]!;
      if (isCore(ch)) end = ++k;
      else if (inner.test(ch)) k++;
      else break;
    }
    // parenthèses : jamais de paire coupée par la frontière du segment
    for (;;) {
      const cut = balancedEnd(text, i, end);
      if (cut === end) break;
      end = cut;
      while (end > i && !isCore(text[end - 1]!)) end--;
    }
    if (end <= i) {
      i++;
      continue;
    }
    if (!rtl && text[end] === '…') end++;
    // signes collés devant la première lettre (tatwīl de « ـنَا », chiffres de « 2nd ») : même segment
    while (i > plainFrom && isCore(text[i - 1]!)) i--;
    let seg = text.slice(i, end);
    const long = !rtl && arabicWords(seg) >= LONG_WORDS;
    if (long) {
      // phrase entre parenthèses ou guillemets : les signes qui l'entourent passent avec elle sur sa ligne
      const before = /[([«“"]\s*…?\s*$/.exec(text.slice(Math.max(plainFrom, i - 4), i));
      const after = /^\s*…?\s*[)\]»”"]/.exec(text.slice(end, end + 4));
      if (before && after) {
        i -= before[0].length;
        end += after[0].length;
        seg = text.slice(i, end);
      }
    }
    if (i > plainFrom) out.push({ text: text.slice(plainFrom, i), kind: 'plain' });
    out.push({ text: seg, kind: rtl ? 'ltr' : long ? 'ar-long' : 'ar' });
    plainFrom = i = end;
  }
  if (plainFrom < text.length) out.push({ text: text.slice(plainFrom), kind: 'plain' });
  return out;
}
