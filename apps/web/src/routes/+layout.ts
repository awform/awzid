// Application monopage (hors ligne d'abord) : le rendu se fait sur l'appareil, à partir des paquets de
// niveau stockés (IndexedDB) ou du réseau. Le service worker sert la coquille sans réseau.
// Les pages publiques en rendu serveur (QR) viendront avec leur lot, dans un groupe de routes séparé.
import { detectLocale, setLocale } from '$lib/i18n';
import { kvGet } from '$lib/idb';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

/** Langue de l'interface : choix enregistré sur l'appareil, sinon langue du navigateur, sinon français. */
export const load: LayoutLoad = async () => {
  const saved = await kvGet<string>('locale').catch(() => undefined);
  const drafts = (await kvGet<boolean>('draftLocales').catch(() => undefined)) ?? false;
  setLocale(saved ?? detectLocale(navigator.languages ?? [], drafts));
  return {};
};
