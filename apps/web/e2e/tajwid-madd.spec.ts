import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { TAJWID_RULES, textHash } from '@awform/content/tajwid';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Indication des madd (25/10/2026) — interrupteur `tajwid_madd` :
 *  - COUPÉ par défaut : « Réciter et vérifier » reste entier, sans l'indication des madd ;
 *  - « canal bêta », ADULTE, UN verset récité : sous le bilan, les madd longs du verset (annotations de tajwīd) ; « Vérifier ce
 *    madd » envoie la récitation (en mémoire) au service du mode « madd » ; réponse = « semble trop court » ou « aucune indication »
 *    (jamais « correct », jamais de note) ; phrase de prudence affichée ; accessibilité AA en clair et en sombre, cibles de 44 px.
 * Micro FACTICE de Chromium (bips) ; service d'écoute FACTICE de l'e2e ; annotation de tajwīd et réponse du service SIMULÉES par
 * `page.route` (le service du mode « madd » est testé à part : API, python). Verset de test : 112:4 (sourate de 4 versets).
 */
test.use({
  compte: null,
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
  },
});

const H = { 'x-awform': '1' };
const R = (r: string) => TAJWID_RULES.indexOf(r as (typeof TAJWID_RULES)[number]);

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-md-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** annotation de tajwīd SIMULÉE de 112:4 : un madd muttaṣil sur le 1er mot, un lāzim sur le 2e (texte lu dans la base de test) */
async function simulerTajwid(page: Page) {
  const r = await page.request.get('/api/v1/quran/verses?s=112&from=4&to=4');
  const text = ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
  const mots = text.split(' ');
  const entree = [
    textHash(text),
    R('madd_muttasil'),
    0,
    mots[0]!.length,
    R('madd_6'),
    mots[0]!.length + 1,
    mots[1]!.length,
  ];
  await page.route('**/tajwid/112.json', (route) =>
    route.fulfill({
      json: { v: 1, s: 112, src: 'essai', a: [[''], [''], [''], entree] },
    }),
  );
}

async function reciterUnVerset(page: Page) {
  await page.goto('/coran/lecteur?s=112&a=4&memo=1');
  await expect(page.getByTestId('mode-memoriser')).toBeVisible();
  await page.getByTestId('reciter-verifier').click();
  await expect(page.getByTestId('panneau-ecoute')).toBeVisible();
  const accord = page.getByTestId('ecoute-accepter');
  // le panneau charge d'abord ses textes : attendre l'accord OU l'écran prêt avant de décider
  await expect(accord.or(page.getByTestId('ecoute-pret'))).toBeVisible();
  if (await accord.isVisible()) await accord.click();
  await expect(page.getByTestId('ecoute-pret')).toBeVisible();
  await page.getByTestId('ecoute-commencer').click();
  await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByTestId('ecoute-terminer').click();
  await expect(page.getByTestId('ecoute-resultat')).toBeVisible();
}

test.describe('indication des madd', () => {
  test.describe.configure({ mode: 'serial' });
  let adm: Page;
  const beta = async (email: string) => {
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
  };
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/tajwid_madd', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) {
      await adm.request.put('/api/v1/admin/fonctions/tajwid_madd', {
        headers: H,
        data: { etat: 'off' },
      });
      await adm.context().close();
    }
  });
  let erreurs: string[] = [];
  test.beforeEach(({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('coupée hors du canal bêta : « Réciter et vérifier » sans l’indication des madd', async ({
    page,
  }) => {
    await newAdult(page, 'md-ferme');
    await simulerTajwid(page);
    const demandes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/tajwid/madd')) demandes.push(r.url());
    });
    await reciterUnVerset(page);
    await expect(page.getByTestId('madd')).toHaveCount(0);
    expect(demandes).toEqual([]);
  });

  test('madd longs du verset, indication ou rien, jamais « correct » ni note ; AA clair et sombre', async ({
    page,
  }) => {
    const { email, profileId } = await newAdult(page, 'md-beta');
    await beta(email);
    await simulerTajwid(page);
    const envois: Array<{ url: string; type: string; octets: number }> = [];
    let n = 0;
    await page.route('**/api/v1/profiles/*/tajwid/madd?*', (route) => {
      const r = route.request();
      envois.push({
        url: r.url(),
        type: r.headers()['content-type'] ?? '',
        octets: r.postDataBuffer()?.length ?? 0,
      });
      n++;
      // 1re demande : « trop court » ; 2e : rien
      return route.fulfill({ json: { indication: n === 1 ? 'trop_court' : null } });
    });
    await reciterUnVerset(page);

    const bloc = page.getByTestId('madd');
    await expect(bloc).toBeVisible();
    const cibles = bloc.getByTestId('madd-cible');
    await expect(cibles).toHaveCount(2);
    await expect(cibles.nth(0)).toContainText('Madd muttaṣil');
    await expect(cibles.nth(1)).toContainText('Madd lāzim');
    // le mot est le texte Tanzil, isolé en arabe
    await expect(cibles.nth(0).locator('.quran-text')).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('madd-notice')).toHaveText(
      'Indication automatique, en cours de validation par des maîtres. Ton maître reste la référence.',
    );

    await cibles.nth(0).getByTestId('madd-verifier').click();
    await expect(cibles.nth(0).getByTestId('madd-reponse')).toContainText('semble trop court');
    await cibles.nth(1).getByTestId('madd-verifier').click();
    await expect(cibles.nth(1).getByTestId('madd-reponse')).toContainText('Aucune indication');
    await expect(cibles.nth(1).getByTestId('madd-reponse')).toContainText(
      'ton maître reste la référence',
    );

    // ce qui part : le verset, le rang du madd, son type, le nombre de madd ; l'audio du micro tel quel
    expect(envois).toHaveLength(2);
    expect(envois[0]!.url).toContain(`/api/v1/profiles/${profileId}/tajwid/madd?`);
    expect(new URL(envois[0]!.url).searchParams.toString()).toBe('s=112&a=4&k=0&type=muttasil&n=2');
    expect(new URL(envois[1]!.url).searchParams.toString()).toBe('s=112&a=4&k=1&type=lazim&n=2');
    expect(envois[0]!.type).toMatch(/^audio\//);
    expect(envois[0]!.octets).toBeGreaterThan(100);

    // jamais « correct », jamais de note ni de pourcentage dans l'indication
    await expect(bloc).not.toContainText(/\bcorrect|bravo|parfait|\d\s?%|\/\s?20/i);

    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const r = await new AxeBuilder({ page })
        .include('[data-testid="madd"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        r.violations.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    const petites = await bloc.locator('button').evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => Math.round(e.getBoundingClientRect().height))
        .filter((h) => h < 43.5),
    );
    expect(petites).toEqual([]);
  });

  test('le service est indisponible : un message simple, jamais une fausse indication', async ({
    page,
  }) => {
    const { email } = await newAdult(page, 'md-panne');
    await beta(email);
    await simulerTajwid(page);
    await page.route('**/api/v1/profiles/*/tajwid/madd?*', (route) =>
      route.fulfill({ status: 503, json: { error: { code: 'madd_indisponible' } } }),
    );
    await reciterUnVerset(page);
    const premier = page.getByTestId('madd-cible').first();
    await premier.getByTestId('madd-verifier').click();
    await expect(premier.getByTestId('madd-reponse')).toContainText('pas disponible');
    await expect(premier.getByTestId('madd-reponse')).not.toContainText(/trop court/i);
  });
});
