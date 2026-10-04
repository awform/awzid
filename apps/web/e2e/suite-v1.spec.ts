import { expect, loginTeacher, newAdult, test } from './fixtures';

/**
 * Suite V1 (lots 21 à 25) : messagerie encadrée et visio (enseignant ↔ famille, signalement), suivi des
 * sourates, code d'activation mal saisi, interface en arabe de droite à gauche.
 * Le carnet de pratique signé et les codes valides sont couverts par les tests d'API (lot22, lot23).
 */
test.use({ compte: null });

test('messagerie : annonce, message privé, réponse, signalement, visio', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  await loginTeacher(page);
  const name = `Msg-${info.project.name}-${Date.now()}`;
  const c = await page.request.post('/api/v1/teacher/classes', {
    headers: { 'x-awform': '1' },
    data: { name },
  });
  expect(c.status()).toBe(201);
  const cls = (await c.json()).class as { id: string; joinCode: string };

  const ctx = await browser.newContext();
  const fam = await ctx.newPage();
  const { profileId } = await newAdult(fam, 'msg21');
  const j = await fam.request.post(`/api/v1/profiles/${profileId}/classes`, {
    headers: { 'x-awform': '1' },
    data: { code: cls.joinCode, consent: true },
  });
  expect(j.status(), await j.text()).toBe(201);

  // enseignant : annonce à la classe, puis message privé à la famille
  await page.goto(`/enseignant/classe/${cls.id}`);
  await page.getByTestId('onglet-messages').click();
  // réponse de l'annonce retenue jusqu'à la saisie du message suivant (vu sur la VM : une réponse lente
  // effaçait le message déjà tapé, envoyé ensuite vide puis bloqué par « required »)
  let relacher!: () => void;
  const retenue = new Promise<void>((ok) => (relacher = ok));
  await page.route('**/api/v1/ecole/classes/*/annonces', async (route) => {
    const res = await route.fetch();
    await retenue;
    await route.fulfill({ response: res });
  });
  await page.getByTestId('msg-texte').fill('Sortie scolaire vendredi.');
  await page.getByTestId('msg-envoyer').click();
  await page.getByTestId('msg-destinataire').selectOption({ index: 1 });
  await page.getByTestId('msg-texte').fill('Bravo pour cette semaine.');
  relacher();
  await expect(page.getByText('Sortie scolaire vendredi.')).toBeVisible();
  await expect(page.getByTestId('msg-texte')).toHaveValue('Bravo pour cette semaine.');
  await page.unroute('**/api/v1/ecole/classes/*/annonces');
  await page.getByTestId('msg-texte').fill('Bravo pour cette semaine.');
  await page.getByTestId('msg-envoyer').click();
  await expect(page.getByTestId('msg-fil')).toHaveCount(1);

  // visio dans 5 minutes : le lien est donné à la famille (15 minutes avant le début)
  // heure locale calculée DANS le navigateur (son fuseau peut différer de celui du lanceur de tests)
  const local = await page.evaluate(() => {
    const start = new Date(Date.now() + 5 * 60_000);
    return new Date(start.getTime() - start.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  await page.locator('#vt').fill('Révision');
  await page.locator('#vd').fill(local);
  await page.locator('#vu').fill('https://meet.jit.si/awzid-e2e');
  await page.getByTestId('visio-planifier').click();
  await expect(page.getByText('Révision', { exact: false })).toBeVisible();

  // famille : annonce, fil privé (réponse), visio, signalement avec numéro d'aide
  await fam.goto('/messages');
  await expect(fam.getByTestId('annonce')).toContainText('Sortie scolaire vendredi.');
  await fam.getByTestId('msg-fil').click();
  await expect(fam.getByTestId('msg-fil-ouvert')).toContainText('Bravo pour cette semaine.');
  // réponse : la suite tapée pendant l'envoi n'est pas effacée (famille, puis enseignant)
  const REP = '**/api/v1/fils/*/messages';
  const retenir = async (p: typeof page) => {
    let lacher!: () => void;
    const attente = new Promise<void>((ok) => (lacher = ok));
    await p.route(REP, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const res = await route.fetch();
      await attente;
      await route.fulfill({ response: res });
    });
    return lacher;
  };
  const lacherFam = await retenir(fam);
  await fam.locator('#rep').fill('Merci !');
  await fam.getByRole('button', { name: 'Envoyer' }).click();
  await fam.locator('#rep').fill('À vendredi.');
  lacherFam();
  await expect(fam.getByTestId('msg-fil-ouvert')).toContainText('Merci !');
  await expect(fam.locator('#rep')).toHaveValue('À vendredi.');
  await fam.unroute(REP);

  await page.getByTestId('msg-fil').click();
  await expect(page.getByTestId('msg-fil-ouvert')).toContainText('Merci !');
  const lacherEns = await retenir(page);
  await page.locator('#rep').fill('Très bien.');
  await page.locator('#rep').locator('xpath=..').getByRole('button').click();
  await page.locator('#rep').fill('Bonne semaine.');
  lacherEns();
  await expect(page.getByTestId('msg-fil-ouvert')).toContainText('Très bien.');
  await expect(page.locator('#rep')).toHaveValue('Bonne semaine.');
  await page.unroute(REP);
  await expect(fam.getByTestId('visio').first()).toContainText('Révision');
  await expect(fam.getByTestId('visio').first().getByRole('link')).toHaveAttribute(
    'href',
    'https://meet.jit.si/awzid-e2e',
  );
  await fam.getByTestId('annonce').getByRole('button').click();
  await expect(fam.getByTestId('msg-info')).toBeVisible();
  await ctx.close();
});

test('suivi des sourates et code d’activation mal saisi', async ({ page }) => {
  await newAdult(page, 'sour22');
  await page.goto('/sourates');
  await expect(page.locator('main h1')).toHaveText('Suivi des sourates');
  await page.goto('/activation');
  // dernier caractère (contrôle) faux : refusé sans consulter la base
  // (« AWZ-0000-0000-00000 » a, lui, un contrôle juste et serait simplement « inconnu »)
  await page.getByTestId('code-activation').fill('AWZ-0000-0000-00001');
  await page.getByTestId('activer').click();
  await expect(page.getByRole('alert')).toContainText('mal saisi');
});

test('interface en arabe : page entière de droite à gauche', async ({ page }) => {
  await newAdult(page, 'ar25');
  await page.goto('/compte');
  await page.getByTestId('langues-preparation').check();
  await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="ar"]').click()]);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  // retour au français
  await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="fr"]').click()]);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
