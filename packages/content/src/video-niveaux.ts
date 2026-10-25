/**
 * Vidéos vivantes : niveaux proposés (ceux dont la garde coranique de la vidéo est calculée et testée, voir
 * `video-garde.ts`). Module minuscule, importé par la page de leçon et le téléchargement hors ligne sans emporter le
 * générateur (chargé à la demande avec le lecteur). Écrit en compact (préfixe, nombre de livres) : le poids de
 * l'appareil élève, marge de 3 Ko, ne grandit presque pas à chaque livre ajouté.
 */
const livres = (p: string, n: number) => Array.from({ length: n }, (_, i) => p + (i + 1));
export const VIDEO_NIVEAUX: readonly string[] = [
  ...livres('ad', 10),
  ...livres('en', 2),
  ...livres('ado', 2),
];
