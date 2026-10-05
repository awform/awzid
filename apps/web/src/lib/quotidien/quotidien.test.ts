import * as A from 'adhan';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hijriOf } from './hijri';
import { fitSize, wrapWords } from './partage';
import {
  civilDay,
  computeDay,
  fmtTime,
  METHODS,
  nextDay,
  nextPrayer,
  remaining,
  type Settings,
} from './priere';
import { compassPoint, distanceKm, greatCircle, headingOf, qiblaBearing } from './qibla';
import {
  defaultMethod,
  defaultPrefs,
  KEY,
  readPrefs,
  writePrefs,
  type MethodId,
  type PrayerKey,
} from './reglages';
import { cityById, CITIES } from './villes';

const ZERO: Record<PrayerKey, number> = {
  fajr: 0,
  sunrise: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
};
const S = (method: MethodId, over: Partial<Settings> = {}): Settings => ({
  method,
  asr: 'majorite',
  highLat: 'auto',
  adjust: ZERO,
  ...over,
});
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
/** écart en minutes entre l'heure calculée (fuseau du lieu) et la référence */
function gap(at: Date | null, tz: string, ref: string) {
  return Math.abs(minutes(fmtTime(at, tz)) - minutes(ref));
}

/**
 * Références : api.aladhan.com/v1/timings/05-10-2026 (moteur indépendant, PrayTimes), relevées le 05/10/2026,
 * école de l'ʿaṣr standard (ombre ×1). Tolérance ±2 min (arrondis et ajustements propres à chaque moteur).
 */
const REF: Array<{
  city: string;
  method: MethodId;
  t: Record<'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', string>;
}> = [
  {
    city: 'paris',
    method: 'uoif',
    t: {
      fajr: '06:48',
      sunrise: '07:56',
      dhuhr: '13:39',
      asr: '16:45',
      maghrib: '19:21',
      isha: '20:29',
    },
  },
  {
    city: 'paris',
    method: 'mwl',
    t: {
      fajr: '06:11',
      sunrise: '07:56',
      dhuhr: '13:39',
      asr: '16:45',
      maghrib: '19:21',
      isha: '21:00',
    },
  },
  {
    city: 'dakar',
    method: 'mwl',
    t: {
      fajr: '05:49',
      sunrise: '07:00',
      dhuhr: '12:58',
      asr: '16:20',
      maghrib: '18:56',
      isha: '20:03',
    },
  },
  {
    city: 'montreal',
    method: 'isna',
    t: {
      fajr: '05:36',
      sunrise: '06:58',
      dhuhr: '12:43',
      asr: '15:52',
      maghrib: '18:27',
      isha: '19:48',
    },
  },
  {
    city: 'medine',
    method: 'ummalqura',
    t: {
      fajr: '04:57',
      sunrise: '06:15',
      dhuhr: '12:10',
      asr: '15:33',
      maghrib: '18:05',
      isha: '19:35',
    },
  },
];

describe('A12 — horaires de prière (adhan-js, sur l’appareil)', () => {
  for (const r of REF)
    it(`${r.city} (${r.method}), 5 octobre 2026 : conforme à une source de calcul indépendante`, () => {
      const c = cityById(r.city)!;
      const day = computeDay(A, c.lat, c.lng, { y: 2026, m: 10, d: 5 }, S(r.method));
      for (const [k, ref] of Object.entries(r.t))
        expect(gap(day[k as PrayerKey], c.tz, ref), `${r.city} ${k}`).toBeLessThanOrEqual(2);
    });

  it('ʿaṣr ḥanafite (ombre ×2) plus tardif ; ajustements manuels appliqués à la minute', () => {
    const c = cityById('paris')!;
    const d = { y: 2026, m: 10, d: 5 };
    const maj = computeDay(A, c.lat, c.lng, d, S('uoif'));
    const han = computeDay(A, c.lat, c.lng, d, S('uoif', { asr: 'hanafite' }));
    expect(han.asr!.getTime() - maj.asr!.getTime()).toBeGreaterThan(30 * 60_000);
    const adj = computeDay(
      A,
      c.lat,
      c.lng,
      d,
      S('uoif', { adjust: { ...ZERO, isha: 5, fajr: -3 } }),
    );
    expect((adj.isha!.getTime() - maj.isha!.getTime()) / 60_000).toBe(5);
    expect((adj.fajr!.getTime() - maj.fajr!.getTime()) / 60_000).toBe(-3);
  });

  it('hautes latitudes (Paris, 21 juin, 18°) : le fajr existe grâce à la règle choisie', () => {
    const c = cityById('paris')!;
    for (const highLat of ['auto', 'milieu', 'septieme', 'angle'] as const) {
      const t = computeDay(A, c.lat, c.lng, { y: 2026, m: 6, d: 21 }, S('mwl', { highLat }));
      expect(t.fajr, highLat).not.toBe(null);
      expect(t.isha, highLat).not.toBe(null);
      expect(t.fajr!.getTime()).toBeLessThan(t.sunrise!.getTime());
    }
  });

  it('prochaine prière, puis fajr du lendemain après le ʿishāʾ ; temps restant', () => {
    const c = cityById('dakar')!;
    const d = { y: 2026, m: 10, d: 5 };
    const today = computeDay(A, c.lat, c.lng, d, S('mwl'));
    const tomorrow = computeDay(A, c.lat, c.lng, nextDay(d), S('mwl'));
    const noon = new Date(today.dhuhr!.getTime() - 60_000);
    expect(nextPrayer(noon, today, tomorrow)?.key).toBe('dhuhr');
    const late = new Date(today.isha!.getTime() + 60_000);
    const n = nextPrayer(late, today, tomorrow)!;
    expect(n.key).toBe('fajr');
    expect(n.tomorrow).toBe(true);
    expect(remaining(new Date(0), new Date(90 * 60_000 + 1))).toEqual({ h: 1, min: 31 });
    expect(nextDay({ y: 2026, m: 12, d: 31 })).toEqual({ y: 2027, m: 1, d: 1 });
    expect(civilDay(new Date('2026-10-05T23:30:00Z'), 'Europe/Paris')).toEqual({
      y: 2026,
      m: 10,
      d: 6,
    });
  });

  it('chaque méthode calcule des horaires ordonnés (Paris, 5 octobre)', () => {
    const c = cityById('paris')!;
    for (const m of METHODS) {
      const t = computeDay(A, c.lat, c.lng, { y: 2026, m: 10, d: 5 }, S(m.id));
      const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
      for (let i = 1; i < order.length; i++)
        expect(t[order[i]!]!.getTime(), `${m.id} ${order[i]}`).toBeGreaterThan(
          t[order[i - 1]!]!.getTime(),
        );
    }
  });
});

describe('A12 — qibla (grand cercle)', () => {
  // références : api.aladhan.com/v1/qibla/<lat>/<lng>, relevées le 05/10/2026
  const QREF: Array<[string, number]> = [
    ['paris', 119.163],
    ['dakar', 73.927],
    ['montreal', 58.693],
    ['bruxelles', 123.481],
  ];
  for (const [id, ref] of QREF)
    it(`${id} : ${ref}°`, () => {
      const c = cityById(id)!;
      expect(Math.abs(qiblaBearing(c.lat, c.lng) - ref)).toBeLessThan(0.05);
    });
  it('distance, points cardinaux, grand cercle jusqu’à la Kaʿba, cap de la boussole', () => {
    const p = cityById('paris')!;
    expect(Math.round(distanceKm(p.lat, p.lng))).toBeGreaterThan(4400);
    expect(Math.round(distanceKm(p.lat, p.lng))).toBeLessThan(4550);
    expect(compassPoint(119)).toBe('ESE');
    expect(compassPoint(359)).toBe('N');
    const g = greatCircle(p.lat, p.lng, 8);
    expect(g).toHaveLength(9);
    expect(g[8]!.lat).toBeCloseTo(21.4225, 3);
    expect(headingOf({ alpha: 10, webkitCompassHeading: 200 })).toBe(200);
    expect(headingOf({ alpha: 90, absolute: true })).toBe(270);
    expect(headingOf({ alpha: 90, absolute: false })).toBe(null);
  });
});

describe('A12 — calendrier hégirien (Umm al-Qurā, Intl)', () => {
  // références : api.aladhan.com/v1/gToH (05/10/2026 → 24/04/1448 ; 17/02/2026 → 29/08/1447)
  it('dates connues, et décalage réglable de ±1/±2 jours', () => {
    const h = hijriOf(new Date('2026-10-05T12:00:00Z'), 0, 'fr', 'UTC')!;
    expect([h.day, h.month, h.year]).toEqual([24, 4, 1448]);
    const s = hijriOf(new Date('2026-02-17T12:00:00Z'), 0, 'fr', 'UTC')!;
    expect([s.day, s.month, s.year]).toEqual([29, 8, 1447]);
    const r = hijriOf(new Date('2026-02-17T12:00:00Z'), 1, 'fr', 'UTC')!;
    expect([r.day, r.month]).toEqual([1, 9]);
    const m2 = hijriOf(new Date('2026-10-05T12:00:00Z'), -2, 'fr', 'UTC')!;
    expect(m2.day).toBe(22);
    expect(hijriOf(new Date('2026-10-05T12:00:00Z'), 0, 'ar', 'UTC')!.monthName).not.toBe('');
  });
});

describe('A12 — image d’un verset : texte jamais modifié', () => {
  it('lignes aux espaces seulement : leur jointure redonne le texte exact', () => {
    // mots courants, aucun texte religieux
    const text = 'كِتَابٌ قَلَمٌ بَابٌ بَيْتٌ شَمْسٌ قَمَرٌ';
    const lines = wrapWords(text, 40, (s) => s.length * 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
    const fit = fitSize(text, 40, 100, 30, 10, 1.5, (size) => (s) => (s.length * size) / 10);
    expect(fit.fits).toBe(true);
    expect(fit.lines.join(' ')).toBe(text);
    expect(fit.size).toBeLessThanOrEqual(30);
  });
});

describe('A12 — réglages et vie privée (la position reste sur l’appareil)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    };
  };

  it('position arrondie au millième, gardée localement seulement ; aucune requête réseau', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const s = mem();
    writePrefs(
      {
        ...defaultPrefs(),
        place: { kind: 'appareil', lat: 48.8566123, lng: 2.3522987, tz: 'Europe/Paris' },
      },
      s,
    );
    expect(s.m.get(KEY)).toContain('48.857');
    expect(s.m.get(KEY)).not.toContain('48.8566123');
    const p = readPrefs(s);
    expect(p.place).toEqual({ kind: 'appareil', lat: 48.857, lng: 2.352, tz: 'Europe/Paris' });
    // calcul complet sur l'appareil, sans réseau
    computeDay(A, 48.857, 2.352, { y: 2026, m: 10, d: 5 }, S('uoif'));
    qiblaBearing(48.857, 2.352);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('valeurs hors bornes ignorées ; rappels désactivés par défaut ; méthode par pays', () => {
    const s = mem();
    s.setItem(
      KEY,
      JSON.stringify({ v: 1, adjust: { fajr: 99, isha: -99 }, hijriOffset: 7, highLat: 'x' }),
    );
    const p = readPrefs(s);
    expect(p.adjust.fajr).toBe(30);
    expect(p.adjust.isha).toBe(-30);
    expect(p.hijriOffset).toBe(2);
    expect(p.highLat).toBe('auto');
    expect(p.reminders).toBe(false);
    expect(p.asr).toBe('majorite');
    expect(defaultMethod('FR')).toBe(null);
    expect(defaultMethod('SN')).toBe('mwl');
    expect(defaultMethod('CA')).toBe('mwl');
    expect(defaultMethod('SA')).toBe('ummalqura');
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
  });
});
