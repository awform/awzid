import { expect, newAdult, password, test } from './fixtures';

/**
 * Complément E — mobile money SIMULÉ au Sénégal : pass prépayé en francs CFA, opérateur choisi (Orange Money),
 * aucune donnée de téléphone ni argent ; la notification signée de l'opérateur active le pass.
 */
test.use({ compte: null });

test('Sénégal : pass 3 mois payé par Orange Money (simulé)', async ({ page }) => {
  await newAdult(page, 'mm', 'SN');
  await page.goto('/offres');
  const pass = page.locator('[data-plan="pass_3_mois"]');
  await expect(pass).toContainText('3 500');
  await expect(page.locator('[data-plan="pass_1_mois"]')).toBeVisible();
  await expect(page.locator('[data-plan="pass_12_mois"]')).toBeVisible();
  await page.getByTestId('choisir-pass_3_mois').click();
  await pass.getByTestId('mdp-achat').fill(password());
  await pass.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page).toHaveURL(/\/abonnement\/paiement-simule\//);
  await expect(page.getByTestId('paiement-simule')).toContainText('Aucun argent');
  await expect(page.getByTestId('montant')).toContainText('3 500');
  await page.getByTestId('operateurs').getByLabel('Orange Money').check();
  await page.getByTestId('payer').click();
  await expect(page.getByTestId('paiement-ok')).toBeVisible();
  await expect(page.getByTestId('formule-actuelle')).toHaveAttribute('data-plan', 'pass_3_mois');
});
