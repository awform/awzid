import { execFileSync } from 'node:child_process';
import { expect, test } from './fixtures';

/**
 * Comptes de démonstration par niveau (apps/api/src/demo-niveaux.ts) : connexion par identifiant court et
 * mot de passe « awzid », le bon niveau s'affiche. API en mode démonstration (E2E_DEMO=1), vrais livres.
 *   E2E_DEMO=1 pnpm e2e demo-niveaux.spec.ts --project=mobile-chromium
 */
test.use({ compte: null });
test.skip(process.env.E2E_DEMO !== '1', 'API de démonstration seulement (E2E_DEMO=1)');

test.beforeAll(() => {
  // le semis de démonstration (comme `deploy.sh --demo`), sur la base de test ; deux fois : idempotent
  for (let i = 0; i < 2; i++)
    execFileSync(process.execPath, ['../api/dist/cli/demo.js'], {
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AWFORM_DEMO: '1',
        AWFORM_DEMO_PASSWORD: 'demo-e2e-niveaux-2026',
        AWFORM_DEMO_TAG: 'e2e1',
        AWFORM_DEMO_PIN: '4821',
        AWFORM_SECRET_KEY: process.env.E2E_KEY,
      },
      timeout: 240_000,
    });
});

for (const [id, niveau] of [
  ['adulte2', 'ad2'],
  ['ado3', 'ado3'],
  ['enfant4', 'en4'],
] as const) {
  test(`${id} : connexion directe, niveau ${niveau} affiché`, async ({ page }) => {
    await page.goto('/connexion');
    await page.locator('#email').fill(id);
    await page.locator('#password').fill('awzid');
    await page.getByRole('button', { name: /connexion|se connecter/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/connexion'));
    await page.goto('/');
    await expect(page.getByTestId('mon-niveau')).toHaveAttribute('data-niveau', niveau);
    // leçon 1 : aucune progression, et on ne voit que son niveau (les suivants sont fermés)
    await expect(page.getByTestId('progression')).toContainText(/\b0\b/);
  });
}
