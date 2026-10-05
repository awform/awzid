/**
 * Niveaux, filières et MATIÈRES (lot F2, revue d'architecture E8) : UNE seule source pour l'importeur, l'API et
 * l'interface (avant : deux expressions régulières recopiées dans `db/import.ts` et `web/lib/levels.ts`).
 * Le code d'un niveau est définitif (en1, ad3, ado2, re1, ra2, qc1) ; sa matière en découle.
 */

/** Matières : chaque élève a un niveau courant PAR matière (table profile_level). */
export const SUBJECTS = ['arabe', 'sciences', 'coran', 'ecriture'] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface TrackInfo {
  /** préfixe du code (en, ad, ado…) */
  prefix: string;
  /** filière en base (`level.track`) */
  track: string;
  /** clé de libellé de l'interface (`niveau.filiere_<key>`) */
  key: string;
  subject: Subject;
  /** public visé : livres des enfants, des ados, des adultes */
  public: 'enfants' | 'ados' | 'adultes' | 'tous';
}

/** Ordre important : « ado » avant « ad ». */
export const TRACKS: readonly TrackInfo[] = [
  { prefix: 'ado', track: 'ados', key: 'ados', subject: 'arabe', public: 'ados' },
  { prefix: 'ad', track: 'adultes', key: 'adultes', subject: 'arabe', public: 'adultes' },
  { prefix: 'en', track: 'enfants', key: 'enfants', subject: 'arabe', public: 'enfants' },
  { prefix: 're', track: 'religion', key: 'religion', subject: 'sciences', public: 'enfants' },
  {
    prefix: 'ra',
    track: 'religion-ra',
    key: 'religion_ra',
    subject: 'sciences',
    public: 'adultes',
  },
  { prefix: 'qc', track: 'coran', key: 'coran', subject: 'coran', public: 'tous' },
];

export function levelParts(code: string): (TrackInfo & { n: number }) | null {
  const m = /^([a-z]+?)(\d{1,2})$/.exec(code);
  if (!m) return null;
  const tr = TRACKS.find((x) => x.prefix === m[1]);
  return tr ? { ...tr, n: Number(m[2]) } : null;
}

/** Filière en base (`level.track`) ; « autre » si le code est inconnu. */
export function trackOf(code: string): string {
  return levelParts(code)?.track ?? 'autre';
}

/** Matière d'un niveau (null : code inconnu). */
export function subjectOf(code: string): Subject | null {
  return levelParts(code)?.subject ?? null;
}

/** Niveau voisin dans la même filière (en2 → en3 ; null au-delà des bornes). */
export function neighbourLevel(
  code: string,
  delta: number,
  known?: readonly string[],
): string | null {
  const p = levelParts(code);
  if (!p) return null;
  const n = p.n + delta;
  if (n < 1) return null;
  const next = `${p.prefix}${n}`;
  return !known || known.includes(next) ? next : null;
}

/** Type de profil d'après l'ANNÉE de naissance (revue E4 : recalculé à chaque lecture, jamais figé). */
export function profileKindFromYear(
  birthYear: number | null | undefined,
  now = new Date(),
): 'enfant' | 'ado' | 'adulte' | null {
  if (!birthYear) return null;
  // année seulement (minimisation) : âge « au plus bas » de l'année, comme `ageFromYear` (audit MIN-2)
  const age = now.getUTCFullYear() - birthYear - 1;
  return age < 13 ? 'enfant' : age < 18 ? 'ado' : 'adulte';
}

/**
 * Mots du Coran (décision du client, 05/10/2026) : chaque lemme est rattaché au NIVEAU DE LIVRE qui l'enseigne
 * (données des livres `mots_coran_1000.json` : `niveau_enfants` E1-E5, `niveau_adultes` A1-A10). Aucune
 * hiérarchie propre : « E3 » → en3, « A7 » → ad7.
 */
export function lemmaLevelCode(v: string | null | undefined): string | null {
  const m = /^\s*([EA])(\d{1,2})\s*$/.exec(v ?? '');
  if (!m) return null;
  return `${m[1] === 'E' ? 'en' : 'ad'}${Number(m[2])}`;
}
