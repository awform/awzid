import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Mode « tout voir » du client (2/11/2026) : sur son compte administrateur (second facteur validé), tout le contenu est
 * visible — tous les niveaux et livres de toutes les pistes, les Madjaliss dont le chapitre du jihād (séances 134 à 136
 * et 257 de la Risāla) ; ce contenu reste invisible pour tous les autres comptes, y compris la bêta fermée. Rien n'est
 * enregistré (aucun profil). L'interrupteur `beta_contenu_differe_visible` n'est jamais basculé ici (suites en parallèle).
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const racine = fileURLToPath(new URL('..', import.meta.url));
const gardes = join(racine, 'src', 'lib', 'server', 'mutun');
const NUMEROS = [134, 135, 136, 257];
const SENSIBLE = /jih[aā]d|pays ennemi/i;
const FICHIER_TOUT = '/mutun/risala-tout.json';

const CLIENT = '01a14091-7673-776c-9993-d46fd1265aa7';
const sql = (requete: string) =>
  execFileSync('psql', [process.env.TEST_DATABASE_URL!, '-Atqc', requete], { stdio: 'ignore' });

/**
 * Administrateur créé comme par la CLI, avec son second facteur configuré ET validé dans la session. `client` : il prend
 * l'identifiant du compte du client (seul compte « tout voir »), sur la base de test ISOLÉE de ce dossier (le titulaire
 * précédent de l'identifiant, d'un test d'avant, est supprimé : les suites tournent avec --workers=1).
 */
async function admin(browser: Browser, label: string, client = true): Promise<Page> {
  const email = `admin-tv-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
  );
  if (client)
    sql(
      `begin; delete from account where id = '${CLIENT}'; update account set id = '${CLIENT}' where email = '${email}'; commit;`,
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

test('administrateur avec second facteur : fichiers gardés ouverts, toutVoir vrai, aucun profil', async ({
  browser,
}) => {
  const adm = await admin(browser, 'api');
  const me = (await (await adm.request.get('/api/v1/auth/me')).json()) as {
    toutVoir: boolean;
    profiles: unknown[];
  };
  expect(me.toutVoir).toBe(true);
  expect(me.profiles).toEqual([]);
  for (const f of ['risala-tout.json', 'risala-p3.json', 'ibn-ashir-differe.json']) {
    const r = await adm.request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(200);
    expect(await r.text(), f).toBe(readFileSync(join(gardes, f), 'utf8'));
  }
});

test('administrateur : les Madjaliss montrent le chapitre du jihād et la Risāla entière (265 séances)', async ({
  browser,
}) => {
  const adm = await admin(browser, 'mj');
  await adm.goto('/madjaliss');
  await expect(adm.getByTestId('madjaliss')).toHaveAttribute('data-pret', 'true');
  await expect(adm.locator('a[data-texte="risala"]')).toHaveAttribute('data-actif', '1');
  await adm.goto('/madjaliss/risala');
  await expect(adm.locator('[data-testid="mj-sommaire"] li')).toHaveCount(265);
  for (const n of NUMEROS) await expect(adm.locator(`li[data-seance="${n}"]`)).toBeVisible();
  await expect(adm.locator('li[data-seance="134"]')).toContainText('jihād');
  // une séance sensible s'ouvre : étape de lecture, phrases affichées, rien n'est enregistré (aucun profil)
  await adm.goto('/madjaliss/risala/134');
  await expect(adm.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  await expect(adm.locator('article.phrase').first()).toBeVisible();
  await expect(adm.locator('h1')).toContainText('jihād');
  // et une séance différée ordinaire, adulte (séance 1, croyance)
  await adm.goto('/madjaliss/risala/1');
  await expect(adm.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
});

test('administrateur : « Tout voir » dans le menu ; tous les niveaux de toutes les pistes, sans verrou', async ({
  browser,
}) => {
  const adm = await admin(browser, 'niv');
  const niveaux = (
    (await (await adm.request.get('/api/v1/levels')).json()) as { levels: Array<{ code: string }> }
  ).levels.map((l) => l.code);
  expect(niveaux.length).toBeGreaterThan(1);
  await adm.goto('/admin');
  const entree = adm.locator('nav.tabs a[href="/admin/explorer"]');
  await expect(entree).toBeVisible();
  await expect(entree).toContainText('Tout voir');
  await expect(entree).toHaveAttribute('href', '/admin/explorer');
  await adm.goto('/admin/explorer');
  await expect(adm.getByTestId('tv-page')).toBeVisible();
  // chaque niveau de l'édition est listé, une fois, dans sa piste
  await expect(adm.getByTestId('tv-niveau')).toHaveCount(niveaux.length);
  for (const code of niveaux) await expect(adm.locator(`[data-niveau="${code}"]`)).toHaveCount(1);
  const pistes = new Set(niveaux.map((c) => /^([a-z]+?)\d+$/.exec(c)?.[1] ?? 'autres'));
  await expect(adm.getByTestId('tv-piste')).toHaveCount(pistes.size);
  // un niveau s'ouvre sans verrou (ni « fermé », ni aperçu seul), quelle que soit la piste
  for (const code of [niveaux[0]!, niveaux[niveaux.length - 1]!]) {
    await adm.goto(`/niveaux/${code}`);
    await expect(adm.getByTestId('acces-ferme')).toHaveCount(0);
    await expect(adm.getByTestId('acces-apercu')).toHaveCount(0);
    await expect(adm.getByTestId('acces-revision')).toHaveCount(0);
  }
});

test('compte de la bêta fermée : ne voit pas le jihād (fichier refusé, sommaire à 261 séances, séance introuvable)', async ({
  browser,
  page,
}) => {
  const { email } = await newAdult(page, 'tv-beta');
  const adm = await admin(browser, 'beta', false);
  const a = await adm.request.post('/api/v1/admin/groupe-beta', {
    headers: H,
    data: { adresse: email },
  });
  expect(a.status(), await a.text()).toBe(201);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    roles: string[];
    toutVoir: boolean;
  };
  expect(me.roles).toContain('beta_fermee');
  expect(me.toutVoir).toBe(false);
  // le groupe a toujours le différé ordinaire, mais jamais le fichier des séances sensibles
  expect((await page.request.get('/mutun/risala-p3.json')).status()).toBe(200);
  expect((await page.request.get(FICHIER_TOUT)).status()).toBe(403);
  const vus: string[] = [];
  page.on('request', (r) => vus.push(new URL(r.url()).pathname));
  await page.goto('/madjaliss/risala');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(261);
  for (const n of NUMEROS) await expect(page.locator(`li[data-seance="${n}"]`)).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toMatch(SENSIBLE);
  await page.goto('/madjaliss/risala/134');
  await expect(page.getByTestId('mj-etape')).toHaveCount(0);
  await expect(page.locator('main')).toContainText("Ce texte n'est pas encore disponible.");
  expect(vus).not.toContain(FICHIER_TOUT);
  // l'entrée « Tout voir » n'existe pas pour lui et la page est fermée
  await expect(page.locator('nav.tabs a[href="/admin/explorer"]')).toHaveCount(0);
  await page.goto('/admin/explorer');
  await expect(page.getByTestId('tv-reserve')).toBeVisible();
  await expect(page.getByTestId('tv-page')).toHaveCount(0);
});

test('visiteur et compte ordinaire : le fichier des séances sensibles est refusé ; le sommaire public n’en dit rien', async ({
  request,
  page,
}) => {
  expect((await request.get(FICHIER_TOUT)).status()).toBe(401);
  const pub = await request.get('/mutun/risala.json');
  expect(pub.status()).toBe(200);
  expect(await pub.text()).not.toMatch(SENSIBLE);
  await newAdult(page, 'tv-ordinaire');
  expect((await page.request.get(FICHIER_TOUT)).status()).toBe(403);
  expect((await page.request.get('/mutun/risala-p3.json')).status()).toBe(403);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as { toutVoir: boolean };
  expect(me.toutVoir).toBe(false);
});

test('un AUTRE administrateur avec second facteur validé n’a pas « tout voir » : fichier refusé, sommaire à 261 séances', async ({
  browser,
}) => {
  const adm = await admin(browser, 'autre', false);
  const me = (await (await adm.request.get('/api/v1/auth/me')).json()) as {
    toutVoir: boolean;
    mfaVerified: boolean;
  };
  expect(me.mfaVerified).toBe(true);
  expect(me.toutVoir).toBe(false);
  expect((await adm.request.get(FICHIER_TOUT)).status()).toBe(403);
  expect((await adm.request.get('/mutun/risala-p3.json')).status()).toBe(200);
  await adm.goto('/madjaliss/risala');
  await expect(adm.locator('[data-testid="mj-sommaire"] li')).toHaveCount(261);
  await expect(adm.locator('li[data-seance="134"]')).toHaveCount(0);
  await adm.goto('/admin/explorer');
  await expect(adm.getByTestId('tv-reserve')).toBeVisible();
});
