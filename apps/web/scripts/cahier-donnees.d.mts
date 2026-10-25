export const NIVEAUX_CAHIER: string[];
export const NIVEAUX_JEUX: string[];
export function convertir(src: unknown, niveau: string, garde?: string[], audio?: unknown): unknown;
export function concordance(cahier: unknown, niveau: string): Record<string, number[]>;
