/**
 * A12 — réglages de l'espace « Au quotidien », gardés SUR L'APPAREIL SEULEMENT (localStorage) : lieu, méthode,
 * ajustements, rappels, décalage du calendrier hégirien. La position (lieu choisi par géolocalisation) ne quitte
 * jamais l'appareil : aucune fonction de ce module (ni des modules de calcul) n'appelle le réseau ; elle est
 * arrondie au millième de degré (≈ 100 m), ce qui suffit au calcul (écart bien inférieur à la minute).
 */
import type { CountryCode } from './villes';

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYER_KEYS: readonly PrayerKey[] = [
  'fajr',
  'sunrise',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
];

export type MethodId =
  | 'mwl'
  | 'uoif'
  | 'gmp'
  | 'isna'
  | 'egypte'
  | 'karachi'
  | 'ummalqura'
  | 'moonsighting'
  | 'turquie'
  | 'dubai'
  | 'koweit'
  | 'qatar'
  | 'singapour';
export type AsrSchool = 'majorite' | 'hanafite';
export type HighLat = 'auto' | 'milieu' | 'septieme' | 'angle';

export type Place =
  { kind: 'ville'; id: string } | { kind: 'appareil'; lat: number; lng: number; tz: string };

export interface QuotidienPrefs {
  v: 1;
  place: Place | null;
  /** null : pas encore choisie (France : choix proposé à l'utilisateur) */
  method: MethodId | null;
  asr: AsrSchool;
  highLat: HighLat;
  /** minutes ajoutées (ou retirées) à chaque horaire, pour suivre la mosquée locale */
  adjust: Record<PrayerKey, number>;
  /** décalage du calendrier hégirien (observation locale) : -2 à +2 jours */
  hijriOffset: number;
  /** rappels doux (désactivés par défaut) */
  reminders: boolean;
}

export const KEY = 'awzid.quotidien.v1';
export const ADJUST_MAX = 30;

export const defaultPrefs = (): QuotidienPrefs => ({
  v: 1,
  place: null,
  method: null,
  asr: 'majorite',
  highLat: 'auto',
  adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  hijriOffset: 0,
  reminders: false,
});

const clamp = (n: unknown, lo: number, hi: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : 0;
/** arrondi au millième de degré (≈ 100 m) */
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Relit les réglages (valeurs inconnues ignorées, bornes appliquées). */
export function readPrefs(store: Store | null = storage()): QuotidienPrefs {
  const d = defaultPrefs();
  let raw: Partial<QuotidienPrefs> | null;
  try {
    raw = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<QuotidienPrefs> | null;
  } catch {
    return d;
  }
  if (!raw || raw.v !== 1) return d;
  const p = raw.place;
  let place: Place | null = null;
  if (p?.kind === 'ville' && typeof p.id === 'string') place = { kind: 'ville', id: p.id };
  else if (
    p?.kind === 'appareil' &&
    Math.abs(Number(p.lat)) <= 90 &&
    Math.abs(Number(p.lng)) <= 180 &&
    typeof p.tz === 'string'
  )
    place = { kind: 'appareil', lat: round3(Number(p.lat)), lng: round3(Number(p.lng)), tz: p.tz };
  const adjust = { ...d.adjust };
  for (const k of Object.keys(adjust) as PrayerKey[])
    adjust[k] = clamp(raw.adjust?.[k], -ADJUST_MAX, ADJUST_MAX);
  return {
    v: 1,
    place,
    method: typeof raw.method === 'string' ? (raw.method as MethodId) : null,
    asr: raw.asr === 'hanafite' ? 'hanafite' : 'majorite',
    highLat: (['auto', 'milieu', 'septieme', 'angle'] as const).includes(raw.highLat as HighLat)
      ? (raw.highLat as HighLat)
      : 'auto',
    adjust,
    hijriOffset: clamp(raw.hijriOffset, -2, 2),
    reminders: raw.reminders === true,
  };
}

export function writePrefs(p: QuotidienPrefs, store: Store | null = storage()): void {
  try {
    const place =
      p.place?.kind === 'appareil'
        ? { ...p.place, lat: round3(p.place.lat), lng: round3(p.place.lng) }
        : p.place;
    store?.setItem(KEY, JSON.stringify({ ...p, place }));
  } catch {
    /* stockage plein ou interdit : les réglages restent pour la session */
  }
}

/** Rappels actifs ? (lu au démarrage de l'application, sans charger le calcul des horaires) */
export const remindersOn = (store: Store | null = storage()) => readPrefs(store).reminders;

/** Méthode proposée par défaut selon le pays (France : l'utilisateur choisit, null). */
export function defaultMethod(country: CountryCode | null): MethodId | null {
  if (country === 'FR') return null;
  if (country === 'SA') return 'ummalqura';
  return 'mwl';
}
/** Méthodes proposées en premier pour la France (choix de l'utilisateur). */
export const FRANCE_CHOICES: readonly MethodId[] = ['uoif', 'gmp', 'mwl'];
