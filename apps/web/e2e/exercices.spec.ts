import { expect, test } from '@playwright/test';
import { solveExercise, unitData } from './solve';

/**
 * Les 8 types « langue » sont interactifs et corrigés par la bibliothèque partagée ; les réponses sont
 * enregistrées (tentatives) et la progression est recalculée par le serveur.
 */
const LECONS = ['en1.l03', 'en1.l04', 'en1.l15', 'ad1.l04'];

for (const id of LECONS) {
  test(`${id} : tous les exercices résolus par l'interface`, async ({ page }) => {
    const { unit } = await unitData(page, id);
    await page.goto(`/lecons/${id}`);
    const types = new Set<string>();
    for (let i = 0; i < unit.lesson.exercices.length; i++) {
      const ex = unit.lesson.exercices[i]!;
      const n = await solveExercise(page, unit.exercises[i]!.id, ex);
      if (n > 0) types.add(ex.type);
    }
    expect(types.size).toBeGreaterThan(0);
    await expect(page.getByTestId('progression')).toContainText('commencée');
  });
}

test('mauvaise réponse : message doux, nouvel essai permis', async ({ page }) => {
  await page.goto('/lecons/en1.l04');
  const vf = page.locator('section.ex[data-type="vrai_faux"]').first();
  const { unit } = await unitData(page, 'en1.l04');
  const ex = unit.lesson.exercices.find((e) => e.type === 'vrai_faux')!;
  const vrai = (ex.items as Array<{ vrai: boolean }>)[0]!.vrai;
  await vf.locator(`[data-item="0"] button[data-v="${vrai ? 0 : 1}"]`).click();
  await expect(vf.locator('[data-item="0"]').getByText('Essaie encore !')).toBeVisible();
  await expect(vf.locator('.score')).toContainText('★ 0 /');
  await vf.locator(`[data-item="0"] button[data-v="${vrai ? 1 : 0}"]`).click();
  await expect(vf.locator('.score')).toContainText('★ 1 /');
});

test('leçon réussie + auto-évaluation cochée → maîtrisée (progression recalculée par le serveur)', async ({
  page,
}) => {
  const id = 'en1.l02';
  const { unit } = await unitData(page, id);
  await page.goto(`/lecons/${id}`);
  for (let i = 0; i < unit.lesson.exercices.length; i++)
    await solveExercise(page, unit.exercises[i]!.id, unit.lesson.exercices[i]!);
  const boxes = page.locator('.check input[type="checkbox"]');
  const n = await boxes.count();
  for (let k = 0; k < n; k++) await boxes.nth(k).check();
  await expect(page.getByText('Bravo ! Leçon terminée.')).toBeVisible();
  await expect(page.getByTestId('progression')).toContainText('maîtrisée', { timeout: 15_000 });
  // la liste du niveau affiche l'état
  await page.goto('/niveaux/en1');
  await expect(page.locator('a[href="/lecons/en1.l02"] [data-testid="statut"]')).toContainText(
    'maîtrisée',
  );
});
