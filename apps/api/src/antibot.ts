/**
 * Protection anti-robots de l'inscription, SANS service tiers ni suivi :
 *  - JETON signé (HMAC-SHA-256 avec la clé du serveur) émis quand la page d'inscription s'ouvre : il porte l'heure
 *    d'émission ; l'inscription n'est acceptée que 3 secondes à 2 heures plus tard (un robot qui poste tout de suite est
 *    refusé, un jeton ancien aussi) ;
 *  - CHAMP PIÈGE (« honeypot ») : un champ caché que seul un robot remplit ;
 *  - limites de débit déjà en place (inscriptions par adresse IP et par heure, essais de codes, connexions).
 * Option de CAPTCHA respectueux de la vie privée, NON activée et sans compte créé : ALTCHA (preuve de travail, auto-hébergé,
 * aucun cookie, aucun appel externe) ou Cloudflare Turnstile (service tiers, à décider avec le client) : voir
 * EXPLOITATION.md § 16.6. Le jeton ci-dessous est la première couche ; la preuve de travail s'ajouterait au même endroit.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ANTIBOT_MIN_MS = 3_000;
export const ANTIBOT_MAX_MS = 2 * 3_600_000;
/** clé de repli (processus) quand le serveur n'a pas de clé : les jetons ne survivent alors pas à un redémarrage */
const CLE_PROCESSUS = randomBytes(32);

const signe = (key: Buffer | null, ts: string) =>
  createHmac('sha256', key ?? CLE_PROCESSUS)
    .update(`awzid-antibot:${ts}`)
    .digest('base64url');

export function emettreJeton(key: Buffer | null, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${signe(key, ts)}`;
}

export type ResultatJeton = 'ok' | 'absent' | 'invalide' | 'trop_rapide' | 'expire';
export function verifierJeton(
  key: Buffer | null,
  jeton: string | undefined,
  now = Date.now(),
): ResultatJeton {
  if (!jeton) return 'absent';
  const [ts, sig] = jeton.split('.');
  if (!ts || !sig || !/^\d{10,16}$/.test(ts)) return 'invalide';
  const attendu = Buffer.from(signe(key, ts));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return 'invalide';
  const age = now - Number(ts);
  if (age < ANTIBOT_MIN_MS) return 'trop_rapide';
  if (age > ANTIBOT_MAX_MS) return 'expire';
  return 'ok';
}
