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

test('carnet ra* : l’adulte coche la ligne de la leçon, retrouvée dans son carnet', async ({
  page,
}) => {
  await newAdult(page, 'ra-carnet');
  await page.goto('/lecons/ra1.l01');
  const box = page.getByTestId('carnet-perso-case');
  await expect(box).not.toBeChecked();
  // coche enregistrée par le serveur avant d'ouvrir le carnet (machine chargée)
  const saved = page.waitForResponse(
    (r) => r.request().method() !== 'GET' && r.url().includes('carnet') && r.ok(),
  );
  await box.check();
  await saved;
  await expect(box).toBeChecked();
  await page.getByTestId('lien-carnet-perso').click();
  await expect(page.locator('main h1')).toHaveText('Mon carnet de pratique');
  await expect(page.locator('[data-carnet-perso="ra1.l01"] input')).toBeChecked();
  await expect(page.locator('[data-carnet-perso] input:checked')).toHaveCount(1);
  expect(await page.locator('[data-carnet-perso]').count()).toBeGreaterThan(40);
  // aucune signature pour un adulte
  await expect(page.getByText('Signer la semaine')).toHaveCount(0);
});
