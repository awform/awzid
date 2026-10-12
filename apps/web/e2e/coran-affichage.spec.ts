import type { Page } from '@playwright/test';
import { settled } from './coran';
import { expect, test } from './fixtures';

/**
 * Captures du client (12/10/2026, pages 2 et 3, portrait 412 px et paysage, page fluide par défaut) :
 * A. signes de pause (ۖ ۗ ۘ ۙ ۚ ۛ ۜ) jamais seuls en début de ligne ni entre deux lignes : à l'affichage,
 *    chacun reste sur la ligne du mot qui le précède (texte Tanzil inchangé) ;
 * B. aucun vide au-dessus du cadre, quelle que soit la page (1, 2, 3, 4, 50), ouverte ou atteinte en tournant ;
 * C. zoom (pincement) : l'habillage reste masqué, les flèches ne couvrent pas le texte, on fait glisser le texte
 *    d'un bord à l'autre.
 */
const TEL = { width: 412, height: 915 };
const PAYSAGE = { width: 915, height: 412 };
const epure = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-epure'));
const zoom = async (page: Page) =>
  Number(await page.getByTestId('mushaf-livre').getAttribute('data-zoom'));

async function openPage(page: Page, n: number) {
  await page.goto(`/coran/lecteur?page=${n}&vue=page`);
  await expect(page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`)).toBeVisible();
  await expect(page.getByTestId('barre-coran')).toBeAttached();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
}

/** Signes de pause de la page : chacun sur la ligne du mot qui le précède, jamais en tête de ligne. */
const pauses = (page: Page, n: number) =>
  page.evaluate((n) => {
    const PAUSE = /^[ۖ-ۜ]+$/;
    const ws = [...document.querySelectorAll(`[data-page="${n}"] .flow .w`)];
    const out: Array<{ i: number; sign: string; ok: boolean; groupe: boolean; why: string }> = [];
    ws.forEach((w, i) => {
      const txt = (w.textContent ?? '').trim();
      if (!PAUSE.test(txt) || i === 0) return;
      const prev = ws[i - 1]!;
      // même verset : le signe suit un mot (sinon c'est le début d'un verset, sans mot avant)
      if (prev.closest('[data-aya]') !== w.closest('[data-aya]')) return;
      const a = [...prev.getClientRects()].pop()!;
      const b = w.getClientRects()[0]!;
      const ca = (a.top + a.bottom) / 2;
      const cb = (b.top + b.bottom) / 2;
      const ligne = a.bottom - a.top;
      const meme = Math.abs(ca - cb) < ligne / 2;
      out.push({
        i,
        sign: txt,
        ok: meme,
        groupe: !!w.parentElement?.classList.contains('wg'),
        why: `mot ${a.top.toFixed(0)}-${a.bottom.toFixed(0)} signe ${b.top.toFixed(0)}-${b.bottom.toFixed(0)}`,
      });
    });
    return out;
  }, n);

test.describe('A. signes de pause rattachés au mot (page fluide)', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone');
  for (const [nom, vp] of [
    ['portrait 412', TEL],
    ['paysage 915 × 412', PAYSAGE],
  ] as const)
    test(`pages 2 et 3 — ${nom}`, async ({ page }) => {
      await page.setViewportSize(vp);
      for (const n of [2, 3]) {
        await openPage(page, n);
        const r = await pauses(page, n);
        expect(r.length, `page ${n} : signes de pause trouvés`).toBeGreaterThan(0);
        for (const x of r) {
          expect(x.groupe, JSON.stringify(x)).toBe(true);
          expect(x.ok, `page ${n} ${JSON.stringify(x)}`).toBe(true);
        }
        // texte de chaque verset inchangé (Tanzil octet pour octet, mêmes espaces)
        const keys = await page
          .locator(`[data-page="${n}"] [data-verse]`)
          .evaluateAll((els) => els.map((e) => [e.getAttribute('data-verse')!, e.textContent!]));
        // (verset 1 d'une sourate : la basmala est affichée à part, on ne compare que les autres)
        for (const [k, txt] of keys.filter(([k]) => !k!.endsWith(':1')).slice(0, 4)) {
          const [s, a] = k!.split(':');
          const res = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
          const src = ((await res.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
          // le DOM n'ajoute ni ne retire aucune espace entre les mots (tanwīn d'affichage mis à part)
          expect(txt!.split(' ').length, k).toBe(src.split(' ').length);
        }
      }
      // le toucher d'un mot suivi d'un signe ouvre toujours le menu du bon verset
      const g = page.locator('[data-page="3"] .wg').first();
      const aya = await g.evaluate((e) => e.closest('[data-aya]')!.getAttribute('data-aya'));
      await expect.poll(() => epure(page), { timeout: 8000 }).toBe(true);
      await g.scrollIntoViewIfNeeded();
      await g.tap();
      await expect(page.getByTestId('menu-verset')).toBeVisible();
      await expect(page.getByTestId('menu-verset')).toContainText(String(aya!.split(':')[1]));
    });
});

test.describe('B. aucun vide en haut, toutes les pages (portrait, page fluide)', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone');
  test('pages 1, 2, 3, 4, 50 : ouvertes, puis atteintes en tournant', async ({ page }) => {
    await page.setViewportSize(TEL);
    const top = (n: number) =>
      page
        .locator(`[data-testid="mushaf-page"][data-page="${n}"]`)
        .evaluate((el) => el.getBoundingClientRect().top);
    for (const n of [1, 2, 3, 4, 50]) {
      await openPage(page, n);
      expect(await page.evaluate(() => scrollY), `page ${n}`).toBe(0);
      expect(await top(n), `page ${n} ouverte`).toBeLessThanOrEqual(2);
    }
    // en tournant (clavier : flèche gauche = page suivante), après avoir défilé jusqu'en bas de la page
    await openPage(page, 1);
    for (const n of [2, 3, 4]) {
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`)).toBeVisible();
      await settled(page);
      await expect.poll(() => top(n), { message: `page ${n} atteinte` }).toBeLessThanOrEqual(2);
    }
  });
});

async function pinch(page: Page, d0: number, d1: number) {
  await page.getByTestId('mushaf-livre').evaluate(
    (el, [a, b]) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = Math.max(r.top, 0) + 300;
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
      for (let i = 1; i <= 6; i++) {
        const d = a! + ((b! - a!) * i) / 6;
        fire('touchmove', pts(d), pts(d));
      }
      fire('touchend', [], pts(b!));
    },
    [d0, d1],
  );
}
async function drag(page: Page, dx: number) {
  await page.getByTestId('mushaf-livre').evaluate((el, d) => {
    const r = el.getBoundingClientRect();
    const y = Math.max(r.top, 0) + 300;
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
    for (let i = 1; i <= 8; i++) fire('touchmove', x0 + (d * i) / 8);
    fire('touchend', x0 + d, true);
  }, dx);
}

test.describe('C. zoom au doigt : habillage masqué, flèches hors du texte, glisser d’un bord à l’autre', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone');
  test('portrait 412 : pincement', async ({ page }) => {
    await page.setViewportSize(TEL);
    await openPage(page, 3);
    await expect.poll(() => epure(page), { timeout: 8000 }).toBe(true);
    await pinch(page, 80, 240);
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.5);
    // l'habillage reste masqué, même après un toucher au milieu de la page
    await page.waitForTimeout(400);
    expect(await epure(page)).toBe(true);
    const b = (await page.getByTestId('mushaf-livre').boundingBox())!;
    // un toucher sur le texte agrandi : le menu du verset (s'il y a un verset dessous), jamais l'habillage
    await page.touchscreen.tap(b.x + b.width / 2, Math.max(b.y, 0) + 300);
    await page.waitForTimeout(600);
    if (await page.getByTestId('menu-verset').isVisible()) {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('menu-verset')).toBeHidden();
    }
    await page.waitForTimeout(300);
    expect(await epure(page)).toBe(true);
    for (const sel of ['header.top', '[data-testid="barre-coran"]', '[data-testid="mp-suiv"]'])
      expect(
        await page
          .locator(sel)
          .evaluate(
            (e) => getComputedStyle(e).opacity === '0' || getComputedStyle(e).display === 'none',
          ),
        sel,
      ).toBe(true);
    // glisser vers la droite jusqu'au bout : le bord GAUCHE de la page est atteint ; puis vers la gauche
    for (let i = 0; i < 6; i++) await drag(page, 160);
    let e = await page.evaluate(() => {
      const book = document.querySelector('[data-testid="mushaf-livre"]')!.getBoundingClientRect();
      const z = document.querySelector('[data-testid="zoom-page-cadre"]')!.getBoundingClientRect();
      return { book: [book.left, book.right], z: [z.left, z.right] };
    });
    expect(e.z[0], JSON.stringify(e)).toBeGreaterThanOrEqual(e.book[0] - 1.5);
    for (let i = 0; i < 12; i++) await drag(page, -160);
    e = await page.evaluate(() => {
      const book = document.querySelector('[data-testid="mushaf-livre"]')!.getBoundingClientRect();
      const z = document.querySelector('[data-testid="zoom-page-cadre"]')!.getBoundingClientRect();
      return { book: [book.left, book.right], z: [z.left, z.right] };
    });
    expect(e.z[1], JSON.stringify(e)).toBeLessThanOrEqual(e.book[1] + 1.5);
    // le cadre du livre occupe toute la largeur de l'écran (rien de coupé par une marge inutile)
    expect(e.book[0]).toBeLessThanOrEqual(16.5);
    expect(e.book[1]).toBeGreaterThanOrEqual(TEL.width - 16.5);
    await page.keyboard.press('0');
  });
});
