import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Lecteur du Coran AU DOIGT (régression signalée par le client, 12/10/2026, Xiaomi 412 × 915, Chrome Android :
 * « Réglages n'est plus tactile ni intuitif : dès que tu cliques, ça sort, ça fait rien »). Vrais TOUCHERS
 * (`hasTouch`, `tap`), pas des clics de souris. Causes trouvées :
 *  1. une feuille ou le menu d'un verset ouvert, toucher « Réglages » (visible au-dessus du fond) ne faisait que
 *     fermer la feuille ; désormais la feuille se ferme ET « Réglages » s'ouvre, d'un seul toucher ;
 *  2. la barre s'efface d'un coup après 3 s : un doigt parti vers « Réglages » arrivait sur le texte dessous (menu
 *     du verset à la place) ; pendant 2 s après l'effacement, le toucher à la place d'une commande la fait agir ;
 *  3. le « + » de la proposition attendait 0,3 s (double-toucher de zoom) avant d'ouvrir le menu.
 * Pour chaque commande : ouvrir, rester ouvert (au-delà des 3 s de l'effacement), choisir, fermer.
 */
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
// eslint-disable-next-line no-empty-pattern -- Playwright exige un objet déstructuré en premier argument
test.beforeEach(({}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'téléphone');
});

const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** toucher au point (x, y), sans contrôle d'accessibilité de Playwright (fond d'un dialogue, barre effacée) */
async function toucherA(page: Page, p: { x: number; y: number }) {
  await page.touchscreen.tap(p.x, p.y);
}
const epure = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-epure'));

async function ouvrir(page: Page, q: string) {
  await page.goto(`/coran/lecteur?${q}`);
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
/** reste ouvert au-delà des 3 s de l'effacement des commandes */
async function resteOuvert(page: Page, l: Locator) {
  await page.waitForTimeout(3500);
  await expect(l).toBeVisible();
}
/** commandes effacées (comme l'élève qui ne touche rien pendant 3 s) */
async function attendreEffacement(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await expect.poll(() => epure(page), { timeout: 8000, intervals: [50] }).toBe(true);
}
/** ferme le menu d'un verset par son fond, au-dessus du texte (pas d'une commande) */
async function fermerMenuParLeFond(page: Page) {
  const m = page.getByTestId('menu-verset');
  const r = (await m.boundingBox())!;
  await toucherA(page, { x: 206, y: Math.max(300, r.y - 100) });
  await expect(m).toBeHidden();
}

for (const [nom, q] of [
  ['page', 'page=3&vue=page'],
  ['versets', 's=2&vue=versets'],
] as const) {
  test(`Réglages au doigt (${nom}) : ouvrir, rester ouvert, choisir, fermer`, async ({ page }) => {
    await ouvrir(page, q);
    await page.getByTestId('ouvrir-reglages-lecteur').tap();
    const reg = page.getByTestId('reglages');
    await expect(reg).toBeVisible();
    await resteOuvert(page, reg);
    // choisir : « Avancé », puis une taille de texte
    await page.locator('[data-testid="reglages-avance"] > summary').tap();
    await expect(page.getByTestId('affichage')).toBeVisible();
    await page.locator('label:has([data-testid="taille-1"])').tap();
    await expect(page.getByTestId('taille-1')).toBeChecked();
    await expect(reg).toBeVisible();
    await reg.getByTestId('fermer-feuille').tap();
    await expect(reg).toBeHidden();
  });
}

test('Traduction au doigt (page) : ouvrir, rester ouvert, toucher dedans, fermer', async ({
  page,
}) => {
  await ouvrir(page, 'page=3&vue=page');
  await page.getByTestId('mp-trad').tap();
  const f = page.getByTestId('feuille-traduction');
  await expect(f).toBeVisible();
  await resteOuvert(page, f);
  await page.getByTestId('mp-panneau-traduction').tap();
  await expect(f).toBeVisible();
  await f.getByTestId('fermer-feuille').tap();
  await expect(f).toBeHidden();
});

test('Écouter au doigt : la lecture démarre, reste, pause, arrêt', async ({ page }) => {
  // audio d'essai : al-Fātiḥa
  await ouvrir(page, 'page=1&vue=page');
  await page.getByTestId('ouvrir-ecoute').tap();
  const joue = () =>
    page.evaluate(
      () =>
        document.querySelector('[data-testid="pastille-jouer"]')?.getAttribute('aria-pressed') ===
          'true' ||
        document.querySelector('[data-testid="jouer"]')?.getAttribute('aria-pressed') === 'true',
    );
  await expect.poll(joue, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(3500);
  // commandes effacées : la pastille d'écoute reste, la lecture continue
  await expect(page.getByTestId('pastille-audio')).toBeVisible();
  await page.getByTestId('pastille-jouer').tap();
  await expect(page.getByTestId('pastille-jouer')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('pastille-ouvrir').tap();
  await expect.poll(() => epure(page)).toBe(false);
  // barre d'écoute montrée : « Arrêter » au doigt, la barre reste (lecture arrêtée)
  await page.getByTestId('arreter-audio').tap();
  await expect(page.getByTestId('jouer')).toBeVisible();
  await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
});

test("menu d'un verset au doigt : ouvrir, rester ouvert, choisir, fermer par le fond", async ({
  page,
}) => {
  await ouvrir(page, 's=2&vue=versets');
  await attendreEffacement(page);
  const v = page.locator('[data-testid="texte-coran"] [data-aya="5"]').first();
  await v.scrollIntoViewIfNeeded();
  await v.tap();
  const m = page.getByTestId('menu-verset');
  await expect(m).toBeVisible();
  await resteOuvert(page, m);
  await m.getByTestId('menu-signet').tap();
  await expect(m).toBeHidden();
  await v.tap();
  await expect(m).toBeVisible();
  // fond, au-dessus du texte : le menu se ferme, rien d'autre ne s'ouvre
  await fermerMenuParLeFond(page);
  await expect(page.getByTestId('reglages')).toBeHidden();
});

test("menu d'un verset sur la PAGE au doigt (après l'attente du double-toucher)", async ({
  page,
}) => {
  await ouvrir(page, 'page=3&vue=page');
  await attendreEffacement(page);
  const v = page.locator('[data-testid="mushaf-livre"] [data-aya]').nth(6);
  await v.tap();
  const m = page.getByTestId('menu-verset');
  await expect(m).toBeVisible();
  await resteOuvert(page, m);
  await m.getByTestId('menu-signet').tap();
  await expect(m).toBeHidden();
});

test('sélecteur de sourate et « + » au doigt : ouvrir, rester, aller, menu tout de suite', async ({
  page,
}) => {
  await ouvrir(page, 'page=3&vue=page');
  await page.getByTestId('puce').tap();
  const sel = page.getByTestId('selecteur');
  await expect(sel).toBeVisible();
  await resteOuvert(page, sel);
  await page.getByTestId('sel-verset').tap();
  await page.getByTestId('sel-verset').fill('7');
  await page.getByTestId('sel-verset-aller').tap();
  await expect(sel).toBeHidden();
  await expect(page.getByTestId('proposition')).toBeVisible();
  // « + » : le menu du verset s'ouvre sans l'attente du double-toucher (0,3 s)
  await page.getByTestId('ici-actions').tap();
  const m = page.getByTestId('menu-verset');
  await expect(m).toBeVisible({ timeout: 250 });
  await resteOuvert(page, m);
  await fermerMenuParLeFond(page);
});

test("menu d'un verset ouvert : toucher « Réglages » l'ouvre d'un seul toucher", async ({
  page,
}) => {
  await ouvrir(page, 's=2&vue=versets');
  await attendreEffacement(page);
  const v = page.locator('[data-testid="texte-coran"] [data-aya="5"]').first();
  await v.scrollIntoViewIfNeeded();
  await v.tap();
  await expect(page.getByTestId('menu-verset')).toBeVisible();
  // une feuille ouverte : la barre du lecteur est montrée au-dessus du fond
  await expect.poll(() => epure(page)).toBe(false);
  await toucherA(page, await centre(page.getByTestId('ouvrir-reglages-lecteur')));
  await expect(page.getByTestId('menu-verset')).toBeHidden();
  await expect(page.getByTestId('reglages')).toBeVisible();
  await resteOuvert(page, page.getByTestId('reglages'));
});

test('feuille Traduction ouverte : toucher « Réglages » ouvre Réglages ; « Traduction » la ferme', async ({
  page,
}) => {
  await ouvrir(page, 'page=3&vue=page');
  await page.getByTestId('mp-trad').tap();
  const f = page.getByTestId('feuille-traduction');
  await expect(f).toBeVisible();
  await toucherA(page, await centre(page.getByTestId('mp-trad')));
  await expect(f).toBeHidden();
  await expect(page.getByTestId('reglages')).toBeHidden();
  await page.getByTestId('mp-trad').tap();
  await expect(f).toBeVisible();
  await toucherA(page, await centre(page.getByTestId('ouvrir-reglages-lecteur')));
  await expect(f).toBeHidden();
  await expect(page.getByTestId('reglages')).toBeVisible();
});

for (const [nom, q] of [
  ['page', 'page=3&vue=page'],
  ['versets', 's=2&vue=versets'],
] as const)
  test(`barre effacée à l'instant (${nom}) : le doigt arrivé sur « Réglages » l'ouvre`, async ({
    page,
  }) => {
    await ouvrir(page, q);
    const p = await centre(page.getByTestId('ouvrir-reglages-lecteur'));
    await attendreEffacement(page);
    await toucherA(page, p);
    await expect(page.getByTestId('reglages')).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('menu-verset')).toBeHidden();
    await expect(page.getByTestId('reglages')).toBeVisible();
    await page.getByTestId('reglages').getByTestId('fermer-feuille').tap();
    await expect(page.getByTestId('reglages')).toBeHidden();
    // bien après l'effacement (décision du 11/10/2026) : le texte sous la barre cachée reste touchable
    await attendreEffacement(page);
    await page.waitForTimeout(2300);
    await toucherA(page, p);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('reglages')).toBeHidden();
  });
