import { expect, newAdult, test } from './fixtures';
import { solveExercise, unitData } from './solve';

/**
 * Lot 11 : « Aujourd'hui » (séance du jour), régularité sans punition (ados/adultes), jalons, rapport
 * hebdomadaire, « Nos garanties » (publique), protections des mineurs.
 */

test.describe('adulte', () => {
  test.use({ compte: null });
  test('séance du jour, régularité réglable, jour de travail compté, jalons', async ({ page }) => {
    await newAdult(page, 'aujourdhui');
    const { unit } = await unitData(page, 'ad1.l03');
    await page.goto('/lecons/ad1.l03');
    await solveExercise(page, unit.exercises[0]!.id, unit.lesson.exercices[0]!);
    await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });

    await page.getByTestId('accueil').click();
    await expect(page).toHaveURL(/\/aujourdhui$/);
    await expect(page.getByTestId('seance')).toBeVisible();
    await expect(page.getByTestId('duree')).toContainText('min');
    await expect(page.getByTestId('jours-travail')).toContainText('1 jour de travail');
    await expect(page.locator('[data-actif="true"]')).toHaveCount(1);

    await page.getByText('Régler mon objectif et mes jours de repos').click();
    await page.getByTestId('objectif').selectOption('5');
    await page.locator('[data-repos="5"]').check();
    await page.getByTestId('enregistrer-regularite').click();
    await expect(page.getByTestId('jours-travail')).toContainText('objectif : 5');
    await page.reload();
    await expect(page.getByTestId('jours-travail')).toContainText('objectif : 5');
    await expect(page.getByTestId('jalons')).toContainText('Des jalons, jamais de points');

    await page.getByTestId('lien-rapport').click();
    await expect(page.locator('[data-rapport]').first()).toContainText('jour de travail');
  });

  test('« Nos garanties » : page publique, sans compte', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByTestId('lien-garanties').click();
    await expect(page.locator('[data-garantie]')).toHaveCount(11);
    await expect(page.locator('[data-garantie="coran"]')).toContainText('Tanzil');
    await expect(page.locator('[data-garantie="resiliation"]')).toContainText(
      'Arrêter le renouvellement',
    );
  });
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('enfant : aucun compteur ; protections par défaut ; rapport sans jours pour l’enfant', async ({
    page,
  }) => {
    await page.goto('/compte/protections');
    const amina = page.locator('[data-protections]').filter({ hasText: 'Amina' });
    await expect(amina).toBeVisible();
    for (const k of [
      'publicite',
      'monnaieVirtuelle',
      'personnalisationComportementale',
      'lectureAutomatique',
      'enregistrementsEnvoyes',
      'texteLibreTuteur',
      'compteurRegularite',
    ])
      await expect(amina.locator(`[data-protection="${k}"]`)).toHaveAttribute(
        'data-actif',
        'false',
      );

    await page.goto('/suivi/rapport');
    const r = page.locator('[data-rapport]').filter({ hasText: 'Amina' });
    await expect(r).toBeVisible();
    await expect(r).not.toContainText('jour de travail');
    await expect(page.getByTestId('semaine')).toContainText('Du');

    await page.goto('/profils');
    await page.locator('[data-profile]').filter({ hasText: 'Amina' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId('lien-aujourdhui').click();
    await expect(page.getByTestId('seance')).toBeVisible();
    await expect(page.getByTestId('regularite')).toHaveCount(0);
    await expect(page.getByTestId('jalons')).toBeVisible();
  });

  test('rapport : la même partie validée deux fois le même jour ne casse pas la page', async ({
    page,
  }) => {
    // vu sur la VM : deux validations « 112:1-4 » le même jour (enseignant) → clé d'itération en double,
    // plus aucun rapport affiché ; la réponse réelle de l'API est reprise, avec deux validations identiques
    await page.route('**/api/v1/rapport-hebdo/**', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.profil?.pseudonym === 'Amina') {
        const v = { day: body.semaine.lundi, part: '112:1-4', mention: 'Très bien' };
        body.validations = [v, { ...v }];
      }
      await route.fulfill({ response: res, json: body });
    });
    await page.goto('/suivi/rapport');
    const r = page.locator('[data-rapport]').filter({ hasText: 'Amina' });
    await expect(r).toBeVisible();
    await expect(r.locator('li').filter({ hasText: '112:1-4' })).toHaveCount(2);
  });
});
