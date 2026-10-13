import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Tests unitaires des modules de l'appareil (hors ligne, file d'événements) : IndexedDB simulée.
// Composants Svelte rendus côté serveur (`svelte/server`) quand un test les importe (ex. : TexteEcoute).
export default defineConfig({
  plugins: [svelte()],
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  // délai élargi : l'analyse de tous les catalogues (≈ 14 000 messages) approche 5 s quand la machine est chargée
  test: { include: ['src/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
});
