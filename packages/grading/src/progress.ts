/**
 * Progression d'une leçon RECALCULÉE à partir des tentatives (CDC §2.2 et §2.15) :
 *  - score (statistiques) = moyenne, sur les exercices notés commencés, de la part des points réussis
 *    au PREMIER essai ; meilleur score (pour l'élève) = part des points trouvés (nouvel essai permis) ;
 *  - « commencée » dès une tentative ; « terminée » quand tous les points de tous les exercices notés sont
 *    trouvés ET l'auto-évaluation cochée ; « maîtrisée » quand elle est terminée avec un score ≥ 80 %.
 * Pour chasse / contient, chaque point est une case (un mot) attendu : trouvé ou non (pas de « premier essai »).
 */
import type { LanguageExercise } from '@awform/content/types';
import { exerciseTotal } from './index.js';

export interface AttemptLite {
  exerciseId: string;
  itemIndex: number;
  correct: boolean;
  /** ordre chronologique (horodatage appareil puis identifiant) */
  order: number;
}

export interface ExerciseLite {
  id: string;
  content: LanguageExercise;
}

export type ProgressStatus = 'ouverte' | 'commencee' | 'terminee' | 'maitrisee';

export interface UnitProgress {
  status: ProgressStatus;
  score: number | null;
  bestScore: number | null;
  exercises: Array<{ id: string; total: number; firstTry: number; found: number; errors: number }>;
}

export const MASTERY_THRESHOLD = 0.8;

export function computeUnitProgress(
  exercises: readonly ExerciseLite[],
  attempts: readonly AttemptLite[],
  checklistDone: boolean,
): UnitProgress {
  const byEx = new Map<string, AttemptLite[]>();
  for (const a of [...attempts].sort((x, y) => x.order - y.order))
    byEx.set(a.exerciseId, [...(byEx.get(a.exerciseId) ?? []), a]);

  const rows = exercises.map((e) => {
    const total = exerciseTotal(e.content);
    const list = byEx.get(e.id) ?? [];
    const firstByItem = new Map<number, boolean>();
    const foundItems = new Set<number>();
    let errors = 0;
    for (const a of list) {
      if (!firstByItem.has(a.itemIndex)) firstByItem.set(a.itemIndex, a.correct);
      if (a.correct) foundItems.add(a.itemIndex);
      else errors++;
    }
    const cellType = e.content.type === 'chasse' || e.content.type === 'contient';
    const found = Math.min(foundItems.size, total);
    const firstTry = cellType ? found : [...firstByItem.values()].filter(Boolean).length;
    return {
      id: e.id,
      total,
      firstTry: Math.min(firstTry, total),
      found,
      errors,
      started: list.length > 0,
    };
  });

  const started = rows.filter((r) => r.started && r.total > 0);
  if (started.length === 0)
    return { status: 'ouverte', score: null, bestScore: null, exercises: rows.map(strip) };
  const score = started.reduce((s, r) => s + r.firstTry / r.total, 0) / started.length;
  const bestScore = started.reduce((s, r) => s + r.found / r.total, 0) / started.length;
  const complete = rows.every((r) => r.total === 0 || r.found >= r.total);
  let status: ProgressStatus = 'commencee';
  if (complete && checklistDone) status = score >= MASTERY_THRESHOLD ? 'maitrisee' : 'terminee';
  return { status, score, bestScore, exercises: rows.map(strip) };
}

function strip(r: { id: string; total: number; firstTry: number; found: number; errors: number }) {
  return { id: r.id, total: r.total, firstTry: r.firstTry, found: r.found, errors: r.errors };
}
