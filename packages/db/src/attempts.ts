/**
 * Enregistrement des tentatives (journal IMMUABLE, CDC §2.15 et §5.6) :
 *  - idempotent : l'identifiant (UUID généré par l'appareil) est la clé ; un doublon est ignoré ;
 *  - le serveur RECALCULE la correction avec la même bibliothèque que l'appareil (@awform/grading) et
 *    ne fait jamais confiance au résultat envoyé ; l'événement est rattaché à l'édition et à l'empreinte
 *    de l'exercice ; une empreinte différente (contenu changé) est refusée ;
 *  - la progression (profil × leçon) est recalculée à partir de tous les événements.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { LanguageExercise } from '@awform/content/types';
import {
  checkItem,
  computeUnitProgress,
  isLanguageExercise,
  isValidItemResponse,
  type UnitProgress,
} from '@awform/grading';
import { deviceTime, hasNul, isolated, isSmallInt, REFUSED } from './bounds.js';
import type { Db } from './client.js';
import * as t from './schema.js';

export interface AttemptInput {
  id: string;
  profileId: string;
  unitId: string;
  /** « reponse » (réponse à un item) ou « checklist » (auto-évaluation) */
  eventType: 'reponse' | 'checklist';
  exerciseId?: string;
  exerciseHash?: string;
  itemIndex?: number;
  response: unknown;
  deviceAt: string;
  deviceId?: string;
}

export interface AttemptResult {
  accepted: Array<{ id: string; correct: boolean | null }>;
  duplicates: string[];
  rejected: Array<{ id: string; reason: string }>;
  progress: Record<string, UnitProgress>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordAttempts(
  db: Db,
  editionId: string,
  events: readonly AttemptInput[],
): Promise<AttemptResult> {
  const res: AttemptResult = { accepted: [], duplicates: [], rejected: [], progress: {} };
  const touched = new Set<string>();
  const profiles = new Set<string>();

  for (const ev of events) {
    const reject = (reason: string) => res.rejected.push({ id: String(ev?.id ?? ''), reason });
    if (!ev || typeof ev.id !== 'string' || !UUID.test(ev.id)) {
      reject('identifiant invalide');
      continue;
    }
    if (typeof ev.profileId !== 'string' || !UUID.test(ev.profileId)) {
      reject('profil invalide');
      continue;
    }
    const deviceAt = deviceTime(ev.deviceAt);
    if (!deviceAt) {
      reject('horodatage invalide');
      continue;
    }
    if (hasNul(ev.response) || typeof ev.unitId !== 'string' || ev.unitId.length > 40) {
      reject('données invalides');
      continue;
    }
    if (!profiles.has(ev.profileId)) {
      const p = await db
        .select({ id: t.profile.id })
        .from(t.profile)
        .where(eq(t.profile.id, ev.profileId));
      if (!p[0]) {
        reject('profil inconnu');
        continue;
      }
      profiles.add(ev.profileId);
    }
    const [uv] = await db
      .select({ unitId: t.unitVersion.unitId })
      .from(t.unitVersion)
      .where(
        and(eq(t.unitVersion.editionId, editionId), eq(t.unitVersion.unitId, String(ev.unitId))),
      );
    if (!uv) {
      reject('leçon inconnue');
      continue;
    }

    let correct: boolean | null = null;
    let exerciseId: string | null = null;
    let exerciseHash: string | null = null;
    let itemIndex: number | null = null;
    let response: unknown;

    if (ev.eventType === 'reponse') {
      const [xv] = await db
        .select({
          hash: t.exerciseVersion.hash,
          content: t.exerciseVersion.content,
          unitId: t.exercise.unitId,
        })
        .from(t.exerciseVersion)
        .innerJoin(t.exercise, eq(t.exercise.id, t.exerciseVersion.exerciseId))
        .where(
          and(
            eq(t.exerciseVersion.editionId, editionId),
            eq(t.exerciseVersion.exerciseId, String(ev.exerciseId)),
          ),
        );
      if (!xv || xv.unitId !== ev.unitId) {
        reject('exercice inconnu');
        continue;
      }
      if (xv.hash !== ev.exerciseHash) {
        reject('empreinte différente (contenu modifié depuis le téléchargement)');
        continue;
      }
      const ex = xv.content as LanguageExercise;
      if (!isLanguageExercise(ex)) {
        reject('type d’exercice non corrigé automatiquement');
        continue;
      }
      if (!isSmallInt(ev.itemIndex) || ev.itemIndex < 0 || !isValidItemResponse(ex, ev.response)) {
        reject('réponse invalide');
        continue;
      }
      itemIndex = ev.itemIndex as number;
      correct = checkItem(ex, itemIndex, ev.response);
      exerciseId = String(ev.exerciseId);
      exerciseHash = xv.hash;
      response = ev.response;
    } else if (ev.eventType === 'checklist') {
      const r = ev.response as { checked?: unknown; total?: unknown } | null;
      if (
        !r ||
        !Number.isInteger(r.checked) ||
        !Number.isInteger(r.total) ||
        (r.checked as number) < 0 ||
        (r.checked as number) > (r.total as number) ||
        (r.total as number) > 1000
      ) {
        reject('auto-évaluation invalide');
        continue;
      }
      response = { checked: r.checked, total: r.total };
    } else {
      reject('type d’événement inconnu');
      continue;
    }

    const inserted = await isolated(() =>
      db
        .insert(t.attempt)
        .values({
          id: ev.id,
          profileId: ev.profileId,
          editionId,
          unitId: ev.unitId,
          exerciseId,
          exerciseHash,
          itemIndex,
          eventType: ev.eventType,
          response,
          correct: correct === null ? null : correct ? 1 : 0,
          total: correct === null ? null : 1,
          score: correct === null ? null : correct ? 1 : 0,
          deviceAt,
          deviceId: typeof ev.deviceId === 'string' ? ev.deviceId.slice(0, 64) : null,
        })
        .onConflictDoNothing({ target: t.attempt.id })
        .returning({ id: t.attempt.id }),
    );
    if (inserted === REFUSED) reject('données invalides');
    else if (inserted.length === 0) res.duplicates.push(ev.id);
    else {
      res.accepted.push({ id: ev.id, correct });
      touched.add(`${ev.profileId}|${ev.unitId}`);
    }
  }

  for (const key of touched) {
    const [profileId = '', unitId = ''] = key.split('|');
    res.progress[unitId] = await refreshProgress(db, editionId, profileId, unitId);
  }
  return res;
}

/** Recalcule et enregistre la progression d'un profil pour une leçon. */
export async function refreshProgress(
  db: Db,
  editionId: string,
  profileId: string,
  unitId: string,
): Promise<UnitProgress> {
  const exs = await db
    .select({ id: t.exercise.id, content: t.exerciseVersion.content })
    .from(t.exerciseVersion)
    .innerJoin(t.exercise, eq(t.exercise.id, t.exerciseVersion.exerciseId))
    .where(and(eq(t.exerciseVersion.editionId, editionId), eq(t.exercise.unitId, unitId)))
    .orderBy(asc(t.exercise.position));
  const graded = exs.filter((e) => isLanguageExercise(e.content as LanguageExercise));
  const hashes = await db
    .select({ id: t.exerciseVersion.exerciseId, hash: t.exerciseVersion.hash })
    .from(t.exerciseVersion)
    .where(eq(t.exerciseVersion.editionId, editionId));
  const currentHash = new Map(hashes.map((h) => [h.id, h.hash]));

  const rows = await db
    .select()
    .from(t.attempt)
    .where(and(eq(t.attempt.profileId, profileId), eq(t.attempt.unitId, unitId)))
    .orderBy(asc(t.attempt.deviceAt), asc(t.attempt.id));
  // seules comptent les réponses données sur le contenu ACTUEL de l'exercice (même empreinte)
  const answers = rows
    .filter(
      (r) =>
        r.eventType === 'reponse' &&
        r.exerciseId &&
        currentHash.get(r.exerciseId) === r.exerciseHash,
    )
    .map((r, i) => ({
      exerciseId: r.exerciseId ?? '',
      itemIndex: r.itemIndex ?? 0,
      correct: r.correct === 1,
      order: i,
    }));
  const lastChecklist = [...rows].reverse().find((r) => r.eventType === 'checklist');
  const ck = lastChecklist?.response as { checked?: number; total?: number } | undefined;
  const checklistDone = !!ck && (ck.total ?? 0) > 0 && ck.checked === ck.total;

  const p = computeUnitProgress(
    graded.map((e) => ({ id: e.id, content: e.content as LanguageExercise })),
    answers,
    checklistDone,
  );
  await db
    .insert(t.progress)
    .values({
      profileId,
      unitId,
      status: p.status,
      score: p.score,
      bestScore: p.bestScore,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [t.progress.profileId, t.progress.unitId],
      set: { status: p.status, score: p.score, bestScore: p.bestScore, updatedAt: new Date() },
    });
  return p;
}

export async function levelProgress(db: Db, profileId: string, unitIds: string[]) {
  if (unitIds.length === 0) return [];
  return db
    .select({
      unitId: t.progress.unitId,
      status: t.progress.status,
      score: t.progress.score,
      bestScore: t.progress.bestScore,
    })
    .from(t.progress)
    .where(and(eq(t.progress.profileId, profileId), inArray(t.progress.unitId, unitIds)))
    .orderBy(desc(t.progress.updatedAt));
}

// ------------------------------------------------------------------ profils de démonstration (développement)

/** Identifiants FIXES des profils fictifs de démonstration (aucune donnée personnelle). */
export const DEMO = {
  account: '00000000-0000-7000-8000-00000000a001',
  enfant: '00000000-0000-7000-8000-00000000c001',
  adulte: '00000000-0000-7000-8000-00000000c002',
} as const;

/** Crée (une fois) un compte parent fictif avec un profil enfant (en1) et un profil adulte (ad1). */
export async function seedDemo(db: Db): Promise<void> {
  await db
    .insert(t.account)
    .values({ id: DEMO.account, kind: 'parent', country: 'FR' })
    .onConflictDoNothing();
  await db
    .insert(t.profile)
    .values([
      {
        id: DEMO.enfant,
        ownerAccountId: DEMO.account,
        kind: 'enfant',
        pseudonym: 'Profil de démonstration (enfant)',
        avatar: 'etoile',
        levelCode: null,
      },
      {
        id: DEMO.adulte,
        ownerAccountId: DEMO.account,
        kind: 'adulte',
        pseudonym: 'Profil de démonstration (adulte)',
        avatar: 'lune',
        levelCode: null,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(t.guardianship)
    .values({
      parentAccountId: DEMO.account,
      profileId: DEMO.enfant,
      consentAt: new Date('2026-09-28T00:00:00Z'),
    })
    .onConflictDoNothing();
}
