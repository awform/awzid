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
// lot F2 : formateur ICU minimal à la place d'intl-messageformat (même résultat, contrôlé par icu.test.ts)
import { formatIcu } from './icu';
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
  // lot 25 : traductions de l'INTERFACE seulement, à relire par un locuteur natif avant toute publication
  { code: 'es', label: 'Español', dir: 'ltr', status: 'preparation' },
  { code: 'de', label: 'Deutsch', dir: 'ltr', status: 'preparation' },
  { code: 'ar', label: 'العربية', dir: 'rtl', status: 'preparation' },
];

/**
 * Le français (langue de repli) est dans la coquille ; les autres catalogues sont chargés À LA DEMANDE
 * (décision D4, audit PERF-1 ; lot 25) : fichiers statiques `static/i18n/<langue>.json`, téléchargés seulement
 * si la langue est choisie ; le service worker ne garde que ceux déjà utilisés (pas de préchargement).
 */
const CATALOG: Record<string, Messages> = { fr };
export type CatalogFetcher = (code: string) => Promise<Messages>;
const fetchCatalog: CatalogFetcher = async (code) => {
  const r = await fetch(`/i18n/${code}.json`);
  if (!r.ok) throw new Error(`catalogue ${code} : ${r.status}`);
  return (await r.json()) as Messages;
};
export const FALLBACK = 'fr';

/** Charge le catalogue d'une langue (sans effet s'il est déjà là ou si la langue est inconnue). */
export async function loadLocale(
  code: string,
  fetcher: CatalogFetcher = fetchCatalog,
): Promise<void> {
  if (CATALOG[code] || !LOCALES.some((l) => l.code === code)) return;
  CATALOG[code] = await fetcher(code);
}

/**
 * A37 (TACHES_TECHNIQUES, D-A27) : les textes FRANÇAIS propres aux pages du personnel (enseignant, direction,
 * administration) sont hors de la coquille de l'élève, dans le fichier statique `static/i18n/fr-personnel.json`,
 * chargé par les mises en page `/enseignant` et `/admin` (gardé au premier usage, comme les autres catalogues).
 * Les autres langues gardent ces textes dans leur catalogue (déjà chargé à la demande).
 */
export const STAFF_CATALOG = 'fr-personnel';
/**
 * A37 : même principe par ESPACE de l'élève (textes chargés par route) — `fr-quotidien` (prières, qibla, adhkār,
 * verset) et `fr-vivre` (bon comportement), chargés par les mises en page `/quotidien` et `/vivre` ; ces deux
 * fichiers-là sont préchargés par le service worker (hors ligne dès l'installation).
 */
export const SPACE_CATALOGS = ['personnel', 'quotidien', 'vivre', 'acces'] as const;
const loadedTexts = new Map<string, Promise<void>>();
export function loadTexts(
  name: (typeof SPACE_CATALOGS)[number],
  fetcher: CatalogFetcher = fetchCatalog,
): Promise<void> {
  let p = loadedTexts.get(name);
  if (!p) {
    p = fetcher(`fr-${name}`)
      .then((m) => {
        for (const [k, v] of Object.entries(m)) CATALOG.fr![k] ??= v;
      })
      .catch(() => {
        loadedTexts.delete(name);
      });
    loadedTexts.set(name, p);
  }
  return p;
}
export const loadStaffTexts = (fetcher: CatalogFetcher = fetchCatalog) =>
  loadTexts('personnel', fetcher);

let current = FALLBACK;

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
  // lot F2 : formateur ICU minimal (arguments, pluriels), identique à intl-messageformat sur nos catalogues
  return formatIcu(msg, current, values ?? {});
}

/** Lot F3 (revue M8) : fuseau du compte (null : celui de l'appareil) — les heures s'affichent dans ce fuseau. */
let zone: string | undefined;
export function setTimeZone(tz: string | null | undefined): void {
  try {
    zone = tz
      ? new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone
      : undefined;
  } catch {
    zone = undefined;
  }
}

export function fmtDate(
  d: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  // un jour seul (« AAAA-MM-JJ ») n'a pas d'heure : jamais décalé d'un fuseau à l'autre
  const day = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return new Intl.DateTimeFormat(current, {
    ...opts,
    timeZone: day ? 'UTC' : (opts.timeZone ?? zone),
  }).format(new Date(d));
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
