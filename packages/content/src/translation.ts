/**
 * Traduction des CONTENUS (lot F1, revue d'architecture G1) : structure prête, AUCUNE traduction produite
 * (décision du client : les livres restent en français). Modèle « texte source + calque de traduction » :
 *  - le texte source est le champ français du livre, à son chemin dans le JSON de la leçon (`consigne_fr`,
 *    `rubriques.2.texte.0.fr`…) ; son empreinte est gardée avec chaque traduction ;
 *  - une traduction n'est servie que si elle porte sur le texte source ACTUEL (sinon : français) et si son statut
 *    le permet : « relue » ou « validée » pour un texte ordinaire, « validée » par le référent pour un texte
 *    religieux (sens d'un verset, hadith, invocation, règle de fiqh, extraits des textes de l'école, tafsir) ;
 *  - l'empreinte des exercices ne contient pas les traductions (calque à part) : traduire ne périme rien.
 * Module pur (aucune dépendance) : le calcul d'empreinte est fait par l'appelant.
 */
export const TRANSLATION_STATUSES = ['brouillon', 'relue', 'validee', 'rejetee'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/** Langue source des livres (décision du client). */
export const SOURCE_LOCALE = 'fr';

type Obj = Record<string, unknown>;

/** Blocs de nature religieuse : leur traduction exige la validation du référent. */
const RELIGIOUS_KEYS = new Set([
  'coran',
  'versets',
  'versets_ref',
  'hadiths',
  'duas',
  'extraits',
  'fiqh_adab',
  'divergences',
  'tafsir_fr',
  'sens_fr',
]);
const RELIGIOUS_RUBRIQUES = new Set([
  'fiqh',
  'muamalat',
  'usra',
  'extraits',
  'hadith',
  'dua',
  'aqida',
]);
/** Jamais traduits (enseignant seulement, ou objet d'étude) : guide, sources, translittération. */
const SKIP_KEYS = new Set(['guide', 'sources_fr', 'tr', 'guide_fr', 'parents_fr']);

export interface TranslatableField {
  path: string;
  text: string;
  religious: boolean;
}

/**
 * Champs français traduisibles d'une leçon (ou d'un exercice), avec leur nature. `religiousLevel` : livre de
 * sciences islamiques (re, ra) — tout y est religieux.
 */
export function translatableFields(content: unknown, religiousLevel = false): TranslatableField[] {
  const base = '';
  const out: TranslatableField[] = [];
  const walk = (v: unknown, path: string, religious: boolean) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`, religious));
    else if (v && typeof v === 'object') {
      const o = v as Obj;
      const rel =
        religious ||
        (typeof o.code === 'string' &&
          RELIGIOUS_RUBRIQUES.has(o.code) &&
          /rubriques\.\d+$/.test(path));
      for (const [k, x] of Object.entries(o)) {
        if (SKIP_KEYS.has(k) || k.endsWith('_guide_fr')) continue;
        const p = path ? `${path}.${k}` : k;
        const r = rel || RELIGIOUS_KEYS.has(k);
        if (typeof x === 'string') {
          if ((k === 'fr' || k.endsWith('_fr')) && x.trim())
            out.push({ path: p, text: x, religious: r });
        } else walk(x, p, r);
      }
    }
  };
  walk(content, base, religiousLevel);
  return out;
}

export interface TranslationRow {
  locale: string;
  version: number;
  status: TranslationStatus;
  religious: boolean;
  sourceSha256: string;
  text: string;
}

/**
 * Traduction à servir pour un champ, ou null (→ texte source français, avec la mention « texte original »).
 * Religieux : « validée » seulement ; ordinaire : « relue » ou « validée » ; toujours sur la source actuelle ;
 * la version la plus récente l'emporte.
 */
export function pickTranslation(
  rows: readonly TranslationRow[],
  locale: string,
  sourceSha256: string,
): TranslationRow | null {
  if (locale === SOURCE_LOCALE) return null;
  const ok = rows
    .filter((r) => r.locale === locale && r.sourceSha256 === sourceSha256)
    .filter((r) =>
      r.religious ? r.status === 'validee' : r.status === 'relue' || r.status === 'validee',
    )
    .sort((a, b) => b.version - a.version);
  return ok[0] ?? null;
}
