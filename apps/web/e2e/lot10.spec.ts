import { expect, newAdult, PARENT_PIN, test } from './fixtures';

/** Lot 10 : offres et abonnement, paiement SIMULÉ (aucune donnée de carte, aucun argent). */

test.describe('adulte', () => {
  test.use({ compte: null });
  test('essai découverte, abonnement payé (simulé), arrêt du renouvellement', async ({ page }) => {
    await newAdult(page, 'abonnement');
    await page.goto('/offres');
    await expect(page.getByTestId('demo-paiement')).toBeVisible();
    await expect(page.locator('[data-plan="adulte_mensuel"]')).toContainText('4,99');
    await expect(page.locator('[data-plan="famille_mensuel"]')).toHaveCount(0);

    await page.getByTestId('choisir-decouverte').click();
    await expect(page).toHaveURL(/\/abonnement$/);
    await expect(page.getByTestId('formule-actuelle')).toHaveAttribute('data-plan', 'decouverte');

    await page.getByTestId('voir-offres').click();
    await page.getByTestId('choisir-adulte_mensuel').click();
    await expect(page).toHaveURL(/\/abonnement\/paiement-simule\//);
    await expect(page.getByTestId('paiement-simule')).toContainText('Aucun argent');
    await expect(page.getByTestId('montant')).toContainText('4,99');
    await page.getByTestId('payer').click();
    await expect(page.getByTestId('paiement-ok')).toBeVisible();
    await expect(page.getByTestId('formule-actuelle')).toHaveAttribute(
      'data-plan',
      'adulte_mensuel',
    );

    const sub = page.locator('[data-abonnement="adulte_mensuel"]');
    await sub.getByTestId('annuler').click();
    await expect(sub).toHaveAttribute('data-status', 'annulee');
    await expect(page.getByTestId('formule-actuelle')).toHaveAttribute(
      'data-plan',
      'adulte_mensuel',
    );
  });
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('achat réservé à l’adulte (code parent), paiement refusé (simulé)', async ({ page }) => {
    await page.goto('/offres');
    const fam = page.locator('[data-plan="famille_mensuel"]');
    await fam.getByTestId('choisir-famille_mensuel').click();
    await fam.getByTestId('pin-achat').fill('0000');
    await fam.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('alert')).toContainText('Code parent');
    await fam.getByTestId('pin-achat').fill(PARENT_PIN);
    await fam.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page).toHaveURL(/\/abonnement\/paiement-simule\//);
    await page.getByTestId('refuser').click();
    await expect(page.getByTestId('paiement-erreur')).toContainText('refusé');
  });
});
