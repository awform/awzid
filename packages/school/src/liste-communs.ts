/**
 * Liste LOCALE des mots de passe courants (V2-1) : aucun appel externe. Chargée par l'API seulement (jamais par
 * l'application de l'élève : poids). Les données sont dans `mdp-communs.ts` (généré, un mot par ligne).
 */
import { MDP_COMMUNS_TEXTE } from './mdp-communs.js';

export const MDP_COMMUNS: ReadonlySet<string> = new Set(MDP_COMMUNS_TEXTE.split('\n'));

/** Vrai si le mot de passe (comparé en minuscules) figure dans la liste. */
export const estMotDePasseCommun = (minuscule: string): boolean =>
  MDP_COMMUNS.has(minuscule.trim().toLowerCase());
