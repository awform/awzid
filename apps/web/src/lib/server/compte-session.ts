/**
 * Compte de la session pour les fichiers gardés de `/mutun/` (textes différés, notes de l'enseignant, audio des
 * Madjaliss) : le cookie est transmis tel quel à `GET /api/v1/auth/me` ; null sans session valide ou si l'API ne répond
 * pas (jamais d'ouverture par défaut).
 */
import { env } from '$env/dynamic/private';
import type { CompteMutun } from '$lib/server/mutun-acces';

const api = () => env.API_URL ?? 'http://127.0.0.1:3000';

export async function compteSession(cookie: string | null): Promise<CompteMutun | null> {
  if (!cookie) return null;
  try {
    const r = await fetch(`${api()}/api/v1/auth/me`, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    return r.ok ? ((await r.json()) as CompteMutun) : null;
  } catch {
    return null; // API injoignable : aucun droit
  }
}
