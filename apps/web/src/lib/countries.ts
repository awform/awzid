import { locale } from './i18n';

/** Pays proposés à l'inscription (public occidental d'abord, puis le monde, sans oublier l'Afrique). */
export const COUNTRIES = [
  'FR',
  'BE',
  'CH',
  'LU',
  'CA',
  'US',
  'GB',
  'DE',
  'ES',
  'IT',
  'NL',
  'IE',
  'SE',
  'PT',
  'AT',
  'MA',
  'DZ',
  'TN',
  'SN',
  'ML',
  'CI',
  'GN',
  'BF',
] as const;

const EU_EEA = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'IS',
  'LI',
  'NO',
]);

/** Données hébergées dans l'UE : un pays hors UE/EEE, Suisse et Royaume-Uni doit consentir au transfert. */
export function needsTransferConsent(country: string): boolean {
  return !EU_EEA.has(country) && country !== 'CH' && country !== 'GB';
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
