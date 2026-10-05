/**
 * Chantier A8 — textes OFFICIELS des riwāyāt (Complexe du Roi Fahd pour l'impression du Noble Coran,
 * plateforme développeurs https://download.qurancomplex.gov.sa/resources_dev/, licence L-DEV : « peut être
 * utilisé dans le développement d'applications et de logiciels »). Module PUR (aucun accès disque) : liste des
 * riwāyāt, lecture des lignes du fichier JSON du Complexe TELLES QUELLES (aucune normalisation, aucune NFC,
 * rien de retapé) et contrôles d'intégrité (nombre de versets par sourate = compte officiel de la riwāya).
 * Ḥafṣ reste le texte Tanzil des livres (inchangé) : il n'est pas importé ici.
 */

/** Versets de chaque sourate en Ḥafṣ (compte koufi, 6 236). */
export const HAFS_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/** Compte madanī II (Warsh et Qālūn ʿan Nāfiʿ) : sourates qui diffèrent de Ḥafṣ. */
const MADANI_II: Readonly<Record<number, number>> = {
  2: 285,
  4: 175,
  5: 122,
  6: 167,
  8: 76,
  9: 130,
  11: 121,
  13: 44,
  14: 54,
  17: 110,
  18: 105,
  19: 99,
  20: 134,
  21: 111,
  22: 76,
  23: 119,
  24: 62,
  26: 226,
  27: 95,
  30: 59,
  31: 33,
  35: 46,
  36: 82,
  38: 86,
  39: 72,
  40: 84,
  41: 53,
  42: 50,
  44: 56,
  45: 36,
  46: 34,
  47: 39,
  52: 47,
  53: 61,
  55: 77,
  56: 99,
  57: 28,
  58: 21,
  67: 31,
  71: 30,
  73: 18,
  74: 55,
  75: 39,
  79: 45,
  89: 32,
  96: 20,
  99: 9,
  101: 10,
  106: 5,
  107: 6,
};
/** Compte baṣrī (Abū ʿAmr : as-Sūsī) : sourates qui diffèrent de Ḥafṣ. */
const BASRI: Readonly<Record<number, number>> = {
  2: 285,
  4: 175,
  5: 122,
  6: 167,
  8: 76,
  9: 130,
  11: 122,
  13: 44,
  14: 54,
  17: 110,
  18: 105,
  20: 134,
  21: 111,
  22: 76,
  23: 119,
  24: 62,
  27: 95,
  31: 33,
  36: 82,
  38: 86,
  39: 72,
  40: 84,
  41: 53,
  42: 50,
  44: 56,
  45: 36,
  46: 34,
  47: 39,
  52: 47,
  53: 61,
  55: 77,
  56: 99,
  57: 28,
  67: 31,
  71: 30,
  75: 39,
  79: 45,
  86: 16,
  89: 32,
  91: 16,
  96: 20,
  101: 10,
  106: 5,
  107: 6,
};
/**
 * ad-Dūrī : même compte baṣrī, SAUF al-Mulk (67) que le fichier « UthmanicDouri v2.0 » du Complexe numérote en
 * 30 versets (as-Sūsī : 31) — 6 217 versets au lieu de 6 218. Relevé tel quel, non corrigé (A8, 05/10/2026).
 */
const DOURI: Readonly<Record<number, number>> = { ...BASRI, 67: 30 };
/** Compte makkī (al-Bazzī ʿan Ibn Kathīr, 6 220 ; basmala = verset 1 d'al-Fātiḥa). */
const MAKKI: Readonly<Record<number, number>> = {
  2: 285,
  4: 175,
  5: 122,
  6: 167,
  8: 76,
  9: 130,
  11: 121,
  13: 44,
  14: 54,
  17: 110,
  18: 105,
  19: 99,
  20: 134,
  21: 111,
  22: 77,
  23: 119,
  24: 62,
  26: 226,
  27: 95,
  30: 59,
  31: 33,
  36: 82,
  38: 86,
  39: 72,
  40: 84,
  41: 53,
  42: 50,
  44: 56,
  45: 36,
  46: 34,
  47: 39,
  52: 47,
  53: 61,
  55: 77,
  56: 99,
  57: 28,
  58: 21,
  67: 31,
  71: 30,
  74: 55,
  75: 39,
  78: 41,
  79: 45,
  89: 32,
  96: 20,
  97: 6,
  99: 9,
  101: 10,
  106: 5,
  107: 6,
  112: 5,
  114: 7,
};

const counts = (diff: Readonly<Record<number, number>>) =>
  HAFS_COUNTS.map((n, i) => diff[i + 1] ?? n);

export interface RiwayaText {
  /** identifiant (même valeur que la riwāya des récitateurs, base de données) */
  key: 'warsh' | 'qalun' | 'shuba' | 'susi' | 'duri' | 'bazzi';
  /** nom affiché en clair */
  fr: string;
  ar: string;
  /** version du Complexe affichée dans le crédit */
  version: string;
  /** archive téléchargée (plateforme développeurs) et son SHA-256 (INVENTAIRE_COMPLEXE.md, RECAP.tsv) */
  archive: string;
  archiveSha256: string;
  /** fichier JSON du Complexe (gardé compressé dans riwayat-source/) et SHA-256 du fichier d'origine */
  json: string;
  jsonSha256: string;
  /** colonne du texte dans ce fichier */
  textField: 'aya_text_unicode' | 'aya_text';
  /** police fournie avec le texte, servie SANS modification (licence de la police : ni vente ni modification) */
  font: string;
  fontSha256: string;
  fontVersion: string;
  /** comptes officiels par sourate et total */
  counts: readonly number[];
  total: number;
}

export const RIWAYA_TEXTS: readonly RiwayaText[] = [
  {
    key: 'warsh',
    fr: 'Warsh ʿan Nāfiʿ',
    ar: 'ورش عن نافع',
    version: 'kfgqpc_warsh_v30',
    archive: 'resources_dev/kfgqpc_warsh_v30.zip',
    archiveSha256: 'd79b0e9d71696e6967a8f9051e62da87e3ad797e76c6b9d931d66fcf7739bbda',
    json: 'kfgqpc_warsh_v30.json',
    jsonSha256: '1afd0c853e29ddfa0111731f45d46792d42d850f571b10931c31eeec9ebd8ce3',
    textField: 'aya_text_unicode',
    font: 'kfgqpc_warsh_v30.ttf',
    fontSha256: '6406832cf9c34312aae5903ec34220a3aa80b83088d6a91c2d89c71684b99995',
    fontVersion: '3.0',
    counts: counts(MADANI_II),
    total: 6214,
  },
  {
    key: 'qalun',
    fr: 'Qālūn ʿan Nāfiʿ',
    ar: 'قالون عن نافع',
    version: 'kfgqpc_qalun_v30',
    archive: 'resources_dev/kfgqpc_qalun_v30.zip',
    archiveSha256: '32552185fda5520eb4cae741cc01162dc866fe3a224d921f4c182de4a7b965d9',
    json: 'kfgqpc_qalun_v30.json',
    jsonSha256: 'a4f611dae86a91797951997ab5fce22c14efdc7786b86e42fd847e6518332cb0',
    textField: 'aya_text_unicode',
    font: 'kfgqpc_qalun_v30.ttf',
    fontSha256: 'a50992a1d4477a886f8cf3c721ff24dea41381185bf2afe2243c59a51be128f5',
    fontVersion: '3.0',
    counts: counts(MADANI_II),
    total: 6214,
  },
  {
    key: 'shuba',
    fr: 'Shuʿba ʿan ʿĀṣim',
    ar: 'شعبة عن عاصم',
    version: 'kfgqpc_shubah_v30',
    archive: 'resources_dev/kfgqpc_shubah_v30.zip',
    archiveSha256: 'e2ec0e48dd0126716095cbe05627221863afce295c2894e151ea9cc8dbd36288',
    json: 'kfgqpc_shubah_v30.json',
    jsonSha256: '5140c8c7bc910600c7bf201473b6c08c8e42d8615a39a28599209dc5dc689845',
    textField: 'aya_text_unicode',
    font: 'kfgqpc_shubah_v30.ttf',
    fontSha256: '532e6810636173e00e76e80cbc58196b3920d1001e9434a00caeb6a2d18ff57e',
    fontVersion: '3.0',
    counts: HAFS_COUNTS,
    total: 6236,
  },
  {
    key: 'susi',
    fr: 'as-Sūsī ʿan Abī ʿAmr',
    ar: 'السوسي عن أبي عمرو',
    version: 'kfgqpc_susi_v30',
    archive: 'resources_dev/kfgqpc_susi_v30.zip',
    archiveSha256: 'c202fee4c08426b042240e5a530cd2b459fcf072f77aef4da09f6f823701714e',
    json: 'kfgqpc_susi_v30.json',
    jsonSha256: '76215094dceeec8161ba553fdbc4c474bd00df00f85195f2aaaee54922de1cff',
    textField: 'aya_text_unicode',
    font: 'kfgqpc_susi_v30.ttf',
    fontSha256: 'e2014a0eb42df43b094715104d9d1d4c6afb044b1ee0163ad67e3197565603e0',
    fontVersion: '3.0',
    counts: counts(BASRI),
    total: 6218,
  },
  {
    key: 'duri',
    fr: 'ad-Dūrī ʿan Abī ʿAmr',
    ar: 'الدوري عن أبي عمرو',
    version: 'UthmanicDouri v2.0',
    archive: 'resources_dev/UthmanicDouri_v2-0.zip',
    archiveSha256: '84e5569790f96b05896b8f44ebe8d82d98377a929ac0e87dd8af4dbec52cb0c1',
    json: 'DouriData_v2-0.json',
    jsonSha256: '3ebae16badd0b1a20e6da0952557e234abb97041d752706245d0660fa48e5f51',
    textField: 'aya_text',
    font: 'uthmanic_douri_v20.ttf',
    fontSha256: '5ff180fbd908b93428b33f6a882c0f5a84f7c1a70f51dc35120aa5829d24ca19',
    fontVersion: '2.0',
    counts: counts(DOURI),
    total: 6217,
  },
  {
    key: 'bazzi',
    fr: 'al-Bazzī ʿan Ibn Kathīr',
    ar: 'البزي عن ابن كثير',
    version: 'kfgqpc_bazzi_v30',
    archive: 'resources_dev/kfgqpc_bazzi_v30.zip',
    archiveSha256: '5470010041ba2822385571feb5616a344827b7f8a43a0849b70346247680172b',
    json: 'kfgqpc_bazzi_v30.json',
    jsonSha256: '8259e82d102e7052be5a8425d1f06a0cd9f1771abaa982a81bce0ee1d6752a83',
    textField: 'aya_text_unicode',
    font: 'kfgqpc_bazzi_v30.ttf',
    fontSha256: '2197adaf394156d62a5b64ba5efdb9e9faaa6a2e6786fc9c789760d4e6479044',
    fontVersion: '3.0',
    counts: counts(MAKKI),
    total: 6220,
  },
];

export const riwayaText = (key: string) => RIWAYA_TEXTS.find((r) => r.key === key) ?? null;

/** Un verset tel que lu dans le fichier du Complexe (texte NON transformé). */
export interface RiwayaVerse {
  s: number;
  a: number;
  /** page du muṣḥaf de la riwāya (première page si le verset est à cheval : « 34-35 » → 34) */
  page: number;
  juz: number;
  text: string;
  /** nom de la sourate en arabe, tel que fourni (police de la riwāya) */
  suraAr: string;
}

const int = (v: unknown, what: string): number => {
  const m = /^\s*(\d+)/.exec(String(v));
  if (!m) throw new Error(`${what} illisible : ${JSON.stringify(v)}`);
  return Number(m[1]);
};

/** Lignes du JSON du Complexe → versets. Le texte et le nom de sourate sont recopiés sans aucun changement. */
export function readRiwayaRows(def: RiwayaText, rows: unknown): RiwayaVerse[] {
  if (!Array.isArray(rows)) throw new Error(`${def.key} : tableau JSON attendu`);
  return rows.map((r: Record<string, unknown>, i) => {
    const text = r[def.textField];
    const suraAr = r.sura_name_ar;
    if (typeof text !== 'string' || typeof suraAr !== 'string')
      throw new Error(`${def.key} : ligne ${i + 1} sans texte`);
    return {
      s: int(r.sura_no, 'sura_no'),
      a: int(r.aya_no, 'aya_no'),
      page: int(r.page, 'page'),
      juz: int(r.jozz, 'jozz'),
      text,
      suraAr,
    };
  });
}

/**
 * Contrôles bloquants : versets dans l'ordre, sans trou ni doublon ; nombre de versets de chaque sourate =
 * compte officiel ; total ; pages 1 à 604 croissantes ; juzʾ 1 à 30 ; aucun texte vide. Renvoie les écarts.
 */
export function checkRiwaya(def: RiwayaText, verses: readonly RiwayaVerse[]): string[] {
  const errs: string[] = [];
  const per = new Array<number>(114).fill(0);
  let prev: RiwayaVerse | null = null;
  for (const v of verses) {
    if (v.s < 1 || v.s > 114) {
      errs.push(`sourate ${v.s} hors bornes`);
      continue;
    }
    per[v.s - 1]!++;
    const expect = prev
      ? prev.s === v.s
        ? v.a === prev.a + 1
        : v.s === prev.s + 1 && v.a === 1
      : v.s === 1 && v.a === 1;
    if (!expect) errs.push(`ordre : ${prev ? `${prev.s}:${prev.a}` : 'début'} → ${v.s}:${v.a}`);
    if (prev && v.page < prev.page) errs.push(`page décroissante en ${v.s}:${v.a}`);
    if (v.page < 1 || v.page > 604) errs.push(`page ${v.page} hors bornes en ${v.s}:${v.a}`);
    if (v.juz < 1 || v.juz > 30) errs.push(`juzʾ ${v.juz} hors bornes en ${v.s}:${v.a}`);
    if (!v.text.trim()) errs.push(`texte vide en ${v.s}:${v.a}`);
    prev = v;
  }
  per.forEach((n, i) => {
    if (n !== def.counts[i])
      errs.push(`sourate ${i + 1} : ${n} versets au lieu de ${def.counts[i]}`);
  });
  if (verses.length !== def.total) errs.push(`total ${verses.length} au lieu de ${def.total}`);
  const pages = new Set(verses.map((v) => v.page));
  if (pages.size !== 604) errs.push(`${pages.size} pages au lieu de 604`);
  return errs;
}

/** Index d'une riwāya pour l'application : comptes, début de chaque page, juzʾ de chaque page. */
export interface RiwayaIndex {
  v: 1;
  key: string;
  version: string;
  counts: number[];
  /** début des 604 pages : [sourate, verset] */
  pages: [number, number][];
  /** juzʾ du premier verset de chaque page */
  pageJuz: number[];
}
export function riwayaIndex(def: RiwayaText, verses: readonly RiwayaVerse[]): RiwayaIndex {
  const pages: [number, number][] = [];
  const pageJuz: number[] = [];
  for (const v of verses)
    if (!pages[v.page - 1]) {
      pages[v.page - 1] = [v.s, v.a];
      pageJuz[v.page - 1] = v.juz;
    }
  return { v: 1, key: def.key, version: def.version, counts: [...def.counts], pages, pageJuz };
}
