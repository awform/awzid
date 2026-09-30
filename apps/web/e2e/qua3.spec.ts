import { expect, test } from './fixtures';

/**
 * QUA-3 — le découpage du lecteur de leçon ne change pas l'affichage : cartes des lettres (« je découvre »)
 * rendues par LettresLecon, dans l'ordre du livre, avec leurs couleurs. Contenu synthétique ou réel.
 */
test.use({ compte: null });

test('leçon : cartes des lettres identiques aux données de la leçon', async ({ page }) => {
  const r = await page.request.get('/api/v1/units/en1.l01');
  expect(r.status()).toBe(200);
  const lettres = (await r.json()).unit.lesson.lettres as Array<{ l: string; nom_ar?: string }>;
  await page.goto('/lecons/en1.l01');
  await page.locator('main h1').first().waitFor();
  const cards = page.locator('.fcard');
  await expect(cards).toHaveCount(lettres.some((x) => x.nom_ar) ? lettres.length : 0);
  for (const [i, x] of lettres.entries()) {
    await expect(cards.nth(i).locator('.big')).toHaveText(x.l);
    await expect(cards.nth(i).locator('.big')).toHaveClass(new RegExp(`c${i % 4}`));
    if (x.nom_ar) await expect(cards.nth(i)).toContainText(x.nom_ar);
  }
});
