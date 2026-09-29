// Application monopage (hors ligne d'abord) : le rendu se fait sur l'appareil, à partir des paquets de
// niveau stockés (IndexedDB) ou du réseau. Le service worker sert la coquille sans réseau.
// Les pages publiques en rendu serveur (QR) viendront avec leur lot, dans un groupe de routes séparé.
import { detectLocale, loadLocale, localeInfo, setLocale } from '$lib/i18n';
import { kvGet, kvSet } from '$lib/idb';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

/**
 * Langues « en préparation » (traductions non relues) : montrables seulement si le serveur l'autorise
 * (AWFORM_LANGUES_PREPARATION, démonstration) — jamais en production tant qu'elles ne sont pas relues.
 * Réglage mémorisé sur l'appareil pour le hors ligne ; par défaut : non.
 */
async function draftsAllowed(): Promise<boolean> {
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

/** Langue de l'interface : choix enregistré sur l'appareil, sinon langue du navigateur, sinon français. */
export const load: LayoutLoad = async () => {
  const allowed = await draftsAllowed();
  const saved = await kvGet<string>('locale').catch(() => undefined);
  const drafts =
    allowed && ((await kvGet<boolean>('draftLocales').catch(() => undefined)) ?? false);
  const usable = saved && (localeInfo(saved).status === 'relue' || drafts) ? saved : undefined;
  const code = usable ?? detectLocale(navigator.languages ?? [], drafts);
  // catalogue chargé à la demande (hors ligne : fichier gardé par le service worker ; sinon français)
  await loadLocale(code).catch(() => {});
  setLocale(code);
  return { draftsAllowed: allowed };
};
