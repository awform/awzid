/** Motifs et réponses communs aux routes de contenu et de progression (QUA-3, repris de app.ts). */
export type Edition = () => Promise<{ id: string; code: string } | null>;

export const LEVEL_CODE = '^[a-z]{2,3}[0-9]{1,2}$';
export const UNIT_ID = '^[a-z]{2,3}[0-9]{1,2}\\.l[0-9]{2}$';
export const UUID = '^[0-9a-fA-F-]{36}$';

export function notFound(message: string) {
  return { error: { code: 'introuvable', message } };
}
