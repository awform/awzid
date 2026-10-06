import type { Page } from '@playwright/test';
import { expect, PARENT_PIN, test } from './fixtures';
import { solveExercise, unitData } from './solve';

/** Lot 3 : hors ligne complet, synchronisation différée, données économes, mode école, onglets. */

test('hors ligne complet : niveau téléchargé, leçon faite sans réseau, envoi au retour du réseau', async ({
  page,
  context,
}) => {
  const { unit } = await unitData(page, 'en1.l03');
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const row = page.locator('tr[data-level="en1"]');
  await expect(row.getByTestId('poids')).toContainText('Ko');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(row.getByTestId('etat')).toContainText("sur l'appareil");

  await context.setOffline(true);
  // navigation complète sans réseau : le service worker sert la coquille, les données viennent d'IndexedDB
  await page.goto('/niveaux/en1');
  await expect(page.getByTestId('unit')).toHaveCount(26);
  await page.locator('a[href="/lecons/en1.l03"]').click();
  await expect(page.locator('h1')).toBeVisible();
  await solveExercise(page, unit.exercises[0]!.id, unit.lesson.exercices[0]!);
  await expect(page.getByTestId('en-attente')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('progression')).toContainText('commencée', { timeout: 15_000 });
});

test('données économes : pas de téléchargement automatique, poids affiché avant', async ({
  page,
}) => {
  await page.goto('/hors-ligne');
  await expect(page.getByTestId('donnees-mois')).toBeVisible();
  await page.getByTestId('econome').check();
  await expect(
    page.getByRole('status').and(page.locator(':not([data-testid="chargement"])')),
  ).toContainText('Données économes activées');
  await page.reload();
  await expect(page.getByTestId('econome')).toBeChecked();
  const packRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/packs/ad1')) packRequests.push(r.url());
  });
  await page.goto('/niveaux/ad1');
  await expect(page.getByTestId('etat-hors-ligne')).toContainText('Données économes');
  await page.waitForTimeout(500);
  expect(packRequests).toEqual([]);
  // sans données économes, le niveau ouvert est téléchargé en arrière-plan
  await page.goto('/hors-ligne');
  await expect(page.getByTestId('econome')).toBeChecked(); // réglage relu depuis l'appareil
  await page.getByTestId('econome').uncheck();
  await expect(
    page.getByRole('status').and(page.locator(':not([data-testid="chargement"])')),
  ).toContainText('Données économes désactivées');
  await page.reload();
  await expect(page.getByTestId('econome')).not.toBeChecked();
  await page.goto('/niveaux/ad1');
  await expect(page.getByTestId('etat-hors-ligne')).toContainText('Disponible sans réseau', {
    timeout: 15_000,
  });
  await page.goto('/hors-ligne');
  await expect(page.getByTestId('donnees-mois')).not.toHaveText('0 o');
});

test.describe('compte parent', () => {
  test.use({ compte: 'parent' });
  test('mode école : code image, élève actif, retour à la grille après inactivité', async ({
    page,
  }) => {
    await runEcole(page);
  });
});

async function runEcole(page: Page) {
  await page.clock.install();
  await page.goto('/ecole');
  await page.getByTestId('activer-ecole').click();
  await page.getByText("Réglages de l'adulte").click();
  await page.locator('#apin').fill(PARENT_PIN);
  await page.getByTestId('ecole-pin').getByRole('button').click();
  const first = page.locator('[data-setup]').first();
  const pid = await first.getAttribute('data-setup');
  await first.click();
  for (const s of ['etoile', 'lune', 'soleil', 'goutte'])
    await page.locator(`[data-setsym="${s}"]`).click();
  await page.getByTestId('enregistrer-code').click();
  await page.getByRole('button', { name: '1 min' }).click();
  await page.getByText("Réglages de l'adulte").click();

  await page.locator(`[data-profile="${pid}"]`).click();
  for (const s of ['lune', 'lune', 'lune', 'lune']) await page.locator(`[data-sym="${s}"]`).click();
  await expect(page.getByRole('alert')).toContainText('Essaie encore');
  for (const s of ['etoile', 'lune', 'soleil', 'goutte'])
    await page.locator(`[data-sym="${s}"]`).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('eleve-actif')).toBeVisible();

  await page.clock.fastForward('02:00');
  await expect(page).toHaveURL(/\/ecole$/, { timeout: 10_000 });
  await expect(page.getByTestId('grille')).toBeVisible();
  await expect(page.getByTestId('eleve-actif')).toHaveCount(0);
}

// lot 26 : cinq entrées au plus (adulte : Accueil, Arabe, Coran, Sciences, Plus), le reste sous « Plus » ;
// A12 : « Prières » (Au quotidien) remplace « Sciences », rangé sous « Plus » ; A37 : « Prières » devient « Vivre l'islam »
test('navigation : cinq entrées, entrée active, « Plus », barre en bas sur téléphone', async ({
  page,
}, info) => {
  await page.goto('/');
  const tabs = page.locator('nav.tabs a');
  await expect(tabs).toHaveCount(5);
  await expect(page.locator('nav.tabs a[data-tab="arabe"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.locator('nav.tabs a[data-tab="coran"]').click();
  await expect(page.getByRole('heading', { name: 'Coran', exact: true })).toBeVisible();
  await expect(page.locator('nav.tabs a[data-tab="coran"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const t of ['aujourdhui', 'vivre', 'plus']) {
    await page.locator(`nav.tabs a[data-tab="${t}"]`).click();
    await expect(page.locator(`nav.tabs a[data-tab="${t}"]`)).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  // « Plus » reste l'entrée active dans l'écriture, les lectures et le suivi
  for (const href of ['/sciences', '/ecriture', '/lectures', '/suivi']) {
    await page.locator(`[data-plus="${href}"]`).click();
    await expect(page.locator('nav.tabs a[data-tab="plus"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.locator('nav.tabs a[data-tab="plus"]').click();
  }
  // thème « manuscrit » (adulte) posé sur la page, mode sombre au choix de l'appareil
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'manuscrit');
  await page.getByTestId('mode-affichage').click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'sombre');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'sombre');
  if (info.project.name.startsWith('mobile')) {
    const box = await page.locator('nav.tabs').boundingBox();
    const vh = page.viewportSize()?.height ?? 0;
    expect(box && box.y > vh / 2).toBe(true);
  }
});
