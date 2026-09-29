import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* pas de .env : valeurs par défaut */
}

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
