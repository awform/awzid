import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* pas de .env */
}

const TEST_DB = process.env.TEST_DATABASE_URL ?? '';
const API_PORT = 3100;
const WEB_PORT = 4180;

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
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, locale: 'fr-FR', timezoneId: 'Europe/Paris' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // base de TEST remise à zéro, édition « e2e » importée, profils fictifs de démonstration
      command: `node ../../packages/db/dist/cli/import.js --test --reset --edition e2e --publish --demo && node ../api/dist/server.js`,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      env: {
        DATABASE_URL: TEST_DB,
        API_HOST: '127.0.0.1',
        API_PORT: String(API_PORT),
        AWFORM_DEV_ATTEMPTS: '1',
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
