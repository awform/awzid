/**
 * Leçons vivantes — départ automatique d'une animation quand elle « arrive à l'écran ».
 *
 * Bug du 30/10/2026 (client, Chrome ordinateur, Écriture niveau 1) : le départ exigeait 60 % de la HAUTEUR DE
 * L'ANIMATION visibles (`threshold: 0.6`). Une animation plus haute que 60 % de la fenêtre utile (la scène garde la
 * hauteur de son plus grand temps : tableau des formes, lettre + noms + modèles) ne peut JAMAIS atteindre ce
 * ratio sur un écran d'ordinateur peu haut : l'animation restait figée sur son premier temps. Règle corrigée : assez
 * visible = 60 % de l'animation OU 60 % de la fenêtre utile, le plus petit des deux.
 */
export const SEUIL_VISIBLE = 0.6;
/** paliers d'observation : le ratio est recalculé en hauteur réelle à chaque palier */
export const PALIERS = Array.from({ length: 21 }, (_, i) => i / 20);

export function assezVisible(
  r: { top: number; bottom: number },
  hauteurFenetre: number,
  barre = 0,
  seuil = SEUIL_VISIBLE,
): boolean {
  const h = r.bottom - r.top;
  const utile = hauteurFenetre - barre;
  if (h <= 0 || utile <= 0) return false;
  const visible = Math.min(r.bottom, utile) - Math.max(r.top, 0);
  return visible >= Math.min(seuil * h, seuil * utile) - 0.5;
}
