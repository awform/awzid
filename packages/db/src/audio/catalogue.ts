/**
 * Catalogue des muṣḥafs enregistrés du Complexe du Roi Fahd retenus par le client (décision du lot 27).
 * Ce sont des MÉTADONNÉES (noms, riwāya, licence, crédit) : aucun fichier audio n'est fourni ici.
 * Noms arabes : graphie de la page du Complexe (chantier A1). Comptes de versets hors Ḥafṣ : comptes officiels
 * des textes du Complexe (voir riwayaSuraVerses dans suras.ts). Licence : texte arabe « حقوق الاستخدام » relevé
 * EN DIRECT le 04/10/2026 sur https://qurancomplex.gov.sa/quran-audios/ (relevé du client :
 * licences/LICENCES_COMPLEXE_2026-10-04.txt).
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
  /** crédit en français */
  credit: string;
  /** crédit en arabe */
  creditAr: string;
  /** condition d'usage affichée avec le crédit */
  usageNote: string;
}

export const RIWAYA_FR: Record<string, string> = {
  hafs: 'Ḥafṣ ʿan ʿĀṣim',
  shuba: 'Shuʿba ʿan ʿĀṣim',
  qalun: 'Qālūn ʿan Nāfiʿ',
  warsh: 'Warsh ʿan Nāfiʿ',
  susi: 'as-Sūsī ʿan Abī ʿAmr',
  duri: 'ad-Dūrī ʿan Abī ʿAmr',
};

export const COMPLEXE_FR = 'Complexe du Roi Fahd pour l’impression du Noble Coran, Médine';
export const COMPLEXE_AR = 'مجمع الملك فهد لطباعة المصحف الشريف، المدينة المنورة';
const SOURCE = 'Complexe du Roi Fahd pour l’impression du Noble Coran (Médine)';
export const LICENCE_URL = 'https://qurancomplex.gov.sa/quran-audios/';
const LICENCE_DATE = '2026-10-04';
/** Texte affiché par le Complexe (arabe, faisant foi), relevé le 04/10/2026, suivi d'une traduction de travail. */
export const LICENCE_TEXTE = [
  'حقوق الاستخدام',
  'بناء على موافقة معالي وزير الشؤون الإسلامية والدعوة والإرشاد، المشرف العام على مجمع الملك فهد لطباعة المصحف الشريف، يتشـرَّف المجمع بإتاحة النسخ الرقمية من التلاوات الصوتية المدرجة في هذه الصفحة للاستخدام العام مجاناً في التطبيقات الحاسوبية ومواقع وقنوات البث الإذاعي، ومواقع الإنترنت، وأعمال الجهات الحكومية والجهات والمؤسسات الخاصة وغيرها، وذلك داخل المملكة العربية السعودية وخارجها.',
  'والمجمع ليس مسؤولاً عن الأخطاء الفنية، أو البرمجية التي تحدُثُ من استخدام النسخة المذكورة.',
  'نسأل الله أن ينفع المسلمين بهذا العمل المبارك.',
  '',
  'Traduction de travail (non officielle) : avec l’accord du ministre des Affaires islamiques, de la Daʿwa et de ' +
    'l’Orientation, superviseur général du Complexe, le Complexe met à disposition les copies numériques des ' +
    'récitations audio de cette page pour un usage général, gratuitement, dans les applications informatiques, ' +
    'les sites et chaînes de radiodiffusion, les sites Internet, et les travaux des organismes gouvernementaux, ' +
    'des organismes et établissements privés et autres, en Arabie saoudite et hors d’Arabie saoudite. Le ' +
    'Complexe n’est pas responsable des erreurs techniques ou de programmation résultant de l’usage de cette copie.',
  `Relevé en direct le 04/10/2026 : ${LICENCE_URL}`,
].join('\n');
/** Règle du client : l'audio du Complexe est offert, jamais vendu. */
export const USAGE_NOTE =
  'Audio mis à disposition gratuitement par le Complexe : ne pas vendre l’audio (ni seul, ni dans une offre payante).';

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
    credit: `Récitation : ${nameFr} — ${COMPLEXE_FR}`,
    creditAr: `تلاوة: ${nameAr} — ${COMPLEXE_AR}`,
    usageNote: USAGE_NOTE,
  };
}

/** 9 muṣḥafs ; comptes hors Ḥafṣ : comptes officiels du Complexe (Shuʿba 6 236, Abū ʿAmr 6 218, Qālūn 6 214). */
export const COMPLEXE_CATALOGUE: readonly ReciterMeta[] = [
  meta('huthify-hafs', 'علي الحذيفي', 'ʿAlī al-Ḥudhayfī', 'hafs', 6236),
  meta('muaiqly-hafs', 'ماهر المعيقلي', 'Māhir al-Muʿayqlī', 'hafs', 6236),
  meta('ayyoub-hafs', 'محمد أيوب', 'Muḥammad Ayyūb', 'hafs', 6236),
  meta('muhanna-hafs', 'خالد المهنا', 'Khālid al-Muhannā', 'hafs', 6236),
  meta('akhdar-hafs', 'إبراهيم الأخضر', 'Ibrāhīm al-Akhḍar', 'hafs', 6236),
  meta('huthify-shuba', 'علي الحذيفي', 'ʿAlī al-Ḥudhayfī', 'shuba', 6236),
  meta('huthify-qalun', 'علي الحذيفي', 'ʿAlī al-Ḥudhayfī', 'qalun', 6214),
  meta('sediki-susi', 'عثمان الصديقي', 'ʿUthmān aṣ-Ṣiddīqī', 'susi', 6218),
  meta('juhani-duri', 'عبدالله بن عواد الجهني', 'ʿAbdullāh ibn ʿAwwād al-Juhanī', 'duri', 6218),
];

/**
 * Nommages réels des fichiers « par verset » du Complexe (relevés sur les fichiers reçus, 05/10/2026), à
 * passer à --nommage ; les fichiers ne sont jamais renommés. Dossiers supplémentaires : --dossier répété.
 */
export const COMPLEXE_NOMMAGES: Readonly<Record<string, string>> = {
  'ayyoub-hafs': '10-SSSVVV-A03.mp3',
  'muaiqly-hafs': '10-SSSVVV-A08.mp3',
  // sourate 2 livrée à part, nommée « 10-002VVV-001.mp3 »
  'huthify-hafs': '10-SSSVVV-A01.mp3,10-SSSVVV-001.mp3',
  'muhanna-hafs': '10-SSSVVV-A06.mp3',
  'akhdar-hafs': '10-SSSVVV-A02.mp3',
  'huthify-shuba': '09-SSSVVV-A01.mp3',
  'huthify-qalun': '01-SSSVVV-A01.mp3,01-SSSVVV-001.mp3,01-SSSVVVA01.mp3',
  // double extension d'origine ; sourate 1 écrite sur deux chiffres
  'sediki-susi': '06-SSSVVVA10.mp3.mp3,06-SSSVVVA10.wav.mp3,06-SSVVVA10.wav.mp3',
  'juhani-duri': '05-SSSVVV-A09.mp3',
};

/** Nommage des fichiers de sourate entière (zip « sura ») utilisés en repli. */
export const COMPLEXE_NOMMAGES_SOURATE: Readonly<Record<string, string>> = {
  'sediki-susi': '06-SSSD00-10mp3.mp3',
  'muhanna-hafs': '10-SSSD00-A06.mp3',
  'huthify-qalun': '01-SSSD00-A01.mp3',
  'juhani-duri': '05-SSSD00-A09.mp3',
  'huthify-shuba': '09-SSSD00-A01.mp3',
};

/** Validation à l'écoute (A1) : condition d'activation hors démo, décidée par le client et le référent. */
export const VALIDATION_ECOUTE = 'écoute de contrôle client + référent provisoire, 05/10/2026';

/**
 * Plan d'import de chaque muṣḥaf (chemins relatifs au dossier source, AWFORM_AUDIO_SOURCE monté sur /source) et
 * validation à l'écoute. Une récitation VALIDÉE est importée PUIS ACTIVÉE par `coran-audio importer-valides`
 * dans tout déploiement (démo, bêta, production) ; contrôles automatiques toujours appliqués (un import bloqué
 * n'active rien).
 */
export interface ImportPlan {
  dossiers: string[];
  sourateDuDossier?: boolean;
  fichiersSourate?: string;
  repliSourates?: number[];
  validation: string | null;
}
export const COMPLEXE_IMPORT: Readonly<Record<string, ImportPlan>> = {
  'ayyoub-hafs': { dossiers: ['ayyoub-hafs'], validation: VALIDATION_ECOUTE },
  'muaiqly-hafs': { dossiers: ['muaiqly-hafs'], validation: VALIDATION_ECOUTE },
  'huthify-hafs': {
    dossiers: ['huthify-hafs', '_extras/huthify-hafs/الحذيفي-ايات/002 Al-Baqarah البقرة'],
    validation: VALIDATION_ECOUTE,
  },
  'akhdar-hafs': { dossiers: ['akhdar-hafs'], validation: VALIDATION_ECOUTE },
  // zip réextrait AVEC ses dossiers (an-Naṣr nommée 109 dans le dossier 110) ; sourate 42 en fichier entier
  // (42:1 et 42:2 contiennent chacun « حم عسق » ; décision du référent)
  'muhanna-hafs': {
    dossiers: ['_extras/muhanna-hafs/muhanna-ayat'],
    sourateDuDossier: true,
    fichiersSourate: '_sura/muhanna-hafs-sura/muhanna-sura',
    repliSourates: [42],
    validation: VALIDATION_ECOUTE,
  },
  'huthify-shuba': { dossiers: ['huthify-shuba'], validation: VALIDATION_ECOUTE },
  'juhani-duri': { dossiers: ['juhani-duri'], validation: VALIDATION_ECOUTE },
  // al-Mulk : 30 fichiers pour 31 versets dans le texte officiel → fichier de sourate entière
  'sediki-susi': {
    dossiers: ['sediki-susi'],
    fichiersSourate: '_sura/sediki-susi-sura/sediki',
    validation: VALIDATION_ECOUTE,
  },
  // al-Fātiḥa : fichier 1 = basmala (annexe), reconnu par l'outil
  'huthify-qalun': { dossiers: ['huthify-qalun'], validation: VALIDATION_ECOUTE },
};

/** Conseil pour un débutant (décision du client) : Muḥammad Ayyūb, Ḥafṣ. */
export const BEGINNER_RECITER = 'ayyoub-hafs';
