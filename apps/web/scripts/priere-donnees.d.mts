export const SOURCE: string;
export const SORTIE: string;
export function nettoyerSource(s: string): string;
export function projeter<T>(o: T): T;
export function parcourir(o: unknown, f: (o: Record<string, unknown>) => void): void;
export function trouver(racine: unknown, id: string): Record<string, unknown> | null;
export function fabriquer(
  priere: unknown,
  sourates: unknown,
  animation: unknown,
): Record<string, unknown>;
export function serialiser(o: unknown): string;
export function ecrire(): { fichiers: number; octets: number };
