import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Famille de mots » du Coran (3/11/2026) — interrupteur `racines_coran`, à 375 px :
 *  - COUPÉ (défaut) : la page dit que la fonction n'est pas ouverte, aucune donnée demandée ;
 *  - ADULTE (niveau 1) : la liste ne montre que les familles de son niveau ; la famille ع ل م se parcourt en 7 étapes (accroche, racine,
 *    moule, cousins, vérifier, ancrer, suite), un mot de niveau supérieur est SIGNALÉ, le verset est celui de Tanzil tel quel, le mini-exercice
 *    n'échoue jamais, la pastille « X % » apparaît, rien ne déborde, cibles de 44 px au moins, AUCUNE voix de synthèse ;
 *  - ENFANT : seulement les familles marquées enfant, 6 étapes (pas de moule), 3 mots.
 * RACINES_CAPTURES=<dossier> : captures mobiles des étapes.
 */
const H = { 'x-awform': '1' };
/** le verset d'accroche de la famille ع ل م tel que dans les données (jamais retapé) */
const famille1 = JSON.parse(
  readFileSync(
    join(process.cwd(), '..', '..', 'packages', 'content', 'racines', '001.json'),
    'utf8',
  ),
) as {
  mots: Array<{ n: number; x: { t: string } }>;
};
const VERSET = famille1.mots.find((m) => m.n === 29)!.x.t;
const CAPTURES = process.env.RACINES_CAPTURES;
const MDP = 'une longue phrase de passe 2026';
test.use({ viewport: { width: 375, height: 812 } });

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-rc-${test.info().project.name}-${Date.now()}@e2e.test`;
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
  ).json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}
const etat = async (adm: Page, e: 'on' | 'off') => {
  for (const f of ['racines_coran', 'coran_mots']) {
    const r = await adm.request.put(`/api/v1/admin/fonctions/${f}`, {
      headers: H,
      data: { etat: e },
    });
    expect(r.status(), await r.text()).toBe(200);
  }
};
const capture = async (page: Page, nom: string) => {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: join(CAPTURES, `${nom}.png`) });
};
const sansDebordement = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
const continuer = (page: Page) => page.getByTestId('rc-continuer').click();

test.describe('Famille de mots', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
  });
  test.afterAll(async () => {
    await etat(adm, 'off');
    await adm.context().close();
  });

  test('coupé par défaut : page fermée, aucune donnée demandée', async ({ page }) => {
    await etat(adm, 'off');
    await newAdult(page, 'rc-off');
    const demandes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/racines/')) demandes.push(r.url());
    });
    await page.goto('/coran/familles');
    await expect(page.getByTestId('rc-ferme')).toBeVisible();
    expect(demandes).toEqual([]);
  });

  test('adulte niveau 1 : parcours complet en 7 étapes', async ({ page }) => {
    await etat(adm, 'on');
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const voix: string[] = [];
    await page.addInitScript(() => {
      const ss = window.speechSynthesis;
      if (ss) ss.speak = () => ((window as unknown as { __v?: number }).__v = 1);
    });
    page.on('request', (r) => {
      if (/\/synthese|\/tts|\/tuteur/.test(r.url())) voix.push(r.url());
    });
    const a = await newAdult(page, 'rc-ad');
    const c = await page.request.post(`/api/v1/profiles/${a.profileId}/commencer/arabe`, {
      headers: H,
      data: {},
    });
    expect(c.status(), await c.text()).toBe(201);

    await page.goto('/coran/familles');
    await expect(page.getByTestId('rc-liste').first()).toBeVisible({ timeout: 20_000 });
    // seulement le niveau 1 : aucun titre de niveau 2 ou plus
    await expect(page.getByRole('heading', { name: /Niveau 2/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Niveau 1/ })).toBeVisible();
    await capture(page, '0_liste');
    await sansDebordement(page);
    await page.locator('[data-testid="rc-famille"][data-id="1"]').click();

    // 1. accroche : le verset de Tanzil, tel quel, 24 px au moins
    await expect(page.getByTestId('rc-ou')).toContainText('1/7');
    const verset = page.getByTestId('rc-verset').locator('.q');
    await expect(verset).toHaveText(VERSET);
    expect(
      await verset.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(24);
    await capture(page, '1_accroche');
    const ecoute = page.getByTestId('rc-ecouter');
    expect((await ecoute.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await sansDebordement(page);
    await continuer(page);

    // 2. racine : trois tuiles
    await expect(page.locator('.tuile')).toHaveCount(3);
    await capture(page, '2_racine');
    await continuer(page);

    // 3. moule
    await expect(page.getByTestId('rc-moule')).toBeVisible();
    await capture(page, '3_moule');
    await continuer(page);

    // 4. cousins : un mot à la fois, un mot de niveau supérieur est signalé (jamais caché)
    await expect(page.getByTestId('rc-ou')).toContainText('4/7');
    const cousins = page.getByTestId('rc-cousin');
    expect(await cousins.count()).toBeGreaterThanOrEqual(8);
    let signale = 0;
    for (let k = 0; k < (await cousins.count()); k++) {
      await cousins.nth(k).click();
      signale += await page.getByTestId('rc-niveau-sup').count();
      await sansDebordement(page);
    }
    expect(signale).toBeGreaterThan(0);
    await cousins.nth(1).click();
    await page.getByTestId('rc-moule-btn').click();
    await capture(page, '4_cousin');
    await continuer(page);

    // 5. vérifier : deux questions, jamais d'échec (même une mauvaise réponse laisse continuer)
    await expect(page.getByTestId('rc-continuer')).toBeDisabled();
    await page.getByTestId('rc-choix').first().click();
    await expect(page.getByTestId('rc-retour-q').first()).toBeVisible();
    await page.getByTestId('rc-choix').nth(3).click();
    await expect(page.getByTestId('rc-bilan')).toBeVisible();
    await capture(page, '5_verifier');
    await expect(page.getByTestId('rc-continuer')).toBeEnabled();
    await continuer(page);

    // 6. ancrer : la pastille « X % »
    await expect(page.getByTestId('rc-pastille')).toContainText('%');
    await capture(page, '6_ancrer');
    await continuer(page);

    // 7. suite
    await expect(page.getByTestId('rc-ou')).toContainText('7/7');
    await capture(page, '7_suite');
    await sansDebordement(page);
    expect(erreurs).toEqual([]);
    expect(voix).toEqual([]);
  });

  test('enfant : seulement ses familles, 6 étapes, sans moule', async ({ page }) => {
    await etat(adm, 'on');
    const r = await page.request.post('/api/v1/auth/signup', {
      headers: H,
      data: {
        kind: 'parent',
        intention: 'famille',
        email: `rc-parent-${Date.now()}@e2e.test`,
        password: MDP,
        country: 'FR',
        birthYear: 1985,
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const p = await page.request.post('/api/v1/profiles', {
      headers: H,
      data: {
        pseudonym: 'Amina',
        birthYear: new Date().getFullYear() - 9,
        levelCode: 'en1',
        password: MDP,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      },
    });
    expect(p.status(), await p.text()).toBe(201);
    const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
      profiles: Array<{ id: string; kind: string }>;
    };
    const enfant = me.profiles.find((x) => x.kind === 'enfant')!;
    await page.goto('/profils');
    await page.locator(`button[data-profile="${enfant.id}"]`).click();
    await expect(page.getByTestId('eleve-actif')).toBeVisible();
    await page.goto('/coran/familles');
    await expect(page.getByTestId('rc-famille').first()).toBeVisible({ timeout: 20_000 });
    expect(await page.getByTestId('rc-famille').count()).toBe(46);
    await page.locator('[data-testid="rc-famille"][data-id="1"]').click();
    await expect(page.getByTestId('rc-ou')).toContainText('1/6');
    await continuer(page); // racine
    await continuer(page); // cousins (pas de moule)
    await expect(page.getByTestId('rc-ou')).toContainText('3/6');
    expect(await page.getByTestId('rc-cousin').count()).toBe(3);
    await expect(page.getByTestId('rc-moule-btn')).toHaveCount(0);
    await expect(page.getByTestId('rc-niveau-sup')).toHaveCount(0);
    await capture(page, '8_enfant_cousin');
    await sansDebordement(page);
  });
});
