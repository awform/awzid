import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * A26b, phase 1 — « Je parle » : scénario guidé SANS IA tiré du dialogue de la leçon (choix multiples), joué en
 * entier en en1 et en ad1, dont une fois SANS RÉSEAU ; aide douce (jamais de rouge), traduction sur demande,
 * décor sans personnage, mots proposés à « Mes mots ».
 * Captures 375 px (clair, sombre) si CONV_CAPTURES est défini.
 */
const CAPTURES = process.env.CONV_CAPTURES;
const H = { 'x-awform': '1' };

/** Administrateur neuf (outil staff), second facteur configuré (comme f5.spec.ts). */
async function admin(browser: Browser): Promise<Page> {
  const email = `admin-conv-${test.info().project.name}-${Date.now()}@e2e.test`;
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
const etat = async (adm: Page, e: 'on' | 'beta') =>
  expect(
    (
      await adm.request.put('/api/v1/admin/fonctions/conversation', {
        headers: H,
        data: { etat: e },
      })
    ).status(),
  ).toBe(200);
const profilDe = async (page: Page) =>
  (
    (await (await page.request.get('/api/v1/auth/me')).json()) as {
      profiles: Array<{ id: string }>;
    }
  ).profiles[0]!.id;

test.describe.configure({ mode: 'serial' });
let adm: Page;

test('interrupteur « conversation » en BÊTA : fermé hors du canal bêta (API 403, pas de bouton)', async ({
  page,
  browser,
}) => {
  const pid = await profilDe(page);
  const r = await page.request.get(`/api/v1/profiles/${pid}/conversation/en1.l05`);
  expect(r.status()).toBe(403);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('fonction_coupee');
  await page.goto('/lecons/en1.l05');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('jp-ouvrir')).toHaveCount(0);
  // ouverte pour la suite des essais (remise en bêta à la fin)
  adm = await admin(browser);
  await etat(adm, 'on');
});
test.afterAll(async () => {
  if (adm) await etat(adm, 'beta');
});

test('droits : visiteur 401 ; profil d’un autre niveau 403 ; niveau courant et aperçu ouverts', async ({
  page,
  browser,
}) => {
  const pid = await profilDe(page);
  const anon = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const v = await anon.request.get(`/api/v1/profiles/${pid}/conversation/en1.l05`);
  expect(v.status()).toBe(401);
  await anon.close();
  // jamais un fichier public
  expect((await page.request.get('/conversation/en1/l05.json')).status()).toBe(404);
  // adulte placé en ad1 : ad1 (courant) et ad2 (aperçu) ouverts ; ad3 et le livre des enfants fermés
  const { profileId } = await newAdult(page, 'conv-niveau');
  const n = await page.request.put(`/api/v1/profiles/${profileId}/niveaux`, {
    headers: H,
    data: { levelCode: 'ad1', source: 'positionnement', score: 0.7 },
  });
  expect(n.status(), await n.text()).toBe(200);
  const st = async (u: string) =>
    (await page.request.get(`/api/v1/profiles/${profileId}/conversation/${u}`)).status();
  expect(await st('ad1.l01')).toBe(200);
  expect(await st('ad2.l01')).toBe(200);
  expect(await st('ad3.l01')).toBe(403);
  expect(await st('en1.l05')).toBe(403);
  // le profil d'une autre famille : introuvable
  expect(await st('ad1.l01')).toBe(200);
  const autre = (await page.request.get(`/api/v1/profiles/${pid}/conversation/ad1.l01`)).status();
  expect(autre).toBe(404);
});

async function jouer(page: Page, opts: { erreurDAbord?: boolean } = {}) {
  let premiere = true;
  for (let n = 0; n < 20; n++) {
    const tour = page.getByTestId('jp-tour');
    if (!(await tour.isVisible())) break;
    if (premiere && opts.erreurDAbord) {
      const faux = page.locator('[data-testid="jp-choix"]:not([data-kind="bonne"])').first();
      await faux.click();
      const aide = page.getByTestId('jp-aide');
      await expect(aide).toBeVisible();
      // aide douce : jamais de rouge
      const couleurs = await aide.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.color, s.backgroundColor];
      });
      for (const c of couleurs) {
        const [r, g, b] = (c.match(/\d+/g) ?? []).map(Number) as [number, number, number];
        expect(r > 150 && g < 90 && b < 90, c).toBe(false);
      }
      // le choix essayé reste là (plus discret), la scène n'avance pas
      await expect(page.getByTestId('jp-tour')).toBeVisible();
    }
    premiere = false;
    // la réplique à CHOISIR n'est visible nulle part avant le choix : ni dans le décor, ni dans le fil, ni dans
    // le dialogue de la leçon (masqué sous l'écran)
    const bonne = (
      await page
        .locator(
          '[data-testid="jp-choix"][data-kind="bonne"] .ar, [data-testid="jp-choix"][data-kind="bonne"] .ar-long',
        )
        .first()
        .innerText()
    ).trim();
    expect(await page.getByTestId('jp-fil').innerText()).not.toContain(bonne);
    expect(await page.locator('.calli').allInnerTexts()).not.toContain(bonne);
    await expect(page.locator('.dlg:visible')).toHaveCount(0);
    const avant = await page.getByTestId('jp-moi').count();
    await page.locator('[data-testid="jp-choix"][data-kind="bonne"]').click();
    await expect(page.getByTestId('jp-moi')).toHaveCount(avant + 1);
  }
  await expect(page.getByTestId('jp-fin')).toBeVisible();
}

async function ouvrir(page: Page, unit: string) {
  await page.goto(`/lecons/${unit}`);
  const b = page.getByTestId('jp-ouvrir');
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await expect(page.getByTestId('je-parle')).toBeVisible();
}

test('en1 : scène complète du verger (en1.l05), traduction, aide douce, Mes mots, puis hors ligne', async ({
  page,
  context,
}) => {
  // niveau gardé sur l'appareil (leçons hors ligne), puis leçon ouverte une fois en ligne (scénario gardé)
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const row = page.locator('tr[data-level="en1"]');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(row.getByTestId('etat')).toContainText("sur l'appareil", { timeout: 30_000 });

  await ouvrir(page, 'en1.l05');
  const ecran = page.getByTestId('je-parle');
  // décor du livre, AUCUN personnage (aucun symbole de personnage dans la scène)
  const persos = await ecran
    .locator('svg use')
    .evaluateAll((us) =>
      us
        .map((u) => u.getAttribute('href') ?? '')
        .filter((h) => /i-(youssouf|maryam|papa|maman|fatou|grandpere)/.test(h)),
    );
  expect(persos).toEqual([]);
  // nom français des personnages, titre « Je parle · … »
  await expect(page.getByTestId('jp-partenaire').first()).toContainText('Grand-père');
  await expect(ecran.locator('h2')).toContainText('Je parle · Dans le verger de grand-père');
  // la scène commence par le partenaire, phrase arabe sur sa propre ligne
  await expect(page.getByTestId('jp-partenaire').first()).toBeVisible();
  await expect(
    page.getByTestId('jp-partenaire').first().locator('.ar-long, [dir="rtl"]').first(),
  ).toBeVisible();
  // traduction sur demande
  await expect(ecran.locator('.rep .sens')).toHaveCount(0);
  await page.getByTestId('jp-traduction').click();
  await expect(page.getByTestId('jp-traduction')).toHaveAttribute('aria-pressed', 'true');
  await expect(ecran.locator('.rep .sens').first()).toContainText('Regardez');

  if (CAPTURES) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: 'light' });
    await ecran.evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(1800); // fin de l'écriture animée
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-clair-v2.png`, fullPage: false });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-sombre-v2.png`, fullPage: false });
    await page.emulateMedia({ colorScheme: 'light' });
  }

  await jouer(page, { erreurDAbord: true });
  await expect(page.getByTestId('jp-fin')).toContainText('Bravo');
  await page.getByTestId('jp-garder-mots').click();
  await expect(page.getByTestId('jp-mots-msg')).toContainText('Mes mots');
  if (CAPTURES) {
    await page.getByTestId('jp-fin').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-fin-clair-v2.png` });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-fin-sombre-v2.png` });
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // SANS RÉSEAU : coquille du service worker, leçon d'IndexedDB, scénario gardé sur l'appareil
  await context.setOffline(true);
  await page.goto('/lecons/en1.l05');
  await expect(page.locator('h1')).toBeVisible();
  await page.getByTestId('jp-ouvrir').click();
  await expect(page.getByTestId('je-parle')).toBeVisible();
  await jouer(page);
  await context.setOffline(false);
});

test('ad1 : scène complète « Premier jour à l’institut » (ad1.l01), rejouer, puis hors ligne', async ({
  page,
  context,
}) => {
  await ouvrir(page, 'ad1.l01');
  await expect(page.getByTestId('je-parle')).toContainText('Tu joues');
  // bonne réponse = réplique du livre, à sa place
  await jouer(page, { erreurDAbord: true });
  const pid = await profilDe(page);
  const s = (await (
    await page.request.get(`/api/v1/profiles/${pid}/conversation/ad1.l01`)
  ).json()) as {
    tours: Array<{ t: string; choix?: Array<{ ar: string; kind: string }> }>;
  };
  const bonne = s.tours.find((x) => x.t === 'eleve')!.choix!.find((c) => c.kind === 'bonne')!.ar;
  await expect(page.getByTestId('jp-moi').first()).toContainText(bonne.replace(/[[\]]/g, ''));
  await page.getByTestId('jp-rejouer').click();
  await expect(page.getByTestId('jp-moi')).toHaveCount(0);
  await expect(page.getByTestId('jp-tour')).toBeVisible();
  // fermer rend la main au bouton
  await page.getByTestId('jp-fermer').click();
  await expect(page.getByTestId('jp-ouvrir')).toBeFocused();

  // sans réseau, page restée ouverte : écran et scénario viennent de l'appareil
  await context.setOffline(true);
  await page.getByTestId('jp-ouvrir').click();
  await expect(page.getByTestId('je-parle')).toBeVisible();
  await jouer(page);
  await context.setOffline(false);
});

test('un seul bouton « Je parle » par leçon ; jamais de scénario pour la religion', async ({
  page,
}) => {
  await page.goto('/lecons/en1.l05');
  await expect(page.getByTestId('jp-ouvrir')).toHaveCount(1);
  const pid = await profilDe(page);
  const r = await page.request.get(`/api/v1/profiles/${pid}/conversation/re1.l01`);
  expect(r.status()).toBe(400);
});
