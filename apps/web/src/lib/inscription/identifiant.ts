/**
 * V2-2 : champ unique « Numéro WhatsApp ou e-mail » de l'inscription, et pays déduit.
 * Fonctions pures (aucune requête, jamais l'adresse IP) ; le numéro est lu par `@awform/school/telephone`,
 * la même source que le serveur.
 */
import { normaliserTelephone } from '@awform/school/telephone';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Lecture =
  | { type: 'vide' }
  | { type: 'email'; email: string }
  | { type: 'telephone'; e164: string; pays: string | null }
  | { type: 'invalide'; raison: string };

/**
 * Reconnaît la forme de la saisie : e-mail (contient « @ »), numéro international (« + » ou « 00 » au début),
 * sinon refus avec une raison (clé de message : `ins.err_id_<raison>` ou `id.erreur.numero_<raison>`).
 */
export function lireIdentifiant(saisie: string): Lecture {
  const s = (saisie ?? '').trim();
  if (!s) return { type: 'vide' };
  if (s.includes('@'))
    return EMAIL.test(s) ? { type: 'email', email: s } : { type: 'invalide', raison: 'email' };
  if (/^(\+|00)/.test(s) && /^[+0-9][0-9\s.\-()]*$/.test(s)) {
    const n = normaliserTelephone(s);
    return n.ok
      ? { type: 'telephone', e164: n.e164, pays: n.pays }
      : { type: 'invalide', raison: `numero_${n.raison}` };
  }
  // chiffres seuls, sans indicatif : le pays n'est pas encore connu, on demande l'écriture internationale
  if (/^[0-9][0-9\s.\-()]{5,}$/.test(s)) return { type: 'invalide', raison: 'sans_indicatif' };
  return { type: 'invalide', raison: 'ni_l_un_ni_l_autre' };
}

/** fuseau IANA de l'appareil → pays (seulement ceux que l'application propose) */
const FUSEAUX: Readonly<Record<string, string>> = {
  'Europe/Paris': 'FR',
  'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH',
  'Europe/Luxembourg': 'LU',
  'America/Toronto': 'CA',
  'America/Montreal': 'CA',
  'America/Vancouver': 'CA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'Europe/London': 'GB',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Dublin': 'IE',
  'Europe/Stockholm': 'SE',
  'Europe/Lisbon': 'PT',
  'Europe/Vienna': 'AT',
  'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ',
  'Africa/Tunis': 'TN',
  'Africa/Dakar': 'SN',
  'Africa/Bamako': 'ML',
  'Africa/Abidjan': 'CI',
  'Africa/Conakry': 'GN',
  'Africa/Ouagadougou': 'BF',
};

/** pays possibles d'une langue quand ni numéro, ni région de la langue, ni fuseau ne tranchent */
const PAR_LANGUE: Readonly<Record<string, readonly string[]>> = {
  fr: ['FR', 'SN', 'BE', 'CH', 'CA', 'MA', 'DZ', 'TN', 'ML', 'CI', 'GN', 'BF', 'LU'],
  en: ['GB', 'US', 'CA', 'IE'],
  de: ['DE', 'AT', 'CH'],
  es: ['ES'],
  ar: ['MA', 'DZ', 'TN'],
};

export interface PaysDeduit {
  pays: string;
  /** vrai si le pays vient du numéro, de la région de la langue ou du fuseau ; faux = simple supposition */
  sur: boolean;
  /** si le doute persiste : les pays possibles, dont la règle de majorité la plus stricte sera retenue */
  candidats: readonly string[];
}

/**
 * Pays proposé, par ordre de confiance : indicatif du numéro, région de la langue (« fr-SN »), fuseau horaire, puis
 * la langue seule (doute). Jamais l'adresse IP. `connus` = pays que l'application propose.
 */
export function deduirePays(
  entree: { numeroPays?: string | null; langue?: string; fuseau?: string },
  connus: readonly string[],
): PaysDeduit {
  const ok = (c: string | null | undefined): c is string => !!c && connus.includes(c);
  if (ok(entree.numeroPays)) return { pays: entree.numeroPays, sur: true, candidats: [] };
  const [lg = '', rg = ''] = (entree.langue ?? '').split(/[-_]/);
  const region = rg.toUpperCase();
  if (ok(region)) return { pays: region, sur: true, candidats: [] };
  const parFuseau = entree.fuseau ? FUSEAUX[entree.fuseau] : undefined;
  if (ok(parFuseau)) return { pays: parFuseau, sur: true, candidats: [] };
  const candidats = (PAR_LANGUE[lg.toLowerCase()] ?? []).filter((c) => connus.includes(c));
  return { pays: candidats[0] ?? connus[0] ?? 'FR', sur: false, candidats };
}

/** règle la plus stricte : parmi les candidats, le pays dont l'âge de consentement est le plus élevé (le premier en cas d'égalité) */
export function paysLePlusStrict(
  candidats: readonly string[],
  ageDe: (pays: string) => number | undefined,
): string | null {
  let meilleur: string | null = null;
  let max = -1;
  for (const c of candidats) {
    const a = ageDe(c);
    if (a !== undefined && a > max) {
      max = a;
      meilleur = c;
    }
  }
  return meilleur;
}
