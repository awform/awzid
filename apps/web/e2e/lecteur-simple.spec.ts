import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { commandes, listen, openSelector } from './coran';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Lecteur simple » (2/11/2026) — interrupteur `lecteur_simple` (retour du client : lecteur du Coran « trop chargé » sur téléphone) :
 *  - COUPÉ (défaut) : l'ancien affichage, inchangé (Traduction, Grand texte, Réglages, ⓘ dans la barre) ; hors du canal bêta : idem ;
 *  - OUVERT, à 375 px : UNE ligne en haut (sourate et verset, écoute, « Outils »), le premier verset visible sans défiler et non
 *    couvert ; Traduction, Grand texte, Réglages, souligner les mots reconnus, recherche d'un mot et sources dans le panneau « Outils » ;
 *    « Je reconnais X % » réduit à une pastille (rien à 0 %) qui ouvre le détail ; UNE barre audio compacte (« v. 1/4 », « ⋯ » pour le
 *    reste), plus de proposition « Écouter ici / Reprendre où j'étais / + » ;
 *  - deux défauts vus par le client, corrigés pour tous : la page affichée en « Grand texte » suit le verset (Al-Baqara 2:17 = page 4,
 *    pas « page 2 »), et la barre audio d'une lecture mise en pause dans une autre sourate ne garde plus le compte de celle-ci
 *    (« écoute 1 sur 286 » sous al-Fātiḥa).
 */
const H = { 'x-awform': '1' };
const sql = (q: string) =>
  execFileSync('psql', [process.env.TEST_DATABASE_URL!, '-Atqc', q], { encoding: 'utf8' });

test.use({ viewport: { width: 375, height: 667 } });
// eslint-disable-next-line no-empty-pattern -- Playwright exige un objet déstructuré en premier argument
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'téléphone seulement (375 px)');
});

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-ls-${test.info().project.name}-${Date.now()}@e2e.test`;
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
const regler = async (adm: Page, cle: string, etat: 'on' | 'off' | 'beta') =>
  expect(
    (
      await adm.request.put(`/api/v1/admin/fonctions/${cle}`, { headers: H, data: { etat } })
    ).status(),
  ).toBe(200);

/** Adulte au niveau 1 des livres (filière Adultes), `n` leçons faites : « Je reconnais X % » en dépend. */
async function adulte(page: Page, label: string, n: number) {
  const a = await newAdult(page, label);
  const r = await page.request.post(`/api/v1/profiles/${a.profileId}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect(r.status(), await r.text()).toBe(201);
  if (n > 0)
    sql(
      `INSERT INTO progress (profile_id, unit_id, status) SELECT '${a.profileId}', u.id, 'terminee' FROM unit u
       WHERE u.level_code = 'ad1' AND u.n <= ${n} ON CONFLICT DO NOTHING`,
    );
  return a;
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
/** Lecteur ouvert, commandes montrées (lecture épurée : elles s'effacent après 3 s). */
async function ouvrir(page: Page, query: string) {
  await page.goto(`/coran/lecteur?${query}`);
  await expect(page.getByTestId('barre-coran')).toBeAttached();
  await commandes(page);
}
const position = (page: Page) => page.getByTestId('position');

test.describe('interrupteur coupé : l’ancien affichage, et les deux défauts corrigés', () => {
  test.use({ compte: 'adulte' });
  test.beforeAll(async ({ browser }) => {
    const adm = await admin(browser);
    await regler(adm, 'lecteur_simple', 'off');
    await adm.context().close();
  });

  test('barre d’avant : Traduction, Grand texte, Réglages et ⓘ ; pas d’« Outils »', async ({
    page,
  }) => {
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('mp-trad')).toBeVisible();
    await expect(page.getByTestId('barre-grand-texte')).toBeVisible();
    await expect(page.getByTestId('ouvrir-reglages-lecteur')).toBeVisible();
    await expect(page.getByTestId('infos-texte')).toBeVisible();
    await expect(page.getByTestId('ouvrir-outils')).toHaveCount(0);
    await expect(page.getByTestId('cm-pastille')).toHaveCount(0);
  });

  test('« Grand texte » : la page affichée suit le verset touché (al-Baqara 2:17 = page 4)', async ({
    page,
  }) => {
    await ouvrir(page, 's=2&a=1&vue=versets');
    await expect(page.getByTestId('puce')).toContainText('page 2', { timeout: 20_000 });
    await expect(page.getByTestId('puce')).toContainText('verset 1');
    const v = page.locator('[data-testid="texte-coran"] [data-aya="17"]').first();
    await v.scrollIntoViewIfNeeded();
    await v.click();
    await expect(page.getByTestId('menu-verset')).toBeVisible();
    await page.keyboard.press('Escape');
    await commandes(page);
    await expect(page.getByTestId('puce')).toContainText('verset 17');
    await expect(page.getByTestId('puce')).toContainText(/page 4(?!\d)/);
    await expect(page.getByTestId('puce')).toContainText('juzʾ 1');
  });

  test('lecture mise en pause dans une autre sourate : la barre audio suit l’emplacement', async ({
    page,
  }) => {
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('puce')).toContainText('Ikhlāṣ', { timeout: 20_000 });
    await listen(page);
    await expect(page.getByTestId('jouer')).toBeEnabled({ timeout: 15_000 });
    await expect(position(page)).toContainText('sur 4');
    // changement de sourate en pleine lecture : pause, la barre se recale sur al-Fātiḥa (7 versets, pas les 4 d'Al-Ikhlāṣ)
    await openSelector(page);
    await page.getByTestId('sel-sourates').locator('li button').first().click();
    await expect(page.getByTestId('puce')).toContainText('Fātiḥa');
    await expect(position(page)).toContainText('7');
    await expect(position(page)).not.toContainText('4');
    // « Reprendre où j'étais » : retour à al-Ikhlāṣ, la lecture repart
    await expect(page.getByTestId('reprendre-lecture')).toBeVisible();
    await page.getByTestId('reprendre-lecture').click();
    await expect(page.getByTestId('puce')).toContainText('Ikhlāṣ');
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true');
    await expect(position(page)).toContainText('sur');
    await expect(position(page)).not.toContainText('sur 7');
  });

  test('lecture mise en pause par l’élève puis autre sourate : « 7 », pas le compte d’al-Ikhlāṣ', async ({
    page,
  }) => {
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('puce')).toContainText('Ikhlāṣ', { timeout: 20_000 });
    await listen(page);
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true');
    await commandes(page);
    await page.getByTestId('jouer').click();
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
    await openSelector(page);
    await page.getByTestId('sel-sourates').locator('li button').first().click();
    await expect(page.getByTestId('puce')).toContainText('Fātiḥa');
    await expect(position(page)).toContainText('7');
    await expect(position(page)).not.toContainText('4');
    await expect(page.getByTestId('reprendre-lecture')).toBeVisible();
  });
});

test.describe('« canal bêta » : seul le compte du canal voit le lecteur simple', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await regler(adm, 'lecteur_simple', 'beta');
  });
  test.afterAll(async () => {
    if (adm) {
      await regler(adm, 'lecteur_simple', 'off');
      await adm.context().close();
    }
  });

  test('hors du canal : l’ancien affichage', async ({ page }) => {
    await adulte(page, 'ls-hors', 0);
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('mp-trad')).toBeVisible();
    await expect(page.getByTestId('ouvrir-outils')).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('ouvrir-outils')).toHaveCount(0);
  });

  test('dans le canal : « Outils » et la ligne unique', async ({ page }) => {
    const a = await adulte(page, 'ls-dans', 0);
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email: a.email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('ouvrir-outils')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('mp-trad')).toHaveCount(0);
  });
});

test.describe('interrupteur ouvert : le Coran d’abord', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await regler(adm, 'lecteur_simple', 'on');
    await regler(adm, 'coran_mots', 'on');
  });
  test.afterAll(async () => {
    if (adm) {
      await regler(adm, 'lecteur_simple', 'off');
      await regler(adm, 'coran_mots', 'off');
      await adm.context().close();
    }
  });

  test('375 px : une ligne en haut, le premier verset visible sans défiler et non couvert', async ({
    page,
  }) => {
    await adulte(page, 'ls-haut', 30);
    for (const [query, verset] of [
      ['s=112', '[data-testid="mushaf-livre"] [data-aya="112:1"]'],
      ['s=112&vue=versets', '[data-testid="texte-coran"] [data-aya="1"]'],
    ] as const) {
      await ouvrir(page, query);
      await expect(page.getByTestId('ouvrir-outils')).toBeVisible({ timeout: 20_000 });
      // la pastille est là (leçons faites) : c'est la pire situation pour la hauteur
      await expect(page.getByTestId('cm-pastille')).toBeVisible({ timeout: 20_000 });
      const premier = page.locator(verset).first();
      await expect(premier).toBeVisible();
      await commandes(page);
      const m = await page.evaluate((sel) => {
        const box = (e: Element | null) => {
          const r = e?.getBoundingClientRect();
          return r ? { top: r.top, bottom: r.bottom } : null;
        };
        const haut = [...document.querySelectorAll('.cbar .nav-zone, .cbar .tools')].flatMap((z) =>
          [...z.querySelectorAll('button, a')].filter(
            (e) => (e as HTMLElement).offsetParent !== null,
          ),
        );
        return {
          scrollY: window.scrollY,
          vh: window.innerHeight,
          cbar: box(document.querySelector('.cbar')),
          verset: box(document.querySelector(sel)),
          nBoutons: haut.length,
        };
      }, verset);
      expect(m.scrollY).toBe(0);
      expect(m.verset, 'premier verset').not.toBeNull();
      // visible sans défiler : dans l'écran, et sous la barre du haut (la ligne et la pastille), pas dessous
      expect(m.verset!.top).toBeGreaterThanOrEqual(m.cbar!.bottom - 1);
      expect(m.verset!.bottom).toBeLessThanOrEqual(m.vh);
      // une seule ligne d'outils : sourate et verset, écoute, Outils (plus Traduction, Grand texte, Retrouve, Réglages, ⓘ)
      expect(m.nBoutons).toBe(3);
      for (const id of ['mp-trad', 'barre-grand-texte', 'ouvrir-reglages-lecteur', 'infos-texte'])
        await expect(page.getByTestId(id)).toHaveCount(0);
      // plus de grande carte « Je reconnais… » ni de proposition flottante
      await expect(page.getByTestId('cm-bande')).toHaveCount(0);
      await expect(page.getByTestId('proposition')).toHaveCount(0);
      // la barre du haut reste basse : une ligne de 56 px et la pastille
      expect(m.cbar!.bottom - m.cbar!.top).toBeLessThan(120);
    }
  });

  test('« Outils » : tout ce que la barre portait, en un ou deux touchers', async ({ page }) => {
    await adulte(page, 'ls-outils', 30);
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('cm-pastille')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('ouvrir-outils').click();
    const o = page.getByTestId('outils');
    await expect(o).toBeVisible();
    for (const id of [
      'mp-trad',
      'barre-grand-texte',
      'ouvrir-reglages-lecteur',
      'cm-souligner',
      'cm-chercher',
      'infos-texte',
      'cm-sources',
    ])
      await expect(o.getByTestId(id)).toBeVisible();
    // accessibilité et cibles de 44 px
    await axe(page, '[data-testid="outils"]');
    const petites = await o.locator('button, a, label').evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => Math.round(e.getBoundingClientRect().height))
        .filter((h) => h < 43.5),
    );
    expect(petites).toEqual([]);
    // souligner : réglage partagé avec la bande (le texte du Coran ne change pas, seule une classe est posée)
    await expect(page.locator('.quran-text .w.mc').first()).toBeVisible();
    const avant = await page.getByTestId('mushaf-livre').innerText();
    await o.getByTestId('cm-souligner').uncheck();
    await expect(page.locator('.quran-text .w.mc')).toHaveCount(0);
    expect(await page.getByTestId('mushaf-livre').innerText()).toBe(avant);
    await o.getByTestId('cm-souligner').check();
    await expect(page.locator('.quran-text .w.mc').first()).toBeVisible();
    // Grand texte : le panneau se ferme, le texte en versets s'affiche
    await o.getByTestId('barre-grand-texte').click();
    await expect(page.getByTestId('outils')).toBeHidden();
    await expect(page.getByTestId('texte-coran')).toBeVisible();
    // Réglages
    await commandes(page);
    await page.getByTestId('ouvrir-outils').click();
    await page.getByTestId('outils').getByTestId('ouvrir-reglages-lecteur').click();
    await expect(page.getByTestId('reglages')).toBeVisible();
    await page.keyboard.press('Escape');
    // Sources
    await commandes(page);
    await page.getByTestId('ouvrir-outils').click();
    await page.getByTestId('outils').getByTestId('infos-texte').click();
    await expect(page.getByTestId('feuille-infos')).toBeVisible();
    await expect(page.getByTestId('credit-feuille')).toContainText('Tanzil');
  });

  test('« Je reconnais X % » : une pastille qui ouvre le détail', async ({ page }) => {
    await adulte(page, 'ls-pastille', 30);
    await ouvrir(page, 's=112');
    const p = page.getByTestId('cm-pastille');
    await expect(p).toBeVisible({ timeout: 20_000 });
    await expect(p).toHaveText(/^\d+ % des mots connus ›$/);
    const h = await p.evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(43.5);
    await p.click();
    const d = page.getByTestId('cm-detail');
    await expect(d).toBeVisible();
    await expect(d.getByTestId('cm-titre')).toContainText('Je reconnais');
    await expect(d).toContainText('ce n’est pas encore comprendre tout le verset');
    await axe(page, '[data-testid="cm-detail"]');
  });

  test('0 % : rien du tout (ni pastille, ni carte)', async ({ page }) => {
    await adulte(page, 'ls-zero', 0);
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('ouvrir-outils')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('cm-pastille')).toHaveCount(0);
    await expect(page.getByTestId('cm-bande')).toHaveCount(0);
    // la recherche d'un mot reste dans « Outils »
    await commandes(page);
    await page.getByTestId('ouvrir-outils').click();
    await expect(page.getByTestId('outils').getByTestId('cm-chercher')).toBeVisible();
  });

  test('pause puis autre sourate : la barre dit « v. 1/7 », « Reprendre où j’étais » est dans « ⋯ »', async ({
    page,
  }) => {
    await adulte(page, 'ls-pause', 30);
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('ouvrir-outils')).toBeVisible({ timeout: 20_000 });
    await listen(page);
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true');
    await commandes(page);
    await page.getByTestId('jouer').click();
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
    await openSelector(page);
    await page.getByTestId('sel-sourates').locator('li button').first().click();
    await expect(page.getByTestId('puce')).toContainText('Fātiḥa');
    await expect(position(page)).toHaveText('v. 1/7');
    await commandes(page);
    await page.getByTestId('audio-plus').click();
    await expect(page.getByTestId('am-reprendre')).toBeVisible();
  });

  test('une seule barre audio compacte : « v. 1/4 », « ⋯ » pour le reste', async ({ page }) => {
    await adulte(page, 'ls-audio', 30);
    await ouvrir(page, 's=112');
    await expect(page.getByTestId('ouvrir-outils')).toBeVisible({ timeout: 20_000 });
    await listen(page);
    await expect(page.getByTestId('lecteur-audio')).toBeVisible();
    await expect(page.getByTestId('jouer')).toBeEnabled({ timeout: 15_000 });
    await expect(position(page)).toHaveText(/^v\. \d\/4/);
    // pas de proposition « Écouter ici / Reprendre où j'étais / + »
    await expect(page.getByTestId('proposition')).toHaveCount(0);
    // la barre : précédent, lecture, suivant, ⋯ — le reste est dans le menu
    const m = await page.evaluate(() => {
      const barre = document.querySelector('[data-testid="mini-barre"]')!;
      const r = barre.getBoundingClientRect();
      const boutons = [...barre.querySelectorAll('button')].filter(
        (e) => (e as HTMLElement).offsetParent !== null,
      );
      return { h: r.height, n: boutons.length };
    });
    expect(m.n).toBe(4);
    expect(m.h).toBeLessThan(70);
    await commandes(page);
    await page.getByTestId('audio-plus').click();
    const menu = page.getByTestId('audio-menu');
    await expect(menu).toBeVisible();
    for (const id of [
      'am-ici',
      'am-verset',
      'am-recul',
      'am-avance',
      'am-recitateur',
      'am-ecoute',
      'am-arreter',
    ])
      await expect(menu.getByTestId(id)).toBeVisible();
    await axe(page, '[data-testid="audio-menu"]');
    // changer de sourate en pleine lecture : « Reprendre où j'étais » est dans le menu, la barre dit « v. 1/7 »
    await menu.getByTestId('am-arreter').click();
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
    await commandes(page);
    await page.getByTestId('jouer').click();
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true');
    await openSelector(page);
    await page.getByTestId('sel-sourates').locator('li button').first().click();
    await expect(page.getByTestId('puce')).toContainText('Fātiḥa');
    await expect(position(page)).toHaveText('v. 1/7');
    await expect(page.getByTestId('proposition')).toHaveCount(0);
    await commandes(page);
    await page.getByTestId('audio-plus').click();
    await expect(page.getByTestId('am-reprendre')).toBeVisible();
    await page.getByTestId('am-reprendre').click();
    await expect(page.getByTestId('puce')).toContainText('Ikhlāṣ');
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true');
  });
});
