import { kvGet, kvSet } from './idb';

/**
 * Langues « en préparation » (traductions non relues) : montrables seulement si le serveur l'autorise
 * (AWFORM_LANGUES_PREPARATION, démonstration) — jamais en production tant qu'elles ne sont pas relues.
 * Réglage mémorisé sur l'appareil pour le hors ligne ; par défaut : non.
 */
async function demander(): Promise<boolean> {
  try {
    const r = await fetch('/api/v1/config', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const ok =
        ((await r.json()) as { languesEnPreparation?: boolean }).languesEnPreparation === true;
      await kvSet('draftsAllowed', ok).catch(() => {});
      return ok;
    }
  } catch {
    /* hors ligne : dernier réglage connu */
  }
  return ((await kvGet<boolean>('draftsAllowed').catch(() => undefined)) ?? false) === true;
}

/**
 * F5 : une seule demande par chargement de l'application — la mise en page la lance sans l'attendre (ouverture
 * plus rapide en 3G) ; une page qui a besoin de la réponse (compte : langues en préparation) attend la même.
 */
let enCours: Promise<boolean> | null = null;
export function draftsAllowed(): Promise<boolean> {
  enCours ??= demander();
  return enCours;
}
