/* eslint-disable no-misleading-character-class -- classes de signes combinants voulues (signes du Muṣḥaf, harakāt) */
/**
 * Audio des leçons (chantier A3) — clé d'un texte « à écouter », IDENTIQUE à celle du moteur des livres
 * (awform.js : `sayText` puis `AW.audioKey`) : marque ✱/* de tête retirée, crochets de balisage et tatweel
 * retirés, signes coraniques U+06D6–U+06ED retirés, alif waṣla → alif, alif suscrit retiré, espaces réduits,
 * puis NFC. Le fichier d'un texte s'appelle `<SHA-1 UTF-8 de la clé>.mp3`.
 * Ne JAMAIS modifier l'une sans l'autre : le test `audio-cle.test.ts` compare 200 textes réels des livres.
 *
 * Aucune dépendance (navigateur, service worker, Node) : SHA-1 écrit ici, synchrone.
 */

/** `sayText` du moteur des livres */
export function sayText(s: string): string {
  return String(s ?? '')
    .replace(/[[\]ـ]/g, '')
    .replace(/[ۖ-ۭ]/g, '')
    .replace(/ٱ/g, 'ا')
    .replace(/ٰ/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `AW.audioKey` du moteur des livres */
export function audioKey(s: string): string {
  // NFC comme le moteur des livres : la clé ne sert qu'à NOMMER un fichier (empreinte), elle n'est jamais
  // affichée ni stockée comme contenu ; aucun texte coranique n'a de fichier (garde coranique)
  // eslint-disable-next-line no-restricted-syntax
  return sayText(String(s ?? '').replace(/^[✱*\s]+/, '')).normalize('NFC');
}

/** SHA-1 (hexadécimal) des octets UTF-8 d'une chaîne. */
export function sha1Hex(s: string): string {
  const m = new TextEncoder().encode(s);
  const n = (((m.length + 8) >> 6) + 1) << 4;
  const w = new Uint32Array(n);
  for (let i = 0; i < m.length; i++) w[i >> 2]! |= m[i]! << (24 - (i & 3) * 8);
  w[m.length >> 2]! |= 0x80 << (24 - (m.length & 3) * 8);
  w[n - 1] = m.length * 8;
  w[n - 2] = Math.floor((m.length * 8) / 2 ** 32);
  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476,
    e = 0xc3d2e1f0;
  const x = new Uint32Array(80);
  const rol = (v: number, k: number) => (v << k) | (v >>> (32 - k));
  for (let j = 0; j < n; j += 16) {
    for (let t = 0; t < 80; t++)
      x[t] = t < 16 ? w[j + t]! : rol(x[t - 3]! ^ x[t - 8]! ^ x[t - 14]! ^ x[t - 16]!, 1);
    let [A, B, C, D, E] = [a, b, c, d, e];
    for (let t = 0; t < 80; t++) {
      const f =
        t < 20
          ? ((B & C) | (~B & D)) + 0x5a827999
          : t < 40
            ? (B ^ C ^ D) + 0x6ed9eba1
            : t < 60
              ? ((B & C) | (B & D) | (C & D)) + 0x8f1bbcdc
              : (B ^ C ^ D) + 0xca62c1d6;
      const tmp = (rol(A, 5) + f + E + x[t]!) | 0;
      E = D;
      D = C;
      C = rol(B, 30);
      B = A;
      A = tmp;
    }
    a = (a + A) | 0;
    b = (b + B) | 0;
    c = (c + C) | 0;
    d = (d + D) | 0;
    e = (e + E) | 0;
  }
  return [a, b, c, d, e].map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Nom (sans extension) du fichier audio d'un texte ; null pour un texte vide. */
export function audioFileId(text: string): string | null {
  const k = audioKey(text);
  return k ? sha1Hex(k) : null;
}

/**
 * GARDE CORANIQUE, côté affichage : un texte qui porte des signes propres à l'écriture du Muṣḥaf (signes de
 * pause et petits signes U+06D6–U+06ED, alif waṣla, tanwīn ouverts) n'a jamais d'audio de synthèse
 * (l'alif suscrit n'est pas compté : l'écriture courante l'emploie, « هٰذَا »).
 * La garde complète (comparaison au texte Tanzil) est faite à l'import (`coranSkeletons`).
 */
export function looksQuranic(text: string): boolean {
  return /[ۖ-ۭٱࣰ-ࣲ]/.test(String(text ?? ''));
}

/**
 * Squelette de comparaison au Coran : lettres seules (harakāt, signes, tatweel retirés), formes d'alif et
 * hamza effacées, yā'/alif maqṣūra et tā' marbūṭa/hā' confondues : l'écriture du Muṣḥaf (ʿuthmānī) et
 * l'écriture courante d'un même passage donnent le même squelette.
 */
export function skeleton(s: string): string {
  return String(s ?? '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g, '')
    .replace(/[اأإآٱء]/g, '')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre minimal de mots pour qu'un texte soit traité comme un EXTRAIT du Coran (un mot isolé ne l'est pas). */
export const QURAN_EXCERPT_MIN_WORDS = 3;

/**
 * Vrai si le texte (clé audio) est un extrait du Coran : son squelette, d'au moins 3 mots, figure mot pour
 * mot dans le squelette d'un verset ou de deux versets consécutifs (`corpus` : squelettes joints par des
 * espaces, encadrés d'espaces).
 */
export function isQuranExcerpt(text: string, corpus: string): boolean {
  const k = skeleton(text);
  if (!k || k.split(' ').length < QURAN_EXCERPT_MIN_WORDS) return false;
  return corpus.includes(` ${k} `);
}

/** Longueur d'une suite de mots du Coran qui, CITÉE dans un texte (hadith, invocation…), l'écarte de la synthèse. */
export const QURAN_RUN_WORDS = 5;

/** Suites de `QURAN_RUN_WORDS` mots consécutifs du Coran (squelettes), versets enchaînés. */
export function quranRuns(verses: ReadonlyArray<string>, n = QURAN_RUN_WORDS): Set<string> {
  const w = verses.map(skeleton).join(' ').split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** Vrai si le texte CONTIENT une citation du Coran d'au moins `n` mots consécutifs. */
export function containsQuranRun(
  text: string,
  runs: ReadonlySet<string>,
  n = QURAN_RUN_WORDS,
): boolean {
  const w = skeleton(text).split(' ').filter(Boolean);
  for (let i = 0; i + n <= w.length; i++) if (runs.has(w.slice(i, i + n).join(' '))) return true;
  return false;
}

/** Corpus de comparaison à partir des versets (ordre du Muṣḥaf) : chaque verset, puis chaque paire consécutive. */
export function quranCorpus(verses: ReadonlyArray<string>): string {
  const sk = verses.map(skeleton);
  const parts: string[] = [];
  for (let i = 0; i < sk.length; i++) {
    parts.push(sk[i]!);
    if (i + 1 < sk.length) parts.push(`${sk[i]} ${sk[i + 1]}`);
  }
  return ` ${parts.join(' | ')} `;
}
