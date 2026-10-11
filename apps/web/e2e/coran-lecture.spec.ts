import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { close, expectVerse, listen } from './coran';
import { expect, test } from './fixtures';

/**
 * Lecteur du Coran en vrai muṣḥaf (décisions du client, 11/10/2026) :
 * 1. ZOOM : pincer (1× à 3×), double-toucher (page entière ↔ ≈ 1,8×), glisser zoomé = déplacer (jamais tourner
 *    la page), zoom gardé d'une page à l'autre et après rechargement ;
 * 2. LECTURE ÉPURÉE par défaut : commandes effacées après 3 s, un toucher (hors verset) les montre ; le toucher
 *    d'un verset ouvre toujours son menu ; bouton « Afficher les commandes » au clavier ;
 *    pendant l'écoute, une pastille (pause/lecture + verset) remplace la barre audio.
 * Captures : CORAN_LECTURE_CAPTURES=<dossier> (375 px, clair et sombre).
 */
const CAP = process.env.CORAN_LECTURE_CAPTURES;
/** suffixe des fichiers de captures (p. ex. « -v2 ») */
const SFX = process.env.CORAN_LECTURE_SUFFIXE ?? '';
const mobile = (name: string) => name.startsWith('mobile');
const epure = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-epure'));
const zoom = async (page: Page) =>
  Number(await page.getByTestId('mushaf-livre').getAttribute('data-zoom'));

/** Gestes à deux doigts simulés (TouchEvent) sur la page : pincement de `d0` à `d1` pixels d'écart. */
async function pinch(page: Page, d0: number, d1: number) {
  await page.getByTestId('mushaf-livre').evaluate(
    (el, [a, b]) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + Math.min(r.height / 2, 200);
      const pts = (d: number) => [
        new Touch({ identifier: 1, target: el, clientX: cx - d / 2, clientY: cy }),
        new Touch({ identifier: 2, target: el, clientX: cx + d / 2, clientY: cy }),
      ];
      const fire = (type: string, touches: Touch[], changed: Touch[]) =>
        el.dispatchEvent(
          new TouchEvent(type, {
            touches,
            changedTouches: changed,
            cancelable: true,
            bubbles: true,
          }),
        );
      fire('touchstart', pts(a!), pts(a!));
      for (let i = 1; i <= 5; i++) fire('touchmove', pts(a! + ((b! - a!) * i) / 5), pts(a!));
      fire('touchend', [], pts(b!));
    },
    [d0, d1],
  );
}
/** Glisser d'un doigt (horizontal) sur la page. */
async function drag(page: Page, dx: number) {
  await page.getByTestId('mushaf-livre').evaluate((el, d) => {
    const r = el.getBoundingClientRect();
    const y = r.top + 150;
    const x0 = r.left + r.width / 2;
    const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const fire = (type: string, x: number, end = false) =>
      el.dispatchEvent(
        new TouchEvent(type, {
          touches: end ? [] : [t(x)],
          changedTouches: [t(x)],
          cancelable: true,
          bubbles: true,
        }),
      );
    fire('touchstart', x0);
    for (let i = 1; i <= 5; i++) fire('touchmove', x0 + (d * i) / 5);
    fire('touchend', x0 + d, true);
  }, dx);
}
async function ready(page: Page) {
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
}

test.describe('téléphone : muṣḥaf zoomable et lecture épurée', () => {
  test.skip(({ isMobile }) => !isMobile, 'gestes au doigt : téléphone seulement');

  test('commandes effacées après 3 s, un toucher les montre ; le toucher d’un verset ouvre son menu', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=604&vue=page');
    await ready(page);
    await expectVerse(page, '112:1');
    expect(await epure(page)).toBe(false);
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    // en-tête, barre du lecteur et barre d'onglets effacés (mais toujours dans la page, pour le clavier)
    for (const sel of ['header.top', '[data-testid="barre-coran"]', 'nav.tabs'])
      await expect
        .poll(() =>
          page
            .locator(sel)
            .first()
            .evaluate((e) => getComputedStyle(e).opacity),
        )
        .toBe('0');
    // toucher hors verset (sous la page) : les commandes reviennent, puis se recachent d'elles-mêmes
    await page.locator('.stage .pos').tap();
    await expect.poll(() => epure(page)).toBe(false);
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    // toucher de nouveau : montrées ; encore : cachées tout de suite
    await page.locator('.stage .pos').tap();
    await expect.poll(() => epure(page)).toBe(false);
    await page.locator('.stage .pos').tap();
    await expect.poll(() => epure(page)).toBe(true);
    // commandes cachées : un toucher sur un VERSET ouvre son menu (pas le basculement des commandes)
    const v = page.locator('[data-testid="mushaf-livre"] [data-aya="112:2"]').first();
    await v.tap();
    await expect(page.getByTestId('menu-verset')).toBeVisible();
    await close(page);
    // clavier : « Afficher les commandes » est focusable et les montre
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    await page.getByTestId('afficher-commandes').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => epure(page)).toBe(false);
  });

  test('zoom : pincer, double-toucher, glisser zoomé sans tourner la page, zoom gardé', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=50&vue=page');
    await ready(page);
    await expect(page.locator('[data-page="50"]')).toBeVisible();
    expect(await zoom(page)).toBe(1);
    // pincement : agrandit (borné à 3×)
    await pinch(page, 80, 200);
    await expect.poll(() => zoom(page)).toBeGreaterThan(2);
    await pinch(page, 50, 400);
    expect(await zoom(page)).toBeLessThanOrEqual(3);
    // zoomée : glisser DÉPLACE la page, ne la tourne pas (vue calée sur le début des lignes, à droite :
    // glisser vers la droite montre la suite de la ligne, à gauche)
    const before = await page.getByTestId('zoom-page-cadre').getAttribute('style');
    await drag(page, 140);
    await expect(page.locator('[data-page="50"]')).toBeVisible();
    await expect(page.locator('[data-page="51"]')).toHaveCount(0);
    expect(await page.getByTestId('zoom-page-cadre').getAttribute('style')).not.toBe(before);
    // pincer pour revenir à la page entière ; glisser tourne de nouveau la page
    await pinch(page, 400, 40);
    await expect.poll(() => zoom(page)).toBe(1);
    await drag(page, 140);
    await expect(page.locator('[data-page="51"]')).toBeVisible();
    // double-toucher : zoom confortable, puis page entière
    const box = (await page.getByTestId('mushaf-livre').boundingBox())!;
    // milieu de la page (téléphone : la page commence en haut de l'écran, sous les commandes flottantes)
    const [x, y] = [box.x + box.width / 2, box.y + Math.max(box.height / 2, 300)];
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect.poll(() => zoom(page)).toBeCloseTo(1.8, 1);
    await expect(page.getByTestId('menu-verset')).toBeHidden();
    // zoom gardé en changeant de page et après rechargement (réglage de l'appareil)
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-page="52"]')).toBeVisible();
    await expect.poll(() => zoom(page)).toBeCloseTo(1.8, 1);
    await page.reload();
    await expect(page.locator('[data-page="52"]')).toBeVisible();
    await expect.poll(() => zoom(page)).toBeCloseTo(1.8, 1);
    await page.waitForTimeout(400);
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect.poll(() => zoom(page)).toBe(1);
    // aucun défilement horizontal de la page entière
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('écoute : la barre audio devient une pastille (pause/lecture + verset) ; un toucher l’ouvre', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=604&vue=page');
    await listen(page);
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true', {
      timeout: 15_000,
    });
    // pendant l'écoute, sans geste : commandes effacées, pastille montrée
    const pill = page.getByTestId('pastille-audio');
    await expect(pill).toBeVisible({ timeout: 8000 });
    await expect(pill).toContainText(/Verset \d+/);
    await page.getByTestId('pastille-jouer').click();
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('pastille-jouer')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('pastille-ouvrir').click();
    await expect(pill).toHaveCount(0);
    expect(await epure(page)).toBe(false);
    await expect(page.getByTestId('mini-barre')).toBeVisible();
    // nom du récitateur sur sa ligne, en entier (jamais « M. a… »)
    const nm = page.getByTestId('mini-recitateur').locator('.nm');
    expect(await nm.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.getByTestId('arreter-audio').click();
  });

  test('barre audio juste au-dessus des onglets (ancrage mesuré) ; téléphone couché ≥ 900 px : une seule page pleine largeur', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=604&vue=page');
    await listen(page);
    await page.getByTestId('arreter-audio').click();
    const [bar, tabs] = await Promise.all([
      page.getByTestId('mini-barre').boundingBox(),
      page.locator('nav.tabs').boundingBox(),
    ]);
    // la barre audio n'est jamais mordue par la barre d'onglets
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(tabs!.y + 0.5);
    // téléphone couché, large de 932 px : une page (pas la double page du bureau), sur toute la largeur
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/coran/lecteur?page=50&vue=page');
    await ready(page);
    await expect(page.getByTestId('mushaf-page')).toHaveCount(1);
    const book = (await page.getByTestId('mushaf-livre').boundingBox())!;
    expect(book.width).toBeGreaterThan(932 * 0.85);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('réglages : Lire, Écouter, Mémoriser en tête, « Avancé » replié, feuille ≤ 70 % de l’écran', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=604&vue=page');
    await ready(page);
    await page.getByTestId('ouvrir-reglages-lecteur').click();
    const sheet = page.getByTestId('reglages');
    await expect(sheet).toBeVisible();
    for (const id of ['mode-lire', 'mode-ecouter', 'mode-memoriser'])
      await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('reglages-avance')).not.toHaveAttribute('open', '');
    const h = (await sheet.boundingBox())!.height;
    expect(h).toBeLessThanOrEqual(page.viewportSize()!.height * 0.7 + 1);
    // « Lire » : texte seul, commandes effacées
    await page.getByTestId('mode-lire').click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => epure(page)).toBe(true);
  });
});

test.describe('captures', () => {
  test.skip(!CAP, 'captures : CORAN_LECTURE_CAPTURES non défini');
  test('captures 375 px — lecture épurée, commandes, zoom 2×, pastille', async ({ page }, info) => {
    test.skip(!mobile(info.project.name), 'téléphone');
    test.setTimeout(240_000);
    mkdirSync(CAP!, { recursive: true });
    await page.setViewportSize({ width: 375, height: 812 });
    for (const scheme of ['light', 'dark'] as const) {
      const sfx = scheme === 'light' ? 'clair' : 'sombre';
      const save = (n: string) =>
        page.screenshot({ path: join(CAP!, `375-${sfx}-${n}${SFX}.png`) });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/coran/lecteur?page=604&vue=page');
      await ready(page);
      // thème de l'application forcé (bouton « Thème » de l'en-tête : auto → clair → sombre)
      const mode = scheme === 'light' ? 'clair' : 'sombre';
      for (let i = 0; i < 3; i++) {
        const b = page.getByTestId('mode-affichage');
        if ((await b.getAttribute('data-mode')) === mode) break;
        await b.click();
      }
      await expect(page.getByTestId('mode-affichage')).toHaveAttribute('data-mode', mode);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await page.evaluate(() => document.fonts.ready);
      // zoom remis à 1 (réglage de l'appareil)
      if ((await zoom(page)) !== 1) await page.keyboard.press('0');
      await page.waitForTimeout(500);
      await save('commandes-visibles');
      await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
      await page.waitForTimeout(900);
      await save('lecture-epuree');
      await pinch(page, 100, 200);
      await page.waitForTimeout(400);
      await save('zoom-2x');
      await page.keyboard.press('0');
      await listen(page);
      await expect(page.getByTestId('pastille-audio')).toBeVisible({ timeout: 8000 });
      await page.waitForTimeout(500);
      await save('pastille-audio');
      await page.getByTestId('pastille-ouvrir').click();
      await page.waitForTimeout(500);
      await save('barre-audio');
      await page.getByTestId('arreter-audio').click();
      await page.getByTestId('ouvrir-reglages-lecteur').click();
      await page.waitForTimeout(500);
      await save('reglages');
      await close(page);
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });
});
