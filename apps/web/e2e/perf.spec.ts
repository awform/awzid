import { mkdirSync, writeFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Lot F5 — indicateur (c) du budget : OUVERTURE EN 3G SIMULÉE sur un téléphone MOYEN (étude des plateformes,
 * rec. 7) : processeur ralenti ×4, réseau 150 ms et 1,6 Mbit/s (profil « mobile » de Lighthouse). Budget : < 3 s
 * pour la PREMIÈRE ouverture de l'élève (rien en cache : tout vient du réseau) et pour la relance (application
 * installée : coquille servie par le service worker). Médiane de 3 ouvertures à froid, chacune dans un contexte
 * neuf (même session). Octets réellement transférés notés par type (indicateur (b), vu du navigateur).
 * Mesures : reports/perf-3g.json (recopiées par budget.mjs dans reports/budget-web.md) et
 * test-results/perf-<projet>.json. À confirmer sur un vrai Tecno ou Itel (grille de TEST_APPAREILS.md).
 */
test.use({ compte: 'adulte' });

const NET = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

async function throttle(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NET);
  const octets: Record<string, number> = {};
  const types = new Map<string, string>();
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
  cdp.on('Network.loadingFinished', (e) => {
    const k = (types.get(e.requestId) ?? 'Other').toLowerCase();
    octets[k] = (octets[k] ?? 0) + e.encodedDataLength;
  });
  return octets;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

test('ouverture < 3 s en 3G simulée (CPU ×4, 150 ms, 1,6 Mbit/s) : premier lancement et relance', async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'mesure faite une fois, profil téléphone');
  test.setTimeout(180_000);
  const state = await context.storageState();
  const opts = { ...info.project.use, storageState: state, baseURL: info.project.use.baseURL };
  const ouvertures: number[] = [];
  let octets: Record<string, number> = {};
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const o = await throttle(ctx, p);
    const t0 = Date.now();
    await p.goto('/');
    await expect(p.getByRole('heading', { name: 'Mon arabe' })).toBeVisible({ timeout: 20_000 });
    ouvertures.push(Date.now() - t0);
    if (i === 0) {
      // octets de la première ouverture (sans le préchargement du service worker, fait en arrière-plan)
      await p.waitForTimeout(500);
      octets = { ...o };
    }
    await ctx.close();
  }
  // relance : application installée (coquille servie par le service worker)
  await throttle(context, page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mon arabe' })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // laisser le service worker finir son préchargement avant de relancer
  await page.waitForTimeout(1500);
  const t1 = Date.now();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mon arabe' })).toBeVisible({ timeout: 20_000 });
  const relance = Date.now() - t1;

  const ko = (n: number) => Math.round((n / 1024) * 10) / 10;
  const mesure = {
    ouvertureMs: median(ouvertures),
    ouverturesMs: ouvertures,
    relanceMs: relance,
    octetsPremiereOuvertureKo: Object.fromEntries(
      Object.entries(octets).map(([k, v]) => [k, ko(v)]),
    ),
    totalPremiereOuvertureKo: ko(Object.values(octets).reduce((a, b) => a + b, 0)),
    cpu: 4,
    reseau: '3G simulée : 150 ms, 1,6 Mbit/s descendant, 750 kbit/s montant',
    date: new Date().toISOString().slice(0, 10),
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/perf-${info.project.name}.json`, JSON.stringify(mesure));
  mkdirSync('../../reports', { recursive: true });
  writeFileSync('../../reports/perf-3g.json', `${JSON.stringify(mesure, null, 2)}\n`);
  info.annotations.push({
    type: 'perf',
    description: `ouverture ${mesure.ouvertureMs} ms (${ouvertures.join(', ')}), relance ${relance} ms, ${mesure.totalPremiereOuvertureKo} Ko transférés`,
  });
  // indicateur (b), vu du navigateur : JS + CSS de la première ouverture ≤ 150 Ko (transférés, compressés)
  expect(((octets.script ?? 0) + (octets.stylesheet ?? 0)) / 1024).toBeLessThan(150);
  expect(mesure.ouvertureMs).toBeLessThan(3000);
  expect(relance).toBeLessThan(3000);
});
