import { expect, test } from '@playwright/test';

/** Texte sans les crochets de couleur (le navigateur affiche les lettres colorées dans des <span>). */
const plain = (s: string) => s.replace(/[[\]]/g, '');

test('liste des leçons d’en1 puis leçon avec l’arabe correctement rendu', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mes livres' })).toBeVisible();
  await page.locator('a[href="/niveaux/en1"]').click();

  const units = page.getByTestId('unit');
  await expect(units).toHaveCount(26);
  await expect(units.first()).toContainText('Leçon 1');
  await expect(page.getByText('Bilan 1', { exact: true })).toBeVisible();

  await page.locator('a[href="/lecons/en1.l17"]').click();
  await expect(page).toHaveURL(/\/lecons\/en1\.l17$/);

  // titre arabe : lang="ar", dir="rtl", Noto Naskh Arabic
  const h1 = page.locator('h1');
  await expect(h1).toHaveAttribute('lang', 'ar');
  await expect(h1).toHaveAttribute('dir', 'rtl');
  expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Noto Naskh Arabic');

  // versets : police Amiri Quran chargée, texte identique OCTET POUR OCTET à celui de l'API (donc des livres)
  const ayat = page.locator('.ayah .quran-text');
  await expect(ayat.first()).toBeVisible();
  expect(await ayat.first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    'Amiri Quran',
  );
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('32px "Amiri Quran"', 'بِسْمِ'))).toBe(
    true,
  );

  const api = await (await request.get('/api/v1/units/en1.l17')).json();
  const expected: string[] = api.unit.lesson.coran.versets.map((v: { ar: string }) => plain(v.ar));
  const shown = await ayat.allTextContents();
  expect(shown).toEqual(expected);

  // aucune translittération ni guide envoyés à l'élève
  expect(JSON.stringify(api.unit.lesson)).not.toMatch(/"(tr|guide|guide_fr|parents_fr)"\s*:/);
});

test('un exercice à choix est corrigé par la bibliothèque partagée', async ({ page }) => {
  await page.goto('/lecons/en1.l02');
  const ex = page
    .locator('section.ex[data-type="premiere_lettre"], section.ex[data-type="complete"]')
    .first();
  await expect(ex).toBeVisible();
  const item = ex.locator('li[data-item="0"]');
  const buttons = item.locator('.opts button');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(1);
  // on essaie les options une à une jusqu'à la bonne (nouvel essai permis, comme dans le livre)
  for (let k = 0; k < n; k++) {
    await buttons.nth(k).click();
    if (await item.getByText('Bravo !').isVisible()) break;
  }
  await expect(item.getByText('Bravo !')).toBeVisible();
  await expect(ex.locator('.score')).toContainText('★ 1 /');
});
