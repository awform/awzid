/**
 * Versets cités dans les blocs d'une leçon (points du fiqh et de l'adab, « je retiens », rubriques des
 * sciences, invocations…) : repérés par CORRESPONDANCE EXACTE avec le texte Tanzil, octet pour octet (aucune
 * normalisation), jamais d'après l'apparence. Un hadith ou une phrase en écriture courante ne correspond donc
 * jamais ; un passage du Muṣḥaf recopié tel quel, si.
 *
 * Règles :
 * - le texte arabe du point, débarrassé de la ponctuation qui l'entoure (guillemets, parenthèses, « … »,
 *   point final), doit être une suite de mots ENTIERS d'un verset ou de deux versets consécutifs d'une même
 *   sourate ;
 * - au moins 3 mots ; 2 mots seulement si la référence du verset (sourate:verset) figure dans le point ;
 * - plusieurs passages possibles : la référence donnée dans le point tranche ; sinon un verset entier
 *   l'emporte ; sinon le point est un verset SANS référence (aucune référence inventée).
 * Le résultat (`VerseMark`) désigne la sous-chaîne exacte `ar.slice(i, j)` : c'est elle qu'on affiche.
 */

export interface VerseRow {
  s: number;
  a: number;
  text: string;
}

/** Verset repéré dans un texte : `ar.slice(i, j)` est la sous-chaîne Tanzil exacte. */
export interface VerseMark {
  i: number;
  j: number;
  /** sourate et verset (absents si le passage est ambigu et que le livre ne donne pas la référence) */
  s?: number;
  a?: number;
  /** dernier verset si le passage en couvre deux */
  a2?: number;
  /** référence affichée (celle du livre en fin de traduction si elle désigne ce verset, sinon « Sourate s:a ») */
  ref?: string;
  /** la traduction du livre s'arrête à `k` quand sa référence finale est reprise dans `ref` */
  k?: number;
}

/** Champ posé par le serveur sur un élément `{ ar, … }` reconnu comme verset. */
export const VERSE_FIELD = 'verset_tanzil';

export interface VerseLocator {
  readonly text: string;
  readonly starts: readonly number[];
  readonly rows: ReadonlyArray<{ s: number; a: number }>;
  /** premier mot → positions (début de mot) dans `text` */
  readonly byWord: ReadonlyMap<string, readonly number[]>;
}

/** Index de recherche : versets dans l'ordre du Muṣḥaf, joints par une espace. */
export function buildVerseLocator(rows: ReadonlyArray<VerseRow>): VerseLocator {
  const sorted = [...rows].sort((x, y) => x.s - y.s || x.a - y.a);
  const starts: number[] = [];
  const parts: string[] = [];
  const byWord = new Map<string, number[]>();
  let off = 0;
  for (const r of sorted) {
    starts.push(off);
    parts.push(r.text);
    let p = 0;
    for (const w of r.text.split(' ')) {
      if (w) {
        let l = byWord.get(w);
        if (!l) byWord.set(w, (l = []));
        l.push(off + p);
      }
      p += w.length + 1;
    }
    off += r.text.length + 1;
  }
  return {
    text: parts.join(' '),
    starts,
    rows: sorted.map((r) => ({ s: r.s, a: r.a })),
    byWord,
  };
}

/** ponctuation qui ENTOURE une citation (jamais retirée du milieu) */
const EDGE = /[\s«»"“”„'‘’()[\]{}.,;:!?…،؛؟\-–—]/u;

/** Bornes de la citation dans le texte : ponctuation et espaces des bords écartés. */
export function quoteBounds(ar: string): [number, number] {
  let i = 0;
  let j = ar.length;
  while (i < j && EDGE.test(ar[i]!)) i++;
  while (j > i && EDGE.test(ar[j - 1]!)) j--;
  return [i, j];
}

/** Références « s:a » ou « s:a-b » écrites dans un texte (sourate 1 à 114). */
export function verseRefs(text: string): Array<{ s: number; a: number; a2: number }> {
  const out: Array<{ s: number; a: number; a2: number }> = [];
  for (const m of String(text ?? '').matchAll(
    /(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/g,
  )) {
    const s = Number(m[1]);
    const a = Number(m[2]);
    if (s >= 1 && s <= 114 && a >= 1) out.push({ s, a, a2: m[3] ? Number(m[3]) : a });
  }
  return out;
}

function verseAt(loc: VerseLocator, pos: number): number {
  let lo = 0;
  let hi = loc.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (loc.starts[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Verset contenu dans `ar` (voir les règles en tête du fichier) ; `hint` : textes du même point (traduction,
 * référence) où chercher la référence « sourate:verset ». Null si ce n'est pas un passage exact du Coran.
 */
export function locateVerse(loc: VerseLocator | null, ar: string, hint = ''): VerseMark | null {
  if (!loc || !ar || loc.starts.length === 0) return null;
  const [i, j] = quoteBounds(ar);
  const core = ar.slice(i, j);
  const words = core.split(' ').filter(Boolean);
  if (words.length < 2 || /\s{2,}|[\n\t]/.test(core)) return null;
  const cands: Array<{ k1: number; k2: number; whole: boolean }> = [];
  for (const pos of loc.byWord.get(words[0]!) ?? []) {
    if (!loc.text.startsWith(core, pos)) continue;
    const end = pos + core.length;
    if (end < loc.text.length && loc.text[end] !== ' ') continue;
    const k1 = verseAt(loc, pos);
    const k2 = verseAt(loc, end - 1);
    if (k2 > k1 + 1 || loc.rows[k2]!.s !== loc.rows[k1]!.s) continue;
    const vEnd = k2 + 1 < loc.starts.length ? loc.starts[k2 + 1]! - 1 : loc.text.length;
    cands.push({ k1, k2, whole: pos === loc.starts[k1] && end === vEnd });
  }
  if (!cands.length) return null;
  const refs = verseRefs(hint);
  const byRef = cands.filter((c) =>
    refs.some(
      (r) => r.s === loc.rows[c.k1]!.s && loc.rows[c.k1]!.a <= r.a2 && loc.rows[c.k2]!.a >= r.a,
    ),
  );
  if (words.length < 3 && !byRef.length) return null;
  const wholes = cands.filter((c) => c.whole);
  const pick =
    byRef.length === 1
      ? byRef[0]
      : cands.length === 1
        ? cands[0]
        : !byRef.length && wholes.length === 1
          ? wholes[0]
          : undefined;
  if (!pick) return { i, j };
  const m: VerseMark = { i, j, s: loc.rows[pick.k1]!.s, a: loc.rows[pick.k1]!.a };
  if (pick.k2 !== pick.k1) m.a2 = loc.rows[pick.k2]!.a;
  return m;
}

/** référence écrite par le livre à la fin de la traduction : « … » (Al-Bayyina 98:5, extrait). */
const REF_TAIL = /\s*\(([^()]*?(\d{1,3})\s*:\s*(\d{1,3})[^()]*)\)\s*[.;]?\s*$/;

/**
 * Référence affichée sous le verset et fin de la traduction (affichage seulement, sur deux lignes) : la
 * référence écrite par le livre à la fin du texte français si elle désigne ce verset (la traduction s'arrête
 * alors à `k`), sinon « Sourate s:a » calculée à partir du passage repéré (aucune si le passage est ambigu).
 */
export function splitVerseRef(
  fr: string,
  m: Pick<VerseMark, 's' | 'a' | 'a2'>,
  suraName: string,
): { ref: string; k?: number } {
  const x = REF_TAIL.exec(fr ?? '');
  if (x) {
    const s = Number(x[2]);
    const a = Number(x[3]);
    if (!m.s || (s === m.s && a >= (m.a ?? 0) && a <= (m.a2 ?? m.a ?? 0)))
      return { ref: x[1]!.trim(), k: x.index };
  }
  const ref = m.s && m.a ? `${suraName} ${m.s}:${m.a}${m.a2 ? `-${m.a2}` : ''}`.trim() : '';
  return { ref };
}

/** blocs jamais annotés : exercices (corrigés), Coran et Muṣḥaf (déjà des versets), écriture, lettres */
const SKIP = new Set(['exercices', 'coran', 'mushaf', 'ecriture', 'lettres', 'guide', 'scene']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Pose `verset_tanzil` sur chaque élément `{ ar, … }` des blocs d'affichage d'une leçon dont le texte arabe
 * est un passage exact du Coran. Le texte du livre n'est pas modifié. Renvoie le nombre de versets repérés.
 */
export function annotateVerses(
  lesson: unknown,
  loc: VerseLocator | null,
  suraName?: (s: number) => string,
): number {
  if (!loc || !loc.starts.length || !isObj(lesson)) return 0;
  let n = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (!isObj(v)) return;
    if (typeof v.ar === 'string' && !(VERSE_FIELD in v)) {
      const hint = Object.entries(v)
        .filter(([k, x]) => k !== 'ar' && typeof x === 'string')
        .map(([, x]) => x as string)
        .join(' ');
      const m = locateVerse(loc, v.ar, hint);
      if (m) {
        const r = splitVerseRef(
          typeof v.fr === 'string' ? v.fr : '',
          m,
          m.s && suraName ? suraName(m.s) : '',
        );
        if (r.ref) m.ref = r.ref;
        if (r.k !== undefined) m.k = r.k;
        v[VERSE_FIELD] = m;
        n++;
      }
    }
    for (const [k, x] of Object.entries(v)) if (k !== VERSE_FIELD) walk(x);
  };
  for (const [k, x] of Object.entries(lesson)) if (!SKIP.has(k)) walk(x);
  return n;
}
