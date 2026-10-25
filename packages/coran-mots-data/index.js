// Seul rôle de ce fichier : donner le dossier des données au code qui les lit (jamais l'inverse : les données ne
// contiennent aucun code de l'application, et le code de l'application n'embarque aucune de ces données).
import { fileURLToPath } from 'node:url';

/** Chemin absolu du dossier `data/` (avec la barre finale). */
export const DONNEES = fileURLToPath(new URL('./data/', import.meta.url));
