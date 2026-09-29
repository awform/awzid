/**
 * Notation d'une ÉPREUVE (bilan ou examen noté, lot 19, V1-b) — côté serveur, jamais sur l'appareil :
 * l'élève reçoit la projection d'épreuve (aucune réponse) et envoie UNE copie ; le serveur la corrige avec
 * les mêmes vérifications d'items que l'entraînement (`checkItem`).
 * Différences avec l'entraînement (règle provisoire, décision D6) :
 *  - une seule réponse par item (pas de nouvel essai) ;
 *  - « chasse » et « contient » : chaque case / mot juste touché vaut 1, chaque case / mot touché à tort
 *    retire 1 (plancher 0 par exercice) — sinon tout toucher donnerait la note maximale.
 * Seuls les 8 types « langue » sont notés automatiquement ; les autres parties (lecture à voix haute, texte
 * non préparé, dictée, questions ouvertes) sont notées par l'enseignant (partie hors application).
 */
import type { LanguageExercise } from '@awform/content/types';
import { isLanguageExercise } from './index.js';
import { checkItem, isValidItemResponse, itemSlots, type ItemResponse } from './items.js';

export type ExamAnswers = Record<string, Record<string, unknown>>;

export interface ExamExerciseResult {
  exerciseId: string;
  points: number;
  max: number;
}

export interface ExamGrade {
  points: number;
  max: number;
  exercises: ExamExerciseResult[];
}

/** Items « à trouver » d'un chasse / contient (cases de la cible, mots qui la contiennent). */
function targets(ex: LanguageExercise): number[] {
  const out: number[] = [];
  for (let k = 0; k < itemSlots(ex); k++) if (checkItem(ex, k, { touched: true })) out.push(k);
  return out;
}

export function gradeExam(
  exercises: ReadonlyArray<{ id: string; content: unknown }>,
  answers: ExamAnswers,
): ExamGrade {
  const results: ExamExerciseResult[] = [];
  for (const { id, content } of exercises) {
    const ex = content as LanguageExercise;
    if (!content || typeof content !== 'object' || !isLanguageExercise(ex)) continue;
    const given = answers[id] ?? {};
    const valid = (k: number): ItemResponse | null => {
      const r = given[String(k)];
      return isValidItemResponse(ex, r) ? r : null;
    };
    if (ex.type === 'chasse' || ex.type === 'contient') {
      const tg = new Set(targets(ex));
      let found = 0;
      let wrong = 0;
      for (let k = 0; k < itemSlots(ex); k++) {
        if (!valid(k)) continue;
        if (tg.has(k)) found++;
        else wrong++;
      }
      results.push({ exerciseId: id, points: Math.max(0, found - wrong), max: tg.size });
      continue;
    }
    let pts = 0;
    for (let k = 0; k < itemSlots(ex); k++) {
      const r = valid(k);
      if (r && checkItem(ex, k, r)) pts++;
    }
    results.push({ exerciseId: id, points: pts, max: itemSlots(ex) });
  }
  return {
    points: results.reduce((a, r) => a + r.points, 0),
    max: results.reduce((a, r) => a + r.max, 0),
    exercises: results,
  };
}

/**
 * Note sur le barème (20 pour un bilan, 100 pour un examen), arrondie au demi-point :
 * (points automatiques + points de l'enseignant) / (maximum automatique + maximum de l'enseignant).
 */
export function examScore(
  auto: { points: number; max: number },
  teacher: { points: number; max: number } | null,
  bareme: number,
): number | null {
  const pts = auto.points + (teacher?.points ?? 0);
  const max = auto.max + (teacher?.max ?? 0);
  if (max <= 0) return null;
  return Math.round((pts / max) * bareme * 2) / 2;
}

/** Seuil de remédiation : moins de 8/20 (ramené au barème). */
export const REMEDIATION_SUR_20 = 8;
export function needsRemediation(score: number | null, bareme: number): boolean {
  return score !== null && (score / bareme) * 20 < REMEDIATION_SUR_20;
}
