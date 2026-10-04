import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Choisir l'élève actif (compte parent) de façon sûre. Cause des e2e intermittents (lots 15, 26, 27) :
 * le clic sur un profil lance un enregistrement puis une navigation côté client (`choose` → `goto('/')`) ;
 * un `page.goto(...)` lancé aussitôt après le clic interrompait parfois cet enregistrement, et la page
 * suivante s'ouvrait encore au nom du parent. On attend donc que la navigation vers l'accueil soit faite.
 * Si un enfant est déjà actif (code parent demandé), on en sort d'abord par « Changer d'élève ».
 */
export async function pickProfile(page: Page, name: string): Promise<void> {
  await page.goto('/profils');
  const pin = page.locator('#pin');
  const prof = page.locator('[data-profile]').filter({ hasText: name }).first();
  await expect(pin.or(prof).first()).toBeVisible();
  if (await pin.isVisible()) {
    await page.goto('/aide');
    await page
      .getByTestId('changer-eleve')
      .or(page.getByRole('button', { name: "Changer d'élève" }))
      .first()
      .click();
    await page.waitForURL(/\/profils/);
  }
  await prof.click();
  await page.waitForURL((u) => !u.pathname.startsWith('/profils'));
  await expect(page.getByTestId('eleve-actif')).toHaveText(name);
}
