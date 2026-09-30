/**
 * Messagerie encadrée et visio (lot 21) : appels à l'API. Aucun contenu n'est gardé sur l'appareil (pas de
 * cache hors ligne des messages : ils ne concernent que l'adulte et l'enseignant).
 */
import { call } from './session';

export interface MessageView {
  id: string;
  kind: 'prive' | 'annonce';
  deMoi: boolean;
  texte: string | null;
  retire: boolean;
  piece: { nom: string; type: string } | null;
  le: string;
  lu: boolean;
}
export interface FilResume {
  id: string;
  profileId: string;
  pseudonym: string;
  lastAt: string;
  classe?: string;
  classId?: string;
  nonLus?: number;
}
export interface Visio {
  id: string;
  classe?: string;
  titre: string;
  debut: string;
  dureeMin: number;
  service: string;
  url: string | null;
}

export interface ClassVisio {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  canceledAt: string | null;
  provider: string;
  url: string;
}

export const familyMessages = () =>
  call<{ annonces: MessageView[]; fils: FilResume[]; aide: string }>('GET', '/famille/messages');
export const classMessages = (classId: string) =>
  call<{ annonces: MessageView[]; fils: FilResume[] }>('GET', `/ecole/classes/${classId}/messages`);
export const readThread = (id: string) =>
  call<{ fil: string; role: string; messages: MessageView[] }>('GET', `/fils/${id}`);
export const replyThread = (id: string, texte: string) =>
  call('POST', `/fils/${id}/messages`, { texte });
export const announce = (classId: string, texte: string) =>
  call('POST', `/ecole/classes/${classId}/annonces`, { texte });
export const writeToFamily = (classId: string, profileId: string, texte: string) =>
  call<{ fil: string }>('POST', `/ecole/classes/${classId}/eleves/${profileId}/messages`, {
    texte,
  });
export const report = (id: string, motif: string) =>
  call<{ ok: boolean; aide: string }>('POST', `/messages/${id}/signaler`, { motif });
export const profileVisios = (profileId: string) =>
  call<{ visios: Visio[] }>('GET', `/profiles/${profileId}/visios`);
export const classVisios = (classId: string) =>
  call<{ visios: ClassVisio[] }>('GET', `/ecole/classes/${classId}/visios`);
export const planVisio = (
  classId: string,
  v: { titre: string; debut: string; dureeMin: number; url: string },
) => call('POST', `/ecole/classes/${classId}/visios`, v);
export const cancelVisio = (id: string) => call('POST', `/ecole/visios/${id}/annuler`, {});
