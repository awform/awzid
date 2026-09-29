import { expect, test } from './fixtures';

/**
 * Lot 14 — préparation de la mise en production : pages légales (brouillons) et aide accessibles depuis
 * le pied de page, page d'erreur lisible, et AUCUN traceur : un seul cookie (session), aucune requête vers
 * un autre site — d'où l'absence de bannière de consentement.
 */
test('pied de page : aide, garanties et pages légales en brouillon', async ({ page }) => {
  await page.goto('/aujourdhui');
  const pied = page.getByTestId('pied');
  await pied.getByRole('link', { name: 'Confidentialité' }).click();
  await expect(page.getByTestId('page-legale')).toContainText('Politique de confidentialité');
  await expect(page.getByTestId('page-legale')).toContainText('BROUILLON');
  await expect(page.getByTestId('page-legale')).toContainText('2008-12');
  await expect(page.getByTestId('page-legale')).toContainText('COPPA');
  for (const [lien, titre] of [
    ['Mentions légales', 'Mentions légales'],
    ["Conditions d'utilisation", "Conditions générales d'utilisation"],
    ['Cookies', 'Cookies'],
  ]) {
    await page.getByTestId('pied').getByRole('link', { name: lien, exact: true }).click();
    await expect(page.locator('h1')).toContainText(titre);
  }
  await page.getByTestId('pied').getByRole('link', { name: 'Aide' }).click();
  await expect(page.getByTestId('faq').first()).toBeVisible();
  await page.getByTestId('faq').first().locator('summary').click();
  await expect(page.getByTestId('faq').first()).toHaveAttribute('open', '');
});

test('page inconnue : message simple et chemin de retour', async ({ page }) => {
  await page.goto('/cette-page-n-existe-pas');
  const e = page.getByTestId('page-erreur');
  await expect(e).toContainText('Page introuvable');
  await expect(e).toContainText('404');
  await e.getByRole('link', { name: "Revenir à Aujourd'hui" }).click();
  await expect(page).toHaveURL(/\/aujourdhui$/);
});

test('aucun traceur : un seul cookie (session), aucune requête vers un autre site', async ({
  page,
}) => {
  const origins = new Set<string>();
  page.on('request', (r) => origins.add(new URL(r.url()).origin));
  for (const u of ['/aujourdhui', '/lecons/ad1.l01', '/coran/lecteur?s=1', '/offres', '/aide'])
    await page.goto(u);
  await page.waitForLoadState('networkidle');
  const base = new URL(page.url()).origin;
  expect([...origins].filter((o) => o !== base && !o.startsWith('data:'))).toEqual([]);
  const cookies = await page.context().cookies();
  expect(cookies.map((c) => c.name)).toEqual(['awform_session']);
  expect(cookies[0]!.httpOnly).toBe(true);
  expect(cookies[0]!.sameSite).toBe('Lax');
  // pas de bannière : rien à consentir
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
