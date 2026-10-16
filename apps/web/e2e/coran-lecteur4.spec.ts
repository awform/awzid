import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { listen } from './coran';
import { expect, test } from './fixtures';

/**
 * Lot lecteur 4 (retours du client du 12/10/2026, 13 h à 13 h 35) :
 * 1. précision du client (« laisse le mode normal par défaut ») : affichage par défaut INCHANGÉ (comme main) ;
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
});
// eslint-disable-next-line no-empty-pattern -- Playwright exige un objet déstructuré en premier argument
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

test('nouvel élève : affichage par défaut IDENTIQUE à main (aucun mode nouveau, aucun défaut changé)', async ({
  page,
}) => {
  await page.goto('/coran/lecteur');
  await pret(page);
  // comme main (a053633) : la page du muṣḥaf, taille normale, style Médine, rien de masqué
  await expect(page.getByTestId('mushaf-livre')).toBeVisible();
  await expect(page.getByTestId('texte-coran')).toHaveCount(0);
  expect(await prefs(page)).toMatchObject({
    vue: 'page',
    size: 0,
    style: 'exact',
    memo: 0,
    zoom: 1,
    epure: true,
  });
  await expect(page.getByTestId('barre-grand-texte')).toHaveAttribute('aria-pressed', 'false');
});

test('bouton « Grand texte » de la barre (nom écrit) : un toucher, choix mémorisé', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?page=2');
  await pret(page);
  const b = page.getByTestId('barre-grand-texte');
  await expect(b).toContainText('Grand texte');
  await b.tap();
  await expect(page.getByTestId('texte-coran')).toBeVisible();
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  expect(await prefs(page)).toMatchObject({ vue: 'versets', size: 1 });
  await page.reload();
  await pret(page);
  await expect(page.getByTestId('texte-coran')).toBeVisible();
  // un second toucher : retour à la page du muṣḥaf
  await page.getByTestId('barre-grand-texte').tap();
  await expect(page.getByTestId('mushaf-livre')).toBeVisible();
});

test("« Mémoriser » garde l'affichage (page ou Grand texte), traits discrets ; le quitter rétablit l'avant", async ({
  page,
}) => {
  // page du muṣḥaf (défaut) : Mémoriser ne bascule pas d'affichage
  await page.goto('/coran/lecteur?page=1');
  await pret(page);
  await page.getByTestId('ouvrir-reglages-lecteur').tap();
  await page.getByTestId('reglages').getByTestId('mode-memoriser').tap();
  await page.getByTestId('reglages').getByTestId('fermer-feuille').tap();
  await expect(page.getByTestId('mushaf-livre')).toBeVisible();
  expect((await prefs(page)).vue).toBe('page');
  await page.getByTestId('quitter-memoriser').tap();
  expect(await prefs(page)).toMatchObject({ vue: 'page', size: 0, memo: 0 });
  // Grand texte choisi : Mémoriser le garde
  await page.getByTestId('barre-grand-texte').tap();
  await expect(page.getByTestId('texte-coran')).toBeVisible();
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
      await page.goto('/coran/lecteur?page=2');
      await pret(page);
      await page.screenshot({ path: join(CAP!, `defaut-${nom}-${nomT}.png`) });
      await page.getByTestId('barre-grand-texte').tap();
      await expect(page.getByTestId('texte-coran')).toBeVisible();
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
