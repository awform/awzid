import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Madjaliss, lot 6 (décision du client du 14/10/2026) : le groupe « bêta fermée », créé par invitation et géré par
 * l'administration, voit TOUT le contenu différé (séances de croyance d'Ibn ʿĀshir, Risāla complète, vers non confirmés
 * de la Lāmiyya) avec le bandeau « Contenu en relecture : ne pas diffuser ».
 *  - visiteur sans session : 401 ; compte ordinaire : 403 (rien de plus qu'au lot 5) ;
 *  - membre du groupe : fichiers différés (200), jamais les notes du référent (403) ; l'interface montre tout, avec le bandeau ;
 *  - retrait du groupe : le droit est perdu aussitôt (403), l'interface revient au contenu ordinaire ;
 *  - une invitation de groupe inscrit le compte dans le groupe ; l'écran d'administration ajoute et retire un compte.
 * L'interrupteur `beta_contenu_differe_visible` est général au site : jamais basculé ici (autres suites en parallèle) ;
 * son extinction est testée par apps/api/test/beta-groupe.test.ts et les tests unitaires.
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const racine = fileURLToPath(new URL('..', import.meta.url));
const gardes = join(racine, 'src', 'lib', 'server', 'mutun');
const lire = (f: string) => readFileSync(join(gardes, f), 'utf8');
const DIFFERES = [
  'ibn-ashir-differe.json',
  'lamiyya-differe.json',
  'risala-p1.json',
  ...readdirSync(gardes).filter((f) => /^risala-p\d+\.json$/.test(f)),
];
const NOTES = ['ibn-ashir-enseignant.json', 'risala-enseignant.json', 'lamiyya-enseignant.json'];

async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-gb-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
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

const ajouter = (adm: Page, adresse: string) =>
  adm.request.post('/api/v1/admin/groupe-beta', { headers: H, data: { adresse } });

test('visiteur sans session : 401 ; compte ordinaire : 403 sur tout fichier différé et sur les notes', async ({
  request,
  page,
}) => {
  for (const f of [...DIFFERES, ...NOTES])
    expect((await request.get(`/mutun/${f}`)).status(), f).toBe(401);
  await newAdult(page, 'gb-ordinaire');
  for (const f of [...DIFFERES, ...NOTES]) {
    const r = await page.request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(403);
    expect((await r.text()).length, f).toBeLessThan(200);
  }
  // ni bandeau ni séance différée dans l'interface d'un compte ordinaire
  await page.goto('/madjaliss/ibn-ashir');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(49);
  await expect(page.getByTestId('mj-bandeau-relecture')).toHaveCount(0);
});

test('membre du groupe : tout le contenu différé avec le bandeau ; notes du référent refusées ; retrait = droit perdu aussitôt', async ({
  browser,
  page,
}) => {
  const { email } = await newAdult(page, 'gb-membre');
  const adm = await admin(browser, 'membre');

  // avant : rien
  for (const f of DIFFERES) expect((await page.request.get(`/mutun/${f}`)).status(), f).toBe(403);

  // l'administrateur ajoute le compte (journalisé côté serveur)
  const a = await ajouter(adm, email);
  expect(a.status(), await a.text()).toBe(201);

  // les fichiers différés s'ouvrent (contenu identique au dossier gardé), les notes du référent restent fermées
  for (const f of DIFFERES) {
    const r = await page.request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(200);
    expect(r.headers()['cache-control'], f).toContain('no-store');
    expect(await r.text(), f).toBe(lire(f));
  }
  for (const f of NOTES) expect((await page.request.get(`/mutun/${f}`)).status(), f).toBe(403);
  // un fichier absent : même 404 que pour le personnel (le droit est contrôlé avant l'existence)
  expect((await page.request.get('/mutun/inconnu-differe.json')).status()).toBe(404);
  expect((await page.request.get('/mutun/risala.json.map')).status()).toBe(404);

  // interface : bandeau, neuf séances de croyance d'Ibn ʿĀshir en plus, Risāla complète, vers non confirmés
  await page.goto('/madjaliss');
  await expect(page.getByTestId('madjaliss')).toHaveAttribute('data-pret', 'true');
  await expect(page.getByTestId('mj-bandeau-relecture')).toContainText(
    'Contenu en relecture : ne pas diffuser',
  );
  await page.goto('/madjaliss/ibn-ashir');
  await expect(page.getByTestId('mj-bandeau-relecture')).toBeVisible();
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(58);
  await page.goto('/madjaliss/risala');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(264);
  // une séance différée de la Risāla (croyance, niveau adulte) : lue, avec la raison de la publication différée
  await page.goto('/madjaliss/risala/20');
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  await expect(page.getByTestId('mj-bandeau-relecture')).toBeVisible();
  await expect(page.getByTestId('mj-raison-differe')).toContainText('incertaines');
  // Lāmiyya : le vers 0045 est montré, marqué « non confirmé » (séance 11), les deux autres aussi
  for (const [seance, id] of [
    [11, 'LAM-0045'],
    [16, 'LAM-0068'],
    [21, 'LAM-0096'],
  ] as const) {
    await page.goto(`/madjaliss/lamiyya/${seance}`);
    const v = page.locator(`[data-phrase="${id}"]`);
    await expect(v.getByTestId('vers-nc')).toContainText('Non confirmé');
    await expect(v.locator('p.matn')).toBeVisible();
    await expect(v.getByTestId('vers-masque')).toHaveCount(0);
  }

  // retrait : le droit est perdu aussitôt
  const liste = (await (await adm.request.get('/api/v1/admin/groupe-beta')).json()) as {
    membres: Array<{ id: string; adresse: string }>;
  };
  const moi = liste.membres.find((m) => m.adresse === email)!;
  expect(moi).toBeTruthy();
  const del = await adm.request.delete(`/api/v1/admin/groupe-beta/${moi.id}`, { headers: H });
  expect(del.status(), await del.text()).toBe(200);
  for (const f of DIFFERES) expect((await page.request.get(`/mutun/${f}`)).status(), f).toBe(403);
  await page.goto('/madjaliss/ibn-ashir');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(49);
  await expect(page.getByTestId('mj-bandeau-relecture')).toHaveCount(0);
  await page.goto('/madjaliss/lamiyya/11');
  await expect(page.locator('[data-phrase="LAM-0045"]').getByTestId('vers-masque')).toBeVisible();
  await expect(page.getByTestId('vers-nc')).toHaveCount(0);
});

test('invitation de groupe : le compte créé est dans le groupe ; l’écran d’administration ajoute et retire un compte', async ({
  browser,
  page,
}) => {
  const adm = await admin(browser, 'ecran');
  // 1. invitation de groupe créée par l'écran (case à cocher), inscription avec le code
  await adm.goto('/admin');
  await expect(adm.getByTestId('admin-acces')).toBeVisible();
  await adm.getByTestId('inv-groupe').check();
  await adm.getByTestId('inv-creer').click();
  const code = (await adm.getByTestId('inv-code').innerText()).trim();
  expect(code).toMatch(/^AWZ-/);
  const email = `gb-inv-${test.info().project.name}-${Date.now()}@e2e.test`;
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'adulte',
      email,
      password: password(),
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
      birthYear: new Date().getFullYear() - 30,
      pseudonym: 'Invité',
      invitation: code,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    roles: string[];
    betaDiffere: boolean;
  };
  expect(me.roles).toContain('beta_fermee');
  expect(me.betaDiffere).toBe(true);
  expect((await page.request.get('/mutun/ibn-ashir-differe.json')).status()).toBe(200);
  expect((await page.request.get('/mutun/ibn-ashir-enseignant.json')).status()).toBe(403);

  // 2. l'écran liste le membre, le retire en un clic
  await adm.goto('/admin');
  const ligne = adm.locator('[data-testid="gb-membre"]', { hasText: email });
  await expect(ligne).toBeVisible();
  await ligne.getByTestId('gb-retirer').click();
  await expect(ligne).toHaveCount(0);
  expect((await page.request.get('/mutun/ibn-ashir-differe.json')).status()).toBe(403);

  // 3. ajout par l'adresse, depuis l'écran ; adresse inconnue : message
  await adm.getByTestId('gb-adresse').fill(email);
  await adm.getByTestId('gb-ajouter').click();
  await expect(adm.locator('[data-testid="gb-membre"]', { hasText: email })).toBeVisible();
  expect((await page.request.get('/mutun/ibn-ashir-differe.json')).status()).toBe(200);
  await adm.getByTestId('gb-adresse').fill(`inconnu-${Date.now()}@e2e.test`);
  await adm.getByTestId('gb-ajouter').click();
  await expect(adm.getByTestId('gb-erreur')).toBeVisible();
});
