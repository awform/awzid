import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { inscrire } from './inscription';
import { totp } from './totp';

/**
 * V2-1 et V2-0 (29/10/2026) — mots de passe simples de 8 caractères avec messages clairs, et mesure anonyme.
 *  - inscription avec un mot de passe de 8 caractères sans aucune complexité ; mot de passe courant refusé en clair ;
 *  - connexion : essais restants, pause de 10 minutes avec son heure de fin, « Mot de passe oublié ? », pause levée
 *    quand le mot de passe est changé ;
 *  - mesure : l'appareil n'envoie que l'étape, la plateforme et la langue, sans cookie ; entonnoir dans l'admin.
 */
test.use({ compte: null });
const H = { 'x-awform': '1' };
const unique = () => `${test.info().project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-v2-${unique()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
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
  ).json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}

test('inscription : 8 caractères sans complexité acceptés', async ({ page }) => {
  await inscrire(page, {
    email: `v2-simple-${unique()}@e2e.test`,
    motDePasse: 'tamarini',
    kind: 'adulte',
    pseudonyme: 'Zaynabou',
  });
  await expect(page).not.toHaveURL(/\/inscription/);
});

test('inscription : mot de passe courant refusé avec un message clair', async ({ page }) => {
  await inscrire(page, {
    email: `v2-courant-${unique()}@e2e.test`,
    motDePasse: 'dakar2026',
    kind: 'adulte',
    pseudonyme: 'Zaynabou',
  });
  await expect(page.getByTestId('etape-1')).toBeVisible();
  await expect(page.getByText('trop courant').first()).toBeVisible();
});

test('connexion : essais restants, pause avec son heure, levée par le changement de mot de passe', async ({
  page,
  browser,
}) => {
  const email = `v2-pause-${unique()}@e2e.test`;
  const ancien = password();
  const nouveau = `${ancien} bis`;
  // le compte est créé dans un autre contexte (l'écran de connexion reste celui d'un visiteur)
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const autre = await ctx.newPage();
  const s = await autre.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'adulte',
      email,
      password: ancien,
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
      birthYear: new Date().getFullYear() - 30,
      pseudonym: 'Moi',
    },
  });
  expect(s.status(), await s.text()).toBe(201);

  await page.goto('/connexion');
  const erreur = page.getByTestId('connexion-erreur');
  const essayer = async (mdp: string) => {
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(mdp);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/auth/login')),
      page.locator('form button[type="submit"]').click(),
    ]);
  };
  for (let k = 1; k <= 2; k++) {
    await essayer('mauvais mot de passe');
    await expect(erreur).toBeVisible();
    await expect(erreur).not.toContainText('essai');
  }
  await essayer('mauvais mot de passe'); // 3e échec : 5 essais restants
  await expect(erreur).toContainText('Il te reste 5 essais');
  for (let k = 4; k <= 7; k++) await essayer('mauvais mot de passe');
  await expect(erreur).toContainText('Il te reste 1 essai');
  await essayer('mauvais mot de passe'); // 8e échec : la pause commence
  await expect(erreur).toContainText(/pause jusqu.à \d{1,2}[:h]\d{2}/);
  await expect(erreur).toContainText('Mot de passe oublié ?');
  await expect(page.getByTestId('lien-oubli')).toBeVisible();
  // même avec le bon mot de passe, la pause tient
  await essayer(ancien);
  await expect(erreur).toContainText('Trop d');
  await expect(page).toHaveURL(/\/connexion/);

  // le mot de passe est changé (ici depuis l'autre appareil) : la pause est levée tout de suite
  const ch = await autre.request.post('/api/v1/auth/password', {
    headers: H,
    data: { current: ancien, next: nouveau },
  });
  expect(ch.status(), await ch.text()).toBe(200);
  await essayer(nouveau);
  await expect(page).not.toHaveURL(/\/connexion/);
});

test('mesure anonyme : seulement l’étape, la plateforme et la langue, sans cookie ; entonnoir dans l’admin', async ({
  page,
  browser,
}) => {
  const envois: Array<{ corps: Record<string, unknown>; cookie: string | undefined }> = [];
  // un cookie « témoin » existe dans le navigateur : l'envoi de la mesure ne doit PAS le porter
  await page
    .context()
    .addCookies([{ name: 'temoin', value: '1', url: test.info().project.use.baseURL! }]);
  await page.route('**/api/v1/mesure', async (route) => {
    const req = route.request();
    envois.push({
      corps: req.postDataJSON() as Record<string, unknown>,
      cookie: (await req.allHeaders())['cookie'],
    });
    await route.continue();
  });
  await page.goto('/inscription');
  await page.locator('#email').focus();
  await page.goto('/connexion');
  await page.locator('#email').fill(`mesure-${unique()}@e2e.test`);
  await page.locator('#password').fill('mauvais mot de passe');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login')),
    page.locator('form button[type="submit"]').click(),
  ]);
  await expect
    .poll(() => envois.map((e) => e.corps.etape))
    .toEqual(
      expect.arrayContaining([
        'inscription_ouverte',
        'inscription_choix',
        'connexion_ouverte',
        'connexion_identifiants',
        'connexion_echec_mdp',
      ]),
    );
  for (const e of envois) {
    expect(Object.keys(e.corps).sort()).toEqual(['etape', 'langue', 'plateforme']);
    expect(['mobile', 'bureau']).toContain(e.corps.plateforme);
    expect(e.corps.langue).toBe('fr');
    expect(e.cookie).toBeUndefined();
  }

  const adm = await admin(browser);
  const r = await adm.request.get('/api/v1/admin/entonnoir?jours=7');
  expect(r.status(), await r.text()).toBe(200);
  const j = (await r.json()) as {
    jours: number;
    inscription: Array<{ etape: string; n: number; pourcent: number | null }>;
    connexion: Array<{ etape: string; n: number; pourcent: number | null; cote: boolean }>;
  };
  expect(j.jours).toBe(7);
  expect(j.inscription[0]).toMatchObject({ etape: 'inscription_ouverte', pourcent: 100 });
  expect(j.inscription[0]!.n).toBeGreaterThanOrEqual(1);
  expect(j.connexion.find((l) => l.etape === 'connexion_echec_mdp')!.cote).toBe(true);
  expect((await adm.request.get('/api/v1/admin/entonnoir?jours=30')).status()).toBe(200);

  await adm.goto('/admin');
  await expect(adm.getByTestId('entonnoir-inscription')).toBeVisible();
  await expect(adm.getByTestId('entonnoir-connexion')).toBeVisible();
  await expect(
    adm
      .getByTestId('entonnoir-inscription')
      .locator('tr[data-etape="inscription_ouverte"] td')
      .nth(1),
  ).toHaveText(/100/);
  await adm.getByTestId('entonnoir-periode').selectOption('30');
  await expect(adm.getByTestId('entonnoir-connexion')).toBeVisible();
});
