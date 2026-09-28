import { error } from '@sveltejs/kit';
import { t } from './i18n';
import type { Lesson, UnitKind } from '@awform/content/types';

export interface LevelSummary {
  code: string;
  track: string;
  rank: number;
  titleFr: string | null;
  codeFr: string | null;
  niveauFr: string | null;
  titreAr: string | null;
  units: number;
}

export interface UnitSummary {
  id: string;
  n: number;
  kind: UnitKind;
  numLecon: number | null;
  numBilan: number | null;
  titleAr: string;
  titleFr: string;
}

export interface UnitDetail extends UnitSummary {
  levelCode: string;
  sha256: string;
  lesson: Lesson;
  exercises: Array<{ id: string; position: number; type: string; hash: string }>;
}

/** Appel de l'API (même origine : /api/v1/...). */
export async function api<T>(fetchFn: typeof fetch, path: string): Promise<T> {
  const r = await fetchFn(`/api/v1${path}`, { headers: { accept: 'application/json' } });
  if (!r.ok) {
    let msg = t('erreur.http', { status: r.status });
    try {
      msg = ((await r.json()) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      /* réponse non JSON */
    }
    error(r.status === 404 ? 404 : 502, msg);
  }
  return (await r.json()) as T;
}

/** Libellé affiché d'une unité : « Leçon N », « Bilan k », « Examen de fin de niveau ». */
export function unitLabel(u: Pick<UnitSummary, 'kind' | 'numLecon' | 'numBilan' | 'n'>): string {
  if (u.kind === 'bilan') return t('unite.bilan', { n: u.numBilan ?? '' }).trim();
  if (u.kind === 'examen') return t('unite.examen');
  return t('unite.lecon', { n: u.numLecon ?? u.n });
}

/** Taille du corps arabe selon le niveau (CDC §1.4) : 30 px en E1-E2, 26 px en E3-N1, 22 px au-delà. */
export function arabicSize(levelCode: string): number {
  const m = /^([a-z]+)(\d+)$/.exec(levelCode);
  const track = m?.[1] ?? '';
  const n = Number(m?.[2] ?? 0);
  if (track === 'en') return n <= 2 ? 30 : 26;
  if (track === 'ad' || track === 'ado') return n <= 1 ? 26 : 22;
  return 22;
}
