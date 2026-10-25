import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { expect, loginTeacher, newAdult, password, PARENT_PIN, test } from './fixtures';
import { pickProfile } from './profil';
import { totp } from './totp';

/**
 * Khatma et wird (26/10/2026) — interrupteur `khatma_wird` :
 *  - COUPÉ par défaut : ni carte dans le Coran, et le serveur refuse ;
 *  - « canal bêta » : carte dans l'accueil du Coran, plan sur une durée (part du jour calculée), « J'ai lu ma part du jour »,
 *    reprise exacte (la même sur un second appareil), wird, pause sans reproche, date de fin dépassée sans dette (on propose de
 *    la repousser), khatma en famille (parts réparties, total collectif seulement), khatma de la classe côté enseignant (parts de
 *    chacun, jamais de classement), accessibilité AA en clair et en sombre, cibles de 44 px.
 */
const H = { 'x-awform': '1' };
const jour = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-kh-${test.info().project.name}-${Date.now()}@e2e.test`;
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

test.describe('khatma et wird', () => {
  test.describe.configure({ mode: 'serial' });
  let adm: Page;
  const beta = async (email: string, actif = true) => {
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: actif },
    });
    expect(b.ok(), await b.text()).toBe(true);
  };

  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/khatma_wird', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) {
      await adm.request.put('/api/v1/admin/fonctions/khatma_wird', {
        headers: H,
        data: { etat: 'off' },
      });
      await adm.request.put('/api/v1/admin/beta', {
        headers: H,
        data: { type: 'compte', email: 'maitre@e2e.test', beta: false },
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

  async function controle(page: Page) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const r = await new AxeBuilder({ page })
        .include('[data-testid="khatma-carte"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    const petites = await page
      .locator('[data-testid="khatma-carte"] button, [data-testid="khatma-carte"] a')
      .evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({
            t: (e.textContent ?? '').trim().slice(0, 30),
            h: Math.round(e.getBoundingClientRect().height),
          }))
          .filter((x) => x.h < 43.5),
      );
    expect(petites).toEqual([]);
  }

  test('coupée hors du canal bêta : ni carte, et le serveur refuse', async ({ page }) => {
    const { profileId } = await newAdult(page, 'kh-ferme');
    await page.goto('/coran');
    await expect(page.getByTestId('reprendre-carte')).toBeVisible();
    await expect(page.getByTestId('khatma-carte')).toHaveCount(0);
    const r = await page.request.get(`/api/v1/profiles/${profileId}/khatma`);
    expect(r.status()).toBe(403);
    expect((await r.json()).error.code).toBe('fonction_coupee');
  });

  test('plan sur une durée, part du jour, « J’ai lu », reprise exacte sur un second appareil', async ({
    page,
    browser,
  }) => {
    const { email, profileId } = await newAdult(page, 'kh-plan');
    await beta(email);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/coran');
    const carte = page.getByTestId('khatma-carte');
    await expect(carte).toBeVisible();
    await expect(page.getByTestId('khatma-intro')).toBeVisible();
    await page.getByTestId('khatma-nouveau').click();
    await page.getByTestId('kh-jours-30').click();
    await expect(page.getByTestId('kh-cela-fait')).toContainText('21 pages');
    await page.getByTestId('kh-creer').click();
    const plan = page.getByTestId('khatma-plan');
    await expect(plan).toHaveCount(1);
    await expect(page.getByTestId('khatma-jour')).toContainText('Pages 1 à 21');
    await expect(page.getByTestId('khatma-rythme')).toContainText('30');
    await controle(page);

    await page.getByTestId('khatma-ai-lu').click();
    await expect(page.getByTestId('khatma-jour-lu')).toBeVisible();
    await expect(page.getByTestId('khatma-ai-lu')).toHaveCount(0);
    // la reprise mène au lecteur, à l'endroit enregistré (verset, sinon page)
    await expect(page.getByTestId('khatma-reprendre')).toHaveAttribute(
      'href',
      /\/coran\/lecteur\?(s=\d+&a=\d+|vue=page&page=22)/,
    );

    // un second appareil (autre contexte, même compte) retrouve exactement le même état
    const ctx2 = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const p2 = await ctx2.newPage();
    const l = await p2.request.post('/api/v1/auth/login', {
      headers: H,
      data: { email, password: password() },
    });
    expect(l.status()).toBe(200);
    expect((await p2.request.get('/api/v1/auth/me')).status()).toBe(200);
    await p2.goto('/coran');
    await expect(p2.getByTestId('khatma-jour-lu')).toBeVisible({ timeout: 20_000 });
    const href1 = await page.getByTestId('khatma-reprendre').getAttribute('href');
    expect(await p2.getByTestId('khatma-reprendre').getAttribute('href')).toBe(href1);
    const api = (await (await p2.request.get(`/api/v1/profiles/${profileId}/khatma`)).json()) as {
      plans: Array<{ part: { done: number } }>;
    };
    expect(api.plans[0]!.part.done).toBe(21);
    await ctx2.close();

    // pause : la fin est repoussée, sans reproche
    await page.getByTestId('khatma-regler').click();
    await page.getByTestId('kh-pause').click();
    await expect(page.getByTestId('kh-message')).toContainText('repoussée');
    await expect(page.locator('body')).not.toContainText(/retard|dette|raté/i);
  });

  test('une khatma en retard se recalcule sans reproche ; une date passée se repousse d’un clic', async ({
    page,
  }) => {
    const { email, profileId } = await newAdult(page, 'kh-retard');
    await beta(email);
    // 10 jours de plan déjà passés, rien de lu : la part se répartit sur les 20 jours qui restent
    const a = await page.request.post(`/api/v1/profiles/${profileId}/khatma`, {
      headers: H,
      data: { kind: 'khatma', mode: 'duree', startDate: jour(-10), endDate: jour(19) },
    });
    expect(a.status(), await a.text()).toBe(201);
    // un second plan dont la date est passée depuis longtemps
    const b = await page.request.post(`/api/v1/profiles/${profileId}/khatma`, {
      headers: H,
      data: {
        kind: 'khatma',
        mode: 'duree',
        startDate: jour(-40),
        endDate: jour(-10),
        seedDone: 200,
      },
    });
    expect(b.status(), await b.text()).toBe(201);
    await page.goto('/coran');
    const plans = page.getByTestId('khatma-plan');
    await expect(plans).toHaveCount(2);
    await expect(
      page.locator('[data-testid="khatma-jour"]').filter({ hasText: 'Pages 1 à 31' }),
    ).toHaveCount(1);
    await expect(page.getByTestId('khatma-fin-passee')).toContainText('pas grave');
    await expect(page.locator('body')).not.toContainText(/retard|dette|raté|échec/i);
    await page.getByTestId('khatma-repousser').click();
    await expect(page.getByTestId('khatma-fin-passee')).toHaveCount(0);
  });

  test('wird : des pages chaque jour, sans fin', async ({ page }) => {
    const { email } = await newAdult(page, 'kh-wird');
    await beta(email);
    await page.goto('/coran');
    await page.getByTestId('khatma-nouveau').click();
    await page.getByTestId('kh-type-wird').check();
    await page.getByTestId('kh-wird-5').click();
    await page.getByTestId('kh-creer').click();
    await expect(page.getByTestId('khatma-plan')).toContainText('Wird');
    await expect(page.getByTestId('khatma-jour')).toContainText('Pages 1 à 5');
    await page.getByTestId('khatma-ai-lu').click();
    await expect(page.getByTestId('khatma-jour-lu')).toBeVisible();
    await expect(page.getByTestId('khatma-plan')).toContainText('Premier tour');
  });

  test('khatma en famille : parts réparties, seul le total du groupe est partagé, pas de classement', async ({
    page,
  }) => {
    const email = `kh-famille-${Date.now()}@e2e.test`;
    const su = await page.request.post('/api/v1/auth/signup', {
      headers: H,
      data: {
        kind: 'parent',
        birthYear: 1985,
        email,
        password: password(),
        country: 'FR',
        locale: 'fr',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    });
    expect(su.status(), await su.text()).toBe(201);
    await page.request.post('/api/v1/account/pin', {
      headers: H,
      data: { pin: PARENT_PIN, password: password() },
    });
    const annee = new Date().getFullYear();
    const ids: string[] = [];
    for (const [pseudonym, age] of [
      ['Lina', 9],
      ['Sami', 11],
      ['Nour', 7],
    ] as const) {
      const r = await page.request.post('/api/v1/profiles', {
        headers: H,
        data: {
          pseudonym,
          birthYear: annee - 1 - age,
          levelCode: 'en1',
          password: password(),
          consents: ['compte_suivi', 'donnee_religieuse_art9'],
        },
      });
      expect(r.status(), await r.text()).toBe(201);
      ids.push(((await r.json()) as { id: string }).id);
    }
    await beta(email);
    const f = await page.request.post('/api/v1/khatma/famille', {
      headers: H,
      data: { startDate: jour(), endDate: jour(29), title: 'Notre khatma', profileIds: ids },
    });
    expect(f.status(), await f.text()).toBe(201);

    await pickProfile(page, 'Lina');
    await page.goto('/coran');
    const plan = page.getByTestId('khatma-plan');
    await expect(plan).toContainText('Notre khatma');
    await expect(plan).toContainText('Ta part');
    await expect(page.getByTestId('khatma-groupe')).toContainText('Parts lues : 0 sur 3');
    // la part des autres n'est jamais montrée à un participant
    await expect(page.getByTestId('khatma-carte')).not.toContainText(/Sami|Nour/);
    await page.getByTestId('khatma-ai-lu').click();
    await expect(page.getByTestId('khatma-jour-lu')).toBeVisible();
    // le responsable voit les parts de chacun, dans l'ordre du Muṣḥaf
    await page.getByTestId('khatma-regler').click();
    const suivi = page.getByTestId('khatma-suivi');
    await expect(suivi).toBeVisible();
    await expect(suivi.getByTestId('khatma-part')).toHaveCount(3);
    await expect(suivi).not.toContainText(/classement|rang/i);
  });

  test('khatma de la classe : l’enseignant la lance, les élèves ne voient que le total', async ({
    page,
    browser,
  }) => {
    await beta('maitre@e2e.test');
    await loginTeacher(page);
    const c = await page.request.post('/api/v1/teacher/classes', {
      headers: H,
      data: { name: `Classe khatma ${Date.now()}` },
    });
    expect(c.status(), await c.text()).toBe(201);
    const cls = ((await c.json()) as { class: { id: string; joinCode: string } }).class;

    // une famille inscrit deux enfants dans la classe
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const fam = await ctx.newPage();
    const email = `kh-classe-${Date.now()}@e2e.test`;
    const su = await fam.request.post('/api/v1/auth/signup', {
      headers: H,
      data: {
        kind: 'parent',
        birthYear: 1985,
        email,
        password: password(),
        country: 'FR',
        locale: 'fr',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    });
    expect(su.status(), await su.text()).toBe(201);
    await fam.request.post('/api/v1/account/pin', {
      headers: H,
      data: { pin: PARENT_PIN, password: password() },
    });
    const annee = new Date().getFullYear();
    for (const [pseudonym, age] of [
      ['Rayan', 9],
      ['Salma', 10],
    ] as const) {
      const r = await fam.request.post('/api/v1/profiles', {
        headers: H,
        data: {
          pseudonym,
          birthYear: annee - 1 - age,
          levelCode: 'en1',
          password: password(),
          consents: ['compte_suivi', 'donnee_religieuse_art9'],
        },
      });
      const id = ((await r.json()) as { id: string }).id;
      const j = await fam.request.post(`/api/v1/profiles/${id}/classes`, {
        headers: { ...H, 'x-parent-pin': PARENT_PIN },
        data: { code: cls.joinCode, consent: true },
      });
      expect(j.status(), await j.text()).toBe(201);
    }
    await beta(email);

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/enseignant/classe/${cls.id}`);
    await page.getByTestId('onglet-sourates').click();
    await expect(page.getByTestId('khatma-classe')).toBeVisible();
    await expect(page.getByTestId('khatma-classe-form')).toContainText('2 élèves inscrits');
    await page.getByTestId('khatma-classe-lancer').click();
    await expect(page.getByTestId('khatma-classe-plan')).toBeVisible();
    await expect(page.getByTestId('khatma-classe-groupe')).toContainText('Parts lues : 0 sur 2');
    await page.getByTestId('khatma-classe-parts').click();
    await expect(page.getByTestId('khatma-part')).toHaveCount(2);
    await expect(page.getByTestId('khatma-classe')).not.toContainText(/classement|rang/i);

    // côté famille : chaque enfant lit sa part, voit le total de la classe
    await pickProfile(fam, 'Rayan');
    await fam.goto('/coran');
    await expect(fam.getByTestId('khatma-plan')).toContainText('Ta part');
    await expect(fam.getByTestId('khatma-groupe')).toContainText('Parts lues : 0 sur 2');
    await expect(fam.getByTestId('khatma-carte')).not.toContainText('Salma');
    await ctx.close();
  });
});
