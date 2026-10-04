import { expect, newAdult, test } from './fixtures';

/**
 * Collection ra* (vrais livres), décisions du 04/10/2026 : un adulte qui apprend seul écrit sa réponse au cas
 * pratique non résolu, puis voit la réponse proposée par le livre (jamais avant).
 */
test.use({ compte: null });

test('cas pratique : réponse proposée après la réponse de l’adulte', async ({ page }) => {
  await newAdult(page, 'ra-cas');
  await page.goto('/lecons/ra1.l01');
  const form = page.getByTestId('cas-form').first();
  await expect(form).toBeVisible();
  await expect(page.getByTestId('cas-reponse')).toHaveCount(0);
  await expect(form.getByTestId('cas-voir')).toBeDisabled();
  await form
    .getByTestId('cas-texte')
    .fill('Je continue avec mon maître et je vérifie mes sources.');
  await form.getByTestId('cas-voir').click();
  const vu = page.getByTestId('cas-reponse').first();
  await expect(vu).toContainText('Réponse proposée par le livre');
  await expect(vu).toContainText('Je continue avec mon maître');
  // rechargement : la réponse reste visible (tentative enregistrée)
  await page.reload();
  await expect(page.getByTestId('cas-reponse').first()).toContainText(
    'Réponse proposée par le livre',
  );
});
