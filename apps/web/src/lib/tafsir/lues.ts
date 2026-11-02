/**
 * Progression du « Tafsīr du niveau » : les sourates que l'élève a marquées comme lues, gardées SUR L'APPAREIL, par profil (clé `tf:lues:…` :
 * effacée à la déconnexion avec les autres données personnelles). Jamais bloquant : la progression ne ferme rien et ne note personne.
 */
import { kvGet, kvSet } from '$lib/idb';

export const cleLues = (profil?: string | null) => `tf:lues:${profil ?? 'compte'}`;

export async function lireLues(profil?: string | null): Promise<number[]> {
  const v = await kvGet<unknown>(cleLues(profil)).catch(() => undefined);
  return Array.isArray(v)
    ? v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 114)
    : [];
}

/** Marque ou démarque une sourate ; renvoie la liste à jour (triée). */
export async function basculerLue(profil: string | null | undefined, s: number): Promise<number[]> {
  const cur = await lireLues(profil);
  const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s].sort((a, b) => a - b);
  await kvSet(cleLues(profil), next).catch(() => undefined);
  return next;
}
