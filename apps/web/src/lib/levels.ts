/**
 * Libellés des niveaux et des carnets de hifẓ à partir de leur code (en3, ad2, ado1, re1, ra2…) : les livres
 * GELÉS s'ajoutent à l'édition sans toucher à l'interface (lot 16).
 */
import { t } from './i18n';

const TRACKS: Array<[string, string]> = [
  ['ado', 'ados'],
  ['ad', 'adultes'],
  ['en', 'enfants'],
  ['re', 'religion'],
  ['ra', 'religion_ra'],
  ['qc', 'coran'],
];

export function levelParts(code: string): { track: string; n: number } | null {
  const m = /^([a-z]+?)(\d+)$/.exec(code);
  if (!m) return null;
  const track = TRACKS.find(([p]) => p === m[1])?.[1];
  return track ? { track, n: Number(m[2]) } : null;
}

export function levelLabel(code: string): string {
  const p = levelParts(code);
  return p ? t('niveau.nom', { filiere: t(`niveau.filiere_${p.track}`), n: p.n }) : code;
}

export function carnetLabel(code: string): string {
  const p = levelParts(code);
  return p ? t('hifz.carnet_nom', { filiere: t(`niveau.filiere_${p.track}`), n: p.n }) : code;
}

/** Livres d'arabe qu'un profil peut suivre : enfants et ados pour un mineur, adultes pour un adulte. */
export function levelFitsProfile(
  code: string,
  kind: 'enfant' | 'ado' | 'adulte' | string,
): boolean {
  const p = levelParts(code);
  if (!p) return false;
  if (kind === 'adulte') return p.track === 'adultes';
  return p.track === 'enfants' || p.track === 'ados';
}
