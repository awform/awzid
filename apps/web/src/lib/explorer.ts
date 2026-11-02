/**
 * Mode « tout voir » du client (2/11/2026) : liste de TOUS les niveaux et livres, rangés par piste (enfants, ados,
 * adultes, religion, religion des ados et adultes, Coran), SANS aucun verrou de progression, de positionnement,
 * d'épreuve ni d'âge. Ne manipule que du contenu (la liste publique des niveaux de l'édition) : jamais un profil, une
 * progression, une tentative ni une donnée d'élève. Un niveau dont le préfixe est inconnu est rangé dans « autres » :
 * rien n'est jamais caché.
 */
import type { LevelSummary } from './api';
import { compareNiveaux } from './levels';

/** Pistes connues, dans l'ordre d'affichage : préfixe du code de niveau → clé du nom (`niveau.filiere_<clé>`). */
export const PISTES_CONNUES: ReadonlyArray<{ prefixe: string; filiere: string }> = [
  { prefixe: 'en', filiere: 'enfants' },
  { prefixe: 'ado', filiere: 'ados' },
  { prefixe: 'ad', filiere: 'adultes' },
  { prefixe: 're', filiere: 'religion' },
  { prefixe: 'ra', filiere: 'religion_ra' },
  { prefixe: 'qc', filiere: 'coran' },
];

export interface Piste {
  /** préfixe des codes (« en », « ado »…) ; « autres » pour un préfixe inconnu */
  id: string;
  /** clé du nom de la piste (`niveau.filiere_<filiere>`) ; null pour « autres » */
  filiere: string | null;
  niveaux: LevelSummary[];
}

/** Préfixe d'un code de niveau (« ado3 » → « ado »), null si le code n'a pas la forme `<lettres><n>`. */
export const prefixeDe = (code: string): string | null => /^([a-z]+?)\d+$/.exec(code)?.[1] ?? null;

/** Toutes les pistes présentes, chacune avec tous ses niveaux (tri naturel), chaque niveau une seule fois. */
export function pistesDeNiveaux(levels: readonly LevelSummary[]): Piste[] {
  const connues = new Set(PISTES_CONNUES.map((p) => p.prefixe));
  const parPiste = new Map<string, LevelSummary[]>();
  for (const l of levels) {
    const p = prefixeDe(l.code);
    const id = p && connues.has(p) ? p : 'autres';
    parPiste.set(id, [...(parPiste.get(id) ?? []), l]);
  }
  const rang = (l: LevelSummary) => l.code;
  const tri = (a: LevelSummary, b: LevelSummary) => compareNiveaux(rang(a), rang(b));
  const pistes: Piste[] = PISTES_CONNUES.filter((p) => parPiste.has(p.prefixe)).map((p) => ({
    id: p.prefixe,
    filiere: p.filiere,
    niveaux: [...parPiste.get(p.prefixe)!].sort(tri),
  }));
  if (parPiste.has('autres'))
    pistes.push({ id: 'autres', filiere: null, niveaux: [...parPiste.get('autres')!].sort(tri) });
  return pistes;
}
