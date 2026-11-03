import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import {
  mesurerTout,
  pourcent,
  rangsConnus,
  type Frequences,
  type Rangs,
} from '../src/lib/coran-mots/calcul';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Accueil du Coran, 2e rangée de tuiles (3/11/2026) — sous « Lire · Écouter · Mémoriser » :
 *  - « Comprendre » → `/coran/tafsir`, seulement si `tafsir_sens` est ouvert pour la personne ;
 *  - « Mots du Coran » → l'espace `/coran/mots` (« Je reconnais X % des mots du Coran », Familles de mots si `racines_coran`,
 *    « Chercher un mot ou une racine » = la recherche existante), seulement si `coran_mots` est ouvert ;
 *  - aucune des deux : pas de rangée ; une seule : elle prend toute la largeur (jamais de case vide).
 * Les menus existants ne changent pas (menu du verset, panneau « Outils » : voir tafsir.spec.ts et coran-mots.spec.ts).
 * TUILES_CAPTURES=<dossier> : captures à 375 px.
 */
const H = { 'x-awform': '1' };
const CAPTURES = process.env.TUILES_CAPTURES;

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-tu-${test.info().project.name}-${Date.now()}@e2e.test`;
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
type Etat = 'on' | 'off';
async function regler(adm: Page, f: Record<'tafsir_sens' | 'coran_mots' | 'racines_coran', Etat>) {
  for (const [nom, etat] of Object.entries(f)) {
    const r = await adm.request.put(`/api/v1/admin/fonctions/${nom}`, {
      headers: H,
      data: { etat },
    });
    expect(r.status(), await r.text()).toBe(200);
  }
}
async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: join(CAPTURES, `${nom}.png`), fullPage: true });
}
async function axe(page: Page, selecteur: string) {
  const r = await new AxeBuilder({ page })
    .include(selecteur)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}
/** accueil du Coran chargé (1re rangée visible) */
async function accueil(page: Page) {
  await page.goto('/coran');
  await expect(page.getByTestId('mode-memoriser')).toBeVisible({ timeout: 20_000 });
}
const boite = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;
/** l'élément tient dans la largeur de l'écran (bouton « Chercher » compris) */
async function dansLaLargeur(page: Page, testid: string) {
  const w = page.viewportSize()!.width;
  const b = await boite(page, testid);
  expect(b.x + b.width, testid).toBeLessThanOrEqual(w + 1);
  const bouton = await boite(page, 'cm-aller');
  expect(bouton.x + bouton.width, 'cm-aller').toBeLessThanOrEqual(w + 1);
}
const sansDebordement = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

test.describe('accueil du Coran : rangée « Comprendre · Mots du Coran »', () => {
  test.use({ compte: null });
  let adm: Page;
  let erreurs: string[] = [];
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
  });
  test.afterAll(async () => {
    if (adm) {
      await regler(adm, { tafsir_sens: 'off', coran_mots: 'off', racines_coran: 'off' });
      await adm.context().close();
    }
  });
  test.beforeEach(async ({ page }, info) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    if (info.project.name.startsWith('mobile'))
      await page.setViewportSize({ width: 375, height: 812 });
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('tout coupé : pas de 2e rangée ; la 1re est inchangée', async ({ page }, info) => {
    await regler(adm, { tafsir_sens: 'off', coran_mots: 'off', racines_coran: 'off' });
    await newAdult(page, 'tu-off');
    await accueil(page);
    await expect(page.getByTestId('ouvrir-lecteur')).toBeVisible();
    await expect(page.getByTestId('mode-ecouter')).toBeVisible();
    await expect(page.getByTestId('modes-2')).toHaveCount(0);
    await expect(page.getByTestId('mode-comprendre')).toHaveCount(0);
    await expect(page.getByTestId('mode-mots')).toHaveCount(0);
    await capture(page, `accueil-coupe-${info.project.name}`);
  });

  test('« Mots du Coran » seule : toute la largeur ; l’espace donne le % du Coran entier et la recherche', async ({
    page,
  }, info) => {
    await regler(adm, { tafsir_sens: 'off', coran_mots: 'on', racines_coran: 'off' });
    const a = await newAdult(page, 'tu-mots');
    const c = await page.request.post(`/api/v1/profiles/${a.profileId}/commencer/arabe`, {
      headers: H,
      data: {},
    });
    expect(c.status(), await c.text()).toBe(201);
    await accueil(page);
    const tuile = page.getByTestId('mode-mots');
    await expect(tuile).toBeVisible();
    await expect(tuile).toHaveText('Mots du Coran');
    await expect(page.getByTestId('mode-comprendre')).toHaveCount(0);
    await expect(page.getByTestId('modes-2').locator('li')).toHaveCount(1);
    // une seule tuile : aussi large que la 1re rangée entière (de « Lire » à « Mémoriser »), même hauteur
    const lire = await boite(page, 'ouvrir-lecteur');
    const memo = await boite(page, 'mode-memoriser');
    const mots = await boite(page, 'mode-mots');
    const gauche = Math.min(lire.x, memo.x);
    const droite = Math.max(lire.x + lire.width, memo.x + memo.width);
    expect(Math.abs(mots.x - gauche)).toBeLessThan(2);
    expect(Math.abs(mots.x + mots.width - droite)).toBeLessThan(2);
    expect(Math.abs(mots.height - lire.height)).toBeLessThan(2);
    expect(mots.y - (lire.y + lire.height)).toBeGreaterThan(4);
    expect(mots.y - (lire.y + lire.height)).toBeLessThan(14);
    await sansDebordement(page);
    await axe(page, '[data-testid="modes-2"]');
    await capture(page, `accueil-mots-seule-${info.project.name}`);

    // l'espace : pourcentage du Coran entier (même calcul que l'appareil), pas de Familles (racines_coran coupé), recherche
    const connus = await (
      await page.request.get(`/api/v1/profiles/${a.profileId}/coran-mots/connus`)
    ).json();
    expect(connus.disponible).toBe(true);
    const rangs = (await (await page.request.get('/api/v1/coran-mots/rangs')).json()) as Rangs;
    const freq = (await (
      await page.request.get('/api/v1/coran-mots/frequences')
    ).json()) as Frequences;
    const m = mesurerTout(freq, rangsConnus(rangs, connus));
    const pct = Math.round(pourcent(m.compris, m.mots));
    await tuile.click();
    await expect(page).toHaveURL(/\/coran\/mots$/);
    await expect(page.getByTestId('cm-espace').locator('h1')).toHaveText('Mots du Coran');
    await expect(page.getByTestId('cm-coran-titre')).toHaveText(
      `Je reconnais ${pct} % des mots du Coran`,
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('cm-coran').getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(pct),
    );
    await expect(page.getByTestId('cm-espace-familles')).toHaveCount(0);
    await dansLaLargeur(page, 'cm-recherche');
    await expect(page.getByTestId('cm-recherche').locator('h2').first()).toHaveText(
      'Chercher un mot ou une racine',
    );
    await page.getByTestId('cm-q').fill('كتاب');
    await page.getByTestId('cm-q').press('Enter');
    await expect(page.getByTestId('cm-total')).toContainText(/\d+ occurrences/);
    await sansDebordement(page);
    await axe(page, '[data-testid="cm-espace"]');
    await capture(page, `espace-mots-${info.project.name}`);
  });

  test('« Comprendre » et « Mots du Coran » côte à côte ; Familles de mots dans l’espace', async ({
    page,
  }, info) => {
    await regler(adm, { tafsir_sens: 'on', coran_mots: 'on', racines_coran: 'on' });
    await newAdult(page, 'tu-deux');
    await accueil(page);
    const comprendre = page.getByTestId('mode-comprendre');
    await expect(comprendre).toHaveText('Comprendre');
    await expect(page.getByTestId('mode-mots')).toBeVisible();
    const g = await boite(page, 'mode-comprendre');
    const d = await boite(page, 'mode-mots');
    expect(Math.abs(g.y - d.y)).toBeLessThan(1);
    expect(Math.abs(g.width - d.width)).toBeLessThan(1);
    await sansDebordement(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await axe(page, '[data-testid="modes-2"]');
      await capture(page, `accueil-deux-${scheme}-${info.project.name}`);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await comprendre.click();
    await expect(page).toHaveURL(/\/coran\/tafsir$/);
    await accueil(page);
    await page.getByTestId('mode-mots').click();
    const familles = page.getByTestId('cm-espace-familles');
    await expect(familles).toBeVisible({ timeout: 20_000 });
    await expect(familles).toContainText('Familles de mots du Coran');
    await expect(page.getByTestId('cm-q')).toBeVisible();
    await dansLaLargeur(page, 'cm-recherche');
    await dansLaLargeur(page, 'cm-espace');
    await capture(page, `espace-mots-familles-${info.project.name}`);
    await familles.click();
    await expect(page).toHaveURL(/\/coran\/familles$/);
  });

  test('« Comprendre » seule : toute la largeur', async ({ page }, info) => {
    await regler(adm, { tafsir_sens: 'on', coran_mots: 'off', racines_coran: 'off' });
    await newAdult(page, 'tu-tafsir');
    await accueil(page);
    await expect(page.getByTestId('mode-comprendre')).toBeVisible();
    await expect(page.getByTestId('mode-mots')).toHaveCount(0);
    const lire = await boite(page, 'ouvrir-lecteur');
    const memo = await boite(page, 'mode-memoriser');
    const t = await boite(page, 'mode-comprendre');
    expect(Math.abs(t.width - (memo.x + memo.width - lire.x))).toBeLessThan(2);
    await capture(page, `accueil-comprendre-seule-${info.project.name}`);
  });
});
