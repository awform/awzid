/** Pages légales et aide dans la langue de l'interface (français ; anglais en préparation, lot 15). */
import { locale } from '$lib/i18n';
import { FAQ, LEGAL, type FaqItem, type LegalKey, type LegalPage } from './content';
import { FAQ_EN, LEGAL_EN } from './content-en';

export function legalLang(): 'fr' | 'en' {
  return locale() === 'en' ? 'en' : 'fr';
}
export function legalPages(): Record<LegalKey, LegalPage> {
  return legalLang() === 'en' ? LEGAL_EN : LEGAL;
}
export function faq(): Array<{ titre: string; items: FaqItem[] }> {
  return legalLang() === 'en' ? FAQ_EN : FAQ;
}
