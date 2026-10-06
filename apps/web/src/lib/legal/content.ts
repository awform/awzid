/**
 * Pages légales (lot 14) — BROUILLONS À FAIRE VALIDER PAR UN JURISTE avant toute ouverture publique.
 * Textes rédigés d'après le fonctionnement RÉEL du code (données collectées, durées, sous-traitants prévus) ;
 * les informations que seul le client peut fournir sont entre crochets « [à compléter] ».
 * A39 (poids) : les textes eux-mêmes sont dans `static/i18n/legal/fr.json` (et `en.json`, A37), hors de la
 * coquille, chargés par `pages.ts` ; ce module ne garde que leur forme et la liste des pages.
 */
export interface LegalSection {
  titre: string;
  paras: string[];
}
export interface LegalPage {
  titre: string;
  maj: string;
  sections: LegalSection[];
}

export const LEGAL_PAGES = ['mentions', 'cgu', 'confidentialite', 'cookies'] as const;
export type LegalKey = (typeof LEGAL_PAGES)[number];

export interface FaqItem {
  q: string;
  r: string;
}

/** Contenu d'un fichier `static/i18n/legal/<langue>.json`. */
export interface LegalTexts {
  legal: Record<LegalKey, LegalPage>;
  faq: Array<{ titre: string; items: FaqItem[] }>;
}
