/**
 * Pages légales et aide dans la langue de l'interface (français ; anglais en préparation, lot 15).
 * A39 (poids) : la version anglaise n'est plus dans la coquille — fichier statique `/i18n/legal-en.json`,
 * téléchargé seulement quand l'anglais sert (comme les catalogues de langues du lot 25) et gardé ensuite par le
 * service worker. Sans réseau ni copie : le français.
 */
import { locale } from '$lib/i18n';
import { FAQ, LEGAL, type FaqItem, type LegalKey, type LegalPage } from './content';

export interface LegalTexts {
  lang: 'fr' | 'en';
  legal: Record<LegalKey, LegalPage>;
  faq: Array<{ titre: string; items: FaqItem[] }>;
}

/** Français, toujours disponible (rendu immédiat). */
export const LEGAL_FR: LegalTexts = { lang: 'fr', legal: LEGAL, faq: FAQ };

export async function loadLegal(get: typeof fetch = fetch): Promise<LegalTexts> {
  if (locale() !== 'en') return LEGAL_FR;
  try {
    const r = await get('/i18n/legal-en.json');
    if (r.ok) return { lang: 'en', ...((await r.json()) as Omit<LegalTexts, 'lang'>) };
  } catch {
    /* hors ligne sans copie : le français */
  }
  return LEGAL_FR;
}
