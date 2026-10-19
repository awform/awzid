import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Tuteur IA de conversation (19/10/2026, TUTEUR_IA.md) — fournisseur SIMULÉ (AWFORM_TUTEUR=simule), AUCUN appel
 * réel : accroche dans la leçon, page chargée à la demande, dialogue guidé en mode TEXTE (comparaison au livre),
 * conversation libre en texte (réponse, voix simulée), refus religieux avec renvois, minutes restantes, enfant exclu.
 * Captures 375 px (clair, sombre) dans TUIA_CAPTURES si la variable est définie.
 */
const CAPTURES = process.env.TUIA_CAPTURES;
const H = { 'x-awform': '1' };

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-tuia-${test.info().project.name}-${Date.now()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    {
      env: { ...process.env, AWFORM_STAFF_PASSWORD: password() },
      stdio: 'ignore',
    },
  );
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adm = await ctx.newPage();
  expect(
    (
      await adm.request.post('/api/v1/auth/login', {
        headers: H,
        data: { email, password: password() },
      })
    ).status(),
  ).toBe(200);
  const { secret } = (await (
    await adm.request.post('/api/v1/auth/totp/setup', { headers: H, data: {} })
  ).json()) as {
    secret: string;
  };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}
const etat = async (adm: Page, e: 'on' | 'beta') =>
  expect(
    (
      await adm.request.put('/api/v1/admin/fonctions/tuteur_ia', { headers: H, data: { etat: e } })
    ).status(),
  ).toBe(200);

test.describe.configure({ mode: 'serial' });
test.use({ compte: null });
let adm: Page;

test.beforeAll(async ({ browser }) => {
  adm = await admin(browser);
  await etat(adm, 'on');
});
test.afterAll(async () => {
  if (adm) await etat(adm, 'beta');
});

async function adulteNiveau2(page: Page) {
  const { profileId } = await newAdult(page, 'tuia');
  const n = await page.request.put(`/api/v1/profiles/${profileId}/niveaux`, {
    headers: H,
    data: { levelCode: 'ad2', source: 'positionnement', score: 0.7 },
  });
  expect(n.status(), await n.text()).toBe(200);
  return profileId;
}
async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.setViewportSize({ width: 375, height: 812 });
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${CAPTURES}/${nom}-375-${mode === 'light' ? 'clair' : 'sombre'}.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test('dialogue guidé : accroche de la leçon, page à la demande, réplique écrite comparée au livre', async ({
  page,
}) => {
  const pid = await adulteNiveau2(page);
  await page.goto('/lecons/ad2.l01');
  const lien = page.getByTestId('tuia-ouvrir');
  await lien.scrollIntoViewIfNeeded();
  await lien.click();
  await expect(page).toHaveURL(/\/tuteur\/ad2\.l01$/);
  const vue = page.getByTestId('tuteur-ia');
  await expect(vue).toBeVisible();
  await expect(page.getByTestId('tuia-simule')).toBeVisible();
  // aucun visage : la marque et l'onde seulement (aucune image de personne)
  await expect(vue.locator('img')).toHaveCount(2); // symbole clair et sombre de la marque
  // le partenaire parle d'abord (texte du livre), puis c'est à l'élève
  const s = (await (
    await page.request.get(`/api/v1/tuteur-ia/${pid}/scenario/ad2.l01`)
  ).json()) as {
    tours: Array<{ t: string; choix?: Array<{ ar: string; kind: string }> }>;
  };
  for (let i = 0; i < s.tours.length && s.tours[i]!.t === 'partenaire'; i++)
    await page.getByTestId('tuia-continuer').click();
  await expect(page.getByTestId('tuia-a-toi')).toBeVisible();
  await capture(page, 'tuteur-guide');
  const bonne = s.tours
    .find((x) => x.t === 'eleve')!
    .choix!.find((c) => c.kind === 'bonne')!
    .ar.replace(/[[\]]/g, '');
  // mode texte de secours (pas d'accord vocal donné)
  await page.getByTestId('tuia-saisie').fill(bonne);
  await page.getByTestId('tuia-envoyer').click();
  await expect(page.getByTestId('tuia-resultat')).toHaveAttribute('data-bilan', 'bravo');
  await capture(page, 'tuteur-guide-bravo');
  await page.getByTestId('tuia-suivant').click();
});

test('conversation libre (texte) : réponse du livre, voix simulée, refus religieux SANS appel, renvois', async ({
  page,
}) => {
  const pid = await adulteNiveau2(page);
  // comme l'élève : depuis la leçon (accroche sous le dialogue)
  await page.goto('/lecons/ad2.l01');
  await page.getByTestId('tuia-ouvrir').click();
  await page.getByTestId('tuia-mode-libre').click();
  const fil = page.getByTestId('tuia-messages');
  await expect(fil.locator('li[data-de="tuteur"]')).toHaveCount(1); // première réplique du livre
  await page.getByTestId('tuia-ecrire').click();
  await page.getByTestId('tuia-saisie').fill('Est-ce que la musique est haram ?');
  await page.getByTestId('tuia-envoyer').click();
  const renvoi = page.getByTestId('tuia-renvoi').last();
  await expect(renvoi).toHaveAttribute('data-redirection', 'religion');
  await expect(renvoi).toContainText('Je ne réponds pas aux questions de religion');
  await expect(renvoi.getByRole('link')).toHaveCount(3);
  // une phrase en arabe : réponse (dialogue du livre en mode simulé), minutes restantes
  const s = (await (
    await page.request.get(`/api/v1/tuteur-ia/${pid}/scenario/ad2.l01`)
  ).json()) as {
    tours: Array<{ t: string; choix?: Array<{ ar: string; kind: string }> }>;
  };
  const bonne = s.tours
    .find((x) => x.t === 'eleve')!
    .choix!.find((c) => c.kind === 'bonne')!
    .ar.replace(/[[\]]/g, '');
  await page.getByTestId('tuia-saisie').fill(bonne);
  await page.getByTestId('tuia-envoyer').click();
  await expect(fil.locator('li[data-de="tuteur"]')).toHaveCount(3);
  await expect(page.getByTestId('tuia-minutes')).toContainText('minute');
  await capture(page, 'tuteur-libre');
  // côté serveur : la question religieuse n'a coûté aucun appel (une seule dépense, celle de la phrase arabe)
  const j = (await (await page.request.get(`/api/v1/tutor/${pid}/journal`)).json()) as {
    journal: Array<{ route: string }>;
  };
  expect(j.journal.map((x) => x.route).sort()).toEqual(['conversation', 'conversation_religion']);
});

test('enfant : conversation libre refusée par le serveur (dialogue guidé seul)', async ({
  page,
}) => {
  // le compte parent de démonstration a un enfant (en1) ; sinon, on s'arrête au contrôle du serveur pour l'adulte
  await page.request.post('/api/v1/auth/login', {
    headers: H,
    data: { email: 'parent@e2e.test', password: password() },
  });
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles?: Array<{ id: string; kind: string }>;
  };
  const enfant = me.profiles?.find((p) => p.kind === 'enfant');
  test.skip(!enfant, 'pas de profil enfant dans le jeu d’essai');
  const r = await page.request.post(`/api/v1/tuteur-ia/${enfant!.id}/libre`, {
    headers: H,
    data: { unitId: 'en1.l05', texte: 'سلام' },
  });
  expect(r.status()).toBe(403);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('reserve_ados_adultes');
});
