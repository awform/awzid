export const STATUTS_VALIDES: string[];
export function superposer(t: { pts: number[][]; retours?: number[][] }): number[][];
export function source(): {
  version: number;
  familles: Record<string, Record<string, { statut: string }>>;
  lettres: Record<string, { formes: Record<string, string> }>;
};
export function forme(
  j: ReturnType<typeof source>,
  ref: string,
  f: string,
): { statut: string } | undefined;
export function traits(): Record<string, Array<{ s: string; t: number[][] } | null>>;
export function contenu(): string;
