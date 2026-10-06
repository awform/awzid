import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Coran épuré — gestes communs aux e2e de l'écran de lecture unique (`/coran/lecteur`) : la puce (téléphone)
 * ou les sélecteurs dorés (grand écran), le premier « Écouter », les feuilles « Réglages d'écoute » et
 * « Affichage ».
 */
export async function openSelector(page: Page, tab?: 'page' | 'juz' | 'hizb') {
  const puce = page.getByTestId('puce');
  if (await puce.isVisible()) await puce.click();
  else await page.getByTestId('barre-sourate').click();
  await expect(page.getByTestId('selecteur')).toBeVisible();
  if (tab) await page.getByTestId(`sel-onglet-${tab}`).click();
}
/** Premier « Écouter » (téléphone : bouton qui montre la mini-barre ; grand écran : lecture de la barre). */
export async function listen(page: Page) {
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  // prêt : récitateurs chargés (le bouton « Écouter » est désactivé avant)
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  const b = page.getByTestId('ouvrir-ecoute');
  if (await b.isVisible()) await b.click();
  else await page.getByTestId('jouer').click();
}
/** Mini-barre visible (téléphone : après « Écouter » ; grand écran : toujours), lecture arrêtée. */
export async function showBar(page: Page) {
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  if (!(await page.getByTestId('jouer').isVisible())) {
    await listen(page);
    await page.getByTestId('arreter-audio').click();
  }
}
export async function openSettings(page: Page) {
  await showBar(page);
  await page.getByTestId('ouvrir-reglages').click();
  await expect(page.getByTestId('reglages-ecoute')).toBeVisible();
}
/** Panneau unique « Réglages » (corrections du 06/10/2026) : section « Affichage » visible. */
export async function openDisplay(page: Page) {
  await page.getByTestId('ouvrir-reglages-lecteur').click();
  await expect(page.getByTestId('reglages')).toBeVisible();
  // enfant : tuiles d'abord, « Tous les réglages » replié
  const parent = page.getByTestId('reglages-parent');
  if ((await parent.count()) && (await parent.getAttribute('open')) === null)
    await parent.locator(':scope > summary').click();
  await expect(page.getByTestId('affichage')).toBeVisible();
}
/** Muṣḥaf affiché (section « Muṣḥaf » du panneau « Réglages »), panneau refermé. */
export async function chooseMushaf(page: Page, key: string) {
  await openDisplay(page);
  await page.locator(`label:has([data-mushaf="${key}"])`).click();
  await expect(page.getByTestId('choix-mushaf')).toHaveAttribute('data-value', key);
  await close(page);
}
/** Tajwid en couleurs (feuille « Affichage ») : allumé ou éteint, feuille refermée. */
export async function setTajwid(page: Page, on: boolean) {
  await openDisplay(page);
  const b = page.getByTestId('tajwid');
  if ((await b.getAttribute('aria-pressed')) !== String(on)) await b.click();
  await expect(b).toHaveAttribute('aria-pressed', String(on));
}
/** A34 : pages exactes publiées dans cette exécution (E2E_MUSHAF_EXACT=1 et copie Content Sync présente). */
export const EXACT_ON = process.env.E2E_MUSHAF_EXACT_ON === '1';
/**
 * Un verset de la page : texte VISIBLE (page fluide) ou texte Tanzil ACCESSIBLE (page exacte : bouton pour les
 * lecteurs d'écran et le clavier, glyphes de la police du Complexe à l'écran).
 */
export const verseOf = (scope: Page | Locator, key: string) =>
  scope.locator(`[data-verse="${key}"], [data-exact-verse="${key}"]`).first();
/** Texte Tanzil d'un verset, tel que servi par l'API (référence). */
export async function tanzil(page: Page, key: string): Promise<string> {
  const [s, a] = key.split(':');
  const r = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
  return ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
}
/** Le verset est sur la page : visible (fluide) ou, page exacte, son texte Tanzil accessible à l'identique. */
export async function expectVerse(page: Page, key: string, scope: Page | Locator = page) {
  // page exacte : montrée une fois ses lignes et ses polices chargées (sinon la page fluide reste)
  if (EXACT_ON)
    await scope
      .locator(`[data-exact-verse="${key}"]`)
      .first()
      .waitFor({ state: 'attached', timeout: 5000 })
      .catch(() => {});
  const v = verseOf(scope, key);
  await expect(v).toBeAttached({ timeout: 15_000 });
  if ((await v.getAttribute('data-exact-verse')) === null) await expect(v).toBeVisible();
  else expect((await v.textContent())!.startsWith(`${await tanzil(page, key)} (`), key).toBe(true);
}
export async function close(page: Page) {
  await page.keyboard.press('Escape');
}
