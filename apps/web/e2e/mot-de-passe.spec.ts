import { expect, test } from './fixtures';

/**
 * Lot 11 + V2-1 — champ « nouveau mot de passe » de l'inscription (8 caractères sans complexité depuis le 29/10/2026) : bouton « œil »
 * (aria-pressed), indicateur rouge / orange / vert identique à la règle du serveur, confirmation obligatoire.
 */
test.use({ compte: null });

test('inscription : œil, indicateur de la règle, confirmation différente refusée', async ({
  page,
}) => {
  await page.goto('/inscription');
  const mdp = page.locator('#password');
  const force = page.getByTestId('mdp-force');
  await expect(mdp).toHaveAttribute('type', 'password');
  // V2-1 : 8 caractères au moins, aucune exigence de complexité
  await expect(page.getByText('8 caractères au moins', { exact: false })).toBeVisible();

  await mdp.fill('Tamar7x'); // 7 caractères
  await expect(force).toHaveAttribute('data-force', 'refuse');
  await mdp.fill('tamarini'); // 8 minuscules : accepté
  await expect(force).toHaveAttribute('data-force', 'correct');
  await mdp.fill('tamarinier7'); // 11 caractères : accepté
  await expect(force).toHaveAttribute('data-force', 'correct');
  await page.locator('#email').fill('zaynabou@e2e.test');
  await mdp.fill('zaynabou@e2e.test'); // égal à l'adresse : refusé
  await expect(force).toHaveAttribute('data-force', 'refuse');
  await mdp.fill('Tamari7x'); // 8 caractères
  await mdp.fill('mon thé à la menthe'); // phrase de 12 caractères ou plus
  await expect(force).toHaveAttribute('data-force', 'fort');

  const oeil = page.getByTestId('mdp-oeil');
  await expect(oeil).toHaveAttribute('aria-pressed', 'false');
  await expect(oeil).toHaveAccessibleName('Afficher le mot de passe');
  await oeil.click();
  await expect(oeil).toHaveAttribute('aria-pressed', 'true');
  await expect(mdp).toHaveAttribute('type', 'text');
  await expect(page.locator('#password-confirmer')).toHaveAttribute('type', 'text');
  await oeil.click();
  await expect(mdp).toHaveAttribute('type', 'password');

  await page.locator('#password-confirmer').fill('mon thé à la menth');
  await expect(page.getByTestId('mdp-differents')).toHaveText(
    'Les deux mots de passe ne sont pas identiques.',
  );
  await page.locator('#password-confirmer').fill('mon thé à la menthe');
  await expect(page.getByTestId('mdp-differents')).toHaveCount(0);
});
