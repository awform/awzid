/**
 * Téléphone couché (essai du client, 12/10/2026 : Xiaomi, ≈ 915 × 412) : le lecteur passe en habillage compact
 * (en-tête sur une ligne, onglets du bas masqués, pastille d'écoute, menu d'un verset en panneau latéral).
 * La MÊME requête est écrite dans le CSS du lecteur et de `MenuVerset.svelte` (les media queries CSS ne
 * peuvent pas lire une constante).
 */
export const PAYSAGE_MQ = '(orientation: landscape) and (max-height: 500px)';

export function enPaysage(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PAYSAGE_MQ).matches;
}
