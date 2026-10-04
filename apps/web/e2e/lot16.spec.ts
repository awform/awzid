import { randomBytes } from 'node:crypto';
import { expect, PARENT_PIN, password, test } from './fixtures';
import { loginTeacher } from './enseignant';

/**
 * Lot 16 — livres gelés proposés, récitation ENVOYÉE par la famille (accord + code parent) puis écoutée et
 * notée par l'enseignant de la classe, suppression par la famille ; réglages des notifications (tout
 * désactivé par défaut, enfants avec le code parent).
 */
test.use({ compte: null });

test('récitation : la famille envoie, l’enseignant écoute et note, la famille voit la note puis supprime', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // enseignant : une classe
  await loginTeacher(page);
  const cls = (
    await (
      await page.request.post('/api/v1/teacher/classes', {
        headers: { 'x-awform': '1' },
        data: { name: `Écoute ${Date.now()}` },
      })
    ).json()
  ).class as { id: string; joinCode: string };

  // famille (compte parent de test) : l'enfant rejoint la classe, accord d'envoi, envoi avec le code parent
  const ctx = await browser.newContext();
  const fam = await ctx.newPage();
  expect(
    (
      await fam.request.post('/api/v1/auth/login', {
        headers: { 'x-awform': '1' },
        data: { email: 'parent@e2e.test', password: password() },
      })
    ).status(),
  ).toBe(200);
  const me = await (await fam.request.get('/api/v1/auth/me')).json();
  const kid = me.profiles.find((p: { kind: string }) => p.kind === 'enfant');
  expect(
    (
      await fam.request.post(`/api/v1/profiles/${kid.id}/classes`, {
        // audit SEC-3 : accord donné pour un mineur → code parent exigé
        headers: { 'x-awform': '1', 'x-parent-pin': PARENT_PIN },
        data: { code: cls.joinCode, consent: true },
      })
    ).status(),
  ).toBe(201);
  const pin = { 'x-awform': '1', 'x-parent-pin': PARENT_PIN };
  const acc = await fam.request.post(`/api/v1/profiles/${kid.id}/recitations/accord`, {
    headers: pin,
    data: {},
  });
  expect(acc.status(), await acc.text()).toBe(200);
  const audio = Buffer.concat([Buffer.from('OggS'), randomBytes(2000)]);
  const sent = await fam.request.post(
    `/api/v1/profiles/${kid.id}/recitations?classe=${cls.id}&passage=112:1-4`,
    { headers: { ...pin, 'content-type': 'audio/ogg' }, data: audio },
  );
  expect(sent.status(), await sent.text()).toBe(201);
  const rid = (await sent.json()).recitation.id as string;

  // enseignant : onglet « Écoute »
  await page.goto(`/enseignant/classe/${cls.id}`);
  await page.getByTestId('onglet-ecoute').click();
  const item = page.locator(`[data-recitation="${rid}"]`);
  await expect(item).toContainText(kid.pseudonym);
  await item.getByTestId('ecoute-ecouter').click();
  await expect(item.getByTestId('ecoute-audio')).toBeVisible();
  await item.getByTestId('ecoute-noter').click();
  await item.getByTestId('ecoute-enregistrer').click();
  await expect(page.getByTestId('ecole-message')).toContainText('20 / 20');

  // famille : la note, puis suppression
  const list = await (await fam.request.get(`/api/v1/profiles/${kid.id}/recitations`)).json();
  expect(list.recitations[0].grade.note.total).toBe(20);
  expect(
    (
      await fam.request.delete(`/api/v1/profiles/${kid.id}/recitations/${rid}`, {
        headers: { 'x-awform': '1' },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByTestId('onglet-ecoute').click();
  await expect(page.locator(`[data-recitation="${rid}"]`)).toHaveCount(0);
  // retour à l'état initial du compte de test : accord d'envoi retiré, l'enfant quitte la classe
  const consents = (await (await fam.request.get('/api/v1/account/consents')).json())
    .consents as Array<{
    id: string;
    type: string;
    withdrawnAt: string | null;
  }>;
  for (const c of consents.filter((x) => x.type === 'envoi_recitation' && !x.withdrawnAt))
    await fam.request.post(`/api/v1/account/consents/${c.id}/withdraw`, {
      headers: { 'x-awform': '1' },
      data: {},
    });
  await fam.request.delete(`/api/v1/profiles/${kid.id}/classes/${cls.id}`, {
    headers: { 'x-awform': '1' },
  });
  await ctx.close();
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('notifications : tout désactivé par défaut ; enfants avec le code parent', async ({
    page,
  }) => {
    await page.goto('/compte');
    const n = page.getByTestId('notifications');
    await expect(n).toBeVisible();
    await expect(n.getByTestId('notif-devoirs')).not.toBeChecked();
    await expect(n.getByTestId('notif-enfants')).not.toBeChecked();
    const d = await (await page.request.get('/api/v1/notifications')).json();
    expect(d.preferences).toMatchObject({ devoirs: false, rapport: false, enfants: false });
  });

  test('livres gelés : les niveaux Enfants 3 et Ados sont proposés', async ({ page }) => {
    const lv = await (await page.request.get('/api/v1/levels')).json();
    const codes = lv.levels.map((l: { code: string }) => l.code);
    for (const c of ['en3', 'ad3', 'ado1', 'ado2', 'ra1', 'ra2']) expect(codes).toContain(c);
    expect(lv.levels.filter((l: { apercu: boolean }) => l.apercu)).toEqual([]);
    const books = await (await page.request.get('/api/v1/hifz/books')).json();
    for (const c of ['en3', 'ad3']) expect(books.books).toContain(c);
  });
});
