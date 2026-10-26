import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Récitation de Muḥammad Ayyūb dans les leçons et les douas (26/10/2026) — toute citation du Coran gardée sans voix de
 * synthèse est entendue avec Ayyūb, à travers le PETIT LECTEUR de l'application (pause, ±5 s, vitesse ; indice « ⋯ » et
 * appui long pour les réglages). Audio SIMULÉ (silence de 0,3 s) : le paquet de sourate d'Ayyūb et les fichiers sont
 * interceptés ; aucun récitateur en ligne, aucun fichier de synthèse pour le verset.
 */
const SILENCE = Buffer.from(
  readFileSync(new URL('./cahier.spec.ts', import.meta.url), 'utf8').match(
    /const SILENCE = Buffer\.from\(\s*'([^']+)'/,
  )![1]!,
  'base64',
);

interface Sons {
  recitations: string[];
  synthese: string[];
  paquets: string[];
}
async function audioSimule(page: Page, retire = false): Promise<Sons> {
  const sons: Sons = { recitations: [], synthese: [], paquets: [] };
  await page.route(/\/api\/v1\/quran\/audio\/reciters\/[^/]+\/packs\/\d+/, (r) => {
    const u = r.request().url();
    sons.paquets.push(u);
    const sura = Number(/packs\/(\d+)/.exec(u)![1]);
    if (retire || !u.includes('/ayyoub-hafs/'))
      return r.fulfill({ status: 404, json: { error: 'recitateur_indisponible' } });
    return r.fulfill({
      json: {
        format: 1,
        reciter: 'ayyoub-hafs',
        riwaya: 'hafs',
        credit: '',
        sura,
        hash: `t${sura}`,
        surlignage: 'verset',
        wifiSeulement: false,
        bytes: SILENCE.length * 300,
        durationMs: 300,
        files: Array.from({ length: 290 }, (_, i) => ({
          aya: i + 1,
          url: `/api/v1/quran/audio/file/ayyoub-hafs/${sura}-${i + 1}.mp3`,
          bytes: SILENCE.length,
          sha256: '',
          durationMs: 300,
          format: 'mp3',
          surlignage: 'verset',
        })),
      },
    });
  });
  await page.route('**/api/v1/quran/audio/file/**', (r) => {
    sons.recitations.push(new URL(r.request().url()).pathname);
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  await page.route('**/api/v1/lecons-audio/fichiers/*.mp3', (r) => {
    sons.synthese.push(new URL(r.request().url()).pathname);
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  return sons;
}

/** toutes les étapes de la leçon visibles (le bouton est dans la lecture) */
async function lecon(page: Page, id: string) {
  await page.goto(`/lecons/${id}`);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('.etape[hidden]')) e.removeAttribute('hidden');
  });
}

test.describe('récitation d’Ayyūb dans les leçons', () => {
  test('citation gardée : bouton « Récitation », verset entier d’Ayyūb par le petit lecteur, jamais la synthèse', async ({
    page,
  }) => {
    const sons = await audioSimule(page);
    await lecon(page, 'en4.l13');
    const b = page.locator('[data-testid="recitation"][data-versets="12:4"]').first();
    await expect(b).toBeVisible({ timeout: 15_000 });
    await expect(b).toHaveAttribute('data-lecteur', 'l');
    // ce qui est joué se voit, discrètement : « sourate:verset »
    await expect(b.getByTestId('recitation-ref')).toHaveText('12:4');
    // cible de 44 px au moins, nom accessible qui dit le récitateur et le verset entier
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(b).toHaveAttribute('aria-label', /Ayyūb.*12:4/);
    await b.click();
    await expect(page.getByTestId('lecteur')).toBeVisible();
    await expect
      .poll(() => sons.recitations, { timeout: 15_000 })
      .toContain('/api/v1/quran/audio/file/ayyoub-hafs/12-4.mp3');
    expect(sons.paquets.every((u) => u.includes('/ayyoub-hafs/'))).toBe(true);
    expect(sons.synthese).toEqual([]);
    // la pastille montre qu'elle se règle (« ⋯ ») ; un appui long ouvre les réglages : vitesse, ±5 s
    await expect(page.getByTestId('lecteur-regler')).toContainText('⋯');
    const pastille = page.getByTestId('lecteur');
    const p = (await pastille.boundingBox())!;
    await page.mouse.move(p.x + 4, p.y + p.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await expect(pastille).toHaveAttribute('data-deplie', 'true');
    await expect(page.getByTestId('lecteur-recul')).toBeVisible();
    await page.getByTestId('lecteur-vitesse-0.75').click();
    await expect(page.getByTestId('lecteur-vitesse-0.75')).toHaveAttribute('aria-pressed', 'true');
  });

  test('hors ligne : le verset gardé sur l’appareil se réécoute, sans réseau', async ({
    page,
    context,
  }) => {
    const sons = await audioSimule(page);
    await lecon(page, 'en4.l13');
    const b = page.locator('[data-testid="recitation"][data-versets="12:4"]').first();
    await expect(b).toBeVisible({ timeout: 15_000 });
    await b.click();
    await expect.poll(() => sons.recitations.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // le verset est dans le cache des récitations (sourate téléchargée ou verset écouté)
    await page.evaluate(async (corps) => {
      const c = await caches.open('awzid-coran-audio-recents');
      await c.put(
        '/api/v1/quran/audio/file/ayyoub-hafs/12-4.mp3',
        new Response(
          Uint8Array.from(atob(corps), (x) => x.charCodeAt(0)),
          {
            headers: { 'content-type': 'audio/mpeg' },
          },
        ),
      );
    }, SILENCE.toString('base64'));
    await page.waitForTimeout(800);
    const avant = sons.recitations.length;
    await context.setOffline(true);
    await b.click();
    await expect(page.getByTestId('lecteur')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('lecteur-etat').locator('[role="alert"]')).toHaveCount(0);
    expect(sons.recitations.length).toBe(avant);
    await context.setOffline(false);
  });

  test('récitateur retiré : rien n’est joué, aucune voix de synthèse à la place, pas de plantage', async ({
    page,
  }) => {
    const sons = await audioSimule(page, true);
    await lecon(page, 'en4.l18');
    const b = page.locator('[data-testid="recitation"][data-versets="37:102"]').first();
    await expect(b).toBeVisible({ timeout: 15_000 });
    await b.click();
    await expect(page.getByTestId('lecteur-etat').locator('[role="alert"]')).toBeVisible({
      timeout: 15_000,
    });
    expect(sons.recitations).toEqual([]);
    expect(sons.synthese).toEqual([]);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('livre des enfants : la récitation est proposée (Yūsuf 12:4, l’exemple de nombres, jamais en synthèse)', async ({
    page,
  }) => {
    const sons = await audioSimule(page);
    await lecon(page, 'en4.l13');
    const b = page.locator('[data-testid="recitation"][data-versets="12:4"]').first();
    await expect(b).toBeVisible({ timeout: 15_000 });
    await b.click();
    await expect
      .poll(() => sons.recitations, { timeout: 15_000 })
      .toContain('/api/v1/quran/audio/file/ayyoub-hafs/12-4.mp3');
  });
});

test('douas tirées du Coran : récitation d’Ayyūb par le petit lecteur', async ({ page }) => {
  const sons = await audioSimule(page);
  await page.goto('/vivre/douas?r=coran');
  const b = page.locator('[data-doua] [data-testid="recitation"]').first();
  await expect(b).toBeVisible({ timeout: 15_000 });
  await b.click();
  await expect(page.getByTestId('lecteur')).toBeVisible();
  await expect.poll(() => sons.recitations.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(sons.recitations.every((u) => u.includes('/ayyoub-hafs/'))).toBe(true);
});
