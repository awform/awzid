import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Refonte « manuscrit enluminé moderne » (19/10/2026), étape 1 — interrupteur `design_v4` :
 *  - COUPÉ (défaut hors démonstration) : « Aujourd'hui » et « Plus » restent l'ancien design, intact ;
 *  - ALLUMÉ par l'administrateur, sans redéploiement (ici : une exception par pays, qui ne touche aucun autre test) :
 *    séance du jour en héros, semaine (anneau doré), reprise, suite ; « Mes activités » en grille, mêmes destinations ;
 *  - repli : écran v4 impossible à charger → ancien design ;
 *  - accessibilité (axe AA, cibles ≥ 44 px), clair et sombre.
 * Captures 390 px (clair, sombre) à côté des maquettes si REFONTE_CAPTURES est défini (dossier de sortie) ;
 * MAQUETTES_PNG : dossier des PNG des maquettes (`png/`).
 */
const H = { 'x-awform': '1' };
const PAYS = 'IS';
const CAPTURES = process.env.REFONTE_CAPTURES;
const MAQUETTES = process.env.MAQUETTES_PNG;

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-v4-${test.info().project.name}-${Date.now()}@e2e.test`;
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
/** retire les exceptions de design_v4 (aucune trace pour les autres suites) */
async function remettre(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string }> }>;
  };
  for (const r of d.fonctions.find((f) => f.cle === 'design_v4')?.regles ?? [])
    await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
}
const oublier = (p: Page) =>
  p.evaluate(() => {
    localStorage.removeItem('awzid.fonctions');
  });

/** élève adulte du pays de l'exception, niveau d'arabe commencé, dernière lecture du Coran gardée */
async function eleveV4(page: Page) {
  const { profileId } = await newAdult(page, 'v4', PAYS);
  const c = await page.request.post(`/api/v1/profiles/${profileId}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect([200, 201], await c.text()).toContain(c.status());
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'awzid.coran.derniere-lecture.v1',
        JSON.stringify({ s: 1, a: 4, p: 1, t: Date.now() }),
      );
    } catch {
      /* stockage indisponible */
    }
  });
  return profileId;
}

/** toutes les cibles tactiles visibles de l'écran v4 font au moins 44 px */
async function cibles(page: Page, racine: string) {
  const petites = await page.locator(`${racine} a, ${racine} button`).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: (e.textContent ?? '').trim().slice(0, 30), h: Math.round(r.height) };
      })
      .filter((x) => x.h < 44),
  );
  expect(petites).toEqual([]);
}
async function axe(page: Page, racine: string) {
  const r = await new AxeBuilder({ page })
    .include(racine)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

test('interrupteur COUPÉ (défaut) : ancien « Aujourd’hui » et ancien « Plus », intacts', async ({
  page,
}) => {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  const f = (await (
    await page.request.get(`/api/v1/fonctions?profil=${me.profiles[0]!.id}`)
  ).json()) as { fonctions: Record<string, boolean> };
  expect(f.fonctions.design_v4).toBe(false);
  await page.goto('/aujourdhui');
  await expect(page.getByTestId('seance')).toBeVisible();
  await expect(page.locator('.hello h1')).toBeVisible();
  await expect(page.getByTestId('v4-aujourdhui')).toHaveCount(0);
  await page.goto('/plus');
  await expect(page.locator('[data-famille="apprendre"]')).toBeVisible();
  await expect(page.getByTestId('v4-activites')).toHaveCount(0);
});

test.describe('interrupteur ALLUMÉ (exception par pays, sans redéploiement)', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    const r = await adm.request.post('/api/v1/admin/fonctions/design_v4/regles', {
      headers: H,
      data: { effet: 'on', pays: PAYS },
    });
    expect(r.status(), await r.text()).toBe(201);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });

  test('Aujourd’hui v4 : séance du jour en héros, semaine, reprise, suite ; AA ; cibles 44 px', async ({
    page,
  }) => {
    await eleveV4(page);
    await page.goto('/aujourdhui');
    await oublier(page);
    await page.reload();
    const v4 = page.getByTestId('v4-aujourdhui');
    await expect(v4).toBeVisible();
    await expect(page.locator('.hello')).toHaveCount(0);
    await expect(page.getByTestId('bonjour')).toContainText('Hafiz');
    // héros : titre arabe du LIVRE sur sa propre ligne, durée, leçon n sur N, bouton doré
    const heros = page.getByTestId('seance');
    await expect(heros.getByText('Séance du jour')).toBeVisible();
    await expect(heros.getByTestId('v4-titre-ar').locator('[lang="ar"]')).toBeVisible();
    await expect(heros.getByTestId('v4-titre-ar').locator('[lang="ar"]')).toHaveCSS(
      'display',
      'block',
    );
    await expect(heros).toContainText(/leçon \d+ sur \d+/);
    await expect(heros.getByTestId('duree')).toContainText('min');
    // bouton doré : texte foncé sur l'or (jamais l'ivoire)
    await expect(page.getByTestId('commencer-seance')).toHaveCSS('color', 'rgb(30, 43, 37)');
    // semaine : anneau doré et 7 jours ; reprise du Coran au verset gardé ; adhkār du moment
    await expect(page.getByTestId('v4-anneau')).toHaveAttribute('aria-label', /sur un objectif de/);
    await expect(page.locator('[data-testid="ma-semaine"] .jour')).toHaveCount(7);
    const coran = page.getByTestId('v4-reprendre-coran');
    await expect(coran).toContainText('Al-Fātiḥa');
    expect(await coran.getAttribute('href')).toContain('s=1&a=4');
    await expect(page.getByTestId('v4-adhkar')).toBeVisible();
    // tokens du thème clair (ivoire), puis du sombre (vert nuit)
    await expect(coran).toHaveCSS('background-color', 'rgb(255, 253, 248)');
    await cibles(page, '[data-testid="v4-aujourdhui"]');
    await axe(page, '[data-testid="v4-aujourdhui"]');
    await page.evaluate(() => localStorage.setItem('awzid.mode', 'sombre'));
    await page.reload();
    await expect(page.getByTestId('v4-reprendre-coran')).toHaveCSS(
      'background-color',
      'rgb(20, 38, 31)',
    );
    await axe(page, '[data-testid="v4-aujourdhui"]');
    // la séance démarre comme avant (leçon du jour)
    const cible = await page.getByTestId('commencer-seance').getAttribute('data-cible');
    await page.getByTestId('commencer-seance').click();
    await expect(page).toHaveURL(new RegExp(`/lecons/${cible!.replace('.', '\\.')}`));
  });

  test('Mes activités v4 : grille de cartes, mêmes destinations que « Plus » ; AA ; cibles 44 px', async ({
    page,
  }) => {
    await eleveV4(page);
    await page.goto('/plus');
    await oublier(page);
    await page.reload();
    await expect(page.getByTestId('v4-activites')).toBeVisible();
    for (const href of [
      '/madjaliss',
      '/lectures',
      '/sciences',
      '/ecriture',
      '/revisions',
      '/hors-ligne',
      '/ma-classe',
      '/suivi',
      '/suivi/rapport',
      '/aide',
      '/garanties',
      '/legal/mentions',
      '/legal/cgu',
      '/legal/confidentialite',
      '/legal/cookies',
      '/compte',
    ])
      await expect(page.locator(`[data-plus="${href}"]`), href).toHaveCount(1);
    await expect(page.getByTestId('probleme-ouvrir')).toBeVisible();
    await expect(page.getByTestId('avis-ouvrir')).toBeVisible();
    await cibles(page, '[data-testid="plus"]');
    await axe(page, '[data-testid="plus"]');
    await page.evaluate(() => localStorage.setItem('awzid.mode', 'sombre'));
    await page.reload();
    await expect(page.getByTestId('v4-activites')).toBeVisible();
    await axe(page, '[data-testid="plus"]');
    await page.locator('[data-plus="/sciences"]').click();
    await expect(page).toHaveURL(/\/sciences/);
  });

  test('repli : écran v4 impossible à charger (hors ligne avant le premier usage) → ancien design', async ({
    page,
  }) => {
    await eleveV4(page);
    // catalogues versionnés (/i18n/<version>/fr-design.json) depuis la fusion du lecteur audio
    await page.route(/\/i18n\/(?:[^/]+\/)?fr-design\.json$/, (r) => r.abort());
    await page.goto('/aujourdhui');
    await oublier(page);
    await page.reload();
    await expect(page.locator('.hello h1')).toBeVisible();
    await expect(page.getByTestId('commencer-seance')).toBeVisible();
    await expect(page.getByTestId('v4-aujourdhui')).toHaveCount(0);
  });

  test('captures téléphone (clair, sombre) à côté des maquettes', async ({ page }) => {
    test.skip(!CAPTURES, 'REFONTE_CAPTURES non défini');
    test.skip(test.info().project.name !== 'mobile-chromium', 'captures sur téléphone seulement');
    test.setTimeout(180_000);
    mkdirSync(CAPTURES!, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await eleveV4(page);
    // une séance de Madjaliss ouverte (reprise réelle)
    await page.goto('/madjaliss/akhdari/1');
    await page.waitForTimeout(1500);
    for (const [ecran, chemin, maq] of [
      ['aujourdhui', '/aujourdhui', '01-aujourdhui'],
      ['activites', '/plus', '07-activites'],
    ] as const)
      for (const mode of ['clair', 'sombre'] as const) {
        await page.goto(chemin);
        await page.evaluate((m) => localStorage.setItem('awzid.mode', m), mode);
        await oublier(page);
        await page.reload();
        await page.locator('.v4').first().waitFor();
        await page.waitForTimeout(800);
        await page.evaluate(() => document.fonts.ready);
        const fichier = join(CAPTURES!, `${ecran}_${mode}.png`);
        // fenêtre aussi haute que la page : la barre d'onglets (fixe) reste en bas, comme sur la maquette
        const haut = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: 390, height: haut });
        await page.waitForTimeout(300);
        await page.screenshot({ path: fichier });
        await page.setViewportSize({ width: 390, height: 844 });
        const png = join(MAQUETTES ?? '', `${maq}_${mode}.png`);
        if (MAQUETTES && existsSync(png)) {
          const b64 = (p: string) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
          const cote = await page.context().newPage();
          await cote.setViewportSize({ width: 820, height: 900 });
          await cote.setContent(
            `<body style="margin:0;display:flex;gap:20px;padding:10px;background:#888;align-items:flex-start">
              <img src="${b64(png)}" style="width:390px"><img src="${b64(fichier)}" style="width:390px"></body>`,
          );
          await cote.screenshot({
            path: join(CAPTURES!, `${ecran}_${mode}_cote-a-cote.png`),
            fullPage: true,
          });
          await cote.close();
        }
      }
  });
});
