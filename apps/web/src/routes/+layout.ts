// Application monopage (hors ligne d'abord) : le rendu se fait sur l'appareil, à partir des paquets de
// niveau stockés (IndexedDB) ou du réseau. Le service worker sert la coquille sans réseau.
// Les pages publiques en rendu serveur (QR) viendront avec leur lot, dans un groupe de routes séparé.
import { detectLocale, loadLocale, localeInfo, setLocale } from '$lib/i18n';
import { kvGet } from '$lib/idb';
import { draftsAllowed } from '$lib/config';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

/** Langue de l'interface : choix enregistré sur l'appareil, sinon langue du navigateur, sinon français. */
export const load: LayoutLoad = async () => {
  const saved = await kvGet<string>('locale').catch(() => undefined);
  // F5 (ouverture en 3G) : la réponse du serveur n'est ATTENDUE que si elle peut changer la langue affichée (langue
  // en préparation enregistrée ou préférée par le navigateur) ; sinon elle met à jour le réglage en arrière-plan
  const pending = draftsAllowed();
  const mayUseDraft =
    (!!saved && localeInfo(saved).status !== 'relue') ||
    detectLocale(navigator.languages ?? [], true) !== detectLocale(navigator.languages ?? []);
  const allowed = mayUseDraft
    ? await pending
    : ((await kvGet<boolean>('draftsAllowed').catch(() => undefined)) ?? false) === true;
  const drafts =
    allowed && ((await kvGet<boolean>('draftLocales').catch(() => undefined)) ?? false);
  const usable = saved && (localeInfo(saved).status === 'relue' || drafts) ? saved : undefined;
  const code = usable ?? detectLocale(navigator.languages ?? [], drafts);
  // catalogue chargé à la demande (hors ligne : fichier gardé par le service worker ; sinon français)
  await loadLocale(code).catch(() => {});
  setLocale(code);
  return { draftsAllowed: allowed };
};
