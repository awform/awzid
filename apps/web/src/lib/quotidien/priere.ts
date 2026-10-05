/**
 * A12 — horaires de prière calculés SUR L'APPAREIL, hors ligne, avec la bibliothèque adhan-js (Batoul Apps,
 * licence MIT, docs/projet/LICENCES.md § 7). La bibliothèque est chargée À LA DEMANDE (import dynamique : elle
 * n'alourdit pas la page d'entrée) ; les fonctions de ce module la reçoivent en paramètre (tests sans DOM).
 * Aucun appel réseau : coordonnées et date entrent, des instants (Date) sortent.
 */
import type * as AdhanModule from 'adhan';
import type { AsrSchool, HighLat, MethodId, PrayerKey, QuotidienPrefs } from './reglages';
import { PRAYER_KEYS } from './reglages';

export type Adhan = typeof AdhanModule;
export const loadAdhan = (): Promise<Adhan> => import('adhan');

/**
 * Méthodes proposées. Angles vérifiés le 05/10/2026 sur la liste publique d'aladhan.com (api.aladhan.com/v1/methods)
 * et dans le code d'adhan-js ; « Grande Mosquée de Paris » : 18° / 17° d'après les sources consultées (mêmes
 * angles que la Ligue islamique mondiale) — À CONFIRMER par le client auprès de la mosquée.
 */
export interface MethodInfo {
  id: MethodId;
  /** angle de l'aube (fajr) */
  fajr: number;
  /** angle du ʿishāʾ, ou durée fixe après le maghrib (minutes) */
  isha: number | { minutes: number };
}
export const METHODS: readonly MethodInfo[] = [
  { id: 'mwl', fajr: 18, isha: 17 },
  { id: 'uoif', fajr: 12, isha: 12 },
  { id: 'gmp', fajr: 18, isha: 17 },
  { id: 'isna', fajr: 15, isha: 15 },
  { id: 'egypte', fajr: 19.5, isha: 17.5 },
  { id: 'karachi', fajr: 18, isha: 18 },
  { id: 'ummalqura', fajr: 18.5, isha: { minutes: 90 } },
  { id: 'moonsighting', fajr: 18, isha: 18 },
  { id: 'turquie', fajr: 18, isha: 17 },
  { id: 'dubai', fajr: 18.2, isha: 18.2 },
  { id: 'koweit', fajr: 18, isha: 17.5 },
  { id: 'qatar', fajr: 18, isha: { minutes: 90 } },
  { id: 'singapour', fajr: 20, isha: 18 },
];
export const methodInfo = (id: MethodId) => METHODS.find((m) => m.id === id) ?? METHODS[0]!;

function params(A: Adhan, method: MethodId) {
  const M = A.CalculationMethod;
  switch (method) {
    case 'uoif':
      return new A.CalculationParameters('Other', 12, 12);
    case 'gmp':
      return new A.CalculationParameters('Other', 18, 17);
    case 'isna':
      return M.NorthAmerica();
    case 'egypte':
      return M.Egyptian();
    case 'karachi':
      return M.Karachi();
    case 'ummalqura':
      return M.UmmAlQura();
    case 'moonsighting':
      return M.MoonsightingCommittee();
    case 'turquie':
      return M.Turkey();
    case 'dubai':
      return M.Dubai();
    case 'koweit':
      return M.Kuwait();
    case 'qatar':
      return M.Qatar();
    case 'singapour':
      return M.Singapore();
    default:
      return M.MuslimWorldLeague();
  }
}

export interface Settings {
  method: MethodId;
  asr: AsrSchool;
  highLat: HighLat;
  adjust: Record<PrayerKey, number>;
}
export const settingsOf = (p: QuotidienPrefs, fallback: MethodId = 'mwl'): Settings => ({
  method: p.method ?? fallback,
  asr: p.asr,
  highLat: p.highLat,
  adjust: p.adjust,
});

export type DayTimes = Record<PrayerKey, Date | null>;

/**
 * Horaires d'un jour CIVIL (année, mois 1-12, jour) au lieu donné. Les instants rendus sont absolus ; on les
 * affiche ensuite dans le fuseau du lieu. Hautes latitudes : règle choisie (« auto » = recommandation
 * d'adhan : milieu de la nuit, ou septième de la nuit au-delà de 48°) ; cercle polaire : jour le plus proche.
 */
export function computeDay(
  A: Adhan,
  lat: number,
  lng: number,
  day: { y: number; m: number; d: number },
  s: Settings,
): DayTimes {
  const coords = new A.Coordinates(lat, lng);
  const p = params(A, s.method);
  // ʿaṣr : ombre égale à l'objet (mālikites, shāfiʿites, ḥanbalites) ou au double (ḥanafites)
  p.madhab = s.asr === 'hanafite' ? A.Madhab.Hanafi : A.Madhab.Shafi;
  p.highLatitudeRule =
    s.highLat === 'milieu'
      ? A.HighLatitudeRule.MiddleOfTheNight
      : s.highLat === 'septieme'
        ? A.HighLatitudeRule.SeventhOfTheNight
        : s.highLat === 'angle'
          ? A.HighLatitudeRule.TwilightAngle
          : A.HighLatitudeRule.recommended(coords);
  p.polarCircleResolution = A.PolarCircleResolution.AqrabYaum;
  for (const k of PRAYER_KEYS) p.adjustments[k] = s.adjust[k] ?? 0;
  // adhan lit l'année, le mois et le jour LOCAUX de la date reçue : on lui donne le jour civil du lieu
  const t = new A.PrayerTimes(coords, new Date(day.y, day.m - 1, day.d, 12), p);
  const ok = (d: Date) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null);
  return {
    fajr: ok(t.fajr),
    sunrise: ok(t.sunrise),
    dhuhr: ok(t.dhuhr),
    asr: ok(t.asr),
    maghrib: ok(t.maghrib),
    isha: ok(t.isha),
  };
}

/** Jour civil (année, mois, jour) d'un instant dans un fuseau IANA. */
export function civilDay(at: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: n('year'), m: n('month'), d: n('day') };
}

/** Jour suivant (calendrier grégorien). */
export function nextDay(day: { y: number; m: number; d: number }) {
  const x = new Date(Date.UTC(day.y, day.m - 1, day.d + 1));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

/** Heure « HH:MM » d'un instant dans le fuseau du lieu (chiffres de la langue de l'interface). */
export function fmtTime(at: Date | null, tz: string, locale = 'fr'): string {
  if (!at) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** Les cinq prières (le lever du soleil n'est pas une prière : affiché à part, jamais « prochaine prière »). */
export const SALAT: readonly PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Prochaine prière après `now` (aujourd'hui, sinon le fajr du lendemain). */
export function nextPrayer(
  now: Date,
  today: DayTimes,
  tomorrow: DayTimes,
): { key: PrayerKey; at: Date; tomorrow: boolean } | null {
  for (const k of SALAT) {
    const at = today[k];
    if (at && at.getTime() > now.getTime()) return { key: k, at, tomorrow: false };
  }
  const f = tomorrow.fajr;
  return f ? { key: 'fajr', at: f, tomorrow: true } : null;
}

/** Durée restante en heures et minutes (arrondie à la minute supérieure). */
export function remaining(now: Date, at: Date): { h: number; min: number } {
  const total = Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  return { h: Math.floor(total / 60), min: total % 60 };
}
