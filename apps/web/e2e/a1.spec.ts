import { expect, test } from './fixtures';

/**
 * Chantier A1 — audio du Coran avec les vraies récitations (constat sur la démo) : dans le Muṣḥaf page par
 * page, le surlignage du verset entendu (Ḥafṣ) recalculait la file d'écoute et coupait la lecture dès le
 * premier verset. Fichiers d'ESSAI non coraniques seulement (bips de e2e/audio-essai.mjs).
 */
test('Muṣḥaf page par page : l’écoute Ḥafṣ continue en surlignant le verset entendu', async ({
  page,
}) => {
  await page.goto('/coran/mushaf?page=604');
  await expect(page.locator('[data-page="604"]')).toBeVisible();
  await page.getByTestId('mp-ecouter').click();
  const panel = page.getByTestId('mp-audio');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('mp-recitateur').locator('option[value="essai-hafs"]')).toHaveCount(
    1,
  );
  await page.getByTestId('mp-recitateur').selectOption('essai-hafs');
  await panel.getByTestId('jouer').click();
  await expect(panel.getByTestId('position')).toContainText('Verset 1');
  // la lecture enchaîne : le verset 2 est atteint (bips de 0,6 s), sans retour à « écoutes prévues »
  await expect(panel.getByTestId('position')).toContainText('Verset 2', { timeout: 5000 });
  const playing = await page
    .locator('audio')
    .first()
    .evaluate((a: HTMLAudioElement) => !a.paused);
  expect(playing).toBe(true);
  await expect(page.locator('[aria-current="true"]').first()).toBeVisible();
  await panel.getByTestId('arreter-audio').click();
});
