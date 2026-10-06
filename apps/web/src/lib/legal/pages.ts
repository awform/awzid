/**
 * Pages légales et aide dans la langue de l'interface (français ; anglais en préparation, lot 15).
 * A37 : la version anglaise est hors de la coquille de l'élève, dans le fichier statique
 * `static/i18n/legal/en.json` (comme les catalogues des autres langues), chargé par `loadLegal()` seulement si
 * l'interface est en anglais ; tant qu'il n'est pas là, le français s'affiche.
 */
import { locale } from '$lib/i18n';
import { FAQ, LEGAL, type FaqItem, type LegalKey, type LegalPage } from './content';

type LegalEn = {
  legal: Record<LegalKey, LegalPage>;
  faq: Array<{ titre: string; items: FaqItem[] }>;
};
let EN: LegalEn | null = null;

/** Charge la version anglaise si l'interface est en anglais (sans effet sinon, ou si elle est déjà là). */
export async function loadLegal(fetcher: typeof fetch = fetch): Promise<void> {
  if (locale() !== 'en' || EN) return;
  EN = await fetcher('/i18n/legal/en.json')
    .then((r) => (r.ok ? (r.json() as Promise<LegalEn>) : null))
    .catch(() => null);
}

export function legalLang(): 'fr' | 'en' {
  return locale() === 'en' && EN ? 'en' : 'fr';
}
export function legalPages(): Record<LegalKey, LegalPage> {
  return legalLang() === 'en' ? EN!.legal : LEGAL;
}
export function faq(): Array<{ titre: string; items: FaqItem[] }> {
  return legalLang() === 'en' ? EN!.faq : FAQ;
}
