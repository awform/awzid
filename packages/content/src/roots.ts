/**
 * Activité « construire un mot à partir de sa racine » (lot 15) : éléments EXTRAITS des livres gelés, jamais
 * inventés. Chaque élément cite sa leçon source ; à l'import, CHAQUE chaîne (racine, schème, singulier,
 * pluriel, distracteurs) doit figurer mot pour mot dans le fichier de cette leçon, sinon l'élément est écarté
 * et l'import le signale. Les familles de contexte coranique (ر ح م, ع ب د, ص ب ر…) sont EXCLUES : le
 * registre ne vérifie pas les racines coraniques.
 * Source : Adultes N2, leçon 12 (pluriels brisés) — « les trois consonnes de la racine (ك ت ب، ب ي ت، ق ل م) »,
 * « Huit schèmes fréquents… », « Jeu des cartes racine + schème (ك ت ب + فُعُلٌ = كُتُبٌ) ».
 */
export interface RootItem {
  id: string;
  source: string;
  level: string;
  /** lettres de la racine, séparées par des espaces, telles qu'écrites dans le livre */
  root: string;
  scheme: string;
  singular: string;
  plural: string;
  /** pluriels d'autres racines, du même passage du livre */
  distractors: string[];
}

const D = [
  'أَوْلَادٌ',
  'دُرُوسٌ',
  'رِجَالٌ',
  'جِبَالٌ',
  'مُدُنٌ',
  'مَسَاجِدُ',
  'طُلَّابٌ',
  'عُمَّالٌ',
];

export const ROOT_ITEMS: RootItem[] = [
  {
    id: 'ktb-fuul',
    source: 'ad2.l12',
    level: 'ad2',
    root: 'ك ت ب',
    scheme: 'فُعُلٌ',
    singular: 'كِتَابٌ',
    plural: 'كُتُبٌ',
    distractors: [D[0]!, D[4]!],
  },
  {
    id: 'ktb-mafail',
    source: 'ad2.l12',
    level: 'ad2',
    root: 'ك ت ب',
    scheme: 'مَفَاعِلُ',
    singular: 'مَكْتَبٌ',
    plural: 'مَكَاتِبُ',
    distractors: [D[5]!, D[1]!],
  },
  {
    id: 'byt-fuul',
    source: 'ad2.l12',
    level: 'ad2',
    root: 'ب ي ت',
    scheme: 'فُعُولٌ',
    singular: 'بَيْتٌ',
    plural: 'بُيُوتٌ',
    distractors: [D[1]!, D[2]!],
  },
  {
    id: 'qlm-afal',
    source: 'ad2.l12',
    level: 'ad2',
    root: 'ق ل م',
    scheme: 'أَفْعَالٌ',
    singular: 'قَلَمٌ',
    plural: 'أَقْلَامٌ',
    distractors: [D[0]!, D[3]!],
  },
];

/** Racines exclues : contexte coranique, non vérifié par le registre. */
export const QURANIC_ROOTS_EXCLUDED = ['ر ح م', 'ع ب د', 'ص ب ر'];

/**
 * Garde les éléments dont toutes les chaînes figurent dans la leçon source (texte du fichier du livre) ;
 * `sources` : identifiant de leçon → texte brut du fichier. Renvoie aussi les éléments écartés.
 */
export function verifyRootItems(
  sources: Map<string, string>,
  items: readonly RootItem[] = ROOT_ITEMS,
): { ok: RootItem[]; rejected: Array<{ id: string; reason: string }> } {
  const ok: RootItem[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const it of items) {
    const src = sources.get(it.source);
    if (!src) {
      rejected.push({ id: it.id, reason: `leçon ${it.source} absente de l'édition` });
      continue;
    }
    if (QURANIC_ROOTS_EXCLUDED.includes(it.root)) {
      rejected.push({ id: it.id, reason: 'racine coranique non vérifiée' });
      continue;
    }
    const missing = [it.root, it.scheme, it.singular, it.plural, ...it.distractors].filter(
      (s) => !src.includes(s),
    );
    if (missing.length)
      rejected.push({ id: it.id, reason: `absent du livre : ${missing.join(', ')}` });
    else ok.push(it);
  }
  return { ok, rejected };
}
