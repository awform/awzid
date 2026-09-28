/**
 * Correction ITEM PAR ITEM (une réponse = un événement de tentative), utilisée à l'identique par l'appareil
 * (retour immédiat) et par le serveur (recalcul : il ne fait jamais confiance au résultat envoyé).
 * Index d'item : `items[i]` pour les types à items ; case de `grille` (chasse) ; mot de `mots` (contient).
 */
import type { LanguageExercise } from '@awform/content/types';
import {
  checkChasseCell,
  checkComplete,
  checkContientMot,
  checkEcoute,
  checkOrdre,
  checkPremiereLettre,
  checkRelier,
  checkVraiFaux,
} from './index.js';

export type ItemResponse =
  /** premiere_lettre, ecoute, complete : option choisie (texte tel qu'affiché) */
  | { choice: string }
  /** vrai_faux */
  | { value: boolean }
  /** relier : indice de l'élément de droite associé au mot de gauche `item` */
  | { right: number }
  /** chasse, contient : la case / le mot `item` a été touché */
  | { touched: true }
  /** ordre : indices des étiquettes dans l'ordre touché */
  | { sequence: number[] };

/** Nombre d'index d'items possibles (cases pour chasse, mots pour contient). */
export function itemSlots(ex: LanguageExercise): number {
  if (ex.type === 'chasse') return ex.grille.length;
  if (ex.type === 'contient') return ex.mots.length;
  return ex.items.length;
}

/** Forme de réponse attendue pour un type (validation d'entrée). */
export function isValidItemResponse(ex: LanguageExercise, r: unknown): r is ItemResponse {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  switch (ex.type) {
    case 'premiere_lettre':
    case 'ecoute':
    case 'complete':
      return typeof o.choice === 'string' && o.choice.length <= 500;
    case 'vrai_faux':
      return typeof o.value === 'boolean';
    case 'relier':
      return Number.isInteger(o.right);
    case 'chasse':
    case 'contient':
      return o.touched === true;
    case 'ordre':
      return (
        Array.isArray(o.sequence) &&
        o.sequence.length <= 50 &&
        o.sequence.every((x) => Number.isInteger(x))
      );
  }
}

export function checkItem(ex: LanguageExercise, item: number, r: ItemResponse): boolean {
  if (!Number.isInteger(item) || item < 0 || item >= itemSlots(ex)) return false;
  switch (ex.type) {
    case 'premiere_lettre':
      return 'choice' in r && checkPremiereLettre(ex, item, r.choice);
    case 'ecoute':
      return 'choice' in r && checkEcoute(ex, item, r.choice);
    case 'complete':
      return 'choice' in r && checkComplete(ex, item, r.choice);
    case 'vrai_faux':
      return 'value' in r && checkVraiFaux(ex, item, r.value);
    case 'relier':
      return 'right' in r && checkRelier(ex, item, r.right);
    case 'chasse':
      return 'touched' in r && checkChasseCell(ex, item);
    case 'contient':
      return 'touched' in r && checkContientMot(ex, item);
    case 'ordre':
      return 'sequence' in r && checkOrdre(ex, item, r.sequence);
  }
}
