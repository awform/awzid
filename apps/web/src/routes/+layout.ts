// Application monopage (hors ligne d'abord) : le rendu se fait sur l'appareil, à partir des paquets de
// niveau stockés (IndexedDB) ou du réseau. Le service worker sert la coquille sans réseau.
// Les pages publiques en rendu serveur (QR) viendront avec leur lot, dans un groupe de routes séparé.
export const ssr = false;
export const prerender = false;
