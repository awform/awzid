import { expect, loginTeacher, newAdult, test } from './fixtures';

/**
 * Lot 13 — espace école : réglages de la classe, élève « papier », devoir, saisie des bilans du livre papier
 * → note finale et décision, export CSV, certificat de niveau (aperçu, délivrance, impression PDF) ;
 * côté famille : le devoir apparaît sur « Aujourd'hui ».
 */
test.use({ compte: null });

test('espace école : de la classe papier au certificat imprimé', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  await loginTeacher(page);
  const name = `CE1-${info.project.name}-${Date.now()}`;
  const c = await page.request.post('/api/v1/teacher/classes', {
    headers: { 'x-awform': '1' },
    data: { name },
  });
  expect(c.status()).toBe(201);
  const cls = (await c.json()).class as { id: string; joinCode: string };

  await page.goto('/enseignant');
  await page.getByTestId(`espace-ecole-${name}`).click();
  await expect(page).toHaveURL(new RegExp(`/enseignant/classe/${cls.id}$`));

  // réglages : livre suivi, établissement, ville
  await page.getByTestId('niveau-classe').selectOption('en1');
  await page.getByTestId('etablissement').fill('École pilote AWFORM');
  await page.getByTestId('lieu').fill('Dakar');
  await page.getByTestId('enregistrer-reglages').click();
  await expect(page.getByTestId('ecole-message')).toBeVisible();

  // élève de la classe papier
  await page.getByTestId('nom-eleve').fill('Awa D.');
  await page.getByTestId('ajouter-eleve').click();
  await expect(page.locator('[data-eleve="Awa D."]')).toBeVisible();

  // devoir : première leçon, pour toute la classe
  await page.getByTestId('onglet-devoirs').click();
  await page.getByTestId('devoir-lecon').selectOption({ index: 1 });
  await page.getByTestId('creer-devoir').click();
  await expect(page.locator('[data-devoir="en1.l01"]')).toBeVisible();

  // classe papier : notes des bilans et de l'examen → note finale et décision
  await page.getByTestId('onglet-tableau').click();
  await page.getByTestId('saisir-Awa D.').click();
  const form = page.getByTestId('saisie');
  const inputs = form.locator('[data-testid^="score-"]');
  const n = await inputs.count();
  // bilans (tous sauf les 3 dernières lignes : examen, récitations, productions)
  for (let i = 0; i < n - 3; i++) await inputs.nth(i).fill('18');
  await form.getByTestId(`score-${n - 3}`).fill('17');
  await page.getByTestId('enregistrer-saisie').click();
  await expect(page.getByTestId('nf-Awa D.')).toHaveText('87');
  await expect(page.getByTestId('decision-Awa D.')).toContainText('Très bien');

  // export CSV pour l'école
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-tableau').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await (await dl.createReadStream()).toArray();
  const text = Buffer.concat(csv as Buffer[]).toString('utf8');
  expect(text).toContain('Awa D.');
  expect(text).toContain('Validé, mention Très bien');

  // tableau imprimable
  await page.getByTestId('imprimer-tableau').click();
  await expect(page.getByTestId('feuille')).toContainText('Awa D.');
  await page.goBack();

  // certificat de niveau : aperçu (français et arabe), délivrance, registre, impression
  await page.getByTestId('onglet-certificats').click();
  const eleve = page.getByTestId('cert-eleve');
  await eleve.selectOption({ label: 'Awa D.' });
  await page.getByTestId('cert-nom').fill('Awa Diop');
  await page.getByTestId('cert-apercu').click();
  const prev = page.getByTestId('cert-preview');
  await expect(prev).toContainText('Awa Diop');
  await expect(prev).toContainText('Très bien');
  await expect(prev.locator('[lang="ar"]')).toContainText('مُمْتَازٌ');
  await page.getByTestId('cert-delivrer').click();
  await expect(page.getByTestId('ecole-message')).toContainText('AWF-EN1-');
  const num = /AWF-EN1-\d{4}-\d{4}/.exec(
    (await page.getByTestId('ecole-message').textContent()) ?? '',
  )![0];
  await page.getByTestId(`imprimer-${num}`).click();
  await expect(page.getByTestId('numero')).toContainText(num);
  await expect(page.getByTestId('certificat')).toContainText('Awa Diop');
  // PDF (moteur d'impression de Chromium, A4 paysage)
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10_000);

  // côté famille : un adulte rejoint la classe avec le code ; le devoir est sur « Aujourd'hui »
  const ctx = await browser.newContext();
  const fam = await ctx.newPage();
  const { profileId } = await newAdult(fam, 'ecole13');
  const j = await fam.request.post(`/api/v1/profiles/${profileId}/classes`, {
    headers: { 'x-awform': '1' },
    data: { code: cls.joinCode, consent: true },
  });
  expect(j.status(), await j.text()).toBe(201);
  await fam.goto('/aujourdhui');
  await expect(fam.getByTestId('devoirs')).toContainText('en1.l01');
  // la famille ne voit que ses devoirs : aucune donnée des autres élèves
  await expect(fam.getByTestId('devoirs')).not.toContainText('Awa');
  // et n'a pas accès à l'espace école
  const denied = await fam.request.get(`/api/v1/ecole/classes/${cls.id}/tableau`);
  expect(denied.status()).toBe(403);
  await ctx.close();
});
