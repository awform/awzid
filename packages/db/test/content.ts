/**
 * Contenu des tests de la base (audit INF-2) : les vrais livres s'ils sont là, sinon le contenu SYNTHÉTIQUE
 * versionné (`infra/ci/contenu-synthetique`, sans texte religieux) ; `REAL_BOOKS` marque les vérifications
 * propres aux vrais livres.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { contentDir } from '../src/env.js';

const real = contentDir();
export const REAL_BOOKS =
  existsSync(join(real, 'data', 'index-lecons.js')) && !existsSync(join(real, 'SYNTHETIQUE.md'));
export const TEST_CONTENT_DIR = REAL_BOOKS
  ? real
  : join(import.meta.dirname, '..', '..', '..', 'infra', 'ci', 'contenu-synthetique');
