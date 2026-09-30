import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* pas de .env */
}

const TEST_DB = process.env.TEST_DATABASE_URL ?? '';
const API_PORT = 3100;
const WEB_PORT = 4180;
process.env.E2E_KEY ??= randomBytes(32).toString('hex');
const E2E_KEY = process.env.E2E_KEY;
// lot 14 : l'API de test tourne sous son compte PostgreSQL à droits minimaux (comme en production)
process.env.E2E_DB_API_PW ??= randomBytes(24).toString('hex');
process.env.E2E_DB_WORKER_PW ??= randomBytes(24).toString('hex');
const API_DB = (() => {
  if (!TEST_DB) return '';
  const u = new URL(TEST_DB);
  u.username = 'awform_e2e_api';
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
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // base de TEST remise à zéro, édition « e2e » importée ; comptes créés par globalSetup
      // puis comptes PostgreSQL séparés ; l'API tourne sous le compte « api » (droits minimaux)
      command: `node ../../packages/db/dist/cli/import.js --test --reset --edition e2e --publish && node ../../packages/db/dist/cli/roles.js --test && node ../api/dist/server.js`,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      env: {
        DATABASE_URL: API_DB,
        AWFORM_DB_ROLE_PREFIX: 'awform_e2e',
        AWFORM_DB_API_PASSWORD: process.env.E2E_DB_API_PW!,
        AWFORM_DB_WORKER_PASSWORD: process.env.E2E_DB_WORKER_PW!,
        API_HOST: '127.0.0.1',
        API_PORT: String(API_PORT),
        // http local : cookie sans attribut Secure (en production : Secure, derrière HTTPS)
        COOKIE_SECURE: '0',
        // nombreux comptes de test créés depuis 127.0.0.1
        AWFORM_SIGNUP_PER_HOUR: '200',
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
        AWFORM_VAPID_PUBLIC: `B${'A'.repeat(86)}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'node build/index.js',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { HOST: '127.0.0.1', PORT: String(WEB_PORT), API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
