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

/**
 * Lot F3 (revue M9) : âge du consentement par SUBDIVISION (ISO 3166-2), qui l'emporte sur celui du pays.
 * Québec : loi 25, consentement du titulaire de l'autorité parentale sous 14 ans [à vérifier par le juriste].
 */
export const DIGITAL_CONSENT_AGE_REGION: Readonly<Record<string, number>> = {
  'CA-QC': 14,
};

/** Subdivisions proposées à l'inscription (pays où une règle en dépend). */
export const REGIONS_BY_COUNTRY: Readonly<Record<string, readonly string[]>> = {
  CA: [
    'CA-AB',
    'CA-BC',
    'CA-MB',
    'CA-NB',
    'CA-NL',
    'CA-NS',
    'CA-NT',
    'CA-NU',
    'CA-ON',
    'CA-PE',
    'CA-QC',
    'CA-SK',
    'CA-YT',
  ],
};

/** Subdivision valable pour ce pays (liste connue), ou null. */
export function normRegion(
  country: string | null | undefined,
  region: string | null | undefined,
): string | null {
  const c = (country ?? '').toUpperCase();
  const r = (region ?? '').toUpperCase();
  return r && (REGIONS_BY_COUNTRY[c] ?? []).includes(r) ? r : null;
}

export function consentAge(country: string | null | undefined, region?: string | null): number {
  const r = normRegion(country, region);
  if (r && DIGITAL_CONSENT_AGE_REGION[r] !== undefined) return DIGITAL_CONSENT_AGE_REGION[r];
  return DIGITAL_CONSENT_AGE[(country ?? '').toUpperCase()] ?? DEFAULT_CONSENT_AGE;
}

/**
 * Lot F3 (revue G3, décision : fermeture au lancement) : pays FERMÉS aux enfants sous un âge donné. États-Unis :
 * moins de 13 ans fermés (COPPA : la ré-authentification du parent n'est pas une méthode de consentement
 * vérifiable reconnue par la FTC) — aucun profil d'enfant de moins de 13 ans, ni par un parent ni par une école.
 */
export const CLOSED_UNDER_AGE: Readonly<Record<string, number>> = { US: 13 };

/** L'inscription d'un enfant de cet âge est-elle fermée dans ce pays ? */
export function closedForAge(country: string | null | undefined, age: number): boolean {
  const min = CLOSED_UNDER_AGE[(country ?? '').toUpperCase()];
  return min !== undefined && age < min;
}

export function ageFromYear(birthYear: number, now = new Date()): number {
  // année seulement (minimisation) : âge au plus bas de l'année
  return now.getUTCFullYear() - birthYear - 1;
}

/**
 * Version des textes d'information (changer la version impose un nouveau consentement). Lot F3 : CGU,
 * confidentialité et conditions de la bêta revues (brouillons à relire par le juriste).
 */
export const TEXT_VERSION = '2026-10-06';

export type ConsentType =
  | 'cgu' // conditions d'utilisation et politique de confidentialité
  | 'compte_suivi' // compte et suivi pédagogique (profil d'enfant)
  | 'transfert_hors_pays' // loi sénégalaise 2008-12 : données hébergées dans l'Union européenne
  | 'coppa_parent' // États-Unis, moins de 13 ans (HISTORIQUE : fermé au lancement, lot F3)
  | 'rappels' // facultatif : rappels (notifications, plus tard WhatsApp/SMS)
  // lot F3 (revue E10) : RGPD art. 9 — l'usage (hifẓ, sciences islamiques) révèle une conviction religieuse :
  // consentement EXPLICITE, nécessaire au service, RETIRABLE (le compte ou le profil est alors mis en pause)
  | 'donnee_religieuse_art9'
  // lot F3 (revue E10) : analyse automatique de la voix (récitation) par une IA — facultatif, séparé,
  // retirable ; demandé au PREMIER USAGE d'une telle fonction (aucune aujourd'hui), jamais coché d'avance
  | 'analyse_vocale_ia';

/** Consentement « article 9 » : nécessaire au service, mais retirable (mise en pause). */
export const ART9: ConsentType = 'donnee_religieuse_art9';

/** Consentements OBLIGATOIRES à l'inscription du titulaire, selon le pays. */
export function requiredAccountConsents(country: string): ConsentType[] {
  const c = country.toUpperCase();
  const list: ConsentType[] = ['cgu', ART9];
  if (c !== '' && !EU_EEA.has(c) && c !== 'CH' && c !== 'GB') list.push('transfert_hors_pays');
  return list;
}

/**
 * Consentements OBLIGATOIRES à la création d'un profil d'enfant, selon le pays et l'âge. (États-Unis, moins de
 * 13 ans : fermé au lancement — `closedForAge` est contrôlé avant.)
 */
export function requiredChildConsents(_country: string, _age: number): ConsentType[] {
  return ['compte_suivi', ART9];
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

/**
 * Règles par pays (lot 17) : loi applicable et autorité de contrôle où la famille peut se plaindre, montrées
 * à l'inscription et reprises par la politique de confidentialité. Seuls les pays dont la loi et l'autorité
 * sont connues avec certitude ont une entrée ; les autres pays de l'UE/EEE renvoient au RGPD et à « l'autorité
 * de protection des données de votre pays », les autres à la même mention générique.
 * Toutes ces lignes sont À FAIRE CONFIRMER par le juriste (`aValider`).
 *  - Sénégal : loi n° 2008-12 du 25 janvier 2008 ; Commission de protection des données personnelles (CDP) ;
 *    consentement EXPRÈS au transfert hors du Sénégal (hébergement dans l'UE), jamais coché d'avance ;
 *    tout mineur passe par un parent (18 ans, par prudence) ; formalités auprès de la CDP : à accomplir.
 */
export type LawCode =
  | 'rgpd'
  | 'rgpd_uk'
  | 'nlpd_ch'
  | 'coppa'
  | 'pipeda_ca'
  | 'sn_2008_12'
  | 'ma_09_08'
  | 'tn_2004_63'
  | 'dz_18_07'
  | 'ci_2013_450'
  | 'ml_2013_015'
  | 'generique';
export type AuthorityCode =
  | 'cnil'
  | 'apd_be'
  | 'cnpd_lu'
  | 'pfpdt_ch'
  | 'ico_uk'
  | 'ftc_us'
  | 'opc_ca'
  | 'cdp_sn'
  | 'cndp_ma'
  | 'inpdp_tn'
  | 'anpdp_dz'
  | 'artci_ci'
  | 'apdp_ml'
  | 'autorite_ue'
  | 'autorite_locale';

const LAWS: Readonly<Record<string, [LawCode, AuthorityCode]>> = {
  FR: ['rgpd', 'cnil'],
  BE: ['rgpd', 'apd_be'],
  LU: ['rgpd', 'cnpd_lu'],
  CH: ['nlpd_ch', 'pfpdt_ch'],
  GB: ['rgpd_uk', 'ico_uk'],
  US: ['coppa', 'ftc_us'],
  CA: ['pipeda_ca', 'opc_ca'],
  SN: ['sn_2008_12', 'cdp_sn'],
  MA: ['ma_09_08', 'cndp_ma'],
  TN: ['tn_2004_63', 'inpdp_tn'],
  DZ: ['dz_18_07', 'anpdp_dz'],
  CI: ['ci_2013_450', 'artci_ci'],
  ML: ['ml_2013_015', 'apdp_ml'],
};

export interface CountryRules {
  country: string;
  /** lot F3 : subdivision prise en compte (ex. CA-QC), ou null */
  region: string | null;
  /** lot F3 : subdivisions proposées pour ce pays (vide : aucune) */
  regions: readonly string[];
  /** âge en dessous duquel un parent crée le profil */
  consentAge: number;
  /** lot F3 (G3) : âge en dessous duquel l'inscription d'un enfant est FERMÉE dans ce pays (sinon null) */
  closedUnder: number | null;
  /** consentements obligatoires du titulaire du compte */
  accountConsents: ConsentType[];
  /** consentements obligatoires pour un profil d'enfant de moins de 13 ans / de 13 ans et plus */
  childConsents: { moins13: ConsentType[]; plus13: ConsentType[] };
  /** hébergement hors du pays (Union européenne) soumis à un accord exprès */
  transferConsent: boolean;
  law: LawCode;
  authority: AuthorityCode;
  /** tout le tableau est à valider par un juriste */
  aValider: true;
}

export function countryRules(country: string, region?: string | null): CountryRules {
  const c = country.toUpperCase();
  const [law, authority] =
    LAWS[c] ?? (EU_EEA.has(c) ? ['rgpd', 'autorite_ue'] : ['generique', 'autorite_locale']);
  const accountConsents = requiredAccountConsents(c);
  return {
    country: c,
    region: normRegion(c, region),
    regions: REGIONS_BY_COUNTRY[c] ?? [],
    consentAge: consentAge(c, region),
    closedUnder: CLOSED_UNDER_AGE[c] ?? null,
    accountConsents,
    childConsents: { moins13: requiredChildConsents(c, 12), plus13: requiredChildConsents(c, 13) },
    transferConsent: accountConsents.includes('transfert_hors_pays'),
    law,
    authority,
    aValider: true,
  };
}

/** Code pays ISO 3166-1 alpha-2. */
export const COUNTRY_CODE = /^[A-Za-z]{2}$/;

/** Codes ISO 3166-1 alpha-2 officiellement attribués (249) : un code inexistant est refusé (audit MIN-15). */
const ISO_3166 = new Set(
  (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV ' +
    'BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ' +
    'ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE ' +
    'IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
    'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU ' +
    'NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM ' +
    'SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE ' +
    'VG VI VN VU WF WS YE YT ZA ZM ZW'
  ).split(' '),
);

export function isCountry(code: string): boolean {
  return ISO_3166.has(code.toUpperCase());
}

/** Durée des sessions : famille 30 jours glissants ; rôles sensibles 12 h (CDC §4.6). */
export function sessionTtlMs(kind: string): number {
  return kind === 'enseignant' || kind === 'admin' ? 12 * 3600_000 : 30 * 24 * 3600_000;
}

export function requiresMfa(kind: string): boolean {
  return kind === 'enseignant' || kind === 'admin';
}

/** Audit MIN-17 : loi et autorité du pays, jointes à la preuve de TOUT accord (compte ou profil). */
export function lawEvidence(country: string | null | undefined): {
  loi: LawCode;
  autorite: AuthorityCode;
} {
  const r = countryRules(country ?? '');
  return { loi: r.law, autorite: r.authority };
}

/**
 * Lot F3 (revue M8) : fuseau horaire IANA valable (« Europe/Paris », « America/Toronto », « UTC »…), ou null.
 * Contrôlé par le moteur Intl (aucune liste recopiée).
 */
export function normTz(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Fuseau par défaut d'un pays (école créée sans fuseau) ; UTC à défaut. */
const COUNTRY_TZ: Readonly<Record<string, string>> = {
  SN: 'Africa/Dakar',
  ML: 'Africa/Bamako',
  GN: 'Africa/Conakry',
  CI: 'Africa/Abidjan',
  BF: 'Africa/Ouagadougou',
  MA: 'Africa/Casablanca',
  DZ: 'Africa/Algiers',
  TN: 'Africa/Tunis',
  FR: 'Europe/Paris',
  BE: 'Europe/Brussels',
  CH: 'Europe/Zurich',
  LU: 'Europe/Luxembourg',
  DE: 'Europe/Berlin',
  NL: 'Europe/Amsterdam',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  CA: 'America/Toronto',
  US: 'America/New_York',
};
export function defaultTz(country: string | null | undefined): string {
  return COUNTRY_TZ[(country ?? '').toUpperCase()] ?? 'UTC';
}
