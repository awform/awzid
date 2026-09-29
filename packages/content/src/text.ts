/**
 * Utilitaires de texte repris À L'IDENTIQUE du moteur des livres (awform/awform.js, lignes 20 et 26).
 * Ils servent uniquement à COMPARER (correction, contrôles) ; le texte affiché n'est jamais transformé.
 * Aucune normalisation Unicode (NFC/NFD/NFKC) : interdite par le cahier des charges §3.1.
 */

/** `plain(s)` : retire les crochets de mise en couleur `[..]`. */
export function plain(s: unknown): string {
  return String(s ?? '').replace(/[[\]]/g, '');
}

/**
 * `bare(s)` : retire en plus les voyelles, tanwīn, chadda, soukoun, petit alif (U+064B–U+0670, dont U+065F)
 * et le tatwīl (U+0640) — même classe de caractères que le moteur : /[ً-ٰٟـ\[\]]/g.
 */
export function bare(s: unknown): string {
  return String(s ?? '').replace(/[ً-ٰٟـ[\]]/g, '');
}

/** Segments balisés `[..]` d'un texte (pour la coloration des lettres). */
export interface MarkedSegment {
  text: string;
  marked: boolean;
}

export function splitMarked(s: string): MarkedSegment[] {
  const out: MarkedSegment[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), marked: false });
    out.push({ text: m[1] ?? '', marked: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), marked: false });
  return out;
}

/**
 * Indice de couleur d'un segment balisé (port de `lidx` d'awform.js) : lettre (ou digraphe) de la leçon
 * par laquelle le segment commence, préfixe le plus long ; ٱ compte comme ا, ءا comme آ ; sinon 3 (or).
 */
export function letterColorIndex(
  segment: string,
  lettres: ReadonlyArray<{ l: string }> | undefined,
): number {
  if (!lettres || lettres.length === 0) return 3;
  const b = bare(segment).replace(/ٱ/g, 'ا').replace(/^ءا/, 'آ');
  let best = -1;
  let len = 0;
  lettres.forEach((x, i) => {
    const l = bare(x.l);
    if (l && b.startsWith(l) && l.length > len) {
      best = i;
      len = l.length;
    }
  });
  if (best < 0 && /ٰ/.test(segment)) {
    const k = lettres.findIndex((x) => x.l === 'ا' || x.l === 'ـٰ');
    if (k >= 0) best = k;
  }
  return best < 0 ? 3 : best % 4;
}

/**
 * TANWINS du Muṣḥaf de Médine — AFFICHAGE SEULEMENT (même transformation que le moteur des livres,
 * awform.js `tanwinAff`, décision du 29/09/2026 : SCHEMA.md « Tanwins », ERREURS_SYSTEMIQUES.md).
 * Tanzil marque la règle du tanwin par une petite mīm après le tanwin : du même côté (ًۢ ٌۢ ٍۭ) =
 * conversion (iqlāb), du côté opposé (ًۭ ٌۭ ٍۢ) = fusion ou dissimulation. La police Amiri Quran dessine
 * cette mīm partout ; on affiche donc l'écriture Unicode du Muṣḥaf : tanwin décalé U+08F0 à U+08F2, et pour
 * la conversion une seule voyelle suivie de la petite mīm. Le texte STOCKÉ et COMPARÉ reste Tanzil.
 * Un crochet de couleur ([ ou ]) entre le tanwin et la mīm est conservé à sa place.
 */
const TANWIN_MAP: Record<string, string> = {
  '\u064B\u06ED': '\u08F0',
  '\u064C\u06ED': '\u08F1',
  '\u064D\u06E2': '\u08F2',
  '\u064B\u06E2': '\u064E\u06E2',
  '\u064C\u06E2': '\u064F\u06E2',
  '\u064D\u06ED': '\u0650\u06ED',
};
const TANWIN_RE = /([\u064B-\u064D])([[\]]?)([\u06E2\u06ED])/g;

export function tanwinDisplay(s: string): string {
  return s.replace(TANWIN_RE, (_m, t: string, br: string, mim: string) => {
    const r = TANWIN_MAP[t + mim]!;
    return r.length === 1 ? r + br : r[0] + br + r[1];
  });
}

const UNDO: Record<string, string> = {
  '\u08F0': '\u064B\u06ED',
  '\u08F1': '\u064C\u06ED',
  '\u08F2': '\u064D\u06E2',
  '\u064E\u06E2': '\u064B\u06E2',
  '\u064F\u06E2': '\u064C\u06E2',
  '\u0650\u06ED': '\u064D\u06ED',
};

/**
 * Inverse exacte de `tanwinDisplay` pour le texte coranique (Tanzil ne contient ni U+08F0-08F2 ni les
 * suites voyelle simple + petite mīm : vérifié sur les 6 236 versets) — sert aux contrôles « affiché = Tanzil ».
 */
export function tanwinUndo(s: string): string {
  return s.replace(/[\u08F0-\u08F2]|[\u064E\u064F][\u06E2]|\u0650\u06ED/g, (m) => UNDO[m] ?? m);
}
