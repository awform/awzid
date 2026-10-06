import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { openSettings } from './coran';
import { expect, PARENT_PIN, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot 27 — Mes récitateurs, liste du parent. (Écouter, Mémoriser et le Muṣḥaf page par page sont désormais
 * UN SEUL écran : coran-epure.spec.ts.) Les récitateurs « Essai » n'ont que des FICHIERS D'ESSAI NON
 * CORANIQUES (bips générés par e2e/audio-essai.mjs) — jamais une récitation.
 */
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

test('autre riwāya : badge visible, pas de surlignage, absente du mode Mémoriser', async ({
  page,
}) => {
  await page.goto('/coran/ecouter?r=essai-qalun&s=1');
  await openSettings(page);
  await expect(page.getByTestId('autre-riwaya')).toBeVisible();
  await expect(page.getByTestId('reglages-ecoute').getByTestId('badge-riwaya')).toHaveAttribute(
    'data-riwaya',
    'qalun',
  );
  await expect(page.getByTestId('reglages-ecoute').getByTestId('badge-riwaya')).toContainText(
    'autre riwāya',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mini-autre-riwaya')).toBeVisible();
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  await expect(page.getByTestId('sans-surlignage')).toBeVisible();
  // le verset entendu n'est jamais surligné sur le texte d'une autre riwāya
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 8000 });
  await expect(page.locator('[data-aya="1:2"]')).not.toHaveClass(/\bon\b/);
  await page.getByTestId('arreter-audio').click();

  await page.goto('/coran/memoriser');
  await openSettings(page);
  const pick = page.getByTestId('choix-recitateur');
  await expect(pick.locator('option[value="essai-hafs"]')).toHaveCount(1);
  await expect(pick.locator('option[value="essai-qalun"]')).toHaveCount(0);
});

test('mes récitateurs : choix gardé, crédits et licence ; retour à la lecture', async ({
  page,
}) => {
  await page.goto('/coran/recitateurs');
  const card = page.locator('[data-reciter="essai-qalun"]');
  await card.getByTestId('choisir').click();
  await expect(card.getByTestId('choisi')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-reciter="essai-qalun"]').getByTestId('choisi')).toBeVisible();
  await expect(card).toContainText('non coraniques');
  await expect(card.getByTestId('usage-note')).toContainText('ne pas vendre');
  expect(await serious(page)).toEqual([]);
  await page.locator('[data-reciter="essai-hafs"]').getByTestId('choisir').click();
  await page.getByTestId('retour-lecture').click();
  await expect(page).toHaveURL(/\/coran\/lecteur/);
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('le parent restreint la liste d’un enfant (code parent) ; l’enfant ne voit que ce récitateur', async ({
    page,
  }) => {
    await page.goto('/coran/recitateurs');
    const box = page.getByTestId('controle-parent');
    await box.locator('#enfant').selectOption({ label: 'Yanis' });
    await page.waitForLoadState('networkidle');
    // déjà restreinte lors d'un passage précédent : on part de la liste affichée
    const tous = box.getByTestId('tous-permis');
    if (await tous.isChecked()) await tous.uncheck();
    await box.locator('[data-permis="essai-hafs"]').check();
    await box.locator('[data-permis="essai-qalun"]').uncheck();
    // A2 : le récitateur en ligne d'essai fait aussi partie de la liste
    await box.locator('[data-permis="essai-qf"]').uncheck();
    await box.locator('#pin-coran').fill(PARENT_PIN);
    await box.getByTestId('enregistrer-permis').click();
    await expect(box.getByRole('status')).toContainText('enregistrée');
    await pickProfile(page, 'Yanis');
    await page.goto('/coran/lecteur?page=1');
    await openSettings(page);
    const pick = page.getByTestId('choix-recitateur');
    await expect(pick.locator('option')).toHaveCount(1);
    await expect(pick.locator('option[value="essai-hafs"]')).toHaveCount(1);
    // l'enfant garde son thème (tailles, cibles) ; l'espace Coran prend la palette vert-blanc-or
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'jardin');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'verdure');
  });
});
