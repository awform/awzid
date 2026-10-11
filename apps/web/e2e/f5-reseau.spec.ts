import { mkdirSync, writeFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { listen } from './coran';
import { expect, test } from './fixtures';

/**
 * Lot F5 (suite, 11/10/2026) — demandes du client sur le réseau faible :
 *  (a) téléphone MOYEN en 3G (processeur ×4, 150 ms, 1,6 Mbit/s) : toucher « Écouter » → fichier audio demandé
 *      en moins d'1 s, « Verset 1 » affiché ;
 *  (b) modules de l'élève chargés à la demande gardés par le service worker : hors ligne, les pages qui les
 *      utilisent s'ouvrent, et un verset déjà écouté se réécoute ;
 *  (c) module qui ne vient pas : nouvelles tentatives automatiques, puis « Connexion nécessaire pour cette
 *      fonction » — jamais un écran figé ;
 *  (d) Muṣḥaf exact : lignes et polices des pages précédente et suivante préchargées (tourner est immédiat).
 * Mesures : test-results/f5-reseau-<projet>.json.
 */
test.use({ compte: 'adulte' });

const NET = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const mobile = (name: string) => name.startsWith('mobile');
const AUDIO = /\/api\/v1\/quran\/audio\/file\//;

async function ralentir(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NET);
}

function noter(nom: string, v: Record<string, unknown>) {
  const dir = test.info().outputDir.replace(/[/\\][^/\\]+$/, '');
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/f5-reseau-${nom}-${test.info().project.name}.json`, JSON.stringify(v));
}

async function pret(page: Page, timeout = 15_000) {
  await expect(page.getByTestId('barre-coran')).toBeVisible({ timeout });
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0, { timeout });
}

const lecture = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector('audio');
    return { paused: a?.paused ?? true, src: a?.currentSrc ?? '' };
  });

test('(a) téléphone moyen en 3G : « Écouter » → audio demandé en moins d’1 s, « Verset 1 » affiché', async ({
  page,
  context,
}, info) => {
  test.skip(!mobile(info.project.name), 'mesure faite une fois, profil téléphone');
  test.setTimeout(120_000);
  await ralentir(context, page);
  await page.goto('/coran/lecteur?page=604');
  await pret(page, 30_000);
  // premier toucher (le fichier n'est pas encore sur l'appareil) : délai jusqu'à la DEMANDE du fichier audio
  const req = page.waitForRequest(AUDIO, { timeout: 10_000 });
  const t0 = Date.now();
  await listen(page);
  await req;
  const delai = Date.now() - t0;
  await expect(page.getByTestId('position')).toContainText('Verset 1', { timeout: 10_000 });
  noter('ecouter-3g', { delai });
  expect(delai).toBeLessThan(1000);
  await page.getByTestId('arreter-audio').click();
});

test('(b) hors ligne : modules de l’élève gardés par le service worker ; un verset déjà écouté se réécoute', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/coran/lecteur?page=604');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // page servie par le service worker (contrôlée), puis écoute du verset 1 en ligne
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await pret(page);
  await listen(page);
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  await expect.poll(async () => (await lecture(page)).paused).toBe(false);
  // verset 1 entendu jusqu'au bout : gardé sur l'appareil
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 5000 });
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await (await caches.open('awzid-coran-audio-recents')).keys()).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByTestId('arreter-audio').click();
  // modules chargés à la demande par des pages de l'élève (image du verset, réglages du compte), en ligne
  const modules: string[] = [];
  page.on('request', (r) => {
    if (/\/_app\/immutable\/.+\.js/.test(r.url())) modules.push(new URL(r.url()).pathname);
  });
  await page.goto('/quotidien/verset?s=112&a=1');
  await expect(page.getByTestId('qt-partager')).toBeEnabled();
  await page.goto('/compte');
  await expect(page.locator('h1').first()).toBeVisible();
  // tous les fichiers de code demandés sont dans le cache du service worker
  const enCache = await page.evaluate(
    async (paths) => {
      const out: string[] = [];
      for (const p of paths) if (await caches.match(p)) out.push(p);
      return out;
    },
    [...new Set(modules)],
  );
  expect(modules.length).toBeGreaterThan(0);
  expect(enCache.sort()).toEqual([...new Set(modules)].sort());

  await context.setOffline(true);
  try {
    await page.goto('/quotidien/verset?s=112&a=1');
    await expect(page.getByTestId('qt-partager')).toBeEnabled();
    await expect(page.getByTestId('module-echec')).toHaveCount(0);
    await page.goto('/compte');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByTestId('module-echec')).toHaveCount(0);
    // le verset déjà écouté : même récitateur, même verset, sans réseau
    await page.goto('/coran/lecteur?page=604');
    await pret(page);
    await listen(page);
    await expect(page.getByTestId('position')).toContainText('Verset 1');
    await expect.poll(async () => (await lecture(page)).paused).toBe(false);
    await page.getByTestId('arreter-audio').click();
  } finally {
    await context.setOffline(false);
  }
});

test.describe('(c) module qui ne vient pas', () => {
  // requêtes du navigateur interceptées directement (sans service worker entre les deux)
  test.use({ serviceWorkers: 'block' });

  test('nouvelles tentatives automatiques, puis « Connexion nécessaire pour cette fonction » ; page jamais figée', async ({
    page,
  }) => {
    await page.goto('/plus');
    await expect(page.getByTestId('avis-ouvrir')).toBeVisible();
    await page.waitForLoadState('networkidle');
    let couper = true;
    const tentatives: string[] = [];
    await page.route(/\/_app\/immutable\/.+\.js(\?.*)?$/, async (route) => {
      if (!couper) return route.continue();
      tentatives.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    const t0 = Date.now();
    await page.getByTestId('avis-ouvrir').click();
    const msg = page.getByTestId('module-echec');
    await expect(msg).toContainText('Connexion nécessaire pour cette fonction', {
      timeout: 10_000,
    });
    const attente = Date.now() - t0;
    // au moins une NOUVELLE tentative automatique (adresse neuve : l'échec est mémorisé par le navigateur)
    expect(
      tentatives.some((u) => /\?essai=\d+$/.test(u)),
      tentatives.join('\n'),
    ).toBe(true);
    expect(attente).toBeLessThan(8000);
    await expect(page.getByTestId('avis-dialogue')).toHaveCount(0);
    // la page reste utilisable : rien de figé, les autres liens répondent
    await expect(page.getByTestId('avis-ouvrir')).toBeEnabled();
    await expect(page.locator('h1').first()).toBeVisible();
    // réseau revenu : « Réessayer » ouvre la fenêtre
    couper = false;
    await msg.getByTestId('module-reessayer').click();
    await expect(page.getByTestId('avis-dialogue')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('module-echec')).toHaveCount(0);
  });

  test('coupure brève : la nouvelle tentative suffit, aucun message', async ({ page }) => {
    await page.goto('/plus');
    await expect(page.getByTestId('avis-ouvrir')).toBeVisible();
    await page.waitForLoadState('networkidle');
    let coupes = 0;
    await page.route(/\/_app\/immutable\/.+\.js(\?.*)?$/, async (route) => {
      if (coupes++ === 0) return route.abort('internetdisconnected');
      return route.continue();
    });
    await page.getByTestId('avis-ouvrir').click();
    await expect(page.getByTestId('avis-dialogue')).toBeVisible({ timeout: 10_000 });
    expect(coupes).toBeGreaterThan(1);
    await expect(page.getByTestId('module-echec')).toHaveCount(0);
  });
});

test.describe('(d) Muṣḥaf exact', () => {
  test.skip(
    process.env.E2E_MUSHAF_EXACT_ON !== '1',
    'données Content Sync absentes (E2E_MUSHAF_EXACT=1 et ~/awform-data requis)',
  );

  test('lignes et polices des pages précédente et suivante préchargées ; tourner la page est immédiat', async ({
    page,
    context,
  }) => {
    const polices = new Set<string>();
    const lignes = new Set<number>();
    page.on('request', (r) => {
      const u = new URL(r.url()).pathname;
      const f = /\/mushaf-exact\/polices\/(.+)$/.exec(u);
      if (f) polices.add(f[1]!);
      const l = /\/mushaf-exact\/pages\/(\d+)$/.exec(u);
      if (l) lignes.add(Number(l[1]));
    });
    await page.goto('/coran/lecteur?page=3');
    await expect(page.locator('[data-testid="mushaf-page"][data-page="3"]')).toHaveAttribute(
      'data-exact',
      '1',
      { timeout: 15_000 },
    );
    const vues = (
      await page
        .locator('[data-testid="mushaf-page"]')
        .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-page'))))
    ).filter((n) => n > 0);
    for (const n of vues)
      await expect(page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`)).toHaveAttribute(
        'data-exact',
        '1',
        { timeout: 15_000 },
      );
    const a = Math.min(...vues);
    const b = Math.max(...vues);
    const voisines = vues.flatMap((_, i) => [a - i - 1, b + i + 1]).filter((n) => n >= 1);
    await expect
      .poll(() => voisines.filter((n) => !lignes.has(n)), { timeout: 15_000 })
      .toEqual([]);
    const fichier = (n: number) => new RegExp(`(^|[^0-9])0*${n}\\.ttf$`);
    await expect
      .poll(() => voisines.filter((n) => ![...polices].some((f) => fichier(n).test(f))), {
        timeout: 15_000,
      })
      .toEqual([]);
    // page suivante sans réseau : déjà prête (lignes et police sur l'appareil)
    await context.setOffline(true);
    try {
      await page.keyboard.press('ArrowLeft');
      await expect(
        page.locator(`[data-testid="mushaf-page"][data-page="${b + 1}"]`),
      ).toHaveAttribute('data-exact', '1', { timeout: 3000 });
    } finally {
      await context.setOffline(false);
    }
  });
});
