import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { openSettings } from './coran';
import { expect, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * 11/10/2026 — une seule identité (clair et sombre) : thèmes « jardin », « nuit étoilée », « manuscrit » et palette
 * « verdure » supprimés ; en-tête avec noms écrits et police de la marque ; lecteur du Coran en Ivoire / Sépia /
 * sombre sans décor ; retours d'exercice en « attention ». Captures à 375 px si CAPTURES_DIR est défini.
 */
const DIR = process.env.CAPTURES_DIR;
const shotFn = (page: Page) => async (name: string) => {
  if (!DIR) return;
  mkdirSync(DIR, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(DIR, `${name}.png`) });
};
const MOBILE = { width: 375, height: 812 };
const root = (page: Page, v: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);

test('en-tête : noms écrits (Thème, Télécharger, Compte) lisibles à 375 px, nom Awzid en Lexend 600', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/aujourdhui');
  await page.locator('main h1').first().waitFor();
  const noms = page.locator('header.top .ic-nom');
  await expect(noms).toHaveText(['Thème', 'Télécharger', 'Compte']);
  for (const b of await noms.all()) {
    const box = (await b.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(MOBILE.width);
  }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(MOBILE.width);
  const police = await page
    .getByTestId('accueil')
    .locator('.word')
    .evaluate((el) => `${getComputedStyle(el).fontFamily}|${getComputedStyle(el).fontWeight}`);
  expect(police).toMatch(/Lexend.*\|600$/);
  await page.evaluate(() => document.fonts.load("600 16px 'Lexend'"));
  expect(await page.evaluate(() => document.fonts.check("600 16px 'Lexend'"))).toBe(true);
});

test('une seule identité : clair et sombre suivent le téléphone ; aucun décor ni palette', async ({
  page,
}) => {
  const shot = shotFn(page);
  await page.setViewportSize(MOBILE);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/aujourdhui');
    await page.locator('main h1').first().waitFor();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
    await expect(page.locator('html')).not.toHaveAttribute('data-palette', /.+/);
    expect(await root(page, '--paper')).toBe(scheme === 'light' ? '#fbf7ee' : '#0d1a15');
    expect(
      await page.evaluate(() => getComputedStyle(document.body).backgroundImage),
      'aucun motif de fond',
    ).toBe('none');
    const axe = (await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(axe.map((v) => v.id)).toEqual([]);
    await shot(`accueil-adulte-${scheme === 'light' ? 'clair' : 'sombre'}`);
  }
});

test('migration silencieuse : ancien manuscrit (lecteur déjà utilisé) → clair + Sépia, écran intact', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('awzid.themes.v2')) return;
    localStorage.setItem('awzid.coran.signets.v1', '[]');
  });
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/aujourdhui');
  await page.locator('main h1').first().waitFor();
  // adulte = ancien « manuscrit » : mode clair imposé et lecteur en Sépia
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'clair');
  await expect(page.locator('html')).toHaveAttribute('data-fond', 'sepia');
  expect(await page.evaluate(() => localStorage.getItem('awzid.themes.v2'))).toBe('1');
  await expect(page.locator('main h1').first()).toBeVisible();
});

test('lecteur du Coran : Ivoire (défaut), Sépia en clair, fond sombre de la marque, aucun décor', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'captures à 375 px');
  const shot = shotFn(page);
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/coran/lecteur?page=1');
  await expect(page.locator('[data-page="1"]')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-fond', /.+/);
  expect(await root(page, '--mp-paper')).toBe('#fffdf5');
  await shot('coran-ivoire');
  // choix du fond dans les réglages (section Affichage)
  await openSettings(page);
  await page.getByTestId('fond-sepia').check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-fond', 'sepia');
  expect(await root(page, '--mp-paper')).toBe('#f8f0de');
  const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('awzid.mushaf.v1')!));
  expect(prefs.fond).toBe('sepia');
  await page.keyboard.press('Escape');
  await shot('coran-sepia');
  // mode sombre : le fond sombre de la marque l'emporte, même avec Sépia choisi
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => root(page, '--mp-paper')).toBe('#14261f');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toBe('none');
  await shot('coran-sombre');
});

test.describe('enfant', () => {
  test.use({ compte: 'parent' });
  test('accueil enfant : même identité, ergonomie enfant conservée (texte 18 px, cibles 56 px)', async ({
    page,
  }) => {
    const shot = shotFn(page);
    await page.setViewportSize(MOBILE);
    await page.emulateMedia({ colorScheme: 'light' });
    await pickProfile(page, 'Yanis');
    await page.goto('/aujourdhui');
    await page.locator('main h1').first().waitFor();
    await expect(page.locator('html')).toHaveAttribute('data-public', 'enfant');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
    expect(await root(page, '--font-size')).toBe('18px');
    expect(await root(page, '--target')).toBe('56px');
    expect(await root(page, '--paper')).toBe('#fbf7ee');
    await shot('accueil-enfant-clair');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => root(page, '--paper')).toBe('#0d1a15');
    await shot('accueil-enfant-sombre');
  });
});

test('exercice : « presque, réessaie » en attention (jamais en rouge), réussite avec ✓ et le mot', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'captures à 375 px');
  const shot = shotFn(page);
  await page.setViewportSize(MOBILE);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/lecons/en1.l03');
    const quiz = page.locator('section.ex .quiz').first();
    await quiz.scrollIntoViewIfNeeded();
    const retry = page.locator('section.ex .retry').first();
    for (const q of await quiz.locator('.q').all()) {
      if ((await retry.count()) > 0) break;
      for (const b of await q.locator('.opts button').all()) {
        await b.click();
        if ((await q.locator('.retry').count()) > 0 || (await q.locator('.juste').count()) > 0)
          break;
      }
    }
    await expect(retry).toBeVisible();
    await expect(retry).toContainText('↻');
    const couleur = await retry.evaluate((el) => getComputedStyle(el).color);
    expect(couleur).toBe(scheme === 'light' ? 'rgb(138, 90, 11)' : 'rgb(224, 176, 96)');
    await retry.scrollIntoViewIfNeeded();
    await shot(`exercice-attention-${scheme === 'light' ? 'clair' : 'sombre'}`);
  }
  // une réussite montre ✓ et le mot « Juste »
  await page.goto('/lecons/en1.l03');
  const premier = page.locator('section.ex .quiz .q').first();
  for (const b of await premier.locator('.opts button').all()) {
    if ((await premier.locator('.juste').count()) > 0) break;
    await b.click();
  }
  await expect(premier.locator('.juste')).toContainText('✓');
  await expect(premier.locator('.juste')).toContainText('Juste');
});
