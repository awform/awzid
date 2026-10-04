/**
 * Catalogue des muṣḥafs enregistrés du Complexe du Roi Fahd retenus par le client (décision du lot 27).
 * Ce sont des MÉTADONNÉES (noms, riwāya, licence) : aucun fichier audio n'est fourni ici. Les noms arabes et
 * les comptes de versets des riwāyāt autres que Ḥafṣ sont À VÉRIFIER sur les fichiers et la page du Complexe
 * à leur arrivée ; l'URL de licence est à remplacer par celle de la page archivée (option --licence-url).
 */
import type { Riwaya } from './suras.js';

export interface ReciterMeta {
  id: string;
  nameAr: string;
  nameFr: string;
  riwaya: Riwaya;
  speed: 'lente' | 'moyenne' | 'rapide' | null;
  style: 'murattal' | 'mujawwad' | 'muallim' | null;
  expectedVerses: number;
  licenseSource: string;
  licenseUrl: string;
  licenseArchivedOn: string;
  licenseText: string;
  credit: string;
}

export const RIWAYA_FR: Record<string, string> = {
  hafs: 'Ḥafṣ ʿan ʿĀṣim',
  shuba: 'Shuʿba ʿan ʿĀṣim',
  qalun: 'Qālūn ʿan Nāfiʿ',
  warsh: 'Warsh ʿan Nāfiʿ',
  susi: 'as-Sūsī ʿan Abī ʿAmr',
  duri: 'ad-Dūrī ʿan Abī ʿAmr',
};

const SOURCE = 'Complexe du Roi Fahd pour l’impression du Noble Coran (Médine)';
const LICENCE_URL = 'https://qurancomplex.gov.sa/';
const LICENCE_DATE = '2025-07-30';
const LICENCE_TEXTE =
  'Usage général gratuit dans les applications, y compris par le secteur privé (résumé de la licence ' +
  'archivée le 30/07/2025 ; le texte intégral de l’archive est à joindre avec --licence-texte).';

function meta(
  id: string,
  nameAr: string,
  nameFr: string,
  riwaya: Riwaya,
  expectedVerses: number,
): ReciterMeta {
  return {
    id,
    nameAr,
    nameFr,
    riwaya,
    speed: null,
    style: 'murattal',
    expectedVerses,
    licenseSource: SOURCE,
    licenseUrl: LICENCE_URL,
    licenseArchivedOn: LICENCE_DATE,
    licenseText: LICENCE_TEXTE,
    credit: `Récitation : ${nameFr}, riwāya ${RIWAYA_FR[riwaya] ?? riwaya} — enregistrement du ${SOURCE}.`,
  };
}

/** 9 muṣḥafs ; comptes autres que Ḥafṣ : compte DÉCLARÉ (madanī II 6 214, baṣrī 6 204), à confirmer. */
export const COMPLEXE_CATALOGUE: readonly ReciterMeta[] = [
  meta('huthify-hafs', 'علي الحذيفي', 'ʿAlī al-Ḥudhayfī', 'hafs', 6236),
  meta('muaiqly-hafs', 'ماهر المعيقلي', 'Māhir al-Muʿayqlī', 'hafs', 6236),
  meta('ayyoub-hafs', 'محمد أيوب', 'Muḥammad Ayyūb', 'hafs', 6236),
  meta('muhanna-hafs', 'خالد المهنا', 'Khālid al-Muhannā', 'hafs', 6236),
  meta('akhdar-hafs', 'إبراهيم الأخضر', 'Ibrāhīm al-Akhḍar', 'hafs', 6236),
  meta('huthify-shuba', 'علي الحذيفي', 'ʿAlī al-Ḥudhayfī', 'shuba', 6236),
  meta('huthify-qalun', 'علي الحذيفي', 'ʿAlī al-Ḥudhayfī', 'qalun', 6214),
  meta('sediki-susi', 'عثمان الصديقي', 'ʿUthmān aṣ-Ṣiddīqī', 'susi', 6204),
  meta('juhani-duri', 'عبد الله الجهني', 'ʿAbdullāh al-Juhanī', 'duri', 6204),
];

/** Conseil pour un débutant (décision du client) : Muḥammad Ayyūb, Ḥafṣ. */
export const BEGINNER_RECITER = 'ayyoub-hafs';
