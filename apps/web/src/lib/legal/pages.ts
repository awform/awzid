/**
 * Pages légales et aide dans la langue de l'interface (français ; anglais en préparation, lot 15).
 * A37 : la version anglaise est hors de la coquille de l'élève, dans le fichier statique
 * `static/i18n/legal/en.json` (comme les catalogues des autres langues), chargé par `loadLegal()` seulement si
 * l'interface est en anglais ; tant qu'il n'est pas là, le français s'affiche.
 * A39 (poids) : la version FRANÇAISE suit le même chemin (`static/i18n/legal/fr.json`) : ces brouillons ne servent
 * qu'aux pages « Mentions, CGU, confidentialité, cookies » et « Aide », jamais à l'apprentissage ; le service worker
 * les garde au premier usage (catalogues `/i18n/`). Sans réseau ni copie : titres seuls.
 */
import { locale, t } from '$lib/i18n';
import { LEGAL_PAGES, type LegalKey, type LegalPage, type LegalTexts } from './content';

const texts: Partial<Record<'fr' | 'en', LegalTexts>> = {};

const get = (fetcher: typeof fetch, lang: 'fr' | 'en') =>
  fetcher(`/i18n/legal/${lang}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<LegalTexts>) : undefined))
    .catch(() => undefined);

/** Charge les textes dans la langue de l'interface (anglais, ou français à défaut) ; sans effet s'ils sont là. */
export async function loadLegal(fetcher: typeof fetch = fetch): Promise<void> {
  if (locale() === 'en' && !texts.en) texts.en = await get(fetcher, 'en');
  if (!texts.fr && !(locale() === 'en' && texts.en)) texts.fr = await get(fetcher, 'fr');
}

export function legalLang(): 'fr' | 'en' {
  return locale() === 'en' && texts.en ? 'en' : 'fr';
}
const current = () => texts[legalLang()];

/** Hors ligne sans copie : titres seuls (« page indisponible » affichée par la page). */
export function legalPages(): Record<LegalKey, LegalPage> {
  return (
    current()?.legal ??
    (Object.fromEntries(
      LEGAL_PAGES.map((k) => [k, { titre: t('legal.titre'), maj: '', sections: [] }]),
    ) as unknown as Record<LegalKey, LegalPage>)
  );
}
export function faq(): LegalTexts['faq'] {
  return current()?.faq ?? [];
}
