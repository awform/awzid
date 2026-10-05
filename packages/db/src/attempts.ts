/**
 * Enregistrement des tentatives (journal IMMUABLE, CDC §2.15 et §5.6) :
 *  - idempotent : l'identifiant (UUID généré par l'appareil) est la clé ; un doublon est ignoré ;
 *  - le serveur RECALCULE la correction avec la même bibliothèque que l'appareil (@awform/grading) et
 *    ne fait jamais confiance au résultat envoyé ;
 *  - lot F1 (revue E5) : l'événement porte l'ÉDITION du contenu que l'élève avait sous les yeux. Il est
 *    accepté si l'exercice existe dans cette édition avec cette empreinte de texte (ou, pour un appareil
 *    ancien, dans n'importe quelle édition connue) et corrigé avec CE contenu ; il garde l'empreinte du
 *    corrigé (`answer_hash`). Une édition plus récente qui ne corrige qu'une coquille ne lui retire rien ;
 *  - la progression (profil × leçon) est recalculée à partir de tous les événements : une réponse compte
 *    tant que le CORRIGÉ de son exercice (suivi par la lignée des identifiants) n'a pas changé ; un exercice
 *    dont le corrigé a changé est signalé « à refaire » (`revised`), les autres gardent leurs réponses.
 */
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { contentHash } from '@awform/content';
import type { Exercise, LanguageExercise } from '@awform/content/types';
import {
  answerKey,
  checkItem,
  computeUnitProgress,
  isLanguageExercise,
  isValidItemResponse,
  type UnitProgress,
} from '@awform/grading';
import { CONFLICT, deviceTime, hasNul, isolated, isSmallInt, REFUSED } from './bounds.js';
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
  /** code de l'édition du contenu affiché quand l'élève a répondu (lot F1 ; absent sur un appareil ancien) */
  edition?: string;
  /** version du format de l'événement (lot F1 : 2) */
  v?: number;
}

/** Progression d'une leçon + exercices dont le corrigé a changé depuis les réponses de l'élève. */
export type UnitProgressF1 = UnitProgress & { revised: string[] };

export interface AttemptResult {
  accepted: Array<{ id: string; correct: boolean | null; stale?: boolean }>;
  duplicates: string[];
  rejected: Array<{ id: string; reason: string; code?: string }>;
  progress: Record<string, UnitProgressF1>;
}

/** Codes stables de refus définitifs (l'appareil MET DE CÔTÉ ces événements, il ne les jette plus). */
export const REJECT_CODES = { perime: 'version_inconnue', invalide: 'invalide' } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empreinte du CORRIGÉ d'un exercice (règle de @awform/grading `answerKey`). */
export function answerHashOf(content: unknown): string {
  return contentHash(answerKey(content as Exercise));
}

interface Version {
  editionId: string;
  hash: string;
  answerHash: string | null;
  content: unknown;
  unitId: string;
  /** empreinte du corrigé dans l'édition SERVIE (null : exercice absent de cette édition) */
  currentKey: string | null;
}

export async function recordAttempts(
  db: Db,
  editionId: string,
  events: readonly AttemptInput[],
): Promise<AttemptResult> {
  const res: AttemptResult = { accepted: [], duplicates: [], rejected: [], progress: {} };
  const touched = new Set<string>();
  const profiles = new Set<string>();
  const stale = new Set<string>();
  // éditions connues (code → id) : publiées, retirées, et l'édition servie (même brouillon, développement)
  const editions = new Map<string, string>();
  for (const e of await db
    .select({ id: t.edition.id, code: t.edition.code, status: t.edition.status })
    .from(t.edition))
    if (e.status !== 'brouillon' || e.id === editionId) editions.set(e.code, e.id);

  for (const ev of events) {
    const reject = (reason: string, code: string = REJECT_CODES.invalide) =>
      res.rejected.push({ id: String(ev?.id ?? ''), reason, code });
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
    // édition annoncée par l'appareil (inconnue ou absente : on cherche par l'empreinte)
    const evEdition =
      typeof ev.edition === 'string' && ev.edition.length <= 60
        ? editions.get(ev.edition)
        : undefined;

    let correct: boolean | null = null;
    let exerciseId: string | null = null;
    let exerciseHash: string | null = null;
    let answerHash: string | null = null;
    let itemIndex: number | null = null;
    let response: unknown;
    let eventEditionId = evEdition ?? editionId;

    if (ev.eventType === 'reponse') {
      const v = await findVersion(db, String(ev.exerciseId ?? ''), ev.exerciseHash, [
        evEdition,
        editionId,
      ]);
      if (v === 'inconnu' || (v && v.unitId !== ev.unitId)) {
        reject('exercice inconnu');
        continue;
      }
      if (!v) {
        // aucune édition connue n'a ce texte : version jamais publiée (ou appareil corrompu)
        reject(
          'empreinte différente (contenu modifié depuis le téléchargement)',
          REJECT_CODES.perime,
        );
        continue;
      }
      const ex = v.content as LanguageExercise;
      if (!isLanguageExercise(ex)) {
        reject('type d’exercice non corrigé automatiquement');
        continue;
      }
      if (!isSmallInt(ev.itemIndex) || ev.itemIndex < 0 || !isValidItemResponse(ex, ev.response)) {
        reject('réponse invalide');
        continue;
      }
      itemIndex = ev.itemIndex as number;
      // corrigé avec le contenu QUE L'ÉLÈVE AVAIT (édition de l'événement)
      correct = checkItem(ex, itemIndex, ev.response);
      exerciseId = String(ev.exerciseId);
      exerciseHash = v.hash;
      answerHash = v.answerHash ?? answerHashOf(v.content);
      eventEditionId = v.editionId;
      response = ev.response;
      // corrigé changé depuis (édition servie) : réponse gardée, mais elle ne compte plus
      if (v.currentKey && v.currentKey !== answerHash) stale.add(ev.id);
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
      const [uv] = await db
        .select({ unitId: t.unitVersion.unitId })
        .from(t.unitVersion)
        .where(
          and(
            inArray(t.unitVersion.editionId, [...new Set([eventEditionId, editionId])]),
            eq(t.unitVersion.unitId, ev.unitId),
          ),
        )
        .limit(1);
      if (!uv) {
        reject('leçon inconnue');
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
          editionId: eventEditionId,
          unitId: ev.unitId,
          exerciseId,
          exerciseHash,
          answerHash,
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
    else if (inserted.length === 0) {
      // audit OFF-7 : un identifiant déjà pris par un AUTRE profil est un conflit, pas un doublon
      const [x] = await db
        .select({ p: t.attempt.profileId })
        .from(t.attempt)
        .where(eq(t.attempt.id, ev.id));
      if (x && x.p !== ev.profileId)
        res.rejected.push({ id: ev.id, reason: 'identifiant déjà utilisé', code: CONFLICT });
      else res.duplicates.push(ev.id);
    } else {
      res.accepted.push({ id: ev.id, correct });
      touched.add(`${ev.profileId}|${ev.unitId}`);
    }
  }

  for (const key of touched) {
    const [profileId = '', unitId = ''] = key.split('|');
    res.progress[unitId] = await refreshProgress(db, editionId, profileId, unitId);
  }
  // réponse gardée mais qui ne compte plus (corrigé changé depuis) : l'appareil peut le dire à l'élève
  for (const a of res.accepted) if (stale.has(a.id)) a.stale = true;
  return res;
}

/**
 * Version de l'exercice que l'appareil avait : d'abord dans l'édition annoncée puis l'édition servie (même
 * empreinte de texte), sinon dans toute édition connue ayant cette empreinte. `null` : empreinte inconnue ;
 * `'inconnu'` : exercice absent de toutes les éditions.
 */
async function findVersion(
  db: Db,
  exerciseId: string,
  hash: unknown,
  preferred: Array<string | undefined>,
): Promise<Version | null | 'inconnu'> {
  if (!exerciseId || exerciseId.length > 80) return 'inconnu';
  const rows = await db
    .select({
      editionId: t.exerciseVersion.editionId,
      hash: t.exerciseVersion.hash,
      answerHash: t.exerciseVersion.answerHash,
      content: t.exerciseVersion.content,
      unitId: t.exercise.unitId,
      createdAt: t.edition.createdAt,
      status: t.edition.status,
    })
    .from(t.exerciseVersion)
    .innerJoin(t.exercise, eq(t.exercise.id, t.exerciseVersion.exerciseId))
    .innerJoin(t.edition, eq(t.edition.id, t.exerciseVersion.editionId))
    .where(eq(t.exerciseVersion.exerciseId, exerciseId))
    .orderBy(desc(t.edition.createdAt));
  if (!rows.length) return 'inconnu';
  const served = rows.find((r) => r.editionId === preferred[1]);
  const currentKey = served ? (served.answerHash ?? answerHashOf(served.content)) : null;
  const same = rows.filter((r) => r.hash === hash);
  for (const ed of preferred) {
    const r = ed ? same.find((x) => x.editionId === ed) : undefined;
    if (r) return { ...r, currentKey };
  }
  const any = same.find((r) => r.status !== 'brouillon');
  return any ? { ...any, currentKey } : null;
}

/** Lignée (ancien identifiant → identifiant actuel) des exercices donnés, suivie jusqu'au bout. */
async function lineageOf(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows = await db
    .select({ from: t.exerciseLineage.fromId, to: t.exerciseLineage.toId })
    .from(t.exerciseLineage)
    .where(ne(t.exerciseLineage.kind, 'retire'));
  const next = new Map(rows.filter((r) => r.to).map((r) => [r.from, r.to!]));
  for (const id of ids) {
    let cur = id;
    for (let i = 0; i < 10 && next.has(cur); i++) cur = next.get(cur)!;
    if (cur !== id) out.set(id, cur);
  }
  return out;
}

/** Progression d'un profil pour une leçon, calculée sans rien écrire. */
export async function computeProgress(
  db: Db,
  editionId: string,
  profileId: string,
  unitId: string,
): Promise<UnitProgressF1> {
  const exs = await db
    .select({
      id: t.exerciseVersion.exerciseId,
      content: t.exerciseVersion.content,
      answerHash: t.exerciseVersion.answerHash,
    })
    .from(t.exerciseVersion)
    .innerJoin(t.exercise, eq(t.exercise.id, t.exerciseVersion.exerciseId))
    .where(and(eq(t.exerciseVersion.editionId, editionId), eq(t.exercise.unitId, unitId)))
    .orderBy(asc(t.exerciseVersion.position));
  const graded = exs.filter((e) => isLanguageExercise(e.content as LanguageExercise));
  const currentKey = new Map(graded.map((e) => [e.id, e.answerHash ?? answerHashOf(e.content)]));

  const rows = await db
    .select()
    .from(t.attempt)
    .where(and(eq(t.attempt.profileId, profileId), eq(t.attempt.unitId, unitId)))
    .orderBy(asc(t.attempt.deviceAt), asc(t.attempt.id));
  const answered = rows.filter((r) => r.eventType === 'reponse' && r.exerciseId);
  const exIds = [...new Set(answered.map((r) => r.exerciseId!))];
  const lineage = await lineageOf(db, exIds);
  // réponses anciennes sans empreinte de corrigé (avant la migration) : retrouvée par l'empreinte du texte
  const missing = answered.filter((r) => !r.answerHash);
  const keyByText = new Map<string, string>();
  if (missing.length) {
    const vs = await db
      .select({
        id: t.exerciseVersion.exerciseId,
        hash: t.exerciseVersion.hash,
        answerHash: t.exerciseVersion.answerHash,
        content: t.exerciseVersion.content,
      })
      .from(t.exerciseVersion)
      .where(
        inArray(t.exerciseVersion.exerciseId, [...new Set(missing.map((r) => r.exerciseId!))]),
      );
    for (const v of vs) keyByText.set(`${v.id}|${v.hash}`, v.answerHash ?? answerHashOf(v.content));
  }

  const counted: Array<{ exerciseId: string; itemIndex: number; correct: boolean; order: number }> =
    [];
  const staleOn = new Set<string>();
  const freshOn = new Set<string>();
  for (const r of answered) {
    const id = lineage.get(r.exerciseId!) ?? r.exerciseId!;
    const key = r.answerHash ?? keyByText.get(`${r.exerciseId}|${r.exerciseHash}`);
    const cur = currentKey.get(id);
    if (cur === undefined) continue; // exercice retiré ou non noté
    if (key !== cur) {
      staleOn.add(id);
      continue;
    }
    freshOn.add(id);
    counted.push({
      exerciseId: id,
      itemIndex: r.itemIndex ?? 0,
      correct: r.correct === 1,
      order: counted.length,
    });
  }
  const lastChecklist = [...rows].reverse().find((r) => r.eventType === 'checklist');
  const ck = lastChecklist?.response as { checked?: number; total?: number } | undefined;
  const checklistDone = !!ck && (ck.total ?? 0) > 0 && ck.checked === ck.total;

  const p = computeUnitProgress(
    graded.map((e) => ({ id: e.id, content: e.content as LanguageExercise })),
    counted,
    checklistDone,
  );
  return { ...p, revised: [...staleOn].filter((id) => !freshOn.has(id)) };
}

/** Recalcule et enregistre la progression d'un profil pour une leçon. */
export async function refreshProgress(
  db: Db,
  editionId: string,
  profileId: string,
  unitId: string,
): Promise<UnitProgressF1> {
  const p = await computeProgress(db, editionId, profileId, unitId);
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
