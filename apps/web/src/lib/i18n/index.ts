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
import { revision } from './revision.svelte';

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

/**
 * 19/10/2026 — UNE version de l'application charge TOUJOURS le catalogue qui lui correspond. Les catalogues sont
 * demandés sous `/i18n/<version>/<nom>.json` (copie faite à la construction, `scripts/catalogues.mjs`) : l'adresse
 * change à chaque version, donc ni le service worker d'une version précédente (qui cherche dans son cache par
 * adresse), ni le cache HTTP ne peuvent répondre avec un ancien catalogue au nouveau code (incident du 19/10 :
 * clés brutes `⟦id.google⟧` sur un téléphone resté sur l'ancienne version). Sans version (développement, tests) :
 * adresse simple. La version est donnée par `hooks.client.ts` (`$app/environment`).
 */
let catalogBase = '/i18n/';
export function setCatalogVersion(version: string | null | undefined): void {
  catalogBase = version ? `/i18n/${encodeURIComponent(version)}/` : '/i18n/';
}
/** Adresse d'un catalogue (« en », « fr-rares », « legal/fr »). */
export const catalogUrl = (name: string) => `${catalogBase}${name}.json`;

const fetchCatalog: CatalogFetcher = async (code) => {
  const r = await fetch(catalogUrl(code));
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
 * Corrections du lecteur (06/10/2026) : `fr-coran` (`cl.*`, `ca.*`, `mp.*` sauf les noms de traduction, `mpx.*`,
 * `rw.*`, `tj.*`), chargé par `/coran` et `/enseignant` (récitateurs de la classe), préchargé lui aussi.
 */
/**
 * F5 : `fr-rares` — textes des pages RARES, utiles en ligne seulement (offres, abonnement, inscription, certificats,
 * protections du compte, réglages du tuteur, garanties, errata…) et de la fenêtre « Donner mon avis » : chargés par
 * ces pages, jamais préchargés (comme leurs fichiers, voir scripts/groupes.mjs).
 */
export const SPACE_CATALOGS = [
  'personnel',
  'quotidien',
  'vivre',
  'acces',
  'coran',
  'rares',
  // A5 : textes de « Réciter et vérifier » (canal bêta), chargés seulement quand la fonction est ouverte
  'ecoute',
  // hifẓ complet (12/10/2026) : outils du carnet (`hz.*`), chargés par la mise en page `/hifz`
  'hifz',
  // Madjaliss (P3-1) : textes de la rubrique (`mj.*`), chargés par la mise en page `/madjaliss`, jamais préchargés
  'madjaliss',
  // Douas (phase 1) : textes de l'onglet (`do.*`), chargés par `/vivre/douas`, gardés au premier usage
  'douas',
  // lecteur audio des phrases (19/10/2026) : textes `lec.*`, chargés avec le lecteur au premier appui sur « Écouter »
  'lecteur',
  // refonte 19/10 (interrupteur `design_v4`) : textes des écrans v4 (`v4.*`), chargés avec eux (`$lib/design`)
  'design',
  // vidéos vivantes (19/10/2026) : textes du lecteur plein écran (`vv.*`), chargés avec lui au premier appui sur
  // « Voir en vidéo », gardés au téléchargement d'un niveau qui a des vidéos
  'video',
  // 19/10/2026 : catalogue français de base découpé par espaces (la coquille garde les textes communs) :
  // « Arabe » (accueil, leçons, lectures, sciences, révisions, écriture, épreuves…) et « Aujourd'hui et suivi »
  // (aujourd'hui, suivi, plus, profils, hors ligne, aide), chargés par la mise en page racine
  // (lib/i18n/espaces.ts), préchargés
  'arabe',
  'suivi',
  // messages d'erreur RENVOYÉS PAR LE SERVEUR (`erreur.<code>`) : chargés à la réception d'une réponse en erreur
  // (`call`, lib/session.ts), donc toujours en ligne ; jamais préchargés. Les codes produits par l'appareil
  // lui-même (« reseau »…) restent dans la coquille.
  'erreurs',
  // 19/10/2026 : tuteur IA de conversation (`tuia.*`), chargés par la page `/tuteur`, jamais préchargés
  'tuteur',
] as const;
const loadedTexts = new Map<string, Promise<void>>();
/** espaces dont les textes ont été demandés (pour les recharger si une clé manque) */
const demandes = new Set<string>();
export function loadTexts(
  name: (typeof SPACE_CATALOGS)[number],
  fetcher: CatalogFetcher = fetchCatalog,
): Promise<void> {
  demandes.add(name);
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
/**
 * 19/10/2026 : textes français EMBARQUÉS dans le morceau d'un module chargé à la demande (ex. leçons vivantes :
 * `lib/vivante/textes-fr.json`) : ils voyagent avec leur code (gardé hors ligne avec lui), sans catalogue à part.
 */
export function ajouterTextes(m: Messages): void {
  for (const [k, v] of Object.entries(m)) CATALOG.fr![k] ??= v;
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

/**
 * Clé manquante. Développement et tests (`strict`, par défaut) : la clé est montrée entre ⟦ ⟧ pour qu'on la voie.
 * Production (`hooks.client.ts`) : JAMAIS une clé brute devant l'élève — le texte français par défaut est cherché
 * (le catalogue français contient tous les espaces chargés), à défaut le texte reste vide le temps de recharger les
 * catalogues de l'application (une fois), puis s'affiche en français sans recharger la page. Les clés manquantes sont
 * gardées (`clesManquantes()`, `window.__awzidManques`) pour les tests et le diagnostic.
 */
let strict = true;
export function setStrictKeys(on: boolean): void {
  strict = on;
}
const manques = new Set<string>();
export const clesManquantes = () => [...manques];
/**
 * Le texte existe-t-il (langue courante ou français) ? Sans effet de bord, contrairement à `t` qui, en production,
 * note la clé manquante et recharge les catalogues : sert à vérifier qu'un espace de textes a bien été chargé.
 */
export const texteExiste = (key: string) =>
  CATALOG[current]?.[key] !== undefined || CATALOG[FALLBACK]?.[key] !== undefined;
let enCours: Promise<void> | null = null;
let dernierEssai = 0;

/**
 * Recharge les catalogues français — ceux déjà demandés ET tous les autres espaces, car la clé manquante peut appartenir à un espace que la page n'a pas chargé — (adresse de CETTE version) ; les textes frais l'emportent et les
 * écrans affichés se mettent à jour. Une seule récupération à la fois ; automatique au plus toutes les 30 secondes
 * (hors ligne, une clé manquante ne déclenche pas une rafale de demandes).
 */
export function guerir(fetcher: CatalogFetcher = fetchCatalog): Promise<void> {
  if (enCours) return enCours;
  dernierEssai = Date.now();
  enCours = Promise.all(
    [...new Set([...demandes, ...SPACE_CATALOGS])].map((n) =>
      fetcher(`fr-${n}`)
        .then((m) => void Object.assign(CATALOG.fr!, m))
        .catch(() => undefined),
    ),
  ).then(() => {
    revision.n += 1;
    enCours = null;
  });
  return enCours;
}

function clePerdue(key: string): string {
  manques.add(key);
  if (typeof window !== 'undefined')
    (window as unknown as { __awzidManques?: string[] }).__awzidManques = [...manques];
  if (strict) return `⟦${key}⟧`;
  if (typeof fetch !== 'undefined' && Date.now() - dernierEssai > 30_000) void guerir();
  return '';
}

/** Message traduit ; repli sur le français, puis (voir ci-dessus) si le message manque. */
export function t(key: string, values?: Record<string, unknown>): string {
  void revision.n; // une fois les textes rechargés, les écrans déjà affichés se mettent à jour
  const msg = CATALOG[current]?.[key] ?? CATALOG[FALLBACK]?.[key];
  if (msg === undefined) return clePerdue(key);
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
