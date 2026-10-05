/**
 * CORRIGÉ d'un exercice (lot F1, revue d'architecture E5) : ce qui décide si une réponse est juste, et rien
 * d'autre. Son empreinte (`answer_hash`, calculée par l'import) est DISTINCTE de celle du texte :
 *  - corriger une coquille (consigne, traduction, voyelles d'une case de « chasse », image…) ne change pas le
 *    corrigé → les réponses déjà données gardent leur valeur (aucune maîtrise perdue) ;
 *  - changer la réponse attendue (ou le nombre d'items) change le corrigé → seules les réponses de CET exercice
 *    cessent de compter.
 * Mêmes règles que les fonctions de correction (`checkItem`) : chaînes comparées après `plain`, cases et mots
 * par leur indice, « relier » par paire (squelette arabe sans voyelles + image), « ordre » par la suite
 * d'étiquettes attendue. Un exercice non corrigé automatiquement a pour corrigé son contenu entier.
 */
import { bare, plain } from '@awform/content/text';
import type { Exercise } from '@awform/content/types';
import { checkChasseCell, ecouteExpected, isLanguageExercise, ordreSolution } from './index.js';

/** Version de la règle (si elle change un jour, toutes les empreintes changent en même temps). */
export const ANSWER_KEY_VERSION = 1;

export function answerKey(ex: Exercise): unknown {
  if (!isLanguageExercise(ex)) {
    // non noté : tout compte (l'empreinte du texte suffit) ; le champ « id » n'en fait jamais partie
    const { id: _id, ...rest } = ex as Exercise & { id?: unknown };
    void _id;
    return { v: ANSWER_KEY_VERSION, type: ex.type, contenu: rest };
  }
  const k = (items: unknown[]) => ({ v: ANSWER_KEY_VERSION, type: ex.type, items });
  switch (ex.type) {
    case 'premiere_lettre':
      // comparaison EXACTE au choix (comme le moteur des livres)
      return k(ex.items.map((it) => String(it.reponse)));
    case 'ecoute':
      return k(ex.items.map((it) => ecouteExpected(it)));
    case 'complete':
      return k(ex.items.map((it) => plain(it.reponse)));
    case 'vrai_faux':
      return k(ex.items.map((it) => !!it.vrai));
    case 'relier':
      return k(ex.items.map((it) => [bare(it.ar), it.img ?? null]));
    case 'chasse':
      return k(ex.grille.map((_, i) => checkChasseCell(ex, i)));
    case 'contient':
      return k(ex.mots.map((m) => !!m.oui));
    case 'ordre':
      return k(ex.items.map((_, i) => ordreSolution(ex, i)));
  }
}
