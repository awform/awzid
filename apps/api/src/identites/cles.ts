/**
 * Empreintes à clé (HMAC-SHA-256, clé du serveur AWFORM_SECRET_KEY) des numéros et des codes : une empreinte simple
 * (SHA-256) d'un numéro de téléphone se retrouverait par essais (l'espace des numéros est petit) ; avec la clé du
 * serveur, une copie de la base seule ne permet rien. Le numéro lui-même est CHIFFRÉ (AES-256-GCM, même clé).
 */
import { createHmac, randomInt } from 'node:crypto';
import { ALPHABET_DEFI } from '@awform/school/telephone';
import { decrypt, encrypt } from '../auth/crypto.js';

export const hmac = (key: Buffer, s: string) => createHmac('sha256', key).update(s).digest('hex');
export const phoneHashOf = (key: Buffer, e164: string) => hmac(key, `awzid-tel:${e164}`);
export const chiffrer = (key: Buffer, s: string) => encrypt(s, key);
export function dechiffrer(key: Buffer | null, box: string | null | undefined): string | null {
  if (!key || !box) return null;
  try {
    return decrypt(box, key);
  } catch {
    return null;
  }
}

/** Tirage uniforme dans l'alphabet sans caractères ambigus. */
export const tirer = (n: number, alphabet = ALPHABET_DEFI) =>
  Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('');
