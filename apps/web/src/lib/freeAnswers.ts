/**
 * Réponses libres envoyées à l'enseignant (lot 18) : classes du profil et réponses déjà envoyées, chargées
 * une fois par profil et par page (plusieurs exercices ouverts dans une même leçon).
 */
import { call } from './session';

export type Appreciation = 'acquis' | 'en_cours' | 'a_reprendre';
export interface FreeAnswer {
  id: string;
  classId: string;
  exerciseId: string;
  itemIndex: number;
  answer: string;
  sentAt: string;
  appreciation: Appreciation | null;
  comment: string | null;
  correctedAt: string | null;
}
export interface FreeAnswerState {
  classes: Array<{ id: string; name: string }>;
  reponses: FreeAnswer[];
}

const cache = new Map<string, Promise<FreeAnswerState | null>>();

export function loadFreeAnswers(profileId: string, fresh = false): Promise<FreeAnswerState | null> {
  if (fresh || !cache.has(profileId))
    cache.set(
      profileId,
      call<FreeAnswerState>('GET', `/profiles/${profileId}/reponses-libres`).then((r) =>
        r.ok ? r.data : null,
      ),
    );
  return cache.get(profileId)!;
}

export async function sendFreeAnswer(
  profileId: string,
  body: { classId: string; exerciseId: string; itemIndex: number; answer: string },
  pin: string,
) {
  const r = await call<{ reponse: { id: string } }>(
    'POST',
    `/profiles/${profileId}/reponses-libres`,
    body,
    pin ? { 'x-parent-pin': pin } : undefined,
  );
  if (r.ok) await loadFreeAnswers(profileId, true);
  return r;
}
