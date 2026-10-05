/**
 * École juridique (madhhab) des contenus (lot F1, revue d'architecture G2) : ÉTIQUETTE seulement, posée à
 * l'import, jamais dans le texte. Aucun texte religieux n'est modifié.
 *  - niveaux : sciences islamiques (re, ra) → « maliki » ; arabe, Coran, lectures → « commun » ;
 *  - registre : règles de fiqh → « maliki » (convention d'identifiant `FIQH_MAL_…`), versets et hadiths → « commun » ;
 *  - blocs : `fiqh_adab` des leçons de langue et rubriques de fiqh des leçons de sciences (fiqh, muʿāmalāt,
 *    famille, extraits des textes de l'école) → « maliki ».
 * Un champ `madhhab` explicite dans les livres (niveau, leçon, bloc, entrée du registre) l'emporte : c'est ce
 * que les livres pourront exporter plus tard (variantes par école, CDC §5.7).
 */
export const MADHHABS = ['maliki', 'hanafi', 'shafii', 'hanbali', 'commun'] as const;
export type Madhhab = (typeof MADHHABS)[number];

const isMadhhab = (v: unknown): v is Madhhab =>
  typeof v === 'string' && (MADHHABS as readonly string[]).includes(v);

/** Préfixes d'identifiants du registre (CDC §5.2 : `FIQH_MAL_<CODE>_l<NN>_<k>`). */
const FIQH_PREFIX: Record<string, Madhhab> = {
  MAL: 'maliki',
  HAN: 'hanafi',
  SHA: 'shafii',
  HNB: 'hanbali',
};

/** Rubriques des leçons de sciences islamiques qui exposent une règle de l'école. */
export const FIQH_RUBRIQUES: readonly string[] = ['fiqh', 'muamalat', 'usra', 'extraits'];

export function levelMadhhab(code: string, book?: Record<string, unknown> | null): Madhhab {
  if (isMadhhab(book?.madhhab)) return book.madhhab;
  return /^r[ae]\d/.test(code) ? 'maliki' : 'commun';
}

export function registryMadhhab(
  kind: string,
  id: string,
  data?: Record<string, unknown> | null,
): Madhhab {
  if (isMadhhab(data?.madhhab)) return data.madhhab;
  if (kind !== 'fiqh') return 'commun';
  return FIQH_PREFIX[/^FIQH_([A-Z]{3})_/.exec(id)?.[1] ?? ''] ?? 'maliki';
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Blocs de fiqh d'une leçon → école : `{ "fiqh_adab": "maliki", "rubriques.3": "maliki" }` (chemins dans le
 * JSON de la leçon, mêmes indices dans la projection élève). Vide si la leçon n'a aucun bloc de fiqh.
 */
export function blockMadhhabs(content: unknown): Record<string, Madhhab> {
  const out: Record<string, Madhhab> = {};
  if (!isObj(content)) return out;
  const unitDefault: Madhhab = isMadhhab(content.madhhab) ? content.madhhab : 'maliki';
  if (isObj(content.fiqh_adab))
    out.fiqh_adab = isMadhhab(content.fiqh_adab.madhhab) ? content.fiqh_adab.madhhab : unitDefault;
  if (Array.isArray(content.rubriques))
    content.rubriques.forEach((r, i) => {
      if (!isObj(r)) return;
      if (isMadhhab(r.madhhab)) out[`rubriques.${i}`] = r.madhhab;
      else if (typeof r.code === 'string' && FIQH_RUBRIQUES.includes(r.code))
        out[`rubriques.${i}`] = unitDefault;
    });
  return out;
}
