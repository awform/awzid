/**
 * Lot 29 — TAJWID EN COULEURS : annotations de règles posées comme ENVELOPPES sur des plages de caractères du
 * texte Tanzil, sans jamais modifier ni normaliser ce texte.
 *
 * Source des règles : jeu d'annotations « quran-tajweed » de Collin Fair (github.com/cpfair/quran-tajweed,
 * commit 496f71c, fichier `output/tajweed.hafs.uthmani-pause-sajdah.json`, licence CC BY 4.0), riwāya Ḥafṣ,
 * positions en points de code dans le texte Tanzil Uthmani 1.0.2 (copie d'avril 2017 fournie par le projet).
 * Notre texte (Tanzil, plus récent) ne diffère de cette copie que par des INSERTIONS (petite mīm après un
 * tanwin, signes de pause, signe ۞) : `alignVerse` recale chaque annotation et refuse tout autre écart.
 * Voir docs/projet/LICENCES.md. Aucune règle n'est saisie à la main.
 *
 * Fichier sans import (lisible par Node directement) ; utilisé par le générateur (`cli-tajwid.ts`), les tests
 * et l'application web (`@awform/content/tajwid`).
 */

/** Règles de la source, dans l'ordre des indices du format compact (ne jamais réordonner). */
export const TAJWID_RULES = [
  'ghunnah',
  'idghaam_ghunnah',
  'idghaam_shafawi',
  'ikhfa',
  'ikhfa_shafawi',
  'iqlab',
  'idghaam_no_ghunnah',
  'idghaam_mutajanisayn',
  'idghaam_mutaqaribayn',
  'madd_2',
  'madd_246',
  'madd_munfasil',
  'madd_muttasil',
  'madd_6',
  'qalqalah',
  'hamzat_wasl',
  'lam_shamsiyyah',
  'silent',
] as const;
export type TajwidRule = (typeof TAJWID_RULES)[number];

/** Empreinte SHA-256 du fichier Tanzil (`coran/tanzil-uthmani.tsv`) sur lequel les fichiers livrés sont calés. */
export const TAJWID_TANZIL_SHA256 =
  '4d6d41e0b84cbdf9978ed44cc76a2ea74414c749a8ce2e41058e10148d439fe5';

/** Crédit de la source (affiché dans l'application et écrit dans chaque fichier de sourate). */
export const TAJWID_SOURCE =
  'quran-tajweed (Collin Fair, github.com/cpfair/quran-tajweed, commit 496f71c), licence CC BY 4.0';

/**
 * Fichier d'une sourate (`/tajwid/NNN.json`) : `a[verset - 1]` = [empreinte du texte Tanzil du verset,
 * puis triplets (indice de règle, début, longueur)] — positions en unités UTF-16 du texte Tanzil (tout le
 * texte est dans le plan multilingue de base : unité = point de code).
 */
export interface TajwidSura {
  v: 1;
  s: number;
  src: string;
  a: Array<[string, ...number[]]>;
}

/** Empreinte FNV-1a 32 bits (base 36) : l'annotation n'est appliquée qu'au texte exact qui a servi au calage. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Un morceau du texte : caractères Tanzil tels quels, et la règle qui le colore (ou aucune). */
export interface Run {
  t: string;
  r: TajwidRule | null;
}

const TANWIN = /[ً-ٍ]/;
const SMALL_MEEM = /[ۭۢ]/;

/**
 * Découpe un verset en morceaux colorés. Les annotations sont peintes dans l'ordre du fichier (début croissant,
 * plus longue d'abord) : une règle imbriquée l'emporte sur celle qui l'englobe. La petite mīm qui suit un
 * tanwin reste avec lui (l'affichage du tanwin du Muṣḥaf les traite ensemble). Renvoie `null` — verset sans
 * couleurs — si une position est invalide, si l'empreinte ne correspond pas au texte, ou si la concaténation
 * des morceaux n'est pas EXACTEMENT le texte.
 */
export function runsOf(
  text: string,
  entry: readonly (string | number)[] | undefined,
): Run[] | null {
  if (!entry || entry[0] !== textHash(text) || (entry.length - 1) % 3 !== 0) return null;
  const paint = new Int16Array(text.length).fill(-1);
  for (let k = 1; k < entry.length; k += 3) {
    const r = entry[k] as number;
    const start = entry[k + 1] as number;
    const len = entry[k + 2] as number;
    if (
      !Number.isInteger(r) ||
      r < 0 ||
      r >= TAJWID_RULES.length ||
      !Number.isInteger(start) ||
      !Number.isInteger(len) ||
      start < 0 ||
      len <= 0 ||
      start + len > text.length
    )
      return null;
    paint.fill(r, start, start + len);
  }
  for (let i = 1; i < text.length; i++)
    if (paint[i] !== paint[i - 1] && TANWIN.test(text[i - 1]!) && SMALL_MEEM.test(text[i]!))
      paint[i] = paint[i - 1]!;
  const runs: Run[] = [];
  let from = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || paint[i] !== paint[from]) {
      const p = paint[from]!;
      runs.push({ t: text.slice(from, i), r: p < 0 ? null : TAJWID_RULES[p]! });
      from = i;
    }
  }
  return runs.map((x) => x.t).join('') === text ? runs : null;
}

/**
 * Morceaux d'une portion [from, to) du verset, coupée en mots aux espaces (comme l'affichage) : l'espace
 * reste le séparateur, jamais colorié. Contrôle : mots rejoints par « » = portion exacte, sinon `null`.
 */
export function wordRuns(runs: Run[], text: string, from: number, to: number): Run[][] | null {
  const words: Run[][] = [[]];
  let pos = 0;
  for (const run of runs) {
    const end = pos + run.t.length;
    const a = Math.max(pos, from);
    const b = Math.min(end, to);
    if (a < b) {
      const piece = run.t.slice(a - pos, b - pos).split(' ');
      piece.forEach((t, i) => {
        if (i > 0) words.push([]);
        if (t) words[words.length - 1]!.push({ t, r: run.r });
      });
    }
    pos = end;
  }
  const back = words.map((w) => w.map((x) => x.t).join('')).join(' ');
  return back === text.slice(from, to) ? words : null;
}

// ------------------------------------------------------------------ calage (générateur et tests)

/** Caractères que notre texte Tanzil peut contenir EN PLUS de la copie de 2017 (rien d'autre n'est admis). */
const INSERTABLE = new Set([
  0x20, // espace (qui accompagne un signe de pause)
  0x06d6,
  0x06d7,
  0x06d8,
  0x06d9,
  0x06da,
  0x06db,
  0x06dc, // signes de pause
  0x06de, // ۞ début de quart de ḥizb
  0x06e9, // ۩ prosternation
  0x06e2,
  0x06ed, // petite mīm (règle du tanwin)
]);

export interface SourceAnnotation {
  rule: string;
  start: number;
  end: number;
}

/**
 * Cale les annotations d'un verset de la copie de 2017 (`ref`) sur notre texte (`ours`). Lève une erreur si
 * `ref` n'est pas une sous-suite de `ours` aux seules insertions admises, si une annotation sort du texte,
 * porte une règle inconnue, ou si les caractères recouverts (insertions retirées) diffèrent.
 * Renvoie l'entrée compacte du verset : [empreinte, règle, début, longueur, …].
 */
export function alignVerse(
  key: string,
  ref: string,
  ours: string,
  anns: readonly SourceAnnotation[],
): [string, ...number[]] {
  const map = new Int32Array(ref.length);
  const inserted = new Uint8Array(ours.length);
  let j = 0;
  for (let i = 0; i < ref.length; i++) {
    while (j < ours.length && ours[j] !== ref[i]) {
      if (!INSERTABLE.has(ours.charCodeAt(j)))
        throw new Error(`${key} : écart non admis U+${ours.charCodeAt(j).toString(16)} en ${j}`);
      inserted[j++] = 1;
    }
    if (j >= ours.length)
      throw new Error(`${key} : le texte de 2017 n'est pas contenu dans Tanzil`);
    map[i] = j++;
  }
  for (; j < ours.length; j++) {
    if (!INSERTABLE.has(ours.charCodeAt(j)))
      throw new Error(`${key} : écart non admis U+${ours.charCodeAt(j).toString(16)} en ${j}`);
    inserted[j] = 1;
  }
  const out: number[] = [];
  const sorted = [...anns].sort((a, b) => a.start - b.start || b.end - a.end);
  for (const a of sorted) {
    const r = (TAJWID_RULES as readonly string[]).indexOf(a.rule);
    if (r < 0) throw new Error(`${key} : règle inconnue ${a.rule}`);
    if (!(
      Number.isInteger(a.start) &&
      Number.isInteger(a.end) &&
      a.start >= 0 &&
      a.end > a.start &&
      a.end <= ref.length
    ))
      throw new Error(`${key} : position invalide ${a.rule} ${a.start}-${a.end}`);
    const s = map[a.start]!;
    let e = map[a.end - 1]! + 1;
    // la petite mīm ajoutée juste après un tanwin recouvert fait partie de la même lettre
    while (e < ours.length && inserted[e] && SMALL_MEEM.test(ours[e]!)) e++;
    // les autres insertions (signe de pause et son espace) restent HORS de la couleur : plage coupée
    const keep = (k: number) => !inserted[k] || SMALL_MEEM.test(ours[k]!);
    let covered = '';
    let from = -1;
    for (let k = s; k <= e; k++) {
      if (k < e && keep(k)) {
        if (from < 0) from = k;
        if (!inserted[k]) covered += ours[k];
      } else if (from >= 0) {
        out.push(r, from, k - from);
        from = -1;
      }
    }
    if (covered !== ref.slice(a.start, a.end))
      throw new Error(`${key} : caractères différents pour ${a.rule} ${a.start}-${a.end}`);
  }
  return [textHash(ours), ...out];
}

/** Lit la copie Tanzil de 2017 au format « sourate|verset|texte » (lignes « # » ignorées). */
export function parsePipeText(txt: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const raw of txt.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const x = /^(\d+)\|(\d+)\|(.*)$/.exec(line);
    if (x) m.set(`${x[1]}:${x[2]}`, x[3]!);
  }
  return m;
}

/**
 * Construit les 114 fichiers de sourate à partir de la source (annotations + copie de 2017) et de NOTRE texte
 * Tanzil (`loadTanzil`). Lève une erreur au premier écart : le calage est tout ou rien.
 */
export function buildTajwid(
  source: ReadonlyArray<{ surah: number; ayah: number; annotations: SourceAnnotation[] }>,
  ref: ReadonlyMap<string, string>,
  tanzil: ReadonlyMap<string, string>,
): TajwidSura[] {
  if (source.length !== 6236 || tanzil.size !== 6236 || ref.size !== 6236)
    throw new Error(
      `versets : source ${source.length}, 2017 ${ref.size}, Tanzil ${tanzil.size} (6236 attendus)`,
    );
  const suras: TajwidSura[] = Array.from({ length: 114 }, (_, i) => ({
    v: 1,
    s: i + 1,
    src: TAJWID_SOURCE,
    a: [],
  }));
  for (const e of source) {
    const key = `${e.surah}:${e.ayah}`;
    const r = ref.get(key);
    const ours = tanzil.get(key);
    if (r === undefined || ours === undefined) throw new Error(`${key} : verset absent`);
    const sura = suras[e.surah - 1];
    if (!sura || e.ayah !== sura.a.length + 1) throw new Error(`${key} : ordre inattendu`);
    sura.a.push(alignVerse(key, r, ours, e.annotations));
  }
  return suras;
}
