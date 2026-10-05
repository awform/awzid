/**
 * A12 — calendrier hégirien d'Umm al-Qurā (Intl, calendrier « islamic-umalqura » du navigateur), avec un
 * décalage de -2 à +2 jours réglé par l'utilisateur : l'observation locale du croissant fait foi (Ramaḍān, ʿĪd).
 */
export interface HijriDate {
  day: number;
  month: number;
  year: number;
  /** nom du mois dans la langue demandée (forme du navigateur) */
  monthName: string;
}

const DAY = 86_400_000;

export function hijriOf(at: Date, offset = 0, locale = 'fr', tz?: string): HijriDate | null {
  try {
    const d = new Date(at.getTime() + offset * DAY);
    const opts: Intl.DateTimeFormatOptions = {
      calendar: 'islamic-umalqura',
      numberingSystem: 'latn',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      ...(tz ? { timeZone: tz } : {}),
    };
    const fmt = new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura-nu-latn`, opts);
    if (!fmt.resolvedOptions().calendar.startsWith('islamic')) return null;
    const parts = fmt.formatToParts(d);
    const n = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '', 10);
    const monthName =
      new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, {
        calendar: 'islamic-umalqura',
        month: 'long',
        ...(tz ? { timeZone: tz } : {}),
      })
        .formatToParts(d)
        .find((p) => p.type === 'month')?.value ?? '';
    const day = n('day');
    const month = n('month');
    const year = n('year');
    if (!day || !month || !year) return null;
    return { day, month, year, monthName };
  } catch {
    return null;
  }
}

/** Ramaḍān (mois 9) ? Pour le rappel « l'observation locale fait foi » mis en avant. */
export const isRamadan = (h: HijriDate | null) => h?.month === 9;
