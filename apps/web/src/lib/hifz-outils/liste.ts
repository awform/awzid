/** Hifẓ complet — les écrans des outils du hifẓ (adresse /hifz/<outil>), dans l'ordre du carnet. */
export const OUTILS = ['test', 'points-faibles', 'fraicheur', 'priere', 'enfant'] as const;
export type Outil = (typeof OUTILS)[number];
