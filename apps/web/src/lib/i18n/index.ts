/**
 * Internationalisation de l'INTERFACE (priorité client du 28/09 : public mondial, langues par vagues).
 *  - toutes les chaînes d'interface sont dans des fichiers de messages (ICU MessageFormat : pluriels,
 *    genres, sélections) ; aucune chaîne en dur dans les composants (contrôlé par un test) ;
 *  - une locale par utilisateur (réglage, compte, langue du navigateur), repli sur le FRANÇAIS ;
 *  - dates et nombres formatés selon la locale (Intl) ; sens d'écriture par langue (l'arabe est déjà isolé
 *    en RTL dans le contenu ; une interface en arabe passera toute la page en RTL) ;
 *  - une langue n'est proposée aux élèves qu'une fois RELUE (statut « relue ») ; les autres sont en
 *    préparation et visibles seulement si l'on active « langues en préparation ».
 * Ne sont PAS traduits ici : l'arabe étudié et le Coran (objets d'étude). Les consignes et explications
 * pédagogiques des leçons deviendront traduisibles plus tard par des fichiers de contenu séparés.
 */
import IntlMessageFormat from 'intl-messageformat';
import fr from './messages/fr.json';

export type Messages = Record<string, string>;

export interface LocaleInfo {
  code: string;
  /** nom de la langue dans la langue elle-même */
  label: string;
  dir: 'ltr' | 'rtl';
  /** « relue » : publiable ; « preparation » : traduction non relue, jamais proposée par défaut */
  status: 'relue' | 'preparation';
}

/** Vagues prévues : FR → EN → ES, DE → AR (interface RTL) → TR, ID/MS, UR, BN, langues asiatiques… */
export const LOCALES: readonly LocaleInfo[] = [
  { code: 'fr', label: 'Français', dir: 'ltr', status: 'relue' },
  { code: 'en', label: 'English', dir: 'ltr', status: 'preparation' },
];

/**
 * Le français (langue de repli) est dans la coquille ; les autres catalogues sont chargés À LA DEMANDE
 * (décision D4, audit PERF-1) : fichier séparé, téléchargé seulement si la langue est choisie (et gardé par
 * le service worker pour le hors ligne).
 */
const CATALOG: Record<string, Messages> = { fr };
const LOADERS: Record<string, () => Promise<{ default: Messages }>> = {
  en: () => import('./messages/en.json'),
};
export const FALLBACK = 'fr';

/** Charge le catalogue d'une langue (sans effet s'il est déjà là ou si la langue est inconnue). */
export async function loadLocale(code: string): Promise<void> {
  if (CATALOG[code] || !LOADERS[code]) return;
  CATALOG[code] = (await LOADERS[code]()).default;
}

let current = FALLBACK;
const cache = new Map<string, IntlMessageFormat>();

export function locale(): string {
  return current;
}

export function localeInfo(code = current): LocaleInfo {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0]!;
}

export function setLocale(code: string): void {
  current = CATALOG[code] ? code : FALLBACK;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.documentElement.dir = localeInfo(current).dir;
  }
}

/** Locale proposée par le navigateur parmi celles qui existent (relues seulement, sauf option). */
export function detectLocale(preferred: readonly string[] = [], includeDrafts = false): string {
  for (const p of preferred) {
    const base = p.toLowerCase().split('-')[0] ?? '';
    const l = LOCALES.find((x) => x.code === base);
    if (l && (l.status === 'relue' || includeDrafts)) return l.code;
  }
  return FALLBACK;
}

/** Message traduit ; repli sur le français, puis sur la clé (signalée) si le message manque. */
export function t(key: string, values?: Record<string, unknown>): string {
  const msg = CATALOG[current]?.[key] ?? CATALOG[FALLBACK]?.[key];
  if (msg === undefined) return `⟦${key}⟧`;
  const id = `${current}|${key}`;
  let f = cache.get(id);
  if (!f) {
    f = new IntlMessageFormat(msg, current);
    cache.set(id, f);
  }
  return String(f.format(values as Record<string, string | number>));
}

export function fmtDate(
  d: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(current, opts).format(new Date(d));
}

export function fmtNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(current, opts).format(n);
}

/** Poids lisible (Ko/Mo en français, kB/MB en anglais via le message « unit.* »). */
export function fmtBytes(n: number): string {
  if (n < 1024) return t('unit.octets', { n: fmtNumber(n) });
  if (n < 1024 * 1024)
    return t('unit.ko', {
      n: fmtNumber(n / 1024, { maximumFractionDigits: n < 10 * 1024 ? 1 : 0 }),
    });
  return t('unit.mo', { n: fmtNumber(n / 1024 / 1024, { maximumFractionDigits: 1 }) });
}

export const _catalogForTests = CATALOG;
