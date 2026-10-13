import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* pas de .env : valeurs par défaut */
}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // bêta : les essais créent beaucoup de comptes ; le plafond d'inscriptions (200 par défaut) est testé à part
    env: { AWFORM_PLAFOND_COMPTES: '1000000' },
  },
});
