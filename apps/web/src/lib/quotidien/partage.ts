/**
 * A12 — image d'un verset à partager : rendu canvas du texte Tanzil TEL QUEL (police Amiri Quran de
 * l'application), de sa référence et de la traduction du sens (QuranEnc, source et version indiquées).
 * Décor : filets et étoiles à huit pointes (géométrie seule, aucune figuration). Le texte n'est jamais modifié :
 * il est seulement réparti en lignes aux espaces (comme le lecteur), chaque ligne est une sous-chaîne exacte.
 */
export interface ShareColors {
  paper: string;
  ink: string;
  ink2: string;
  frame: string;
  gold: string;
}
export interface ShareContent {
  /** texte Tanzil du verset */
  arabic: string;
  /** « Al-Baqara · 2:255 » */
  reference: string;
  /** traduction du sens (vide : pas de traduction) */
  translation: string;
  translationLang: string;
  /** « Traduction du sens : … — QuranEnc.com (v1.0.3) » */
  credit: string;
  brand: string;
}

export const W = 1080;
export const H = 1350;

type Measure = (s: string) => number;

/** Lignes aux espaces, sans dépasser `max` (un mot plus long reste seul sur sa ligne). Jointure = texte. */
export function wrapWords(text: string, max: number, measure: Measure): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > max) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Plus grande taille (pas de 2 px) pour laquelle le texte tient dans la hauteur donnée. */
export function fitSize(
  text: string,
  maxWidth: number,
  maxHeight: number,
  from: number,
  min: number,
  lineHeight: number,
  measureAt: (size: number) => Measure,
): { size: number; lines: string[]; fits: boolean } {
  for (let size = from; size >= min; size -= 2) {
    const lines = wrapWords(text, maxWidth, measureAt(size));
    if (lines.length * size * lineHeight <= maxHeight) return { size, lines, fits: true };
  }
  const lines = wrapWords(text, maxWidth, measureAt(min));
  return { size: min, lines, fits: lines.length * min * lineHeight <= maxHeight };
}

/** Étoile à huit pointes (deux carrés tournés de 45°). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (const rot of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

export function drawVerse(
  ctx: CanvasRenderingContext2D,
  c: ShareContent,
  col: ShareColors,
): { arabicFits: boolean; translationFits: boolean } {
  ctx.save();
  ctx.fillStyle = col.paper;
  ctx.fillRect(0, 0, W, H);
  // cadre : double filet et étoiles aux coins
  ctx.strokeStyle = col.frame;
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.strokeStyle = col.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 66, W - 132, H - 132);
  ctx.lineWidth = 3;
  for (const [x, y] of [
    [66, 66],
    [W - 66, 66],
    [66, H - 66],
    [W - 66, H - 66],
  ] as const)
    star(ctx, x, y, 22);
  ctx.strokeStyle = col.gold;
  ctx.lineWidth = 2;
  star(ctx, W / 2, 140, 18);

  const measureAt = (font: string) => (size: number) => {
    ctx.font = `${size}px ${font}`;
    return (s: string) => ctx.measureText(s).width;
  };

  // mise en page calculée d'abord (texte coranique, référence, traduction), puis bloc centré verticalement
  const quranFont = `'Amiri Quran', serif`;
  const uiFont = `'Nunito', sans-serif`;
  const TOP = 190;
  const BOTTOM = H - 170;
  const REF_H = 70;
  const SEP_H = 50;
  ctx.direction = 'rtl';
  const ar = fitSize(
    c.arabic,
    W - 220,
    c.translation ? 640 : BOTTOM - TOP - REF_H,
    84,
    30,
    1.85,
    measureAt(quranFont),
  );
  const lh = ar.size * 1.85;
  const arBlock = ar.lines.length * lh;
  ctx.direction = 'ltr';
  const tr = c.translation
    ? fitSize(
        c.translation,
        W - 240,
        BOTTOM - TOP - arBlock - REF_H - SEP_H,
        42,
        20,
        1.45,
        measureAt(uiFont),
      )
    : null;
  const tlh = tr ? tr.size * 1.45 : 0;
  const total = arBlock + REF_H + (tr ? SEP_H + tr.lines.length * tlh : 0);
  let y = TOP + Math.max(0, (BOTTOM - TOP - total) / 2);

  // texte coranique
  ctx.direction = 'rtl';
  ctx.font = `${ar.size}px ${quranFont}`;
  ctx.fillStyle = col.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ar.lines.forEach((l, i) => ctx.fillText(l, W / 2, y + lh * (i + 0.5)));
  y += arBlock;

  // référence
  ctx.direction = 'ltr';
  ctx.fillStyle = col.frame;
  ctx.font = `700 36px ${uiFont}`;
  ctx.fillText(c.reference, W / 2, y + REF_H / 2);
  y += REF_H;

  // traduction du sens
  if (tr) {
    ctx.strokeStyle = col.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 80, y + 10);
    ctx.lineTo(W / 2 + 80, y + 10);
    ctx.stroke();
    y += SEP_H;
    ctx.font = `${tr.size}px ${uiFont}`;
    ctx.fillStyle = col.ink;
    tr.lines.forEach((l, i) => ctx.fillText(l, W / 2, y + tlh * (i + 0.5)));
  }
  const trFits = tr ? tr.fits : true;

  // pied : source de la traduction, marque
  ctx.fillStyle = col.ink2;
  ctx.font = `22px 'Nunito', sans-serif`;
  if (c.credit) ctx.fillText(c.credit, W / 2, H - 130);
  ctx.font = `700 26px 'Nunito', sans-serif`;
  ctx.fillStyle = col.frame;
  ctx.fillText(c.brand, W / 2, H - 92);
  ctx.restore();
  return { arabicFits: ar.fits, translationFits: trFits };
}

/** Couleurs lues dans les jetons du thème affiché (cohérence avec les quatre thèmes et le mode sombre). */
export function colorsFrom(style: CSSStyleDeclaration, mushaf: boolean): ShareColors {
  const v = (n: string, d: string) => style.getPropertyValue(n).trim() || d;
  return mushaf
    ? {
        paper: v('--mp-paper', '#fffdf5'),
        ink: v('--mp-ink', '#132319'),
        ink2: v('--mp-ink2', '#46604f'),
        frame: v('--mp-green', '#16653f'),
        gold: v('--mp-gold', '#b8892c'),
      }
    : {
        paper: v('--card', '#ffffff'),
        ink: v('--ink', '#16202b'),
        ink2: v('--ink2', '#4b5868'),
        frame: v('--primary', '#1b6a85'),
        gold: v('--accent', '#c98a0b'),
      };
}
