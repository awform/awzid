// Types de l'outil A34 (pour les tests de apps/web) — implémentation : qf-lignes.mjs
import type { ExactFile } from '../../../apps/web/src/lib/quran/mushaf-exact.ts';

export type Row = Record<string, unknown>;
export interface Tanzil {
  map: Map<string, string>;
  lengths: number[];
  basmala: string;
}
export interface Mutation {
  type: string;
  resource_group?: string;
  record_type?: string;
  record_key?: string;
  data?: Row | null;
  snapshot_url?: string;
}
export const QF: Record<'prelive' | 'production', { oauth: string; api: string }>;
export const DEFAULT_MUSHAF: number;
export function readTanzil(path: string): Tanzil;
export function readPageStarts(path: string): [number, number][];
export function rowKind(row: Row): 'word' | 'page' | 'mushaf' | 'autre';
export function snapshotRows(snapshot: { records?: unknown[] }): Map<string, Row>;
export function applyMutation(
  rows: Map<string, Row>,
  m: Mutation,
  fetchSnapshot: (url: string) => Promise<{ records?: unknown[] }>,
): Promise<string>;
export function buildExactFile(
  rows: Map<string, Row>,
  lengths: readonly number[],
  source: ExactFile['source'],
): { file: ExactFile; unknown: unknown[] };
export function verify(
  file: ExactFile,
  o: { tanzil: Tanzil; pageStarts?: [number, number][]; fontsDir?: string | null },
): string[];
export function publish(
  dir: string,
  file: ExactFile,
): { sha256: string; version: string; pages: number; bytes: { total: number; pages: number } };
export function apiUrl(env: 'prelive' | 'production', path: string): string;
export function syncOnce(o: {
  env: 'prelive' | 'production';
  mushafId: number;
  state: { syncToken?: string };
  rows: Map<string, Row>;
  fetchImpl?: typeof fetch;
}): Promise<{ syncToken: string | null; actions: Record<string, number> }>;
export function mushafRecord(rows: Map<string, Row>): Row | null;
export function checkMushafRecord(m: Row | null): string | null;
export function fontChecker(dir: string): (p: number, cp: number) => boolean;
