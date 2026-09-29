/**
 * Contenu des tests d'API (audit INF-2) : les VRAIS livres (`~/awform-content`, hors dépôt) s'ils sont là,
 * sinon le contenu SYNTHÉTIQUE versionné (`infra/ci/contenu-synthetique`, sans aucun texte religieux) :
 * les tests de cloisonnement et de sécurité tournent donc aussi en CI. Les vérifications propres aux vrais
 * livres (nombre de leçons, textes précis, religion, carnets de hifẓ…) sont marquées `REAL_BOOKS`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { contentDir } from '@awform/db';

const real = contentDir();
export const REAL_BOOKS =
  existsSync(join(real, 'data', 'index-lecons.js')) && !existsSync(join(real, 'SYNTHETIQUE.md'));
export const SYNTH_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'infra',
  'ci',
  'contenu-synthetique',
);
/** dossier à importer dans les tests */
export const TEST_CONTENT_DIR = REAL_BOOKS ? real : SYNTH_DIR;
