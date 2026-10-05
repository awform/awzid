import type { Page } from '@playwright/test';
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
export async function openDisplay(page: Page) {
  await page.getByTestId('ouvrir-affichage').click();
  await expect(page.getByTestId('affichage')).toBeVisible();
}
/** Tajwid en couleurs (feuille « Affichage ») : allumé ou éteint, feuille refermée. */
export async function setTajwid(page: Page, on: boolean) {
  await openDisplay(page);
  const b = page.getByTestId('tajwid');
  if ((await b.getAttribute('aria-pressed')) !== String(on)) await b.click();
  await expect(b).toHaveAttribute('aria-pressed', String(on));
}
export const close = (page: Page) => page.keyboard.press('Escape');
