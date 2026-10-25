import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Retrouve ce verset » et suivi de la récitation (interrupteur `shazam_coran`, COUPÉ par défaut ; 25/10/2026).
 * Micro FACTICE de Chromium (bips, aucune voix) ; service d'écoute FACTICE (e2e/ecoute-essai.mjs) : il « entend »
 * Al-Ikhlāṣ 112:1-2, ou, selon un marqueur mis à la place de l'enregistrement, un début commun à 11:77 et 29:31,
 * une phrase ordinaire, ou moins de 3 s de voix. La recherche, elle, est la vraie (index Tanzil de l'API).
 * Vérifie : interrupteur coupé (ni bouton ni écran), canal bêta ouvert par l'administrateur, accord au premier
 * usage, passage retrouvé, ex æquo, rien de sûr, trop court (appareil et serveur), un toucher ouvre le verset récité
 * par Muḥammad Ayyūb ; suivi de la récitation qui signale l'erreur pendant qu'on récite, avec le mot attendu ;
 * accessibilité AA (axe-core).
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

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-shz-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** l'enregistrement est remplacé par un marqueur d'essai (le service factice choisit ce qu'il « entend ») */
async function scenario(page: Page, nom: string | null) {
  await page.unroute('**/ecoute/retrouver');
  if (nom)
    await page.route('**/ecoute/retrouver', (r) =>
      r.continue({ postData: Buffer.from(`OggS scenario=${nom}`) }),
    );
}

async function enregistrer(page: Page, ms: number) {
  await page.getByTestId('rv-commencer').click();
  await expect(page.getByTestId('rv-en-cours')).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByTestId('rv-chercher').click();
}

async function axe(page: Page, quoi: string) {
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const graves = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, cibles: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  expect(graves, quoi).toEqual([]);
}

test('interrupteur coupé par défaut : ni bouton dans le lecteur, ni écran', async ({ page }) => {
  await newAdult(page, 'shz');
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  const f = (await (
    await page.request.get(`/api/v1/fonctions?profil=${me.profiles[0]!.id}`)
  ).json()) as { fonctions: Record<string, boolean> };
  expect(f.fonctions.shazam_coran).toBe(false);
  await page.goto('/coran/lecteur?s=112&a=1');
  await expect(page.getByTestId('ouvrir-reglages-lecteur')).toBeVisible();
  await expect(page.getByTestId('retrouver-verset')).toHaveCount(0);
  await page.goto('/coran/retrouver');
  await expect(page.getByTestId('rv-ferme')).toBeVisible();
  await expect(page.getByTestId('rv-commencer')).toHaveCount(0);
});

test.describe('« canal bêta » ouvert par l’administrateur', () => {
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/shazam_coran', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) await adm.context().close();
  });
  let erreurs: string[] = [];
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const { email } = await newAdult(page, 'shz');
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
    const apres = (await (await page.request.get('/api/v1/fonctions')).json()) as {
      fonctions: Record<string, boolean>;
    };
    expect(apres.fonctions.shazam_coran).toBe(true);
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('bouton du lecteur, accord, passage retrouvé, un toucher l’ouvre récité par Ayyūb', async ({
    page,
  }) => {
    const envois: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/ecoute/retrouver')) envois.push(r.headers()['content-type'] ?? '');
    });
    await page.goto('/coran/lecteur?s=1&a=1');
    await page.getByTestId('retrouver-verset').click();
    await expect(page).toHaveURL(/\/coran\/retrouver$/);
    // premier usage : accord « analyse vocale par IA », jamais coché d'avance
    await expect(page.getByTestId('rv-accord')).toContainText('jamais gardée');
    await page.getByTestId('rv-accepter').click();
    await expect(page.getByTestId('rv-commencer')).toBeVisible();
    await expect(page.getByTestId('retrouver')).toContainText('elle ne juge pas ta récitation');
    await page.getByTestId('rv-commencer').click();
    await expect(page.getByTestId('rv-en-cours')).toContainText('0:');
    // rien n'est envoyé pendant l'enregistrement
    await page.waitForTimeout(3500);
    expect(envois).toHaveLength(0);
    await page.getByTestId('rv-chercher').click();
    await expect(page.getByTestId('rv-titre-resultat')).toHaveText('Passage retrouvé');
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatch(/^audio\//);
    const carte = page.getByTestId('rv-carte');
    await expect(carte).toHaveCount(1);
    await expect(carte).toContainText('versets 1 à 2');
    // texte Tanzil sur sa propre ligne, en arabe
    await expect(carte.locator('.txt[lang="ar"]')).not.toBeEmpty();
    // jamais de jugement de la récitation
    await expect(page.getByTestId('retrouver')).not.toContainText(/valid|juste|parfait|excellent/i);
    // un toucher : le passage s'ouvre dans le lecteur et se lit, récité par Muḥammad Ayyūb
    await expect(carte).toHaveAttribute(
      'href',
      /\/coran\/lecteur\?s=112&a=1&r=ayyoub-hafs&lire=1$/,
    );
    await carte.click();
    await expect(page).toHaveURL(/\/coran\/lecteur/);
    await expect(page.getByTestId('mini-barre')).toHaveClass(/\bon\b/);
  });

  test('ex æquo, rien de sûr, trop court (serveur et appareil)', async ({ page }) => {
    await page.goto('/coran/retrouver');
    await page.getByTestId('rv-accepter').click();
    // même début en 11:77 et 29:31 : les deux, ensemble
    await scenario(page, 'egaux');
    await enregistrer(page, 3500);
    await expect(page.getByTestId('rv-titre-resultat')).toContainText('2 endroits');
    await expect(page.getByTestId('rv-principales').getByTestId('rv-carte')).toHaveCount(2);
    await expect(page.getByTestId('rv-principales')).toContainText('verset 77');
    await expect(page.getByTestId('rv-principales')).toContainText('verset 31');
    // autre chose que le Coran : on ne devine jamais
    await scenario(page, 'rien');
    await enregistrer(page, 3500);
    await expect(page.getByTestId('rv-pas-trouve')).toBeVisible();
    await expect(page.getByTestId('rv-carte')).toHaveCount(0);
    // moins de 3 s de voix (mesurées par le serveur)
    await scenario(page, 'court');
    await enregistrer(page, 3500);
    await expect(page.getByTestId('rv-trop-court')).toContainText('au moins 5 secondes');
    // moins de 3 s d'enregistrement : l'appareil n'envoie rien
    await scenario(page, null);
    let envois = 0;
    page.on('request', (r) => {
      if (r.url().includes('/ecoute/retrouver')) envois++;
    });
    await enregistrer(page, 1200);
    await expect(page.getByTestId('rv-trop-court')).toBeVisible();
    expect(envois).toBe(0);
  });

  test('suivi de la récitation : l’erreur est signalée pendant qu’on récite, avec le mot attendu', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?s=112&a=1&memo=1');
    await page.getByTestId('reciter-verifier').click();
    await page.getByTestId('ecoute-accepter').click();
    const suivre = page.getByTestId('ecoute-direct');
    await expect(suivre).toHaveText('Suivre ma récitation');
    await expect(page.getByTestId('suivi-aide')).toContainText('avec le mot attendu');
    await expect(page.getByTestId('ecoute-masque')).toBeChecked();
    await suivre.click();
    await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
    // texte caché : les mots reconnus apparaissent, l'erreur arrive PENDANT la récitation
    await expect(page.locator('[data-testid="ecoute-texte"].masque')).toBeVisible();
    await expect(page.getByTestId('suivi-ecart')).toContainText('Verset 1 : mot oublié', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
    const oublie = page.locator('[data-testid="ecoute-texte"] .mot.oublie');
    await expect(oublie).toHaveCount(1);
    // le mot attendu, tel qu'écrit dans le texte (Tanzil), sur sa propre ligne
    await expect(page.getByTestId('suivi-attendu')).toHaveText((await oublie.textContent())!);
    // compteur : erreurs signalées et part des mots reconnus ; les mots reconnus sont visibles (en vert)
    await expect(page.getByTestId('suivi-compteur')).toContainText('1 erreur signalée');
    await expect(page.locator('[data-testid="ecoute-texte"] .mot.ok').first()).toBeVisible();
    await page.getByTestId('ecoute-terminer').click();
    await expect(page.getByTestId('ecoute-a-revoir')).toContainText('1 mot à revoir', {
      timeout: 15_000,
    });
    // bilan : réécouter le verset juste, récité par Muḥammad Ayyūb
    await expect(page.getByTestId('ecoute-ecart-ecouter').first()).toHaveAttribute(
      'href',
      /\/coran\/lecteur\?s=112&a=1&r=ayyoub-hafs&lire=1$/,
    );
  });

  test('accessibilité AA : accord, écran prêt, résultat', async ({ page }) => {
    await page.goto('/coran/retrouver');
    await expect(page.getByTestId('rv-accord')).toBeVisible();
    await axe(page, 'accord');
    await page.getByTestId('rv-accepter').click();
    await expect(page.getByTestId('rv-commencer')).toBeVisible();
    await axe(page, 'prêt');
    await scenario(page, 'egaux');
    await enregistrer(page, 3500);
    await expect(page.getByTestId('rv-titre-resultat')).toBeFocused();
    await axe(page, 'résultat');
  });
});
