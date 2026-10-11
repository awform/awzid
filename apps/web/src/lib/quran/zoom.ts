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

/** Garde la page dans son cadre : jamais de bord vide à l'intérieur du cadre (w × h). */
export function clampVue(v: Vue, w: number, h: number): Vue {
  const z = clampZoom(v.z);
  const minX = Math.min(0, w - w * z);
  const minY = Math.min(0, h - h * z);
  return {
    z,
    x: Math.round(Math.max(minX, Math.min(0, v.x)) * 10) / 10,
    y: Math.round(Math.max(minY, Math.min(0, v.y)) * 10) / 10,
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

/** Double-toucher : page entière ↔ zoom confortable (centré sur le point touché). */
export function toggleZoom(v: Vue, cx: number, cy: number, w: number, h: number): Vue {
  return v.z > ZOOM_MIN + 0.05
    ? { z: ZOOM_MIN, x: 0, y: 0 }
    : zoomAt(v, ZOOM_CONFORT, cx, cy, w, h);
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
