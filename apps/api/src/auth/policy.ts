/**
 * Règles de conformité par pays (ARCHITECTURE_V2 §6.4 ; priorité client du 28/09 : public occidental
 * d'abord, puis le monde, sans oublier l'Afrique). Valeurs à faire confirmer par un juriste [À VÉRIFIER].
 *  - RGPD art. 8 : âge du consentement numérique fixé par chaque État (13 à 16 ans) ; par défaut 16.
 *  - COPPA (États-Unis) : moins de 13 ans → consentement parental VÉRIFIABLE.
 *  - Sénégal, loi 2008-12 : consentement exprès ; transfert hors du Sénégal mentionné et accepté ;
 *    par prudence, tout mineur (moins de 18 ans) passe par un parent.
 * En dessous de l'âge du pays, un compte personnel est refusé : c'est un parent qui crée le profil.
 */
export const DIGITAL_CONSENT_AGE: Readonly<Record<string, number>> = {
  FR: 15,
  BE: 13,
  CH: 16,
  LU: 16,
  DE: 16,
  NL: 16,
  IE: 16,
  ES: 14,
  IT: 14,
  PT: 13,
  AT: 14,
  SE: 13,
  DK: 13,
  GB: 13,
  US: 13,
  CA: 13,
  MA: 18,
  DZ: 18,
  TN: 18,
  SN: 18,
  ML: 18,
  CI: 18,
  GN: 18,
  BF: 18,
};
export const DEFAULT_CONSENT_AGE = 16;

export function consentAge(country: string | null | undefined): number {
  return DIGITAL_CONSENT_AGE[(country ?? '').toUpperCase()] ?? DEFAULT_CONSENT_AGE;
}

export function ageFromYear(birthYear: number, now = new Date()): number {
  // année seulement (minimisation) : âge au plus bas de l'année
  return now.getUTCFullYear() - birthYear - 1;
}

/** Version des textes d'information (changer la version impose un nouveau consentement). */
export const TEXT_VERSION = '2026-09-28';

export type ConsentType =
  | 'cgu' // conditions d'utilisation et politique de confidentialité
  | 'compte_suivi' // compte et suivi pédagogique (profil d'enfant)
  | 'transfert_hors_pays' // loi sénégalaise 2008-12 : données hébergées dans l'Union européenne
  | 'coppa_parent' // États-Unis, moins de 13 ans : consentement parental vérifiable
  | 'rappels'; // facultatif : rappels (notifications, plus tard WhatsApp/SMS)

/** Consentements OBLIGATOIRES à l'inscription du titulaire, selon le pays. */
export function requiredAccountConsents(country: string): ConsentType[] {
  const c = country.toUpperCase();
  const list: ConsentType[] = ['cgu'];
  if (c !== '' && !EU_EEA.has(c) && c !== 'CH' && c !== 'GB') list.push('transfert_hors_pays');
  return list;
}

/** Consentements OBLIGATOIRES à la création d'un profil d'enfant, selon le pays et l'âge. */
export function requiredChildConsents(country: string, age: number): ConsentType[] {
  const list: ConsentType[] = ['compte_suivi'];
  if (country.toUpperCase() === 'US' && age < 13) list.push('coppa_parent');
  return list;
}

export const EU_EEA: ReadonlySet<string> = new Set([
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

/** Durée des sessions : famille 30 jours glissants ; rôles sensibles 12 h (CDC §4.6). */
export function sessionTtlMs(kind: string): number {
  return kind === 'enseignant' || kind === 'admin' ? 12 * 3600_000 : 30 * 24 * 3600_000;
}

export function requiresMfa(kind: string): boolean {
  return kind === 'enseignant' || kind === 'admin';
}
