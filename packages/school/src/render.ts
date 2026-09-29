/**
 * Certificats et attestations : remplissage des MODÈLES DES LIVRES (data/eval/certificats.js, lus tels quels,
 * jamais réécrits) et d'un modèle d'attestation de hifẓ propre à l'application (à valider par le client).
 *  - champs {nom} remplis par l'école et le calcul ; un champ manquant est signalé et reste en pointillés ;
 *  - variantes féminines entre parenthèses (arabe : « أَتَمَّ (أَتَمَّتِ) » ; français : « le (la) »,
 *    « né(e) ») choisies selon le genre saisi ; sans genre, le texte inclusif du modèle est gardé ;
 *  - chiffres arabes orientaux et mois de la charte dans le texte arabe ;
 *  - numéro unique AWF-<NIVEAU>-<ANNÉE>-<NNNN> (registre de l'établissement).
 * Aucun de ces documents n'est une ijāza : le modèle de hifẓ le dit expressément.
 */

export interface CertModel {
  titre_fr: string;
  fr: string[];
  titre_ar?: string;
  ar?: string[];
  signatures_fr?: string[];
  a_valider?: boolean;
  source_fr?: string;
}

export interface CertModels {
  numero?: string;
  modeles: Record<string, CertModel>;
  ordinaux_ar?: { acc: string[]; gen: string[] };
  mois_ar?: string[];
}

export type Gender = 'm' | 'f' | null;

/** Segment de texte : gras (**…**) ou non. */
export interface Seg {
  t: string;
  b?: boolean;
}

export interface RenderedDoc {
  model: string;
  titleFr: string;
  fr: Seg[][];
  titleAr: string | null;
  ar: Seg[][];
  signatures: string[];
  /** champs attendus par le modèle et non fournis */
  missing: string[];
  aValider: boolean;
}

/**
 * Attestation de fin de partie de hifẓ (modèle de l'APPLICATION, absent des livres) : français seulement,
 * texte à valider par le client ; la version arabe sera rédigée par le comité (jamais improvisée ici).
 */
export const HIFZ_MODEL: CertModel = {
  titre_fr: 'Attestation de récitation — partie de hifẓ validée',
  fr: [
    "L'établissement {etablissement} atteste que **{prenom_nom}** a récité en classe **{partie}**, récitation validée le {date_validation} avec la note de **{note}/20** (mention {mention}).",
    "Cette attestation constate une récitation validée en classe ; elle n'est pas une ijāza.",
    'Fait à {lieu}, le {date}.',
  ],
  signatures_fr: ["L'enseignant(e)", 'Le (la) responsable'],
  a_valider: true,
  source_fr: "modèle de l'application (lot 13) — à valider ; version arabe à rédiger par le comité",
};

/** Modèle du livre pour un certificat de niveau, selon la filière. */
export function levelModelKey(track: string): string | null {
  switch (track) {
    case 'enfants':
      return 'niveau_enfants';
    case 'adultes':
      return 'niveau_adultes';
    case 'ados':
      return 'niveau_ados';
    case 'religion':
      return 'niveau_religion';
    default:
      return null;
  }
}

const EASTERN = '٠١٢٣٤٥٦٧٨٩';
export function arabicDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => EASTERN[Number(d)]!);
}

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 2026-10-05 » → « 5 octobre 2026 » */
export function dateFr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS_FR[(m ?? 1) - 1]} ${y}`;
}

/** « 2026-10-05 » → « ٥ أُكْتُوبَرُ ٢٠٢٦ » (mois de la charte, fichier des livres) */
export function dateAr(iso: string, mois: readonly string[] | undefined): string | null {
  const [y, m, d] = iso.split('-').map(Number);
  const name = mois?.[(m ?? 1) - 1];
  return name ? `${arabicDigits(d ?? 1)} ${name} ${arabicDigits(y ?? 0)}` : null;
}

const AR_WORD = '[\\u0600-\\u06FF]+';
const AR_ALT = new RegExp(`(${AR_WORD}) \\((${AR_WORD})\\)`, 'g');
const FR_ALT = /\b(le|lui|il|Il) \((la|elle|Elle)\)/g;
const FR_E = /(\p{L}+)\(e\)/gu;

/** Choix des variantes de genre (sans genre : texte inchangé). */
export function chooseGender(text: string, lang: 'fr' | 'ar', g: Gender): string {
  if (!g) return text;
  const pick = (_: string, m: string, f: string) => (g === 'f' ? f : m);
  if (lang === 'ar') return text.replace(AR_ALT, pick);
  return text
    .replace(FR_ALT, pick)
    .replace(FR_E, (_, base: string) => (g === 'f' ? `${base}e` : base));
}

function segments(line: string): Seg[] {
  const out: Seg[] = [];
  line.split(/(\*\*[^*]+\*\*)/).forEach((p) => {
    if (!p) return;
    if (p.startsWith('**') && p.endsWith('**')) out.push({ t: p.slice(2, -2), b: true });
    else out.push({ t: p });
  });
  return out;
}

export function fill(
  line: string,
  fields: Record<string, string | number | null | undefined>,
  missing: Set<string>,
): string {
  return line.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
    const v = fields[k];
    if (v === undefined || v === null || v === '') {
      missing.add(k);
      return '…………';
    }
    return String(v);
  });
}

export function renderDoc(
  key: string,
  model: CertModel,
  fields: Record<string, string | number | null | undefined>,
  gender: Gender,
): RenderedDoc {
  const missing = new Set<string>();
  const line = (s: string, lang: 'fr' | 'ar') =>
    segments(chooseGender(fill(s, fields, missing), lang, gender));
  return {
    model: key,
    titleFr: fill(model.titre_fr, fields, missing),
    fr: model.fr.map((s) => line(s, 'fr')),
    titleAr: model.titre_ar ? fill(model.titre_ar, fields, missing) : null,
    ar: (model.ar ?? []).map((s) => line(s, 'ar')),
    signatures: model.signatures_fr ?? [],
    missing: [...missing].sort(),
    aValider: !!model.a_valider,
  };
}

/** Numéro unique : AWF-<NIVEAU>-<ANNÉE>-<NNNN> (NIVEAU en majuscules ; « HZ » pour le hifẓ). */
export function certNumber(level: string, year: number, seq: number): string {
  return `AWF-${level.toUpperCase()}-${year}-${String(seq).padStart(4, '0')}`;
}
