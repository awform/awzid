import { tanwinUndo } from '@awform/content/text';
import type { Page } from '@playwright/test';
import { expect, loginTeacher, newAdult, PARENT_PIN, test } from './fixtures';

/**
 * Lot 5 : carnets de hifẓ. Texte Tanzil affiché octet par octet, trois pistes, révision hors ligne,
 * rythme et mois d'essai, validation officielle par l'enseignant (note /20), écoute du parent protégée.
 */
test.use({ compte: null });

const iso = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

async function tanzil(page: Page, s: number, a: number): Promise<string> {
  const r = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
  return ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
}

/** Texte affiché d'un verset (basmala d'en-tête + reste), à comparer au texte Tanzil. */
async function shown(page: Page, ref: string): Promise<string> {
  const rest = await page.locator(`[data-verse="${ref}"]`).first().textContent();
  const b = page.locator(`[data-basmala="${ref}"]`);
  // affichage : tanwins du Muṣḥaf de Médine → on compare au Tanzil APRÈS inversion de la transformation
  return tanwinUndo((await b.count()) ? `${await b.first().textContent()} ${rest}` : (rest ?? ''));
}

test('carnet N1 : texte Tanzil exact, portion apprise, journal envoyé', async ({ page }) => {
  const { profileId } = await newAdult(page, 'hifz-carnet');
  await page.goto('/coran');
  await page.getByTestId('ouvrir-hifz').click();
  await expect(page).toHaveURL(/\/hifz$/);
  await page.getByTestId('mode-carnet').check();
  await page.getByTestId('commencer-plan').click();
  await expect(page.getByTestId('plan-resume')).toContainText('semaine 1 sur 30');
  // semaine 1 : Al-Fātiḥa 1:1 et Āyat al-Kursī (parcours renforcé)
  for (const [s, a] of [
    [1, 1],
    [2, 255],
  ] as const)
    expect(Buffer.from(await shown(page, `${s}:${a}`))).toEqual(
      Buffer.from(await tanzil(page, s, a)),
    );
  await page.getByTestId('masquer').check();
  await expect(page.locator('button.verse.blur').first()).toBeVisible();
  await page.getByTestId('je-l-ai-appris').first().click();
  await expect(page.getByTestId('appris').first()).toBeVisible();
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`/api/v1/hifz/profiles/${profileId}`);
        return ((await r.json()) as { events: Array<{ kind: string }> }).events.map((e) => e.kind);
      },
      { timeout: 15_000 },
    )
    .toEqual(['appris']);
});

test('révision récente faite sans réseau, envoyée au retour du réseau', async ({
  page,
  context,
}) => {
  const { profileId } = await newAdult(page, 'hifz-horsligne');
  const yesterday = iso(new Date(Date.now() - 86_400_000));
  await page.request.put(`/api/v1/hifz/profiles/${profileId}/plan`, {
    headers: { 'x-awform': '1' },
    data: { mode: 'carnet', bookCode: 'ad1', startDate: yesterday },
  });
  // Al-Fātiḥa 1:1 apprise hier → révision J+1 aujourd'hui
  await page.request.post('/api/v1/attempts', {
    headers: { 'x-awform': '1' },
    data: {
      events: [
        {
          id: crypto.randomUUID(),
          profileId,
          unitId: 'hifz',
          eventType: 'hifz',
          response: {
            day: yesterday,
            part: '1:1-7',
            kind: 'appris',
            source: 'auto',
            details: { v: '1' },
          },
          deviceAt: new Date().toISOString(),
        },
      ],
    },
  });
  await page.goto('/hifz');
  const recent = page.getByTestId('piste-recent');
  await expect(recent.locator('[data-part="1:1-7"]')).toBeVisible();
  await expect(recent).toContainText('J+1');
  // le service worker doit contrôler la page avant la coupure (sinon le rechargement échoue)
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.ready) && !!navigator.serviceWorker.controller,
  );
  await context.setOffline(true);
  await page.reload();
  await expect(recent.locator('[data-part="1:1-7"]')).toBeVisible();
  await recent.locator('[data-part="1:1-7"] button[data-q="3"]').click();
  await expect(page.getByTestId('en-attente')).toBeVisible();
  await expect(recent.locator('[data-part="1:1-7"]')).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });
  const j = (await (await page.request.get(`/api/v1/hifz/profiles/${profileId}`)).json()) as {
    events: Array<{ kind: string; q: number | null }>;
  };
  expect(j.events.map((e) => [e.kind, e.q])).toEqual([
    ['appris', null],
    ['revision', 3],
  ]);
});

test('Coran entier à mon rythme : tableau honnête, mois d’essai, portion du jour', async ({
  page,
}) => {
  await newAdult(page, 'hifz-rythme');
  await page.goto('/hifz');
  await page.getByTestId('mode-rythme').check();
  await expect(page.locator('table.rhythms tbody tr')).toHaveCount(5);
  // temps en fourchette début → fin ; un tour de roue plus long allège la fin de parcours
  const seance7 = page.getByTestId('seance-7');
  await expect(seance7).toContainText('→');
  const before = await seance7.textContent();
  await page.getByTestId('cycle').selectOption('60');
  await expect(seance7).not.toHaveText(before ?? '');
  await expect(seance7).toContainText('tour de 60');
  await page.getByTestId('cycle').selectOption('0');
  await page.locator('#order').selectOption('juz30');
  await page.getByTestId('commencer-plan').click();
  await expect(page.getByTestId('plan-resume')).toContainText("Mois d'essai : jour 1 sur 28");
  await expect(page.getByTestId('charge')).toContainText('tour de 45 jours');
  await page.getByTestId('cycle-plan').selectOption('60');
  await expect(page.getByTestId('charge')).toContainText('tour de 60 jours');
  // portion du jour (pages RÉELLES du Muṣḥaf de Médine : Al-Fātiḥa occupe à elle seule la page 1) : 1:1-4
  expect(await shown(page, '1:1')).toBe(await tanzil(page, 1, 1));
  expect(Buffer.from(await shown(page, '1:4'))).toEqual(Buffer.from(await tanzil(page, 1, 4)));
  await page.getByTestId('je-l-ai-appris').click();
  await expect(page.getByTestId('appris')).toBeVisible();
});

test.describe('enseignant et parent', () => {
  test('le parent inscrit son enfant, l’enseignant valide (note /20), l’enfant voit son étoile', async ({
    page,
    browser,
  }) => {
    // parent : carnet E1 pour Amina, puis inscription dans la classe
    const parent = await browser.newContext();
    const pp = await parent.newPage();
    await pp.request.post('/api/v1/auth/login', {
      headers: { 'x-awform': '1' },
      data: { email: 'parent@e2e.test', password: process.env.E2E_PASSWORD },
    });
    const me = (await (await pp.request.get('/api/v1/auth/me')).json()) as {
      profiles: Array<{ id: string; pseudonym: string }>;
    };
    const amina = me.profiles.find((p) => p.pseudonym === 'Amina')!;
    await pp.request.put(`/api/v1/hifz/profiles/${amina.id}/plan`, {
      headers: { 'x-awform': '1' },
      data: { mode: 'carnet', bookCode: 'en1', startDate: iso(new Date()) },
    });

    await loginTeacher(page);
    await page.goto('/enseignant');
    const name = `Groupe ${test.info().project.name}`;
    await page.locator('#cname').fill(name);
    await page.getByRole('button', { name: 'Créer la classe' }).click();
    const text = await page.getByTestId('ens-message').textContent();
    const code = /([A-HJ-NP-Z2-9]{8})/.exec(text ?? '')![1]!;

    await pp.goto('/compte');
    const block = pp.getByTestId('hifz-compte').locator('.hp').filter({ hasText: 'Amina' });
    await block.getByTestId('code-classe').fill(code);
    await block.getByTestId('consent-partage').check();
    // audit SEC-3 : code parent exigé pour inscrire un enfant
    await block.getByTestId('pin-classe').fill(PARENT_PIN);
    await block.getByRole('button', { name: 'Rejoindre la classe' }).click();
    await expect(pp.getByRole('status')).toContainText(name);

    await page.reload();
    await page.getByRole('button', { name }).click();
    await expect(page.getByTestId('classe')).toContainText('Amina');
    await page.getByTestId('valider-Amina').click();
    await page.locator('#part').selectOption('112:1-4');
    await page.getByTestId('c-aides').fill('2');
    await page.getByTestId('c-hesitations').fill('1');
    await page.getByTestId('c-discretes').fill('1');
    await expect(page.getByTestId('note-calculee')).toContainText('17 / 20');
    await page.getByTestId('enregistrer-validation').click();
    await expect(page.getByTestId('ens-message')).toContainText('Amina : 17 / 20 (Très bien)');

    // l'enfant (E1) voit une étoile et une phrase positive, pas la note
    await pp.goto('/profils');
    await pp.locator('[data-profile]').filter({ hasText: 'Amina' }).click();
    await expect(pp).toHaveURL(/\/$/);
    await expect(pp.getByTestId('eleve-actif')).toHaveText('Amina');
    await pp.goto('/hifz');
    await expect(pp.getByTestId('validations')).toContainText('Très belle récitation');
    await expect(pp.getByTestId('validations')).not.toContainText('/ 20');
    // écoute du parent : protégée par le code parent
    await pp.getByTestId('espace-parent').click();
    await pp.locator('#pin').fill(PARENT_PIN);
    await pp.getByRole('button', { name: 'Valider' }).click();
    await expect(pp.getByText('Écoute du parent')).toBeVisible();
    await parent.close();
  });
});
