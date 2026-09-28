import { expect, test } from '@playwright/test';

/** Règles d'affichage des bilans (moteur `lectureBilan`, conventions du 28/09). */

test('bilan Enfants : lettres, « Je relis » et exercices seulement (ni Coran, ni dialogue)', async ({
  page,
}) => {
  await page.goto('/lecons/en1.l17');
  await expect(page.locator('.num')).toContainText('Bilan 3');
  await expect(page.locator('.quran')).toHaveCount(0);
  await expect(page.locator('.dlg')).toHaveCount(0);
  await expect(page.locator('section.ex').first()).toBeVisible();
});

test('bilan Adultes : supports avant les exercices, versets SANS traduction', async ({
  page,
  request,
}) => {
  await page.goto('/lecons/ad1.l11');
  await expect(page.locator('.quran .ayah').first()).toBeVisible();
  await expect(page.locator('.quran .sens')).toHaveCount(0);
  const api = await (await request.get('/api/v1/units/ad1.l11')).json();
  for (const v of api.unit.lesson.coran.versets) expect(v.fr).toBeUndefined();
  // ordre : Coran avant le premier exercice
  const order = await page.evaluate(() => {
    const q = document.querySelector('.quran');
    const e = document.querySelector('section.ex');
    return !!q && !!e && !!(q.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
});

test('texte non préparé : encadré à la place du texte, texte absent des données reçues', async ({
  page,
  request,
}) => {
  await page.goto('/lecons/ad1.l05');
  await expect(page.getByTestId('non-prepare').first()).toContainText(
    "Texte remis par l'enseignant le jour de l'épreuve",
  );
  const api = await (await request.get('/api/v1/units/ad1.l05')).json();
  const L = api.unit.lesson;
  const np = L.lecture?.non_prepare
    ? !L.lecture.vedette && !L.lecture.phrases && !L.lecture.paragraphes
    : L.coran.versets.every(
        (v: { non_prepare?: boolean; ar?: string }) => !v.non_prepare || v.ar === undefined,
      );
  expect(np).toBe(true);
});
