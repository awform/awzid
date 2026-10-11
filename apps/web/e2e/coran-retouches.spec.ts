import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { close, EXACT_ON, listen, openDisplay, sansCommandes, settled } from './coran';
import { expect, test } from './fixtures';

/**
 * Retouches du lecteur après l'essai du client sur son téléphone (11/10/2026, Android 412 px, page 2 zoomée) :
 * 1. aucun vide en haut : la page commence en haut de l'écran, commandes cachées ou non ;
 * 2. verset choisi / entendu : UN surlignage doux et continu (plus une pastille par mot) ;
 * 3. zoom calé sur le DÉBUT de la ligne (à droite) ; double-toucher : ligne centrée ; « Grand texte » dans
 *    Réglages > Affichage (vue par versets, texte agrandi) ;
 * 4. aucun pied juridique sous le lecteur ; « Sources » seulement derrière ⓘ dans les commandes.
 * Captures : CORAN_RETOUCHES_CAPTURES=<dossier> (412 px, clair et sombre).
 */
const CAP = process.env.CORAN_RETOUCHES_CAPTURES;
const TEL = { width: 412, height: 915 };
const epure = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-epure'));
const zoom = async (page: Page) =>
  Number(await page.getByTestId('mushaf-livre').getAttribute('data-zoom'));

/** Page affichée (exacte quand les données Content Sync sont là, sinon fluide) et lecteur prêt. */
async function openPage(page: Page, n: number) {
  await page.goto(`/coran/lecteur?page=${n}&vue=page`);
  const art = page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`);
  if (EXACT_ON) await expect(art).toHaveAttribute('data-exact', '1', { timeout: 15_000 });
  else await expect(art).toBeVisible();
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  // page posée : son entrée glisse de 6 px (animation « mp-in », --motion) ; mesurée pendant ce glissement, la
  // page fluide (prête plus vite que la page exacte) paraissait 2 à 4 px trop bas (vu le 12/10/2026)
  await settled(page);
  return art;
}
/** Haut de la page du muṣḥaf par rapport au haut de l'écran (défilement à 0). */
const pageTop = (page: Page) =>
  page
    .getByTestId('mushaf-page')
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
/** Bord droit de la page zoomée et bord droit de son cadre (début des lignes arabes). */
const rights = (page: Page) =>
  page.evaluate(() => {
    const book = document.querySelector('[data-testid="mushaf-livre"]')!.getBoundingClientRect();
    const z = document.querySelector('[data-testid="zoom-page-cadre"]')!.getBoundingClientRect();
    return { book: book.right, page: z.right };
  });
async function doubleTap(page: Page, x: number, y: number) {
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
}

test.describe('retouches du lecteur (téléphone 412 px)', () => {
  test.skip(({ isMobile }) => !isMobile, 'essai du client : téléphone');
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(TEL);
  });

  test('1. aucun vide en haut : la page commence en haut de l’écran, commandes visibles, cachées, zoomée', async ({
    page,
  }) => {
    await openPage(page, 2);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    // commandes visibles : elles flottent au-dessus du texte, la page est en haut
    expect(await epure(page)).toBe(false);
    expect(await pageTop(page)).toBeLessThanOrEqual(2);
    // commandes cachées (3 s) : toujours aucun vide
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    expect(await pageTop(page)).toBeLessThanOrEqual(2);
    // zoomée (double-toucher) : la page zoomée remplit aussi le haut de l'écran
    const box = (await page.getByTestId('mushaf-livre').boundingBox())!;
    await doubleTap(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => zoom(page)).toBeCloseTo(1.8, 1);
    expect(await pageTop(page)).toBeLessThanOrEqual(2);
    const cadre = await page
      .getByTestId('mushaf-livre')
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(cadre).toBeLessThanOrEqual(2);
    await page.keyboard.press('0');
  });

  test('2. verset choisi : UN seul surlignage continu, aucune pastille par mot, aucun fond ailleurs', async ({
    page,
  }) => {
    const art = await openPage(page, 2);
    const v = art.locator('[data-aya="2:2"]').first();
    await v.click();
    await expect(page.getByTestId('menu-verset')).toBeVisible();
    await close(page);
    if (EXACT_ON) {
      // un seul élément de surlignage, pour ce verset ; une bande par ligne, toutes de même hauteur
      const band = art.locator('[data-surlignage]');
      await expect(band).toHaveCount(1);
      await expect(band).toHaveAttribute('data-surlignage', '2:2');
      const hs = await band
        .locator('span')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(hs.length).toBeGreaterThan(0);
      expect(new Set(hs).size).toBe(1);
      // aucun glyphe (mot) n'a de fond : ni ceux du verset choisi, ni les autres
      const fonds = await art
        .locator('[data-testid="page-exacte"] .g')
        .evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).backgroundColor))]);
      expect(fonds).toEqual(['rgba(0, 0, 0, 0)']);
    } else {
      // page fluide : le verset entier (un seul élément), aucun mot surligné à part
      await expect(art.locator('.aya.on')).toHaveCount(1);
      await expect(art.locator('.aya.on')).toHaveAttribute('data-aya', '2:2');
      const fonds = await art
        .locator('.w')
        .evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).backgroundColor))]);
      expect(fonds).toEqual(['rgba(0, 0, 0, 0)']);
    }
    // un autre verset choisi : l'ancien n'a plus de fond
    await art.locator('[data-aya="2:4"]').first().click();
    await close(page);
    if (EXACT_ON) {
      await expect(art.locator('[data-surlignage]')).toHaveCount(1);
      await expect(art.locator('[data-surlignage]')).toHaveAttribute('data-surlignage', '2:4');
    } else await expect(art.locator('.aya.on')).toHaveAttribute('data-aya', '2:4');
  });

  test('3. zoom calé sur le début de la ligne (à droite) ; double-toucher : ligne touchée au centre', async ({
    page,
  }) => {
    await openPage(page, 2);
    // commandes montrées (3 s), la flèche « page suivante » flotte au bord gauche, à mi-hauteur : en page fluide,
    // le point visé (bord gauche, 60 % de la page) tombait SUR elle (deux pages tournées au lieu du zoom).
    // L'élève double-touche le texte une fois les commandes effacées.
    await sansCommandes(page);
    const box = (await page.getByTestId('mushaf-livre').boundingBox())!;
    // toucher à GAUCHE d'une ligne : la vue zoomée montre quand même le début (bord droit)
    const ty = box.y + box.height * 0.6;
    await doubleTap(page, box.x + 30, ty);
    await expect.poll(() => zoom(page)).toBeCloseTo(1.8, 1);
    await expect(page.getByTestId('menu-verset')).toBeHidden();
    let r = await rights(page);
    expect(Math.abs(r.page - r.book)).toBeLessThanOrEqual(1.5);
    // la ligne touchée vient vers le milieu de la partie visible de la page
    const mid = await page.getByTestId('mushaf-livre').evaluate((el) => {
      const b = el.getBoundingClientRect();
      return (Math.max(b.top, 0) + Math.min(b.bottom, innerHeight)) / 2;
    });
    const zoomer = await page.getByTestId('zoom-page-cadre').boundingBox();
    // point touché (hauteur dans la page à 1×) → position à l'écran après le zoom
    const ecran = zoomer!.y + (ty - box.y) * 1.8;
    const bas = Math.min(box.y + box.height, TEL.height);
    // centré, sauf si la page bute sur son bord (jamais de vide)
    if (zoomer!.y < box.y - 1 && zoomer!.y + zoomer!.height > bas + 1)
      expect(Math.abs(ecran - mid)).toBeLessThanOrEqual(4);
    // retour à la page entière, puis zoom au clavier (+) : calé à droite aussi
    await page.waitForTimeout(400);
    await doubleTap(page, box.x + 30, ty);
    await expect.poll(() => zoom(page)).toBe(1);
    await page.keyboard.press('+');
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.2);
    r = await rights(page);
    expect(Math.abs(r.page - r.book)).toBeLessThanOrEqual(1.5);
    await page.keyboard.press('0');
    await expect.poll(() => zoom(page)).toBe(1);
  });

  test('3. « Grand texte » dans Réglages > Affichage : vue par versets, texte agrandi, retour à la page', async ({
    page,
  }) => {
    await openPage(page, 2);
    await openDisplay(page);
    const b = page.getByTestId('grand-texte');
    await expect(b).toBeVisible();
    await expect(b).toContainText('Grand texte');
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('vue-versets')).toBeChecked();
    await expect(page.getByTestId('taille-1')).toBeChecked();
    await close(page);
    // texte en versets qui revient à la ligne, sans défilement horizontal
    await expect(page.locator('[data-testid="texte-coran"] [data-verse="2:2"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // taille réglable juste en dessous ; second appui : retour à la page du muṣḥaf
    await openDisplay(page);
    await page.getByTestId('taille-2').check({ force: true });
    await page.getByTestId('grand-texte').click();
    await expect(page.getByTestId('vue-page')).toBeChecked();
    await page.getByTestId('taille-0').check({ force: true });
    await close(page);
    await expect(page.getByTestId('mushaf-page').first()).toBeVisible();
  });

  test('4. aucun pied juridique sur le lecteur ; « Sources » seulement derrière ⓘ dans les commandes', async ({
    page,
  }) => {
    await openPage(page, 2);
    await expect(page.getByTestId('pied')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Mentions légales');
    // ⓘ dans la barre des commandes, nulle part ailleurs sous la page
    const info = page.getByTestId('barre-coran').getByTestId('infos-texte');
    await expect(info).toHaveCount(1);
    await expect(page.getByTestId('infos-texte')).toHaveCount(1);
    // crédits : seulement pour les lecteurs d'écran (aucun texte « Sources » sous la page)
    expect((await page.getByTestId('credit-texte').boundingBox())!.height).toBeLessThanOrEqual(1);
    await info.click();
    await expect(page.getByTestId('feuille-infos')).toBeVisible();
    await close(page);
    // vue par versets : pas de pied non plus
    await page.goto('/coran/lecteur?s=112&vue=versets');
    await expect(page.locator('[data-testid="texte-coran"]')).toBeVisible();
    await expect(page.getByTestId('pied')).toHaveCount(0);
    // ailleurs, le pied reste (page « Aide »)
    await page.goto('/aide');
    await expect(page.getByTestId('pied')).toBeVisible();
  });
});

test.describe('captures', () => {
  test.skip(!CAP, 'captures : CORAN_RETOUCHES_CAPTURES non défini');
  test('captures 412 px — page 2 zoomée, verset entendu surligné, Grand texte (clair et sombre)', async ({
    page,
  }, info) => {
    test.skip(!info.project.name.startsWith('mobile'), 'téléphone');
    test.setTimeout(240_000);
    mkdirSync(CAP!, { recursive: true });
    await page.setViewportSize(TEL);
    for (const scheme of ['light', 'dark'] as const) {
      const sfx = scheme === 'light' ? 'clair' : 'sombre';
      const save = (n: string) => page.screenshot({ path: join(CAP!, `412-${sfx}-${n}.png`) });
      await page.emulateMedia({ colorScheme: scheme });
      await openPage(page, 2);
      const mode = scheme === 'light' ? 'clair' : 'sombre';
      for (let i = 0; i < 3; i++) {
        const b = page.getByTestId('mode-affichage');
        if ((await b.getAttribute('data-mode')) === mode) break;
        await b.click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      if ((await zoom(page)) !== 1) await page.keyboard.press('0');
      await page.waitForTimeout(400);
      await save('p2-commandes');
      await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
      const box = (await page.getByTestId('mushaf-livre').boundingBox())!;
      await doubleTap(page, box.x + 40, box.y + box.height * 0.45);
      await expect.poll(() => zoom(page)).toBeCloseTo(1.8, 1);
      await page.waitForTimeout(700);
      await save('p2-zoom');
      await page.keyboard.press('0');
      // verset choisi (page 2)
      await page.locator('[data-page="2"] [data-aya="2:3"]').first().click();
      await close(page);
      await page.waitForTimeout(500);
      await save('p2-verset-choisi');
      // verset en cours de lecture (récitateur d'essai : al-Ikhlāṣ, page 604)
      await openPage(page, 604);
      await listen(page);
      await expect(page.locator('[data-page="604"] .on[data-aya="112:2"]').first()).toBeAttached({
        timeout: 10_000,
      });
      await page
        .getByTestId('pastille-jouer')
        .click({ timeout: 8000 })
        .catch(() => {});
      await page.waitForTimeout(500);
      await save('p604-verset-entendu');
      await page
        .getByTestId('pastille-ouvrir')
        .click()
        .catch(() => {});
      await page
        .getByTestId('arreter-audio')
        .click()
        .catch(() => {});
      // Grand texte
      await openPage(page, 2);
      await openDisplay(page);
      await page.waitForTimeout(300);
      await page.getByTestId('grand-texte').scrollIntoViewIfNeeded();
      await save('reglages-grand-texte');
      await page.getByTestId('grand-texte').click();
      await close(page);
      await page.waitForTimeout(600);
      await save('grand-texte');
      await openDisplay(page);
      await page.getByTestId('grand-texte').click();
      await page.getByTestId('taille-0').check({ force: true });
      await close(page);
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });
});
