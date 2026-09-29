/**
 * Détecteur de texte coranique (ARCHITECTURE_V2 § 1.6, étape 2). Forme « nue » à usage INTERNE seulement
 * (jamais affichée) : sans voyelles, signes ni tatwīl, alifs unifiés. Tout segment arabe d'au moins trois
 * mots dont un trigramme appartient à l'index du Tanzil est considéré comme coranique.
 * Aucune normalisation Unicode (String.prototype.normalize) : simple table de correspondance.
 */

/** Signes retirés : voyelles et signes coraniques (U+064B–U+065F, U+0670, U+06D6–U+06ED), tatwīl. */
// eslint-disable-next-line no-misleading-character-class -- classe de signes combinants voulue
const MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF]/g;
const MAP: Record<string, string> = {
  ٱ: 'ا', // ٱ
  أ: 'ا', // أ
  إ: 'ا', // إ
  آ: 'ا', // آ
  ى: 'ي', // ى → ي
  ة: 'ه', // ة → ه
  ؤ: 'و', // ؤ → و
  ئ: 'ي', // ئ → ي
  ی: 'ي', // ی persan
  ک: 'ك', // ک persan
};
const ARABIC_LETTER = /[ء-يٱ-ۓ]/;

export function bare(word: string): string {
  let out = '';
  for (const ch of word.replace(MARKS, '')) {
    const m = MAP[ch];
    if (m) out += m;
    else if (ARABIC_LETTER.test(ch) || ch === 'ء') out += ch;
  }
  // hamza isolée et alif final : variations d'orthographe fréquentes
  return out.replace(/ء/g, '');
}

/**
 * Caractères d'un MOT arabe : lettres, voyelles et signes, tatwīl. Tout le reste sépare les mots (audit CON-4) :
 * ponctuation, balises, barres, fin de verset ۝ (U+06DD), ۞ (U+06DE), ۩ (U+06E9), séparateurs invisibles…
 */
const NOT_WORD =
  // eslint-disable-next-line no-misleading-character-class -- classe de lettres et de signes combinants voulue
  /[^\u0621-\u064A\u064B-\u065F\u0670-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640\u08D3-\u08FF\u200B-\u200F\u2060-\u2064\uFEFF\u00AD\u034F]+/;
/** caractères invisibles de mise en forme : ignorés (mot collé) OU séparateurs, selon la variante */
// eslint-disable-next-line no-misleading-character-class -- caractères invisibles isolés, voulus
const INVISIBLE = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD\u034F]/g;

/** Mots arabes (forme nue) d'un texte, dans l'ordre ; les mots vides sont écartés. */
export function bareWords(text: string): string[] {
  return text
    .replace(INVISIBLE, '')
    .split(NOT_WORD)
    .map(bare)
    .filter((w) => w.length > 0);
}

/**
 * Découpages possibles d'un texte (détection seulement) : invisibles et tatwīl collés au mot, ou pris pour
 * des séparateurs (« كلمة‌كلمة », « كلمةـكلمة » : deux mots) ; un passage est coranique si l'un des deux l'est.
 */
function wordVariants(text: string): string[][] {
  const split = text.replace(INVISIBLE, ' ').replace(/\u0640/g, ' ');
  return [bareWords(text), bareWords(split)];
}

export class QuranIndex {
  private readonly tri = new Set<string>();
  /** première occurrence de chaque trigramme → verset (pour retrouver une référence) */
  private readonly where = new Map<string, string>();
  readonly verses: ReadonlyMap<string, string>;

  constructor(tanzil: ReadonlyMap<string, string>) {
    this.verses = tanzil;
    // les trigrammes franchissent la fin des versets d'une même sourate (« donne la suite de… »)
    let sura = 0;
    let prev: string[] = [];
    for (const [ref, text] of tanzil) {
      const s = Number(ref.split(':')[0]);
      if (s !== sura) {
        sura = s;
        prev = [];
      }
      const words = bareWords(text);
      const all = [...prev.slice(-2), ...words];
      for (let i = 0; i + 2 < all.length; i++) {
        const k = `${all[i]} ${all[i + 1]} ${all[i + 2]}`;
        this.tri.add(k);
        if (!this.where.has(k)) this.where.set(k, ref);
      }
      prev = words;
    }
  }

  /** Trigrammes coraniques trouvés dans un texte (vide : pas de Coran). */
  matches(text: string): string[] {
    const out = new Set<string>();
    for (const w of wordVariants(text))
      for (let i = 0; i + 2 < w.length; i++) {
        const k = `${w[i]} ${w[i + 1]} ${w[i + 2]}`;
        if (this.tri.has(k)) out.add(k);
      }
    return [...out];
  }

  /** Verset le plus probable d'un passage (pour répondre par une RÉFÉRENCE). */
  locate(text: string): string | null {
    const votes = new Map<string, number>();
    for (const k of this.matches(text)) {
      const ref = this.where.get(k);
      if (ref) votes.set(ref, (votes.get(ref) ?? 0) + 1);
    }
    let best: string | null = null;
    let n = 0;
    for (const [ref, v] of votes)
      if (v > n) {
        best = ref;
        n = v;
      }
    return best;
  }

  get size(): number {
    return this.tri.size;
  }
}

/** Arabe présent dans un texte (au moins une lettre arabe, y compris en formes de présentation). */
export const hasArabic = (s: string) => ARABIC_LETTER.test(s) || PRESENTATION_FORMS.test(s);

/**
 * Formes de présentation arabes (U+FB50–FDFF, U+FE70–FEFF) : jamais utiles à un tuteur de langue, elles
 * servent à déguiser un texte (audit CON-4) ; tout texte libre qui en contient est refusé. Seules les formules
 * d'eulogie ﷺ et ﷻ (U+FDFA, U+FDFB), d'usage courant après un nom, restent permises.
 */
export const PRESENTATION_FORMS = /[\uFB50-\uFDF9\uFDFC-\uFDFF\uFE70-\uFEFE]/;

/**
 * Translittération latine d'une phrase arabe (REGLES §4 : jamais de phonétique pour faire prononcer
 * l'arabe) : trois mots consécutifs ou plus pris dans le lexique des formules et versets courants.
 */
const TRANSLIT = new Set(
  (
    'bismillah bismillahi bismi allah allahu allahi llahi lillah lillahi rahman rahmani rahmanir ' +
    'rahim rahimi rahiim ar-rahman ar-rahim ar-rahmani ar-rahimi alhamdu alhamdulillah al-hamdu hamdu rabbil rabbi rabb ' +
    "alamin alamine 'alamin al-alamin maliki maaliki yawmi yawmid yawm din deen ad-din iyyaka iyyaka na'budu nabudu " +
    "nasta'in nastain ihdina ihdinas sirat siraat siratal mustaqim al-mustaqim qul huwa hua ahad ahadun samad " +
    'as-samad lam yalid yulad wa walam yakun lahu kufuwan kufuwan inna anzalnahu fi laylatil qadr ' +
    'subhana subhanallah subhanaka rabbiyal ala azim adhim salam alaykum alaikum assalamu wa-alaykum ' +
    'la ilaha illallah illa muhammad rasulullah rasoulullah astaghfirullah inshallah mashallah ' +
    'tabarak alladhi bi yadihi mulk wal-asr asr insan lafi khusr ya ayyuha kafirun nas malik ilah ' +
    'min sharri waswas khannas falaq ghasiq kawthar innaa aataynaka'
  ).split(/\s+/),
);

export function transliterationRuns(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[āâ]/g, 'a')
    .replace(/[īî]/g, 'i')
    .replace(/[ūû]/g, 'u')
    .replace(/[ḥ]/g, 'h')
    .replace(/[ṣ]/g, 's')
    .replace(/[ḍ]/g, 'd')
    .replace(/[ṭ]/g, 't')
    .replace(/[ẓ]/g, 'z')
    .replace(/[ʿʾ’]/g, "'")
    .split(/[\s,.;:!?«»"()]+/)
    .filter(Boolean);
  const runs: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    const k = w.replace(/^'+|'+$/g, '');
    if (TRANSLIT.has(k) || TRANSLIT.has(w)) cur.push(w);
    else {
      if (cur.length >= 3) runs.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length >= 3) runs.push(cur.join(' '));
  return runs;
}

/**
 * Translittération reconnue à sa FORME (audit CON-5), hors lexique : dans une fenêtre de 4 mots, au moins deux
 * mots « translittérés » dont un porte une marque savante (ā ī ū ḥ ṣ ḍ ṭ ẓ ʿ ʾ) ; mot translittéré = marque
 * savante, article ou préposition collé par un tiret (al-, ar-, bi-, wa-…) ou assimilation (r-r, s-s…).
 */
const SCHOLARLY = /[āīūḥṣḍṭẓʿʾĀĪŪḤṢḌṬẒ]/;
const ARABIC_PREFIX = /^(al|ar|as|at|ad|an|ash|az|ath|adh|bi|li|wa|fi)-\p{L}|^(\p{L})-\2/iu;
export function transliterationPatterns(text: string): string[] {
  const words = text.split(/[\s,.;:!?«»"()]+/).filter(Boolean);
  const strong = words.map((w) => SCHOLARLY.test(w));
  const marked = words.map((w, i) => strong[i] || ARABIC_PREFIX.test(w));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const win = [i, i + 1, i + 2, i + 3].filter((j) => j < words.length);
    if (win.filter((j) => marked[j]).length >= 2 && win.some((j) => strong[j]))
      out.push(win.map((j) => words[j]).join(' '));
  }
  return out;
}
