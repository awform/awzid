/**
 * Codes d'activation imprimés dans les livres (lot 23, CDC § 5.3) : 12 caractères de l'alphabet de Crockford
 * (sans I, L, O, U : pas de confusion à la lecture sur papier) + 1 caractère de contrôle, présentés
 * « AWZ-XXXX-XXXX-XXXXC ». Seule l'empreinte SHA-256 du code normalisé est gardée par le serveur.
 */
import { createHash, randomBytes } from 'node:crypto';

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BODY = 12;

/** caractère de contrôle (somme pondérée modulo 32) : détecte une faute de frappe ou deux caractères inversés */
export function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * CODE_ALPHABET.indexOf(body[i]!);
  return CODE_ALPHABET[sum % 32]!;
}

/** Nouveau code (forme imprimée). */
export function generateCode(rand: (n: number) => Buffer = randomBytes): string {
  const bytes = rand(BODY);
  let body = '';
  for (let i = 0; i < BODY; i++) body += CODE_ALPHABET[bytes[i]! % 32];
  const full = body + checkChar(body);
  return `AWZ-${full.slice(0, 4)}-${full.slice(4, 8)}-${full.slice(8)}`;
}

/**
 * Forme normalisée d'une saisie (majuscules, sans tirets ni espaces, O→0, I/L→1, préfixe AWZ retiré), ou null si
 * la longueur ou le caractère de contrôle ne vont pas (refus sans consulter la base).
 */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.startsWith('AWZ')) s = s.slice(3);
  if (s.length !== BODY + 1 || [...s].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return checkChar(s.slice(0, BODY)) === s[BODY] ? s : null;
}

export const hashCode = (normalized: string) =>
  createHash('sha256').update(`awzid-activation:${normalized}`).digest('hex');

/** Fin d'un accès prolongé : un nouveau code s'ajoute à la fin de l'accès en cours (jamais de perte). */
export function passEnd(
  currentEnd: Date | null,
  months: number,
  now = new Date(),
): { start: Date; end: Date } {
  const start = currentEnd && currentEnd > now ? currentEnd : now;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return { start, end };
}
