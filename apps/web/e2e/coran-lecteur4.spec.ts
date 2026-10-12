import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { listen } from './coran';
import { expect, test } from './fixtures';

/**
 * Lot lecteur 4 (retours du client du 12/10/2026, 13 h à 13 h 35) :
 * 1. « Grand texte » (versets, texte agrandi) par défaut ; page exacte seulement si l'élève la demande ;
 * 2. « Mémoriser » garde l'affichage choisi ; le quitter rétablit l'état d'avant ;
 * 3. bouton « Grand texte » (nom écrit) dans la barre du lecteur, choix mémorisé ;
 * 5. mots masqués : traits discrets (plus de gros blocs) ;
 * 8. pastille « Verset N » dans le coin bas gauche en portrait aussi.
 * Captures : LECTEUR4_CAPTURES=<dossier> (412 × 915 et 915 × 412, clair et sombre).
 */
const CAP = process.env.LECTEUR4_CAPTURES;
test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  grandTexte: true,
});
test.beforeEach(({}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'téléphone');
});

const prefs = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('awzid.mushaf.v1') ?? '{}'));

async function pret(page: Page) {
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

test('« Grand texte » par défaut, bouton de la barre, choix mémorisé', async ({ page }) => {
  await page.goto('/coran/lecteur?s=2');
  await pret(page);
  await expect(page.getByTestId('texte-coran')).toBeVisible();
  const b = page.getByTestId('barre-grand-texte');
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(b).toContainText('Grand texte');
  expect(await prefs(page)).toMatchObject({ vue: 'versets', size: 1 });
  // un toucher : la page du muṣḥaf ; mémorisé
  await b.tap();
  await expect(page.getByTestId('mushaf-livre')).toBeVisible();
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await pret(page);
  await expect(page.getByTestId('mushaf-livre')).toBeVisible();
  await expect(page.getByTestId('barre-grand-texte')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('barre-grand-texte').tap();
  await expect(page.getByTestId('texte-coran')).toBeVisible();
});

test('appareil ancien (page exacte gardée avant le lot 4) : « Grand texte » une fois', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?s=2');
  await page.evaluate(() =>
    localStorage.setItem('awzid.mushaf.v1', JSON.stringify({ vue: 'page', size: 0 })),
  );
  await page.goto('/coran/lecteur?s=2');
  await pret(page);
  await expect(page.getByTestId('texte-coran')).toBeVisible();
});

test("« Mémoriser » garde le Grand texte, traits discrets ; le quitter rétablit l'avant", async ({
  page,
}) => {
  await page.goto('/coran/lecteur?s=1');
  await pret(page);
  const avant = await prefs(page);
  await page.getByTestId('ouvrir-reglages-lecteur').tap();
  await page.getByTestId('reglages').getByTestId('mode-memoriser').tap();
  await expect(page.locator('p[data-testid="mode-memoriser"]')).toBeVisible();
  await page.getByTestId('reglages').getByTestId('fermer-feuille').tap();
  // même affichage (versets), jamais la page exacte
  await expect(page.getByTestId('texte-coran')).toBeVisible();
  await expect(page.getByTestId('mushaf-livre')).toHaveCount(0);
  // mots masqués : un trait, plus un bloc plein
  const voile = page.locator('[data-testid="texte-coran"] .w.voile').first();
  await expect(voile).toBeAttached();
  const st = await voile.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { img: cs.backgroundImage, couleur: cs.backgroundColor };
  });
  expect(st.img).toContain('linear-gradient');
  expect(st.couleur).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  if (CAP) {
    mkdirSync(CAP, { recursive: true });
    await page.screenshot({ path: join(CAP, 'memoriser-412x915-clair.png') });
  }
  await page.getByTestId('quitter-memoriser').tap();
  await expect(page.locator('p[data-testid="mode-memoriser"]')).toHaveCount(0);
  await expect(page.getByTestId('texte-coran')).toBeVisible();
  const apres = await prefs(page);
  for (const k of ['vue', 'size', 'chain', 'repeatVerse', 'repeatRange'])
    expect(apres[k], k).toEqual(avant[k]);
  expect(apres.memo).toBe(0);
});

test('pastille « Verset N » dans le coin bas gauche en portrait', async ({ page }) => {
  await page.goto('/coran/lecteur?page=1&vue=page');
  await pret(page);
  await listen(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  const p = page.getByTestId('pastille-audio');
  await expect(p).toBeVisible({ timeout: 10_000 });
  const r = (await p.boundingBox())!;
  expect(r.x).toBeLessThan(24);
  expect(915 - (r.y + r.height)).toBeLessThan(40);
});

for (const [nom, vp] of [
  ['412x915', { width: 412, height: 915 }],
  ['915x412', { width: 915, height: 412 }],
] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`captures ${nom} ${theme === 'light' ? 'clair' : 'sombre'}`, async ({ page }) => {
      test.skip(!CAP, 'captures : LECTEUR4_CAPTURES');
      mkdirSync(CAP!, { recursive: true });
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: theme });
      const nomT = theme === 'light' ? 'clair' : 'sombre';
      await page.goto('/coran/lecteur?s=2');
      await pret(page);
      await page.screenshot({ path: join(CAP!, `grand-texte-${nom}-${nomT}.png`) });
      await page.getByTestId('ouvrir-reglages-lecteur').tap();
      await expect(page.getByTestId('reglages')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(CAP!, `reglages-${nom}-${nomT}.png`) });
      await page.getByTestId('reglages').getByTestId('fermer-feuille').tap();
      await page.goto('/coran/lecteur?page=1&vue=page');
      await pret(page);
      await listen(page);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      await expect(page.getByTestId('pastille-audio')).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: join(CAP!, `pastille-${nom}-${nomT}.png`) });
    });
