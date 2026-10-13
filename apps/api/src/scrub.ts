/**
 * JOURNAL D'ERREURS sans donnée personnelle (bêta) : adresses e-mail, identifiants, jetons et adresses IP sont
 * remplacés dans le texte d'une erreur (un message de base de données cite parfois la valeur fautive :
 * « Key (email)=(x@y) already exists »). Module léger, partagé par l'API et les outils en ligne de commande.
 */
export const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_IN_TEXT = /[^\s@"'<>()[\]{},;]+@[^\s@"'<>()[\]{},;]+\.[^\s@"'<>()[\]{},;]+/g;
const INVITATION_CODE = /AWZ-[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const IPV4_IN_TEXT = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g;

export function scrub(text: string): string {
  return text
    .replace(EMAIL_IN_TEXT, '[adresse]')
    .replace(INVITATION_CODE, '[code]')
    .replace(UUID_ANY, ':id')
    .replace(LONG_TOKEN, '[jeton]')
    .replace(IPV4_IN_TEXT, '$1.0');
}
