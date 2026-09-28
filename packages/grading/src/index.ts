/**
 * @awform/grading — bibliothèque de correction UNIQUE, partagée par l'appareil (correction immédiate,
 * hors ligne) et le serveur (recalcul des notes). Portage fidèle du moteur des livres awform/awform.js :
 *  - rendu des attributs de correction : fonction `exercise()` (l. 366-381) ;
 *  - comparaison au clic : gestionnaire `click` (l. 906-932) ;
 *  - total noté : `exTotal()` (l. 364) ; normalisations `plain()` / `bare()` (l. 20, 26).
 * Règle du moteur : un item compte quand il est trouvé (un nouvel essai est permis) ; les erreurs ne
 * retirent pas de points (bienveillance, CDC §3.6) mais sont comptées pour les statistiques.
 * Aucune normalisation Unicode : comparaisons de chaînes exactes, après `plain` ou `bare` comme le moteur.
 */
import { bare, plain } from '@awform/content/text';
import type {
  ChasseExercise,
  CompleteExercise,
  ContientExercise,
  EcouteExercise,
  Exercise,
  LanguageExercise,
  LanguageExerciseType,
  OrdreExercise,
  PremiereLettreExercise,
  RelierExercise,
  VraiFauxExercise,
} from '@awform/content/types';

export { bare, plain };

export const GRADED_LANGUAGE_TYPES: readonly LanguageExerciseType[] = [
  'premiere_lettre',
  'chasse',
  'relier',
  'ecoute',
  'vrai_faux',
  'complete',
  'contient',
  'ordre',
];

export function isLanguageExercise(ex: Exercise): ex is LanguageExercise {
  return (GRADED_LANGUAGE_TYPES as readonly string[]).includes(ex.type);
}

// ------------------------------------------------------------------ vérifications élémentaires

/** premiere_lettre : `data-a = esc(it.reponse)`, `data-o = esc(option)` → égalité exacte (sans plain). */
export function checkPremiereLettre(ex: PremiereLettreExercise, item: number, choice: string): boolean {
  const it = ex.items[item];
  return !!it && choice === String(it.reponse);
}

/** Réponse attendue d'un item `ecoute` : `plain(reponse || dit)`. */
export function ecouteExpected(it: EcouteExercise['items'][number]): string {
  return plain(it.reponse || it.dit);
}

/** ecoute : `plain(choix) === plain(reponse || dit)`. */
export function checkEcoute(ex: EcouteExercise, item: number, choice: string): boolean {
  const it = ex.items[item];
  return !!it && plain(choice) === ecouteExpected(it);
}

/** complete : `plain(choix) === plain(reponse)`. */
export function checkComplete(ex: CompleteExercise, item: number, choice: string): boolean {
  const it = ex.items[item];
  return !!it && plain(choice) === plain(it.reponse);
}

/** vrai_faux : le choix (vrai / faux) doit égaler `!!vrai`. */
export function checkVraiFaux(ex: VraiFauxExercise, item: number, value: boolean): boolean {
  const it = ex.items[item];
  return !!it && value === !!it.vrai;
}

/** relier : le mot de gauche i va avec l'élément de droite de même indice (paire (i, i)). */
export function checkRelier(ex: RelierExercise, left: number, right: number): boolean {
  return left >= 0 && left < ex.items.length && left === right;
}

/** chasse : une case est juste si `bare(case) === bare(cible)`. */
export function checkChasseCell(ex: ChasseExercise, cell: number): boolean {
  const x = ex.grille[cell];
  return x !== undefined && bare(x) === bare(ex.cible);
}

/** contient : un mot est juste s'il porte `oui: true`. */
export function checkContientMot(ex: ContientExercise, mot: number): boolean {
  return !!ex.mots[mot]?.oui;
}

/** Séparateur des étiquettes d'un item `ordre` : espace, ou collées si la phrase n'a pas d'espace (syllabes). */
export function ordreSeparator(phrase: string): string {
  return plain(phrase).trim().includes(' ') ? ' ' : '';
}

/**
 * ordre : l'élève touche les étiquettes dans l'ordre ; le moteur concatène `plain(étiquette)` (avec une
 * espace si la phrase en contient) et compare à `plain(phrase)` (espaces de bord retirées).
 * `sequence` = indices des étiquettes (`mots`) dans l'ordre choisi ; toutes doivent être utilisées une fois.
 */
export function checkOrdre(ex: OrdreExercise, item: number, sequence: readonly number[]): boolean {
  const it = ex.items[item];
  if (!it) return false;
  if (sequence.length !== it.mots.length) return false;
  if (new Set(sequence).size !== sequence.length) return false;
  if (sequence.some((k) => k < 0 || k >= it.mots.length)) return false;
  const sep = ordreSeparator(it.phrase);
  const out = sequence.map((k) => plain(it.mots[k])).join(sep);
  return out.trim() === plain(it.phrase).trim();
}

// ------------------------------------------------------------------ total et correction d'un exercice

/** Nombre de points d'un exercice (port de `exTotal` pour les 8 types « langue »). */
export function exerciseTotal(ex: LanguageExercise): number {
  switch (ex.type) {
    case 'chasse':
      return ex.grille.filter((x) => bare(x) === bare(ex.cible)).length;
    case 'contient':
      return ex.mots.filter((m) => m.oui).length;
    default:
      return ex.items.length;
  }
}

/** Réponse de l'élève à un exercice entier (une valeur par item ; `null` = non répondu). */
export type ExerciseResponse =
  | { type: 'premiere_lettre' | 'ecoute' | 'complete'; answers: ReadonlyArray<string | null> }
  | { type: 'vrai_faux'; answers: ReadonlyArray<boolean | null> }
  /** pour chaque mot de gauche i : indice de l'élément de droite choisi */
  | { type: 'relier'; pairs: ReadonlyArray<number | null> }
  /** cases (chasse) ou mots (contient) touchés */
  | { type: 'chasse' | 'contient'; selected: readonly number[] }
  /** pour chaque item : indices des étiquettes dans l'ordre touché */
  | { type: 'ordre'; sequences: ReadonlyArray<readonly number[] | null> };

export interface GradeResult {
  /** points possibles (= exerciseTotal) */
  total: number;
  /** points obtenus */
  correct: number;
  /** 0 à 1 */
  score: number;
  /** pour chaque point : obtenu ou non (items, ou cases/mots attendus pour chasse/contient) */
  items: boolean[];
  /** sélections fausses (chasse / contient) : comptées, jamais retirées du score */
  wrongSelections: number;
}

function result(items: boolean[], wrongSelections = 0): GradeResult {
  const correct = items.filter(Boolean).length;
  return { total: items.length, correct, score: items.length ? correct / items.length : 0, items, wrongSelections };
}

export class ResponseTypeError extends Error {
  constructor(expected: string, got: string) {
    super(`réponse de type « ${got} » pour un exercice « ${expected} »`);
    this.name = 'ResponseTypeError';
  }
}

export function gradeExercise(ex: LanguageExercise, response: ExerciseResponse): GradeResult {
  if (response.type !== ex.type) throw new ResponseTypeError(ex.type, response.type);
  switch (ex.type) {
    case 'premiere_lettre': {
      const r = response as Extract<ExerciseResponse, { answers: ReadonlyArray<string | null> }>;
      return result(ex.items.map((_, i) => r.answers[i] != null && checkPremiereLettre(ex, i, r.answers[i] as string)));
    }
    case 'ecoute': {
      const r = response as Extract<ExerciseResponse, { answers: ReadonlyArray<string | null> }>;
      return result(ex.items.map((_, i) => r.answers[i] != null && checkEcoute(ex, i, r.answers[i] as string)));
    }
    case 'complete': {
      const r = response as Extract<ExerciseResponse, { answers: ReadonlyArray<string | null> }>;
      return result(ex.items.map((_, i) => r.answers[i] != null && checkComplete(ex, i, r.answers[i] as string)));
    }
    case 'vrai_faux': {
      const r = response as Extract<ExerciseResponse, { type: 'vrai_faux' }>;
      return result(ex.items.map((_, i) => r.answers[i] != null && checkVraiFaux(ex, i, r.answers[i] as boolean)));
    }
    case 'relier': {
      const r = response as Extract<ExerciseResponse, { type: 'relier' }>;
      return result(ex.items.map((_, i) => r.pairs[i] != null && checkRelier(ex, i, r.pairs[i] as number)));
    }
    case 'chasse': {
      const sel = new Set((response as Extract<ExerciseResponse, { selected: readonly number[] }>).selected);
      const items: boolean[] = [];
      let wrong = 0;
      ex.grille.forEach((_, k) => {
        if (checkChasseCell(ex, k)) items.push(sel.has(k));
        else if (sel.has(k)) wrong++;
      });
      return result(items, wrong);
    }
    case 'contient': {
      const sel = new Set((response as Extract<ExerciseResponse, { selected: readonly number[] }>).selected);
      const items: boolean[] = [];
      let wrong = 0;
      ex.mots.forEach((_, k) => {
        if (checkContientMot(ex, k)) items.push(sel.has(k));
        else if (sel.has(k)) wrong++;
      });
      return result(items, wrong);
    }
    case 'ordre': {
      const r = response as Extract<ExerciseResponse, { type: 'ordre' }>;
      return result(ex.items.map((_, i) => r.sequences[i] != null && checkOrdre(ex, i, r.sequences[i] as number[])));
    }
  }
}

// ------------------------------------------------------------------ corrigé

/** Indices des étiquettes d'un item `ordre` qui reconstituent la phrase (ou null si impossible). */
export function ordreSolution(ex: OrdreExercise, item: number): number[] | null {
  const it = ex.items[item];
  if (!it) return null;
  const sep = ordreSeparator(it.phrase);
  const target = plain(it.phrase).trim();
  const labels = it.mots.map((m) => plain(m));
  const used = new Array<boolean>(labels.length).fill(false);
  const path: number[] = [];
  const walk = (rest: string): boolean => {
    if (path.length === labels.length) return rest === '';
    for (let k = 0; k < labels.length; k++) {
      if (used[k]) continue;
      const last = path.length === labels.length - 1;
      const piece = (labels[k] ?? '') + (last ? '' : sep);
      if (!rest.startsWith(piece)) continue;
      used[k] = true;
      path.push(k);
      if (walk(rest.slice(piece.length))) return true;
      used[k] = false;
      path.pop();
    }
    return false;
  };
  return walk(target) ? [...path] : null;
}

/** Réponse du corrigé (celle que le guide de l'enseignant donne). */
export function correctResponse(ex: LanguageExercise): ExerciseResponse {
  switch (ex.type) {
    case 'premiere_lettre':
      return { type: ex.type, answers: ex.items.map((it) => String(it.reponse)) };
    case 'ecoute':
      return {
        type: ex.type,
        answers: ex.items.map((it) => it.options.find((o) => plain(o) === ecouteExpected(it)) ?? ecouteExpected(it)),
      };
    case 'complete':
      return {
        type: ex.type,
        answers: ex.items.map((it) => it.options.find((o) => plain(o) === plain(it.reponse)) ?? it.reponse),
      };
    case 'vrai_faux':
      return { type: ex.type, answers: ex.items.map((it) => !!it.vrai) };
    case 'relier':
      return { type: ex.type, pairs: ex.items.map((_, i) => i) };
    case 'chasse':
      return { type: ex.type, selected: ex.grille.flatMap((_, k) => (checkChasseCell(ex, k) ? [k] : [])) };
    case 'contient':
      return { type: ex.type, selected: ex.mots.flatMap((m, k) => (m.oui ? [k] : [])) };
    case 'ordre':
      return { type: ex.type, sequences: ex.items.map((_, i) => ordreSolution(ex, i)) };
  }
}
