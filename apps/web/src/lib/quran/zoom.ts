/**
 * ZOOM DE LA PAGE DU MUṢḤAF (décision du client, 11/10/2026) — calculs purs, testés à part.
 * La page est seulement MISE À L'ÉCHELLE (transformation CSS) : le rendu du texte coranique (lignes, polices,
 * mise en page exacte) n'est jamais recalculé ni modifié. Zoom de 1× (page entière) à 3×, « confortable » ≈ 1,8×.
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_CONFORT = 1.8;

export interface Vue {
  /** facteur d'échelle (1 à 3) */
  z: number;
  /** décalage en pixels (origine en haut à gauche ; toujours ≤ 0) */
  x: number;
  y: number;
}

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_MIN;
  return Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 100) / 100;
}

/** Partie VISIBLE du cadre (coordonnées du cadre) : l'écran peut n'en montrer qu'une partie. */
export interface Fenetre {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Garde la page dans son cadre : jamais de bord vide à l'intérieur du cadre (w × h). Avec `win` (partie du
 * cadre visible à l'écran) : les quatre bords de la page agrandie peuvent venir dans la partie VISIBLE (essai du
 * client, 12/10/2026 : page plus haute que l'écran, le bas de la page et son numéro restaient hors d'atteinte).
 */
export function clampVue(v: Vue, w: number, h: number, win?: Fenetre): Vue {
  const z = clampZoom(v.z);
  if (z <= ZOOM_MIN) return { z, x: 0, y: 0 };
  const f = win ?? { top: 0, bottom: h, left: 0, right: w };
  const maxX = Math.max(0, f.left);
  const maxY = Math.max(0, f.top);
  const minX = Math.min(0, Math.min(w, f.right) - w * z);
  const minY = Math.min(0, Math.min(h, f.bottom) - h * z);
  return {
    z,
    x: Math.round(Math.max(minX, Math.min(maxX, v.x)) * 10) / 10,
    y: Math.round(Math.max(minY, Math.min(maxY, v.y)) * 10) / 10,
  };
}

/** Nouveau zoom `z` en gardant immobile le point (cx, cy) du cadre (pincement, double-toucher). */
export function zoomAt(v: Vue, z: number, cx: number, cy: number, w: number, h: number): Vue {
  const nz = clampZoom(z);
  // point de la page sous le doigt, avant : (cx - x) / z ; après, au même endroit de l'écran
  const px = (cx - v.x) / v.z;
  const py = (cy - v.y) / v.z;
  return clampVue({ z: nz, x: cx - px * nz, y: cy - py * nz }, w, h);
}

/**
 * Vue calée sur le DÉBUT des lignes (essai du client, 11/10/2026) : l'arabe se lit de droite à gauche, la vue
 * zoomée montre le BORD DROIT de la page (jamais le milieu d'une ligne).
 */
export function alignRtl(v: Vue, w: number, h: number): Vue {
  const z = clampZoom(v.z);
  return clampVue({ z, x: w - w * z, y: v.y }, w, h);
}

/** Nouveau zoom `z` calé à droite (début des lignes), la hauteur `cy` du cadre restant immobile. */
export function zoomRtl(v: Vue, z: number, cy: number, w: number, h: number): Vue {
  return alignRtl(zoomAt(v, z, w / 2, cy, w, h), w, h);
}

/**
 * Double-toucher : page entière ↔ zoom confortable. Zoom : la LIGNE touchée (hauteur `cy` du cadre) vient à la
 * hauteur `ty` (par défaut le milieu du cadre ; le lecteur donne le milieu de la partie visible), vue calée sur
 * le début des lignes (à droite). `cx` n'est pas utilisé (gardé pour l'appel).
 */
export function toggleZoom(
  v: Vue,
  cx: number,
  cy: number,
  w: number,
  h: number,
  ty: number = h / 2,
): Vue {
  void cx;
  if (v.z > ZOOM_MIN + 0.05) return { z: ZOOM_MIN, x: 0, y: 0 };
  const z = ZOOM_CONFORT;
  // point de la page sous le doigt (coordonnées de la page à 1×)
  const py = (cy - v.y) / v.z;
  return clampVue({ z, x: w - w * z, y: ty - py * z }, w, h);
}

/**
 * Zone d'un toucher simple sur la page (hors verset) : bords latéraux (≈ 18 % de chaque côté) pour tourner la
 * page — livre arabe : le bord GAUCHE avance —, milieu pour montrer ou cacher les commandes. Zoomée : le toucher
 * ne tourne jamais la page (seulement les commandes).
 */
export function tapZone(
  x: number,
  width: number,
  zoomed: boolean,
): 'suivante' | 'precedente' | 'commandes' {
  if (zoomed || width <= 0) return 'commandes';
  const r = x / width;
  if (r < 0.18) return 'suivante';
  if (r > 0.82) return 'precedente';
  return 'commandes';
}

/** Deux touchers forment un double-toucher (≤ 320 ms, ≤ 32 px). */
export function isDoubleTap(
  a: { t: number; x: number; y: number } | null,
  b: { t: number; x: number; y: number },
): boolean {
  return !!a && b.t - a.t <= 320 && Math.hypot(b.x - a.x, b.y - a.y) <= 32;
}
