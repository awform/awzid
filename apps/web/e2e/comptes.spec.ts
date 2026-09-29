import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { EMAILS, expect, password, test } from './fixtures';
import { solveExercise, unitData } from './solve';

/**
 * Lot 4 : comptes (parent, profils enfants sans e-mail, adulte), consentements, connexion, export et
 * suppression (RGPD), réponses enregistrées seulement pour un profil du compte connecté.
 */
test.use({ compte: null });

const YEAR = new Date().getFullYear();
let n = 0;
const uniqueEmail = (kind: string, project: string) =>
  `${kind}-${project}-${Date.now()}-${n++}@e2e.test`;

async function signup(
  page: Page,
  kind: 'parent' | 'adulte',
  email: string,
  opts: { birthYear?: number; country?: string } = {},
) {
  await page.goto('/inscription');
  await page.getByTestId(`type-${kind}`).check();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password());
  if (opts.country) await page.locator('#country').selectOption(opts.country);
  // audit MIN-3 : année de naissance demandée à tout titulaire
  await page
    .locator('#birthYear')
    .fill(String(opts.birthYear ?? (kind === 'parent' ? 1985 : 1990)));
  await page.getByTestId('consent-cgu').check();
  if (opts.country === 'SN') await page.getByTestId('consent-transfert').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
}

test('parent : inscription, profil enfant avec consentement, réponses enregistrées', async ({
  page,
}, info) => {
  await signup(page, 'parent', uniqueEmail('parent', info.project.name));
  await expect(page).toHaveURL(/\/profils$/);
  await expect(page.getByText("Aucun profil pour l'instant.")).toBeVisible();
  await page.getByTestId('ajouter-enfant').click();
  await page.locator('#pseudonym').fill('Lina');
  await page.locator('#birthYear').fill(String(YEAR - 8));
  await page.getByTestId('consent-suivi').check();
  await page.locator('#password').fill(password());
  await page.getByTestId('creer-profil').click();
  await expect(page.getByRole('status')).toContainText('Profil de Lina créé.');
  await page.locator('[data-profile]').first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('eleve-actif')).toHaveText('Lina');

  const { unit } = await unitData(page, 'en1.l03');
  await page.goto('/lecons/en1.l03');
  await solveExercise(page, unit.exercises[0]!.id, unit.lesson.exercices[0]!);
  await expect(page.getByTestId('progression')).toContainText('commencée', { timeout: 15_000 });
});

test('adulte : âge du consentement numérique vérifié ; Sénégal : consentement au transfert', async ({
  page,
}, info) => {
  await signup(page, 'adulte', uniqueEmail('jeune', info.project.name), { birthYear: YEAR - 12 });
  await expect(page.getByTestId('erreur')).toContainText('Avant 15 ans');
  await page.goto('/inscription');
  await expect(page.getByTestId('consent-transfert')).toHaveCount(0);
  await page.locator('#country').selectOption('SN');
  await expect(page.getByTestId('consent-transfert')).toBeVisible();
  await signup(page, 'adulte', uniqueEmail('sn', info.project.name), {
    birthYear: 1985,
    country: 'SN',
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('eleve-actif')).toBeVisible();
});

test('connexion : message générique en cas d’erreur, puis connexion', async ({ page }) => {
  await page.goto('/connexion');
  await page.locator('#email').fill(EMAILS.adulte);
  await page.locator('#password').fill('mot de passe faux mais long');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Adresse ou mot de passe incorrect.');
  await page.locator('#password').fill(password());
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('eleve-actif')).toHaveText('Adulte');
});

test('mon compte : export de mes données puis suppression du compte', async ({ page }, info) => {
  const email = uniqueEmail('rgpd', info.project.name);
  await signup(page, 'adulte', email);
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/compte');
  await expect(page.getByTestId('consentements')).toContainText('Conditions');
  const dl = page.waitForEvent('download');
  await page.getByTestId('exporter').click();
  const file = await (await dl).path();
  const data = JSON.parse(readFileSync(file, 'utf8')) as { compte: { email: string } };
  expect(data.compte.email).toBe(email);

  await page.locator('#delpw').fill(password());
  await page.getByTestId('supprimer-compte').click();
  await expect(page).toHaveURL(/\/connexion$/);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password());
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Adresse ou mot de passe incorrect.');
});

test('visiteur : les leçons restent consultables, lien de connexion affiché', async ({ page }) => {
  await page.goto('/lecons/en1.l01');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.getByTestId('lien-connexion')).toBeVisible();
  await expect(page.getByTestId('progression')).toHaveCount(0);
});

test.describe('compte parent déjà connecté', () => {
  test.use({ compte: 'parent' });
  test('premier chargement : l’en-tête montre le compte, pas « Se connecter »', async ({
    page,
  }) => {
    await page.goto('/profils');
    await expect(page.locator('[data-profile]')).toHaveCount(2);
    await expect(page.getByTestId('lien-compte')).toBeVisible();
    await expect(page.getByTestId('lien-connexion')).toHaveCount(0);
  });
});
