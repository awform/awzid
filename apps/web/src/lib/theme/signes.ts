/**
 * JETONS DES SIGNES (25/10/2026, décision de la direction artistique) — UNE COULEUR FIXE PAR SIGNE, la même partout dans
 * les jeux des cahiers des enfants et des ados, en clair comme en sombre. La couleur ne vient JAMAIS seule : le signe
 * lui-même est toujours montré (pour les daltoniens), jamais une transcription latine.
 *   fatḥa : vert Awzid · kasra : bleu nuit · ḍamma : or · soukoun : gris ardoise · shadda : terracotta ·
 *   tanwīn : la couleur de sa voyelle, avec une pastille doublée · voyelles longues : la couleur de la voyelle courte, en
 *   version claire (`-l`), avec un trait prolongé · hamza, ة et ى : neutres (encre).
 * Aucun conflit avec les couleurs du tajwīd du lecteur du Coran (`tj-*`, `tjk-*`) ni avec celles des lettres étudiées
 * (`c0` à `c3`) : distance RVB d'au moins 30 dans chaque palette (tokens-signes.test.ts). Contraste : signes montrés en
 * GRAND (≥ 24 px, soit « grand texte » WCAG AA : 3:1) sur la carte et sur le papier de chaque mode.
 * `pnpm --filter @awform/web theme` régénère src/lib/theme/signes.css. Fichier sans import (lisible par Node).
 */
export type FamilleSigne = 'fatha' | 'kasra' | 'damma' | 'soukoun' | 'shadda';
export const FAMILLES_SIGNES: readonly FamilleSigne[] = [
  'fatha',
  'kasra',
  'damma',
  'soukoun',
  'shadda',
];

/** mode clair (valeurs de la direction artistique : kasra #2c4a6e, ḍamma #a67c1a, shadda #a8613f) */
export const SIGNES_CLAIR: Record<string, string> = {
  'sg-fatha': '#07553f',
  'sg-kasra': '#2c4a6e',
  'sg-damma': '#a67c1a',
  'sg-soukoun': '#38434d',
  'sg-shadda': '#a8613f',
  // voyelles longues : la couleur de la voyelle courte, en version plus claire
  'sg-fatha-l': '#3a8a63',
  'sg-kasra-l': '#4d73a3',
  'sg-damma-l': '#b0821e',
};
/** mode sombre : teintes éclaircies (mêmes familles) */
export const SIGNES_SOMBRE: Record<string, string> = {
  'sg-fatha': '#7adfb6',
  'sg-kasra': '#7f9fc9',
  'sg-damma': '#cf9f3a',
  'sg-soukoun': '#c9d1d9',
  'sg-shadda': '#e89a74',
  'sg-fatha-l': '#a6efcd',
  'sg-kasra-l': '#a9c1e4',
  'sg-damma-l': '#f0cf7a',
};

const bloc = (sel: string, pal: Record<string, string>, indent = '') =>
  `${indent}${sel} {\n${Object.entries(pal)
    .map(([k, v]) => `${indent}  --${k}: ${v};`)
    .join('\n')}\n${indent}}\n`;

/** feuille des signes (même logique de mode que tokens.css : réglage de l'appareil, sinon préférence du téléphone) */
export function renderSignesCss(): string {
  return [
    '/* FICHIER GÉNÉRÉ par `pnpm --filter @awform/web theme` depuis src/lib/theme/signes.ts — ne pas modifier à la main. */',
    bloc(":root,\n[data-theme='clair']", SIGNES_CLAIR),
    bloc("[data-theme='clair'][data-mode='sombre']", SIGNES_SOMBRE),
    `@media (prefers-color-scheme: dark) {\n${bloc(":root:not([data-mode]):not([data-theme]),\n  :root:not([data-mode])[data-theme='clair']", SIGNES_SOMBRE, '  ')}}\n`,
  ].join('\n');
}
