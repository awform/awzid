import { listen } from './coran';
import { expect, test } from './fixtures';

/**
 * Chantier A1 — audio du Coran avec les vraies récitations (constat sur la démo) : dans le Muṣḥaf page par
 * page, le surlignage du verset entendu (Ḥafṣ) recalculait la file d'écoute et coupait la lecture dès le
 * premier verset. Fichiers d'ESSAI non coraniques seulement (bips de e2e/audio-essai.mjs). Coran épuré : la
 * page suit la récitation sans changer la plage écoutée.
 */
test('Muṣḥaf page par page : l’écoute Ḥafṣ continue en surlignant le verset entendu', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?page=604&vue=page');
  await expect(page.locator('[data-page="604"]')).toBeVisible();
  await listen(page);
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  // la lecture enchaîne : le verset 2 est atteint (bips de 0,6 s), sans retour à « écoutes prévues »
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 5000 });
  const playing = await page
    .locator('[data-testid="lecteur-audio"] audio')
    .evaluate((a: HTMLAudioElement) => !a.paused);
  expect(playing).toBe(true);
  await expect(page.locator('[data-page="604"] .aya.on[data-aya="112:2"]')).toBeVisible();
  await page.getByTestId('arreter-audio').click();
});
