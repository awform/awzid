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

/** jours de retard admis pour un appareil resté hors ligne (relais d'école, carnet rempli plus tard) */
export const OFFLINE_DAYS = 90;

/**
 * Horodatage de l'appareil (audit OFF-5) : illisible → null (refus) ; hors de la fenêtre
 * [serveur − 90 jours, serveur + 1 jour] (horloge fausse, antidatage) → heure du serveur.
 */
export function deviceTime(s: unknown, now = new Date()): Date | null {
  if (typeof s !== 'string' || s.length > 40) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const t = d.getTime();
  const n = now.getTime();
  return t < n - OFFLINE_DAYS * 86_400_000 || t > n + 86_400_000 ? new Date(n) : d;
}

/** Jour AAAA-MM-JJ réel (pas de 30 février), entre deux ans en arrière et demain (audit OFF-5). */
export function validDay(s: unknown, now = new Date()): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  const n = now.getTime();
  return d.getTime() >= n - 731 * 86_400_000 && d.getTime() <= n + 86_400_000;
}

/**
 * Passage du hifẓ (audit OFF-5) : « s:a » ou « s:a-b » avec 1 ≤ s ≤ 114, 1 ≤ a ≤ b ≤ nombre de versets de la
 * sourate (métadonnées Tanzil importées ; sans elles, 286 au plus), ou part de révision « qN » (1 ≤ N ≤ 1000).
 */
export function validPart(part: unknown, ayas?: ReadonlyMap<number, number>): boolean {
  if (typeof part !== 'string') return false;
  const q = /^q(\d{1,4})$/.exec(part);
  if (q) return Number(q[1]) >= 1 && Number(q[1]) <= 1000;
  const m = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(part);
  if (!m) return false;
  const s = Number(m[1]);
  const a = Number(m[2]);
  const b = m[3] === undefined ? a : Number(m[3]);
  const max = ayas?.get(s) ?? 286;
  return s >= 1 && s <= 114 && a >= 1 && a <= b && b <= max;
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
