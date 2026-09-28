import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitaires des modules de l'appareil (hors ligne, file d'événements) : IndexedDB simulée.
export default defineConfig({
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
