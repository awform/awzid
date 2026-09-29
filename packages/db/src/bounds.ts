/**
 * Bornes des événements envoyés par les appareils (audit OFF-2) : un champ hors des types de la base
 * (smallint, integer, horodatage, caractère nul refusé par jsonb) ne doit jamais faire échouer tout un lot.
 * Chaque événement est vérifié ici, puis son écriture est isolée : l'événement fautif est refusé SEUL.
 */

export const isSmallInt = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= -32768 && (n as number) <= 32767;

export const isInt32 = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= -2147483648 && (n as number) <= 2147483647;

/** vrai si la valeur contient un caractère nul (refusé par PostgreSQL dans text et jsonb) */
export const hasNul = (v: unknown): boolean => {
  try {
    return (JSON.stringify(v ?? null) ?? '').includes('\\u0000');
  } catch {
    return true;
  }
};

/** horodatage de l'appareil lisible et dans une plage plausible (années 2000 à 2100) */
export function deviceTime(s: unknown): Date | null {
  if (typeof s !== 'string' || s.length > 40) return null;
  const d = new Date(s);
  const y = d.getUTCFullYear();
  return Number.isNaN(d.getTime()) || y < 2000 || y > 2100 ? null : d;
}

/**
 * Écriture isolée d'un événement : une erreur de la base (valeur hors bornes oubliée ici) refuse cet
 * événement seul au lieu de renvoyer 500 pour tout le lot.
 */
export async function isolated<T>(write: () => Promise<T>): Promise<T | typeof REFUSED> {
  try {
    return await write();
  } catch {
    return REFUSED;
  }
}
export const REFUSED: unique symbol = Symbol('refuse');
