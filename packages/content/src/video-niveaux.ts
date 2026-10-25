/**
 * Vidéos vivantes : niveaux proposés (ceux dont la garde coranique de la vidéo est calculée et testée, voir
 * `video-garde.ts`). Module minuscule, importé par la page de leçon et le téléchargement hors ligne sans emporter le
 * générateur (chargé à la demande avec le lecteur). Une seule donnée, le nombre de livres proposés par famille :
 * `estNiveauVideo` (appareil élève, marge de poids de 3 Ko) la lit sans la liste, la liste `VIDEO_NIVEAUX` (tests,
 * générateur) en est tirée et n'entre pas dans l'appareil.
 */
const LIVRES: Readonly<Record<string, number>> = { ad: 10, en: 3, ado: 3 };
export const estNiveauVideo = (n: string): boolean => {
  const m = /^([a-z]+)([1-9]\d*)$/.exec(n);
  return !!m && +m[2]! <= (LIVRES[m[1]!] ?? 0);
};
export const VIDEO_NIVEAUX: readonly string[] = /* @__PURE__ */ Object.entries(LIVRES).flatMap(
  ([p, k]) => Array.from({ length: k }, (_, i) => p + (i + 1)),
);
