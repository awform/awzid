/**
 * Collection ra* (ados/adultes), décisions du 04/10/2026 : réponse proposée d'un cas pratique non résolu pour un
 * adulte autonome (après sa propre réponse). Appels à l'API ; la règle est appliquée par le serveur.
 */
import { call } from './session';

export interface CasVu {
  texte: string;
  reponse: string;
}

/** référence d'un cas : rubrique et position dans la leçon */
export const casRef = (rubrique: number, cas: number) => `r${rubrique}c${cas}`;

export const loadCas = (profileId: string, unitId: string, ref: string) =>
  call<CasVu>('GET', `/profiles/${profileId}/cas/${unitId}/${ref}`);
/** carnet personnel ra* (adulte, sans signature) : une ligne par leçon, cochée quand c'est fait */
export interface CarnetPersoLigne {
  unitId: string;
  niveau: string;
  ar: string;
  fr: string;
  coche: boolean;
}
export const loadCarnetPerso = (profileId: string) =>
  call<{ lignes: CarnetPersoLigne[] }>('GET', `/profiles/${profileId}/carnet-perso`);
export const setCarnetPerso = (profileId: string, unitId: string, coche: boolean) =>
  call<{ unitId: string; coche: boolean }>('PUT', `/profiles/${profileId}/carnet-perso/${unitId}`, {
    coche,
  });

export const sendCas = (profileId: string, unitId: string, ref: string, texte: string) =>
  call<CasVu>('POST', `/profiles/${profileId}/cas/${unitId}/${ref}`, { texte });
