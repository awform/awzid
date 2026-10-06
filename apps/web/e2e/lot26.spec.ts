import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot 26 — design v2 : thème par public, navigation de 3 à 5 entrées, premier lancement, hors ligne
 * explicite, petit écran (320 px), mode sombre contrasté (axe-core), mouvement réduit.
 */
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

async function noHorizontalScroll(page: Page, url: string) {
  await page.goto(url);
  await page.locator('main h1').first().waitFor();
  await page.waitForLoadState('networkidle').catch(() => {});
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, `${url} : la page défile horizontalement`).toBeLessThanOrEqual(cw);
}

test('adulte : thème « manuscrit », 5 entrées, accueil de premier lancement montré une seule fois', async ({
  page,
}) => {
  await page.goto('/aujourdhui');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'manuscrit');
  await expect(page.locator('nav.tabs a')).toHaveCount(5);
  const hello = page.getByTestId('bienvenue');
  await expect(hello).toBeVisible();
  await page.getByTestId('bienvenue-ok').click();
  await expect(hello).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('seance')).toBeVisible();
  await expect(hello).toHaveCount(0);
});

test('mode sombre : aucune violation grave de contraste (axe-core) sur les écrans de l’adulte', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const url of ['/aujourdhui', '/', '/lecons/ad1.l10', '/plus', '/coran']) {
    await page.goto(url);
    await page.locator('main h1').first().waitFor();
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(await serious(page), url).toEqual([]);
  }
  // réglage de l'appareil : « clair » l'emporte sur la préférence sombre du système
  await page.getByTestId('mode-affichage').click(); // auto → sombre
  await page.getByTestId('mode-affichage').click(); // sombre → clair
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'clair');
  // dernière page : l'espace Coran, palette « vert, blanc, or » (Coran épuré) en mode clair imposé
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(246, 251, 247)');
  await page.goto('/plus');
  await page.locator('main h1').first().waitFor();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(247, 241, 227)',
  );
});

test('petit écran de 320 px : aucune page ne défile horizontalement', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const url of [
    '/aujourdhui',
    '/',
    '/niveaux/ad1',
    '/lecons/ad1.l10',
    '/coran',
    '/plus',
    '/compte',
  ])
    await noHorizontalScroll(page, url);
});

test('hors ligne : bandeau explicite, puis disparition au retour du réseau', async ({ page }) => {
  await page.goto('/aujourdhui');
  await page.locator('main h1').waitFor();
  await page.context().setOffline(true);
  const bar = page.getByTestId('hors-ligne');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('partiront au retour du réseau');
  await page.context().setOffline(false);
  await expect(bar).toHaveCount(0);
});

test('mouvement réduit : transitions neutralisées', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/plus');
  const d = await page
    .locator('a.tile')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(d).toBeLessThan(0.01);
});

test.describe('famille', () => {
  test.use({ compte: 'parent' });
  test('parent « clair » (5 entrées, A12), enfant « jardin » (5 grandes entrées, cibles ≥ 56 px)', async ({
    page,
  }) => {
    await page.goto('/profils');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
    await expect(page.locator('nav.tabs a')).toHaveCount(5);
    await expect(page.getByTestId('bienvenue')).toHaveAttribute('data-public', 'parent');
    await pickProfile(page, 'Yanis');
    await page.goto('/aujourdhui');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'jardin');
    await expect(page.locator('nav.tabs a')).toHaveCount(5);
    await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toBeVisible();
    // consignes lues par l'adulte pour un enfant non lecteur
    await expect(page.getByTestId('bienvenue')).toContainText('Pour l’adulte'.replace('’', "'"));
    const h = await page
      .getByTestId('bienvenue-ok')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(56);
    expect(await serious(page)).toEqual([]);
    // les espaces du parent restent « clairs » même avec un enfant actif
    await page.goto('/compte');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
  });
});
