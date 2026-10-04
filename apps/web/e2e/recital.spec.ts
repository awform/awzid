import { expect, newAdult, test } from './fixtures';
import { loginTeacher } from './enseignant';

/**
 * Suite V1-b — récital de hifẓ : l'enseignant planifie, le serveur tire au sort les passages du carnet (en1
 * synthétique : 3 passages du socle), l'enseignant note avec le barème, publie ; la famille voit ses passages
 * et le résultat officiel. Aucun texte coranique affiché, aucun classement.
 */
test.use({ compte: null });

test('récital : planifié, tiré au sort, noté, publié ; la famille voit son résultat', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  await loginTeacher(page);
  const c = await page.request.post('/api/v1/teacher/classes', {
    headers: { 'x-awform': '1' },
    data: { name: `Récital-${info.project.name}-${Date.now()}` },
  });
  expect(c.status()).toBe(201);
  const cls = (await c.json()).class as { id: string; joinCode: string };
  await page.request.patch(`/api/v1/ecole/classes/${cls.id}`, {
    headers: { 'x-awform': '1' },
    data: { levelCode: 'en1', schoolName: 'École test', place: 'Dakar' },
  });

  const ctx = await browser.newContext();
  const fam = await ctx.newPage();
  const { profileId } = await newAdult(fam, 'rec24');
  const j = await fam.request.post(`/api/v1/profiles/${profileId}/classes`, {
    headers: { 'x-awform': '1' },
    data: { code: cls.joinCode, consent: true },
  });
  expect(j.status(), await j.text()).toBe(201);

  await page.goto(`/enseignant/classe/${cls.id}`);
  await page.getByTestId('onglet-recital').click();
  await page.locator('#rec-titre').fill('Récital de fin d’année');
  await page.locator('#rec-jour').fill('2026-06-20');
  await page.getByTestId('recital-planifier').getByRole('button').click();
  await expect(page.getByTestId('recital')).toHaveCount(1);
  await page.getByTestId('recital-tirer').first().click();
  await expect(page.getByTestId('recital-tires').locator('li')).toHaveCount(3);
  // aucun texte coranique : seulement « nom (sourate:versets) »
  for (const li of await page.getByTestId('recital-tires').locator('li').all())
    await expect(li).toHaveText(/\(\d+:\d+-\d+\)$/);
  await page.getByLabel(/Aides du maître/).fill('1');
  await page.getByTestId('recital-noter').click();
  await expect(page.getByTestId('recital-note')).toContainText('19');
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('recital-publier').click();
  await expect(page.getByRole('status')).toContainText('3 passages validés');

  await fam.goto('/recital');
  await expect(fam.getByTestId('recital-famille')).toContainText('Récital de fin d’année');
  await expect(fam.getByTestId('recital-resultat')).toContainText('19 / 20');
  await expect(fam.getByTestId('recital-resultat')).toContainText('14,25 / 15');
  await ctx.close();
});
