import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* pas de .env */
}

/**
 * Base, rôles PostgreSQL et fichiers de test PROPRES à ce dossier de travail. Plusieurs dossiers (worktrees,
 * sessions parallèles) lancent leurs e2e sur la même VM : avec une base commune (awform_test), le
 * « --reset » d'une suite vidait la base d'une autre en pleine exécution (vu le 04/10/2026 : 84 échecs
 * « relation … does not exist »), et les mots de passe des rôles awform_e2e_* étaient changés par l’autre suite.
 * En CI (machine dédiée), rien ne change.
 */
const ISOLE = !process.env.CI && !!process.env.TEST_DATABASE_URL;
const SUFFIX = createHash('sha256')
  .update(fileURLToPath(new URL('.', import.meta.url)))
  .digest('hex')
  .slice(0, 8);
const ROLE_PREFIX = ISOLE ? `awform_e2e_${SUFFIX}` : 'awform_e2e';
const TEST_DB = (() => {
  const base = process.env.TEST_DATABASE_URL ?? '';
  if (!ISOLE) return base;
  const u = new URL(base);
  const name = `awform_e2e_${SUFFIX}_test`; // suffixe _test exigé par la remise à zéro
  // créée une fois (le rôle de développement a le droit CREATEDB) ; remise à zéro à chaque lancement
  const q = (sql: string) =>
    execFileSync('psql', [base, '-Atqc', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  if (!q(`SELECT 1 FROM pg_database WHERE datname = '${name}'`).trim())
    q(`CREATE DATABASE ${name}`);
  u.pathname = `/${name}`;
  // lu par l'import (--test --reset) et la création des rôles, lancés par le serveur web de test
  process.env.TEST_DATABASE_URL = u.toString();
  return u.toString();
})();
process.env.E2E_TOTP_FILE ??= join(tmpdir(), `awform-e2e-totp-counter${ISOLE ? `-${SUFFIX}` : ''}`);
// ports changeables (plusieurs dossiers de travail lancent leurs e2e en même temps sur la VM)
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4180);
// A5 : service d'écoute FACTICE (e2e/ecoute-essai.mjs : aucun modèle, rien n'est gardé)
const ECOUTE_PORT = Number(process.env.E2E_ECOUTE_PORT ?? API_PORT + 11);
// 18/10/2026 : FAUX fournisseur OpenID (e2e/oidc-essai.mjs) à la place de Google ; boîte de démonstration WhatsApp
const OIDC_PORT = Number(process.env.E2E_OIDC_PORT ?? API_PORT + 12);
process.env.E2E_OIDC_URL = `http://127.0.0.1:${OIDC_PORT}`;
process.env.E2E_WA_DIR ??= join(tmpdir(), `awform-e2e-whatsapp${ISOLE ? `-${SUFFIX}` : ''}`);
process.env.E2E_KEY ??= randomBytes(32).toString('hex');
const E2E_KEY = process.env.E2E_KEY;
// lot 27 : stockage de l'audio d'ESSAI (bips non coraniques) servi par l'API de test
const AUDIO_DIR = join(tmpdir(), `awform-e2e-audio${ISOLE ? `-${SUFFIX}` : ''}`);
// A3 : audio des leçons d'en1 (fichiers réels des livres) importé depuis ~/lecons-audio s'il est là
const LECONS_SRC = process.env.AWFORM_LECONS_AUDIO_SOURCE ?? join(homedir(), 'lecons-audio');
const LECONS_DIR = join(tmpdir(), `awform-e2e-lecons${ISOLE ? `-${SUFFIX}` : ''}`);
// lot F3 : boîte de DÉMONSTRATION des e-mails (aucun envoi réel), lue par les tests (f3.spec.ts)
process.env.E2E_MAIL_DIR ??= join(tmpdir(), `awform-e2e-boite${ISOLE ? `-${SUFFIX}` : ''}`);
if (existsSync(join(LECONS_SRC, 'index.js'))) process.env.E2E_LECONS_AUDIO = '1';
// lot 9 : audio de synthèse des Madjaliss (MP3 générés le 14/10, hors dépôt) lu en place, en lecture seule
const MJ_AUDIO_DIR = process.env.E2E_MADJALISS_AUDIO_DIR ?? join(homedir(), 'madjaliss-audio');
if (existsSync(join(MJ_AUDIO_DIR, 'akhdari'))) process.env.E2E_MADJALISS_AUDIO = '1';
// A34 : Muṣḥaf exact — SEULEMENT avec E2E_MUSHAF_EXACT=1 et la copie Content Sync du serveur (jamais dans le
// dépôt) : les autres suites gardent la page fluide qu'elles vérifient
// copie de production (604 pages) si elle est là, sinon celle du prélancement (49 pages)
const QF_DIR =
  process.env.E2E_QF_MUSHAF_DIR ??
  [
    join(homedir(), 'awform-data', 'qf-mushaf-prod'),
    join(homedir(), 'awform-data', 'qf-mushaf'),
  ].find((d) => existsSync(join(d, 'publie', 'manifeste.json'))) ??
  join(homedir(), 'awform-data', 'qf-mushaf');
const QCF_DIR = process.env.E2E_QCF_DIR ?? join(homedir(), 'awform-data', 'qcf-1405');
const EXACT =
  process.env.E2E_MUSHAF_EXACT === '1' &&
  existsSync(join(QF_DIR, 'publie', 'manifeste.json')) &&
  existsSync(join(QCF_DIR, 'QCF_BSML.ttf'));
process.env.E2E_MUSHAF_EXACT_ON = EXACT ? '1' : '';
// lot 14 : l'API de test tourne sous son compte PostgreSQL à droits minimaux (comme en production)
process.env.E2E_DB_API_PW ??= randomBytes(24).toString('hex');
process.env.E2E_DB_WORKER_PW ??= randomBytes(24).toString('hex');
const API_DB = (() => {
  if (!TEST_DB) return '';
  const u = new URL(TEST_DB);
  u.username = `${ROLE_PREFIX}_api`;
  u.password = process.env.E2E_DB_API_PW!;
  return u.toString();
})();

/**
 * Bout en bout minimal : API (base de TEST, édition « e2e » importée depuis ~/awform-content)
 * + application construite (adapter-node), Chromium en émulation mobile.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  // une seule base de test et un seul profil de démonstration : tests en série
  workers: 1,
  reporter: [['list']],
  // comptes de test créés une fois (adulte ; parent + deux enfants) après le démarrage des serveurs
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    screenshot: 'only-on-failure',
    // environnement cloud : Chromium déjà présent mais d'une autre version que celle attendue
    // (aucun téléchargement) ; sans E2E_CHROMIUM, le navigateur de Playwright est utilisé (VM)
    ...(process.env.E2E_CHROMIUM
      ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } }
      : {}),
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: `node e2e/oidc-essai.mjs ${OIDC_PORT}`,
      url: `http://127.0.0.1:${OIDC_PORT}/sante`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `node e2e/ecoute-essai.mjs ${ECOUTE_PORT}`,
      url: `http://127.0.0.1:${ECOUTE_PORT}/sante`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // base de TEST remise à zéro, édition « e2e » importée ; comptes créés par globalSetup
      // puis comptes PostgreSQL séparés ; l'API tourne sous le compte « api » (droits minimaux)
      command: `node ../../packages/db/dist/cli/import.js --test --reset --edition e2e --publish && node e2e/audio-essai.mjs ${AUDIO_DIR} && node ../../packages/db/dist/cli/lecons-audio.js importer --test --si-present --niveaux en1,lect-ad1-01 --source ${LECONS_SRC} --stockage ${LECONS_DIR} && node ../../packages/db/dist/cli/roles.js --test && node ../api/dist/server.js`,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      env: {
        DATABASE_URL: API_DB,
        AWFORM_DB_ROLE_PREFIX: ROLE_PREFIX,
        AWFORM_DB_API_PASSWORD: process.env.E2E_DB_API_PW!,
        AWFORM_DB_WORKER_PASSWORD: process.env.E2E_DB_WORKER_PW!,
        API_HOST: '127.0.0.1',
        API_PORT: String(API_PORT),
        // http local : cookie sans attribut Secure (en production : Secure, derrière HTTPS)
        COOKIE_SECURE: '0',
        // nombreux comptes de test créés depuis 127.0.0.1
        AWFORM_SIGNUP_PER_HOUR: '5000',
        // lot 9 (R5) : les suites parallèles partagent les mêmes comptes de test (adulte@e2e.test…) et l'adresse
        // 127.0.0.1, bien au-delà d'un usage humain : limite des lectures relevée ici (la limite par défaut, 60/300, est
        // vérifiée par apps/api/test/lot9-limites.test.ts)
        AWFORM_LIMITE_LECTURES: process.env.AWFORM_LIMITE_LECTURES ?? '1000/10000',
        // clé de chiffrement des seconds facteurs : tirée au hasard pour chaque lancement de test
        AWFORM_SECRET_KEY: E2E_KEY,
        // tuteur : fournisseur SIMULÉ (aucun appel à un vrai modèle en test)
        AWFORM_TUTEUR: 'simule',
        // paiements : prestataire SIMULÉ (aucune clé, aucune donnée de carte)
        AWFORM_PAIEMENT: 'simule',
        // langues en préparation (traductions non relues) montrables, comme en démonstration
        AWFORM_LANGUES_PREPARATION: 'on',
        // lot 16 : clé de chiffrement des récitations envoyées (tirée au hasard) ; clé publique VAPID factice
        AWFORM_RECITATION_KEY: `v1:${randomBytes(32).toString('hex')}`,
        // lot 21 : clé de chiffrement des messages école ↔ famille (tirée au hasard)
        AWFORM_MESSAGE_KEY: `v1:${randomBytes(32).toString('hex')}`,
        // lot 27 : fichiers audio d'essai (bips), jamais une récitation ; récitateurs « essai-* » montrés
        // SEULEMENT en test (Coran épuré : jamais en démonstration ni en production)
        AWFORM_AUDIO_DIR: AUDIO_DIR,
        AWFORM_AUDIO_ESSAI: 'on',
        // A2 : récitateur en ligne d'essai : API de Quran Foundation SIMULÉE dans l'API de test (aucun réseau)
        QF_ENV: 'essai',
        // A37 : fiches d'ESSAI du livret « Bon comportement » (textes neutres), SEULEMENT en test
        AWFORM_AKHLAQ_ESSAI: 'on',
        // A3 : audio des leçons d'en1
        AWFORM_LECONS_AUDIO_DIR: LECONS_DIR,
        AWFORM_VAPID_PUBLIC: `B${'A'.repeat(86)}`,
        // A5 : « Réciter et vérifier » ouvert pour les e2e, service d'écoute factice
        AWFORM_ECOUTE_IA: 'on',
        AWFORM_ECOUTE_URL: `http://127.0.0.1:${ECOUTE_PORT}`,
        // bêta fermée : bandeau « Version bêta » masqué par défaut (les autres suites ne le voient pas ; il est testé par
        // beta-acces.spec.ts avec un état simulé) ; nombreux essais de codes depuis 127.0.0.1
        AWFORM_BANDEAU: 'off',
        // plafond d'inscriptions du mode ouvert : très haut pour les essais (testé à part, apps/api/test/beta-modes.test.ts)
        AWFORM_PLAFOND_COMPTES: '1000000',
        AWFORM_INVITATION_ESSAIS: '500',
        // lot F3 : e-mails écrits dans la boîte de démonstration ; liens vers l'application de test
        AWFORM_MAIL: 'journal',
        AWFORM_MAIL_JOURNAL_DIR: process.env.E2E_MAIL_DIR,
        AWFORM_PUBLIC_URL: `http://127.0.0.1:${WEB_PORT}`,
        // 18/10/2026 : « Continuer avec Google » contre le FAUX fournisseur local (jamais Google en test) ; numéro WhatsApp en
        // mode SIMULÉ (simulateur à la place du webhook de Meta, messages sortants dans la boîte de démonstration),
        // validation manuelle et secours payant allumés pour être testés (identites.spec.ts)
        AWFORM_GOOGLE: 'on',
        AWFORM_GOOGLE_CLIENT_ID: 'e2e-client',
        AWFORM_GOOGLE_CLIENT_SECRET: 'e2e-secret',
        AWFORM_GOOGLE_ESSAI_URL: `http://127.0.0.1:${OIDC_PORT}`,
        AWFORM_TELEPHONE: 'on',
        AWFORM_WHATSAPP: 'simule',
        AWFORM_WHATSAPP_NUMERO: '+221700000000',
        AWFORM_WHATSAPP_JOURNAL_DIR: process.env.E2E_WA_DIR,
        AWFORM_TELEPHONE_MANUEL: 'on',
        AWFORM_TELEPHONE_ENVOI: 'on',
        AWFORM_TELEPHONE_PAR_IP: '500',
        // comptes de démonstration par niveau (demo-niveaux.spec.ts) : connexion simplifiée, réseau local ;
        // SEULEMENT avec E2E_DEMO=1 (les autres suites tournent comme en production)
        ...(process.env.E2E_DEMO === '1' ? { AWFORM_DEMO: '1', SITE: '127.0.0.1' } : {}),
        ...(EXACT ? { AWFORM_QF_MUSHAF_DIR: QF_DIR, AWFORM_QCF_DIR: QCF_DIR } : {}),
      },
      reuseExistingServer: false,
      // import de l'édition et rôles : jusqu'à 2 minutes ; plus quand la VM partagée est chargée (vidéos, autres suites)
      timeout: 300_000,
    },
    {
      command: 'node build/index.js',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: {
        HOST: '127.0.0.1',
        PORT: String(WEB_PORT),
        API_URL: `http://127.0.0.1:${API_PORT}`,
        MADJALISS_AUDIO_DIR: MJ_AUDIO_DIR,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
