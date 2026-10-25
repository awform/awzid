/**
 * Vidéos vivantes du cahier de lecture (25/10/2026) — réglages communs au générateur (`video-cahier.ts`, chargé à la
 * demande avec le lecteur) et à la page du cahier (bouton « Regarder la vidéo »). Module minuscule, sans dépendance :
 * le bouton ne doit pas emporter le générateur ni la garde coranique avec lui.
 *
 * Générique : rien n'est propre à Adultes 1. Ces règles valent pour tout cahier de lecture au même format
 * (`/cahier-data/<niveau>.json`, format 1) : enfants (en1), adolescents (ado1), etc.
 */

/**
 * Types de pages sans vidéo : le bilan à froid (l'élève doit lire seul des mots jamais vus : un modèle sonore
 * annulerait l'épreuve), la minute de lecture (chronométrée, seul) et le guide (aucun texte à lire).
 */
export const CAHIER_SANS_VIDEO: readonly string[] = ['bilan', 'minute', 'guide'];

/** pause de répétition : 1,5 fois la durée écoutée (même règle que la lecture guidée du cahier) */
export const FACTEUR_REPETE = 1.5;
/** au moins 2 s pour répéter, même une syllabe très courte */
export const REPETE_MIN_MS = 2000;
/** élément sans voix : temps laissé pour le lire quand même (même durée que la lecture guidée du cahier) */
export const SANS_VOIX_MS = 2000;
/** durée prévue d'un élément dont le fichier n'est pas encore mesuré (barre de progression seulement) */
export const UNITE_MS = 1200;
/** souffle entre deux éléments d'une même ligne */
export const SOUFFLE_MS = 250;
