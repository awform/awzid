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
