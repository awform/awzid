/**
 * Règle des mots de passe — UNE seule source, partagée par l'API (contrôle) et l'application (indicateur) :
 * l'indicateur reflète ce que le serveur accepte (sauf la liste des mots de passe courants, trop lourde pour
 * l'appareil de l'élève : seul le serveur la connaît).
 *
 * Comptes FAMILLE et ADULTE, ados, enfants (V2-1, décision du client du 29/10/2026 : « plus c'est simple, mieux
 * c'est ») : 8 caractères au moins, AUCUNE exigence de composition (ni majuscule, ni chiffre, ni symbole). On refuse
 * seulement :
 *  - un mot de passe courant ou fuité (liste LOCALE du dépôt, `liste-communs.ts` : aucun appel externe) ;
 *  - un mot de passe égal à l'identifiant, à l'adresse e-mail (ou à sa partie avant « @ ») ou au prénom.
 * Les mots de passe déjà créés restent valables : la règle ne joue qu'à la création et au changement.
 *
 * Comptes du PERSONNEL (admin, enseignant, rôles de plateforme, `cli/staff`) : RIEN NE CHANGE — 12 caractères au
 * moins (et second facteur, exigé ailleurs), refus des mots de passe courants et de ceux qui contiennent l'adresse.
 *
 * Dans tous les cas : 128 caractères au plus. Tous les caractères sont admis (espaces, lettres accentuées, arabe) ;
 * pas de normalisation Unicode (règle du projet).
 */
export const MDP_MIN_PHRASE = 12;
export const MDP_MIN_COURT = 8;
/** conservé pour compatibilité (ancienne voie « 8 caractères et 3 types », supprimée pour les familles) */
export const MDP_MIN_TYPES = 3;
export const MDP_MAX = 128;

/** Courts mots de passe courants connus de l'application elle-même (personnel) ; la grande liste est côté serveur. */
const COMMUNS = new Set(
  `123456789012 1234567890123 azertyuiop12 azertyuiopqs qwertyuiop12 motdepasse12 motdepasse123
  password1234 password12345 passwordpassword 000000000000 111111111111 123123123123 abcdefghijkl
  azerty123456 qwerty123456 iloveyou1234 bismillah123 bismillah1234 soleil123456 bonjour12345
  marseille123 football1234 administrator changemenow1 welcome12345 letmein12345 motdepasse00
  awform123456 awzid1234567 azertyazerty qwertyqwerty 1q2w3e4r5t6y 1qaz2wsx3edc aaaaaaaaaaaa
  allahuakbar1 alhamdulillah subhanallah1 mashallah123 inchallah123 senegal12345 dakar1234567
  france123456 paris1234567 motdepasse!! password!!!! 12345678910! azertyuiop!!
  password1 password12 password123 password1! password! motdepasse1 motdepasse! azerty12 azerty123
  azerty1234 azerty123! azerty1! qwerty12 qwerty123 qwerty1234 qwerty123! qwerty1! bismillah1 bismillah12
  bismillah! soleil123 bonjour1 bonjour12 bonjour123 senegal1 senegal12 senegal123 dakar123 dakar1234
  welcome1 welcome12 welcome123 iloveyou1 iloveyou12 admin123 admin1234 admin123! awzid123 awzid2026
  awform123 inchallah1 mashallah1 marseille13 football1 abc12345 abcd1234 abcdef12 1q2w3e4r 1q2w3e4r5t`
    .split(/\s+/)
    .filter(Boolean),
);

export type ProblemeMotDePasse =
  | 'trop_court'
  | 'trop_simple'
  | 'trop_long'
  | 'trop_courant'
  | 'contient_email'
  | 'egal_identifiant';

export interface OptionsMotDePasse {
  /** compte du personnel : 12 caractères au moins, règle inchangée */
  personnel?: boolean;
  /** identifiant(s), prénom(s), numéro… que le mot de passe ne doit pas égaler (comparaison sans casse) */
  identifiants?: ReadonlyArray<string | null | undefined>;
  /** liste des mots de passe courants (donnée par le serveur ; absente côté application : trop lourde) */
  estCommun?: (minuscule: string) => boolean;
}

/** Nombre de types de caractères présents (0 à 4) : minuscule, majuscule, chiffre, symbole. */
export function typesDeCaracteres(pw: string): number {
  let n = 0;
  if (/[\p{Ll}\p{Lo}\p{Lm}]/u.test(pw)) n++;
  if (/[\p{Lu}\p{Lt}]/u.test(pw)) n++;
  if (/\p{N}/u.test(pw)) n++;
  if (/[^\p{L}\p{N}\p{M}]/u.test(pw)) n++;
  return n;
}

/** Contrôle complet (celui du serveur) : null si le mot de passe est accepté. */
export function checkPassword(
  pw: string,
  email = '',
  opts: OptionsMotDePasse = {},
): ProblemeMotDePasse | null {
  const chars = [...pw].length;
  const low = pw.toLowerCase();
  const local = email.toLowerCase().split('@')[0] ?? '';
  if (opts.personnel) {
    // PERSONNEL : règle inchangée
    if (chars < MDP_MIN_PHRASE) return 'trop_court';
    if (chars > MDP_MAX) return 'trop_long';
    if (COMMUNS.has(low) || /^(.)\1+$/.test(pw) || /^(0123456789|123456789)+/.test(pw))
      return 'trop_courant';
    if (opts.estCommun?.(low)) return 'trop_courant';
    if (local.length >= 4 && low.includes(local)) return 'contient_email';
    return null;
  }
  if (chars < MDP_MIN_COURT) return 'trop_court';
  if (chars > MDP_MAX) return 'trop_long';
  if (COMMUNS.has(low) || /^(.)\1+$/.test(pw) || opts.estCommun?.(low)) return 'trop_courant';
  // égal à l'identifiant, à l'adresse (entière ou avant « @ ») ou au prénom — sans casse ni espaces autour
  const nu = low.trim();
  const interdits = [email, local, ...(opts.identifiants ?? [])]
    .map((s) => (s ?? '').toLowerCase().trim())
    .filter(Boolean);
  if (interdits.includes(nu)) return 'egal_identifiant';
  return null;
}

/**
 * Indicateur de l'application : `vide` (rien saisi), `refuse` (rouge : le serveur refuserait), `correct` (orange :
 * 8 à 11 caractères, accepté), `fort` (vert : 12 caractères ou plus, accepté).
 */
export type ForceMotDePasse = 'vide' | 'refuse' | 'correct' | 'fort';
export function forceMotDePasse(
  pw: string,
  email = '',
  opts: OptionsMotDePasse = {},
): ForceMotDePasse {
  if (!pw) return 'vide';
  if (checkPassword(pw, email, opts)) return 'refuse';
  return [...pw].length >= MDP_MIN_PHRASE ? 'fort' : 'correct';
}
