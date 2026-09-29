/**
 * Tuteur (lot 9) : appels à l'API. Le client n'interprète AUCUN texte du tuteur comme du Coran : les
 * versets arrivent en segments « coran » déjà rendus (Tanzil) par le serveur.
 */
import { call } from './session';

export type Segment =
  | { t: 'texte'; v: string }
  | { t: 'coran'; ref: string; s: number; from: number; to: number; text: string }
  | {
      t: 'registre';
      id: string;
      recueil?: string;
      numero?: string;
      degre?: string;
      texteAr?: string;
    }
  | { t: 'explication'; id: string; texteFr: string; ar?: string; source: string };

export interface TutorStatus {
  mode: 'off' | 'local' | 'simule' | 'claude';
  disponible: boolean;
  fournisseur: string | null;
  reel: boolean;
  bloque?: string;
}

export interface TutorAnswer {
  logId: string;
  audience: 'enfant' | 'ado' | 'adulte';
  decision: 'repondre' | 'transmettre' | 'recadrer' | 'proteger';
  route: string;
  segments: Segment[];
  transmise: boolean;
  refus?: string;
  ia: boolean;
  fournisseur: string;
}

export interface TutorQuestion {
  id: string;
  unitId: string | null;
  text: string;
  status: 'en_attente' | 'repondue';
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

export const tutorStatus = () => call<TutorStatus>('GET', '/tutor/status');

export function ask(
  profileId: string,
  body: {
    unitId: string;
    action: 'indice' | 'explique' | 'lecon' | 'mot' | 'question';
    text?: string;
    word?: string;
  },
) {
  return call<TutorAnswer>('POST', `/tutor/${profileId}/ask`, {
    ...body,
    hour: new Date().getHours(),
  });
}

export const myQuestions = (profileId: string) =>
  call<{ questions: TutorQuestion[] }>('GET', `/tutor/${profileId}/questions`);

export const journal = (profileId: string) =>
  call<{
    consentement: boolean;
    audience: string;
    journal: Array<{
      id: string;
      unitId: string | null;
      action: string;
      question: string | null;
      decision: string;
      route: string;
      segments: Segment[] | null;
      refused: string | null;
      provider: string;
      reportedAt: string | null;
      createdAt: string;
    }>;
  }>('GET', `/tutor/${profileId}/journal`);

export const report = (profileId: string, logId: string) =>
  call<{ ok: boolean }>('POST', `/tutor/${profileId}/journal/${logId}/signaler`, {});

/** accord au tuteur IA : code parent exigé par le serveur (audit MIN-4 / SEC-3) */
export const setConsent = (profileId: string, actif: boolean, pin = '') =>
  call<{ actif: boolean }>(
    'PUT',
    `/profiles/${profileId}/tuteur`,
    { actif },
    pin ? { 'x-parent-pin': pin } : undefined,
  );

export const teacherQuestions = () =>
  call<{
    questions: Array<{
      id: string;
      pseudonym: string;
      className: string;
      unitId: string | null;
      text: string;
      motif: string;
      createdAt: string;
    }>;
  }>('GET', '/teacher/questions');

export const answerQuestion = (id: string, answer: string) =>
  call<{ ok: boolean }>('POST', `/teacher/questions/${id}/answer`, { answer });

/** moins de 13 ans : boutons seulement (le serveur le vérifie aussi) */
export function isChild(p: { kind: string; birthYear: number | null } | null): boolean {
  if (!p) return true;
  if (p.kind === 'adulte') return false;
  if (!p.birthYear) return true;
  return new Date().getFullYear() - p.birthYear < 13;
}
