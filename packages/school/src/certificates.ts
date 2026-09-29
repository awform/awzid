/**
 * Champs des documents remis par l'école, calculés à partir de la classe, du niveau (livre + référentiel des
 * livres), des résultats et des saisies de l'enseignant. Les saisies de l'enseignant ont toujours le dernier
 * mot (sauf les champs calculés : note finale, mention, numéro, dates).
 */
import { MENTIONS, type LevelResult } from './grading.js';
import { arabicDigits, dateAr, dateFr, type CertModels } from './render.js';

export interface SchoolInfo {
  schoolName: string | null;
  schoolNameAr: string | null;
  place: string | null;
  placeAr: string | null;
}

/** Niveau du référentiel des livres (data/eval/referentiel.js, « niveaux ») — champs utiles seulement. */
export interface RefLevel {
  code: string;
  n?: number;
  titre_fr?: string;
  titre_ar?: string;
  cecrl?: string;
  heures?: number;
  mots_coran?: number;
  sourates?: string[];
}

export interface LevelCertInput {
  school: SchoolInfo;
  /** rang du niveau (1 à 10) */
  rank: number;
  /** titres du LIVRE (ce que l'élève a eu entre les mains) ; repli : référentiel */
  bookTitleFr: string | null;
  bookTitleAr: string | null;
  ref: RefLevel | null;
  result: LevelResult;
  /** date de délivrance AAAA-MM-JJ */
  day: string;
  pupilName: string;
  pupilNameAr: string | null;
  /** saisies de l'enseignant (nom complet, civilité, naissance, degrés, sourates validées…) */
  extra: Record<string, string>;
}

const COMPUTED = new Set([
  'nf',
  'mention',
  'mention_ar',
  'date',
  'date_ar',
  'n',
  'n_ar',
  'n_ar_gen',
]);

export function levelCertFields(
  input: LevelCertInput,
  models: Pick<CertModels, 'ordinaux_ar' | 'mois_ar'>,
): Record<string, string> {
  const { school, ref, result } = input;
  const m = result.mention ?? (result.decision ? MENTIONS[result.decision.code] : undefined);
  const base: Record<string, string | undefined> = {
    etablissement: school.schoolName ?? undefined,
    etablissement_ar: school.schoolNameAr ?? school.schoolName ?? undefined,
    lieu: school.place ?? undefined,
    lieu_ar: school.placeAr ?? school.place ?? undefined,
    prenom_nom: input.pupilName,
    nom_ar: input.pupilNameAr ?? (input.extra.prenom_nom?.trim() || input.pupilName),
    titre_fr: input.bookTitleFr ?? ref?.titre_fr,
    titre_ar: input.bookTitleAr ?? ref?.titre_ar,
    cecrl: ref?.cecrl,
    heures: ref?.heures !== undefined ? String(ref.heures) : undefined,
    heures_ar: ref?.heures !== undefined ? arabicDigits(ref.heures) : undefined,
    mots_coran: ref?.mots_coran !== undefined ? String(ref.mots_coran) : undefined,
    sourates: ref?.sourates?.length ? ref.sourates.join(', ') : undefined,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v) out[k] = v;
  for (const [k, v] of Object.entries(input.extra))
    if (!COMPUTED.has(k) && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
  // champs calculés (jamais saisis)
  out.n = String(input.rank);
  const acc = models.ordinaux_ar?.acc[input.rank - 1];
  const gen = models.ordinaux_ar?.gen[input.rank - 1];
  if (acc) out.n_ar = acc;
  if (gen) out.n_ar_gen = gen;
  if (result.nf !== null) out.nf = String(result.nf).replace('.', ',');
  if (m) {
    out.mention = m.fr;
    out.mention_ar = m.ar;
  }
  out.date = dateFr(input.day);
  const da = dateAr(input.day, models.mois_ar);
  if (da) out.date_ar = da;
  return out;
}

export interface HifzCertInput {
  school: SchoolInfo;
  pupilName: string;
  /** libellé du passage (« Al-Ikhlāṣ (112:1-4) ») */
  partie: string;
  validationDay: string;
  note: number;
  mention: string;
  day: string;
  extra: Record<string, string>;
}

export function hifzCertFields(input: HifzCertInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.school.schoolName) out.etablissement = input.school.schoolName;
  if (input.school.place) out.lieu = input.school.place;
  out.prenom_nom = input.pupilName;
  for (const k of ['etablissement', 'lieu', 'prenom_nom'])
    if (input.extra[k]?.trim()) out[k] = input.extra[k]!.trim().slice(0, 200);
  out.partie = input.partie;
  out.date_validation = dateFr(input.validationDay);
  out.note = String(input.note).replace('.', ',');
  out.mention = input.mention;
  out.date = dateFr(input.day);
  return out;
}

/** Mentions du barème du maître (carnets de hifẓ) en toutes lettres. */
export const HIFZ_MENTIONS: Record<string, string> = {
  excellent: 'Excellent',
  tres_bien: 'Très bien',
  bien: 'Bien',
  a_consolider: 'À consolider',
  a_reprendre: 'À reprendre',
};
