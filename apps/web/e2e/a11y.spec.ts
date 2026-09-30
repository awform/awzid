import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, loginTeacher, newAdult, test } from './fixtures';

/**
 * Lot 14 — accessibilité : audit axe-core (WCAG 2.1 A et AA) des écrans principaux, sur téléphone et sur
 * ordinateur. Exigence : AUCUNE violation grave (« serious ») ni critique (« critical »). Les violations
 * mineures ou modérées sont listées dans la sortie du test (à traiter au fil de l'eau).
 */
async function audit(page: Page, url: string, ready?: string) {
  await page.goto(url);
  if (ready) await page.locator(ready).first().waitFor();
  else await page.locator('main h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const grave = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const autres = r.violations.filter((v) => !grave.includes(v));
  if (autres.length)
    console.log(
      `[axe] ${url} : ${autres.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
    );
  // expect.soft : tous les écrans sont audités, toutes les violations graves sont listées
  expect
    .soft(
      grave.map((v) => ({
        id: v.id,
        impact: v.impact,
        cibles: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      })),
      url,
    )
    .toEqual([]);
}

test.describe('visiteur', () => {
  test.use({ compte: null });
  test('écrans publics', async ({ page }) => {
    for (const u of [
      '/connexion',
      '/inscription',
      '/garanties',
      '/aide',
      '/legal/mentions',
      '/legal/confidentialite',
      '/legal/cookies',
    ])
      await audit(page, u);
    await audit(page, '/page-qui-n-existe-pas', '[data-testid="page-erreur"]');
  });
});

test.describe('adulte', () => {
  test('écrans de l’apprenant', async ({ page }) => {
    for (const [u, ready] of [
      ['/aujourdhui', '[data-testid="seance"]'],
      ['/niveaux/ad1', undefined],
      ['/lecons/ad1.l01', undefined],
      ['/coran', undefined],
      ['/coran/lecteur?s=1', '[data-verse="1:2"]'],
      ['/hifz', undefined],
      ['/sciences', undefined],
      ['/lectures', undefined],
      ['/ecriture', undefined],
      ['/suivi', undefined],
      ['/compte', undefined],
      ['/offres', '[data-testid="offres"]'],
      ['/activites/racines', '[data-testid="racine"]'],
      ['/revisions', undefined],
    ] as Array<[string, string | undefined]>)
      await audit(page, u, ready);
  });
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('écrans de la famille', async ({ page }) => {
    await audit(page, '/profils');
    await audit(page, '/compte/protections');
    await audit(page, '/suivi/rapport');
  });
});

test.describe('enseignant', () => {
  test.use({ compte: null });
  test('espace enseignant et espace école', async ({ page }) => {
    test.setTimeout(120_000);
    await loginTeacher(page);
    const c = await page.request.post('/api/v1/teacher/classes', {
      headers: { 'x-awform': '1' },
      data: { name: `A11y ${Date.now()}` },
    });
    const id = (await c.json()).class.id as string;
    await page.request.patch(`/api/v1/ecole/classes/${id}`, {
      headers: { 'x-awform': '1' },
      data: { levelCode: 'en1', schoolName: 'École test', place: 'Dakar' },
    });
    await page.request.post(`/api/v1/ecole/classes/${id}/pupils`, {
      headers: { 'x-awform': '1' },
      data: { displayName: 'Élève A.', gender: 'f' },
    });
    await audit(page, '/enseignant');
    await audit(page, `/enseignant/classe/${id}`, '[data-testid="liste-eleves"]');
    // lot 24 : tous les onglets de la classe (messagerie et sourates compris)
    for (const tab of [
      'devoirs',
      'corrections',
      'epreuves',
      'tableau',
      'ecoute',
      'certificats',
      'messages',
      'sourates',
      'recital',
    ]) {
      await page.getByTestId(`onglet-${tab}`).click();
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => v.id),
        tab,
      ).toEqual([]);
    }
    await audit(page, `/enseignant/classe/${id}/imprimer`, '[data-testid="feuille"]');
  });
});

test.describe('suite V1 (lot 24)', () => {
  test.use({ compte: null });
  test('messages, sourates, activation ; interface en arabe', async ({ page }) => {
    test.setTimeout(120_000);
    await newAdult(page, 'a11y24');
    await audit(page, '/messages');
    await audit(page, '/sourates');
    await audit(page, '/activation');
    // interface en arabe (droite à gauche) : mêmes exigences
    await page.goto('/compte');
    await page.getByTestId('langues-preparation').check();
    await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="ar"]').click()]);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    for (const u of ['/compte', '/messages', '/sourates', '/activation', '/aide'])
      await audit(page, u);
  });

  test('RGAA 12.7 : le lien d’évitement est le premier arrêt du clavier et mène au contenu', async ({
    page,
  }, info) => {
    test.skip(info.project.name.startsWith('mobile'), 'clavier : sur ordinateur');
    await page.goto('/connexion');
    await page.locator('main h1').first().waitFor();
    await page.keyboard.press('Tab');
    const skip = page.getByTestId('aller-contenu');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#contenu')).toBeFocused();
  });
});
