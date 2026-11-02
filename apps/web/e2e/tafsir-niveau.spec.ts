import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import type { SourateTafsir } from '@awform/content/tafsir';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Tafsīr du niveau » (2/11/2026, Lawḥ v2 : N1 = 93-114 et al-Fātiḥa … N12 = juzʾ 3-1) — interrupteur `tafsir_sens` :
 *  - l'espace du niveau propose l'entrée « Tafsīr du niveau » ; le parcours montre en PREMIER la portion du niveau de l'élève (N1 sans
 *    niveau choisi), dans l'ordre, avec sa progression (sourates marquées lues, gardées sur l'appareil et reprises au rechargement) ;
 *  - jamais bloquant : les onze autres portions restent ouvrables, et la CONSULTATION d'un verset de N12 (al-Baqara) est libre pour un
 *    élève de N1 ;
 *  - ENFANT : seulement la portion du juzʾ ʿAmma, sans les autres niveaux.
 */
const H = { 'x-awform': '1' };
const MDP = 'une longue phrase de passe 2026';
const livre = (n: number) =>
  JSON.parse(
    readFileSync(
      join(
        fileURLToPath(new URL('.', import.meta.url)),
        '..',
        '..',
        '..',
        'packages',
        'content',
        'tafsir',
        `${String(n).padStart(3, '0')}.json`,
      ),
      'utf8',
    ),
  ) as SourateTafsir;

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-tfn-${test.info().project.name}-${Date.now()}@e2e.test`;
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
const regler = async (adm: Page, etat: 'on' | 'off') =>
  expect(
    (
      await adm.request.put('/api/v1/admin/fonctions/tafsir_sens', { headers: H, data: { etat } })
    ).status(),
  ).toBe(200);

test.describe('parcours du niveau', () => {
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await regler(adm, 'on');
  });
  test.afterAll(async () => {
    if (adm) {
      await regler(adm, 'off');
      await adm.context().close();
    }
  });

  test.describe('adulte au niveau 1', () => {
    test.use({ compte: null });
    test('entrée dans l’espace du niveau, portion N1 en premier, progression gardée, N12 ouvrable, consultation libre', async ({
      page,
    }) => {
      const a = await newAdult(page, 'tfn');
      const c = await page.request.post(`/api/v1/profiles/${a.profileId}/commencer/arabe`, {
        headers: H,
        data: {},
      });
      expect(c.status(), await c.text()).toBe(201);
      // l'entrée dans l'espace du niveau (accueil « Mon arabe »)
      await page.goto('/');
      const entree = page.getByTestId('tafsir-niveau');
      await expect(entree).toBeVisible({ timeout: 20_000 });
      await entree.click();
      await expect(page).toHaveURL(/\/coran\/tafsir/);
      // sa portion en premier : N1, al-Fātiḥa puis 114 → 93, 23 sourates
      const reco = page.getByTestId('tf-reco');
      await expect(reco).toBeVisible();
      await expect(reco).toHaveAttribute('data-niveau', '1');
      const lignes = reco.locator('li[data-sourate]');
      await expect(lignes).toHaveCount(23);
      expect(
        await lignes.evaluateAll((l) => l.slice(0, 3).map((e) => e.getAttribute('data-sourate'))),
      ).toEqual(['1', '114', '113']);
      await expect(page.getByTestId('tf-progres')).toContainText('0 sourates lues sur 23');
      // jamais bloquant : les onze autres niveaux sont là, N12 compris
      const autres = page.getByTestId('tf-autres').locator('details');
      await expect(autres).toHaveCount(11);
      await expect(page.locator('details[data-niveau="12"]')).toBeAttached();
      // progression : marquer une sourate comme lue, reprise au rechargement
      await lignes.nth(1).getByTestId('tf-lue').click();
      await expect(page.getByTestId('tf-progres')).toContainText('1 sourates lues sur 23');
      await page.reload();
      await expect(page.getByTestId('tf-progres')).toContainText('1 sourates lues sur 23');
      await expect(page.locator('li[data-sourate="114"]')).toHaveClass(/\blue\b/);
      // la portion de N12 s'ouvre depuis N1 (al-Baqara), et la consultation d'un verset y est libre
      const n12 = page.locator('details[data-niveau="12"]');
      await n12.locator('summary').click();
      await expect(n12.locator('li[data-sourate="2"]')).toBeVisible();
      await n12.locator('li[data-sourate="2"] [data-testid="tf-ouvrir"]').click();
      await expect(page).toHaveURL(/\/coran\/lecteur\?s=2/);
      const v = page.locator('[data-aya="2:2"]').first();
      await expect(v).toBeVisible({ timeout: 20_000 });
      await v.click();
      await page.getByTestId('menu-sens').click();
      const feuille = page.getByTestId('sens-verset');
      const verset2 = livre(2).versets[1]!;
      await expect(feuille.getByTestId('sens-texte')).toHaveText(verset2.ar);
      await expect(feuille.getByTestId('sens-sens')).toHaveText(verset2.sens);
      await expect(feuille.getByTestId('sens-mot')).toHaveCount(verset2.mots.length);
    });
  });

  test.describe('profil ENFANT', () => {
    test.use({ compte: null });
    test('seulement la portion du juzʾ ʿAmma, aucune autre portion', async ({ page }) => {
      const r = await page.request.post('/api/v1/auth/signup', {
        headers: H,
        data: {
          kind: 'parent',
          intention: 'famille',
          email: `tfn-parent-${Date.now()}@e2e.test`,
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
      await page.goto('/coran/tafsir');
      await expect(page.getByTestId('tf-reco')).toHaveAttribute('data-niveau', '1');
      await expect(page.getByTestId('tf-enfant')).toBeVisible();
      await expect(page.getByTestId('tf-autres')).toHaveCount(0);
      await expect(page.getByTestId('tf-reco').locator('li[data-sourate]')).toHaveCount(23);
      await expect(page.locator('li[data-sourate="2"]')).toHaveCount(0);
    });
  });
});
