/** Codes d'activation imprimés (lot 23) : appels à l'API et fichier pour l'imprimeur. */
import { call } from './session';

export interface Acces {
  niveau: string;
  debut: string;
  fin: string;
}
export interface Lot {
  id: string;
  niveau: string;
  libelle: string;
  mois: number;
  quantite: number;
  utilises: number;
  revoques: number;
  creeLe: string;
}

export const myAccess = () => call<{ acces: Acces[] }>('GET', '/activation');
export const redeem = (code: string) =>
  call<{ niveau: string; jusquAu: string }>('POST', '/activation', { code });
export const listLots = () => call<{ lots: Lot[] }>('GET', '/admin/activation/lots');
export const createLot = (b: { niveau: string; quantite: number; mois: number; libelle: string }) =>
  call<{ lot: { id: string }; codes: string[] }>('POST', '/admin/activation/lots', b);
export const revokeLot = (id: string) =>
  call<{ revoques: number }>('POST', `/admin/activation/lots/${id}/revoquer`, {});

/** Fichier CSV pour l'imprimeur : une ligne par code (niveau, durée, code). */
export function printerCsv(niveau: string, mois: number, codes: readonly string[]): string {
  return ['niveau;mois;code', ...codes.map((c) => `${niveau};${mois};${c}`)].join('\r\n') + '\r\n';
}
