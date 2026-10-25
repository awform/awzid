/**
 * Hifẓ en classe (25/10/2026) — client typé de l'API (maître : séances et erreurs ; élève adulte : enregistrement ; famille :
 * suivi). Aucun enregistrement en mode « direct » : ce module n'ouvre JAMAIS le micro côté maître.
 */
import { call } from '$lib/session';

export const TYPES = ['oubli', 'ajout', 'changement', 'tajwid'] as const;
export type Type = (typeof TYPES)[number];
export interface Erreur {
  a: number;
  k: number;
  t: Type;
}
export interface Compte {
  oubli: number;
  ajout: number;
  changement: number;
  tajwid: number;
}
export interface SeanceVue {
  id: string;
  classId: string;
  className: string;
  profileId: string;
  pseudonym: string;
  mode: 'direct' | 'enregistrement';
  sura: number;
  from: number;
  to: number;
  status: 'en_cours' | 'terminee';
  outcome: 'validee' | 'a_reprendre' | null;
  remark: string | null;
  createdAt: string;
  finishedAt: string | null;
  erreurs: Compte;
}
export interface ElevesEtat {
  classe: { id: string; name: string };
  eleves: Array<{ id: string; pseudonym: string; kind: 'enfant' | 'ado' | 'adulte' }>;
  enregistrements: Array<{
    id: string;
    profileId: string;
    pseudonym: string;
    part: string;
    createdAt: string;
    expiresAt: string;
    annotee: boolean;
  }>;
  seances: SeanceVue[];
}
export interface SeanceDetail {
  seance: {
    id: string;
    classId: string;
    profileId: string;
    mode: 'direct' | 'enregistrement';
    sura: number;
    from: number;
    to: number;
    status: 'en_cours' | 'terminee';
    outcome: string | null;
    remark: string | null;
    recitationId: string | null;
  };
  erreurs: Erreur[];
}

export const total = (c: Compte) => c.oubli + c.ajout + c.changement + c.tajwid;

export const eleves = (classId: string) =>
  call<ElevesEtat>('GET', `/ecole/classes/${classId}/hifz/eleves`);
export const creerSeance = (
  classId: string,
  body: {
    profileId: string;
    mode: 'direct' | 'enregistrement';
    sura: number;
    from: number;
    to: number;
    recitationId?: string;
  },
) =>
  call<{ seance: { id: string; mode: string } }>(
    'POST',
    `/ecole/classes/${classId}/hifz/seances`,
    body,
  );
export const seance = (sid: string) => call<SeanceDetail>('GET', `/ecole/hifz/seances/${sid}`);
export const enregistrerErreurs = (sid: string, erreurs: Erreur[]) =>
  call<{ n: number }>('PUT', `/ecole/hifz/seances/${sid}/erreurs`, { erreurs });
export const terminer = (sid: string, issue: 'validee' | 'a_reprendre', remarque?: string) =>
  call<{ ok: boolean; q: number; erreurs: Compte }>('POST', `/ecole/hifz/seances/${sid}/terminer`, {
    issue,
    ...(remarque?.trim() ? { remarque: remarque.trim() } : {}),
  });

export interface EleveEtat {
  adulte: boolean;
  disponible: boolean;
  accord: boolean;
  conservationMaxJours: number;
  classes: Array<{ id: string; name: string; jours: number }>;
  enregistrements: Array<{
    id: string;
    part: string;
    createdAt: string;
    expiresAt: string;
    listenedAt: string | null;
    gradedAt: string | null;
  }>;
  suivi: SeanceVue[];
}
export const etatEleve = (profileId: string) =>
  call<EleveEtat>('GET', `/profiles/${profileId}/hifz-classe`);
export const suiviFamille = (profileId: string) =>
  call<{ seances: SeanceVue[] }>('GET', `/profiles/${profileId}/hifz-classe/suivi`);
export const accord = (profileId: string) =>
  call<{ ok: boolean }>('POST', `/profiles/${profileId}/recitations/accord`, {});
export const supprimerEnregistrement = (profileId: string, rid: string) =>
  call<{ ok: boolean }>('DELETE', `/profiles/${profileId}/recitations/${rid}`);

/** Portion « 112:1-4 » ou « 112:3 » → sourate, premier et dernier versets (ou null). */
export function portionDe(part: string): { s: number; from: number; to: number } | null {
  const m = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(part);
  if (!m) return null;
  return { s: Number(m[1]), from: Number(m[2]), to: Number(m[3] ?? m[2]) };
}
