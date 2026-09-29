import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from './fixtures';

/**
 * Budget de démarrage sur appareil d'ENTRÉE DE GAMME (étude des plateformes, rec. 7) : processeur ralenti
 * ×4 et réseau « 3G » (150 ms, 1,6 Mbit/s). Mesures : premier lancement (tout vient du réseau) et
 * relance (application installée : coquille servie par le service worker). Budget : relance < 3 s,
 * premier lancement < 6 s. Les mesures sont écrites dans test-results/perf-<projet>.json.
 * À confirmer sur un vrai Tecno ou Itel (grille de TEST_APPAREILS.md).
 */
test.use({ compte: 'adulte' });

test('démarrage < 3 s sur appareil d’entrée de gamme (CPU ×4, 3G)', async ({
  page,
  context,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'mesure faite une fois, profil téléphone');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  const heading = page.getByRole('heading', { name: 'Mes livres' });

  let t0 = Date.now();
  await page.goto('/');
  await expect(heading).toBeVisible({ timeout: 20_000 });
  const premier = Date.now() - t0;
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  t0 = Date.now();
  await page.reload();
  await expect(heading).toBeVisible({ timeout: 20_000 });
  const relance = Date.now() - t0;

  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    `test-results/perf-${info.project.name}.json`,
    JSON.stringify({
      premierMs: premier,
      relanceMs: relance,
      cpu: 4,
      reseau: '3G 150 ms 1,6 Mbit/s',
    }),
  );
  info.annotations.push({
    type: 'perf',
    description: `premier ${premier} ms, relance ${relance} ms`,
  });
  expect(relance).toBeLessThan(3000);
  expect(premier).toBeLessThan(6000);
});
