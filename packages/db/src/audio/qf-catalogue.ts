/**
 * Chantier A2 — récitateurs EN LIGNE de Quran Foundation (QF). Métadonnées seulement (noms, style, crédit,
 * conditions) : AUCUN fichier audio n'est gardé chez nous ni sur l'appareil. Les adresses des fichiers sont
 * demandées à l'API de contenu de QF (jeton côté serveur), gardées au plus 24 h en mémoire (conditions QF :
 * pas plus d'une semaine hors Content Sync), et l'appareil lit le fichier directement sur le réseau de QF.
 *
 * Identifiants QF (« Ayah-by-ayah recitation ID » de /resources/recitations) :
 *  - prélancement : vérifiés par le chef de projet avec les identifiants du client (06/10/2026) : 6 et 7 ;
 *  - production : liste PUBLIQUE de l'API v4 (api.quran.com/api/v4/resources/recitations, relevée le
 *    06/10/2026), à confirmer avec les identifiants de production (infra/outils/qf-audio/qf-recitateurs.mjs).
 * Un récitateur n'est proposé que si l'environnement QF configuré (QF_ENV) lui donne un identifiant.
 * Noms arabes : graphie usuelle (contrôlée sur le nom arabe renvoyé par QF, language=ar).
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as t from '../schema.js';
import type { ReciterMeta } from './catalogue.js';

export type QfEnv = 'prelive' | 'production' | 'essai';
export const QF_ENVS: readonly QfEnv[] = ['prelive', 'production', 'essai'];

export interface QfReciterMeta extends ReciterMeta {
  /** identifiant de la récitation verset par verset chez QF, par environnement (null : non proposé) */
  qf: { prelive: number | null; production: number | null; essai?: number };
}

export const QF_TERMS_URL = 'https://api-docs.quran.foundation/legal/developer-terms/';
const QF_TERMS_DATE = '2026-10-06';
export const QF_SOURCE = 'Quran Foundation — Developer Terms (mise à jour du 04/10/2026)';
export const QF_USAGE_NOTE =
  'Écoute en ligne seulement (conditions de Quran Foundation) : ni téléchargement, ni copie sur l’appareil.';
export const QF_LICENCE_TEXTE = [
  'Récitation diffusée par l’API de contenu de Quran Foundation (compte développeur du client).',
  'Conditions (Developer Terms, mise à jour du 04/10/2026, lues le 06/10/2026) : contenu affiché seulement ' +
    'dans l’application, applications payantes permises ; ni revente, ni redistribution comme données ; ' +
    'pas de garde plus d’une semaine hors « Content Sync » ; « Recitation metadata and audio URLs are ' +
    'distinct from the underlying recordings » : aucun droit sur les enregistrements eux-mêmes, donc écoute ' +
    'en ligne seulement ; crédit de Quran Foundation et compte développeur actif exigés.',
  `Conditions : ${QF_TERMS_URL}`,
].join('\n');

const meta = (
  id: string,
  nameFr: string,
  nameAr: string,
  style: ReciterMeta['style'],
  qf: QfReciterMeta['qf'],
): QfReciterMeta => ({
  id,
  nameAr,
  nameFr,
  riwaya: 'hafs',
  speed: null,
  style,
  expectedVerses: 6236,
  licenseSource: QF_SOURCE,
  licenseUrl: QF_TERMS_URL,
  licenseArchivedOn: QF_TERMS_DATE,
  licenseText: QF_LICENCE_TEXTE,
  credit: `Récitation : ${nameFr} — écoute en ligne fournie par Quran Foundation (quran.foundation)`,
  creditAr: `تلاوة: ${nameAr} — بثّ عبر Quran Foundation`,
  usageNote: QF_USAGE_NOTE,
  qf,
});

/** Catalogue QF (Ḥafṣ ʿan ʿĀṣim). Ordre d'affichage : celui de la liste. */
export const QF_CATALOGUE: readonly QfReciterMeta[] = [
  meta('qf-husary', 'Maḥmūd Khalīl al-Ḥuṣarī', 'محمود خليل الحصري', 'murattal', {
    prelive: 6,
    production: 6,
  }),
  meta('qf-afasy', 'Mishārī Rāshid al-ʿAfāsī', 'مشاري راشد العفاسي', 'murattal', {
    prelive: 7,
    production: 7,
  }),
  meta('qf-husary-muallim', 'Maḥmūd Khalīl al-Ḥuṣarī (muʿallim)', 'محمود خليل الحصري', 'muallim', {
    prelive: null,
    production: 12,
  }),
  meta('qf-sudais', 'ʿAbd ar-Raḥmān as-Sudays', 'عبد الرحمن السديس', 'murattal', {
    prelive: null,
    production: 3,
  }),
  meta('qf-shuraym', 'Saʿūd ash-Shuraym', 'سعود الشريم', 'murattal', {
    prelive: null,
    production: 10,
  }),
  meta('qf-shatri', 'Abū Bakr ash-Shāṭirī', 'أبو بكر الشاطري', 'murattal', {
    prelive: null,
    production: 4,
  }),
  meta('qf-minshawi', 'Muḥammad Ṣiddīq al-Minshāwī', 'محمد صديق المنشاوي', 'murattal', {
    prelive: null,
    production: 9,
  }),
  meta(
    'qf-minshawi-mujawwad',
    'Muḥammad Ṣiddīq al-Minshāwī (mujawwad)',
    'محمد صديق المنشاوي',
    'mujawwad',
    {
      prelive: null,
      production: 8,
    },
  ),
  meta('qf-abdulbasit', 'ʿAbd al-Bāsiṭ ʿAbd aṣ-Ṣamad', 'عبد الباسط عبد الصمد', 'murattal', {
    prelive: null,
    production: 2,
  }),
  meta(
    'qf-abdulbasit-mujawwad',
    'ʿAbd al-Bāsiṭ ʿAbd aṣ-Ṣamad (mujawwad)',
    'عبد الباسط عبد الصمد',
    'mujawwad',
    {
      prelive: null,
      production: 1,
    },
  ),
  meta('qf-rifai', 'Hānī ar-Rifāʿī', 'هاني الرفاعي', 'murattal', { prelive: null, production: 5 }),
];

/** Identifiant QF d'un récitateur dans un environnement (null : non proposé). */
export function qfRecitationId(id: string, env: QfEnv): number | null {
  const m = QF_CATALOGUE.find((x) => x.id === id);
  if (m) return env === 'essai' ? null : m.qf[env];
  // essais automatiques seulement (bips non coraniques, récitateur « essai-qf ») : API QF simulée
  return env === 'essai' && id === QF_ESSAI_RECITER ? QF_ESSAI_ID : null;
}
export const QF_ESSAI_RECITER = 'essai-qf';
export const QF_ESSAI_ID = 7;

/**
 * Catalogue QF dans la base (appelé après les migrations) : métadonnées mises à jour, récitateur créé ACTIF
 * s'il est nouveau ; un récitateur RETIRÉ par l'administrateur le reste (statut jamais touché ici).
 */
export async function syncQfCatalogue(db: Db): Promise<void> {
  for (const m of QF_CATALOGUE) {
    const v = {
      nameAr: m.nameAr,
      nameFr: m.nameFr,
      riwaya: m.riwaya,
      speed: m.speed,
      style: m.style,
      expectedVerses: m.expectedVerses,
      licenseSource: m.licenseSource,
      licenseUrl: m.licenseUrl,
      licenseArchivedOn: m.licenseArchivedOn,
      licenseText: m.licenseText,
      credit: m.credit,
      creditAr: m.creditAr,
      usageNote: m.usageNote,
      source: 'qf' as const,
    };
    await db
      .insert(t.quranReciter)
      .values({ id: m.id, ...v, status: 'actif', activatedAt: sql`now()` })
      .onConflictDoUpdate({ target: t.quranReciter.id, set: v });
  }
}
