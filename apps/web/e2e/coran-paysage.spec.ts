import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { close, EXACT_ON, listen } from './coran';
import { expect, test } from './fixtures';

/**
 * Lecteur du Coran, TÉLÉPHONE COUCHÉ (essai du client, 12/10/2026, Xiaomi, Chrome Android ≈ 915 × 412) :
 * 1. l'habillage ne mange plus l'écran : en-tête compact sur une ligne (≤ 44 px), barre d'onglets du bas
 *    masquée, emplacement replié en une puce, barre audio réduite à la pastille ; le texte occupe ≥ 75 % de la
 *    hauteur, commandes montrées ou non ;
 * 2. le menu d'un verset est entièrement visible (panneau latéral, défilable, au-dessus de toute barre) ;
 * 3. jamais d'en-tête ni de barre semi-transparents par-dessus le texte (opaques ou absents, aucun fondu).
 * Captures : CORAN_PAYSAGE_CAPTURES=<dossier>, CORAN_PAYSAGE_ETAT=avant|apres (915 × 412 et 412 × 915,
 * clair et sombre).
 */
const CAP = process.env.CORAN_PAYSAGE_CAPTURES;
const ETAT = process.env.CORAN_PAYSAGE_ETAT ?? 'apres';
const PAYSAGE = { width: 915, height: 412 };
const PORTRAIT = { width: 412, height: 915 };
/** dernier verset de la page (au bas : le pire cas pour un menu qui s'ouvrirait dessous) */
const dernierVerset = (page: Page) =>
  page.locator('[data-testid="mushaf-livre"] [data-aya]:not([data-aya$=":0"])').last();
const epure = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-epure'));

async function openPage(page: Page, n: number) {
  await page.goto(`/coran/lecteur?page=${n}&vue=page`);
  const art = page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`);
  if (EXACT_ON) await expect(art).toHaveAttribute('data-exact', '1', { timeout: 15_000 });
  else await expect(art).toBeVisible();
  await expect(page.getByTestId('barre-coran')).toBeAttached();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  return art;
}

/**
 * Hauteur laissée au texte : l'écran moins ce que couvrent en haut et en bas les barres VISIBLES (en-tête,
 * barre du lecteur, barre d'onglets, barre audio) ; la pastille d'écoute, petite et centrée, n'est pas une barre.
 */
const zoneTexte = (page: Page) =>
  page.evaluate(() => {
    const H = innerHeight;
    let haut = 0;
    let bas = 0;
    const vu = (el: Element) => {
      for (let x: Element | null = el; x; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)
          return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H;
    };
    for (const sel of ['header.top', 'nav.tabs', '[data-testid="barre-coran"]', '.ecoute.on']) {
      const el = document.querySelector(sel);
      if (!el || !vu(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < H / 2) haut = Math.max(haut, r.bottom);
      else bas = Math.max(bas, H - r.top);
    }
    return { part: (H - haut - bas) / H, haut, bas, H };
  });

/** Montre les commandes comme au doigt (toucher sous la page, hors verset). */
async function montrer(page: Page) {
  if (!(await epure(page))) return;
  await page.getByTestId('afficher-commandes').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => epure(page)).toBe(false);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.describe('lecteur en paysage (téléphone couché 915 × 412)', () => {
  test.skip(({ isMobile }) => !isMobile, 'essai du client : téléphone');
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PAYSAGE);
  });

  test('1. habillage compact : en-tête ≤ 44 px, sans onglets du bas, puce repliée, texte ≥ 75 % de la hauteur', async ({
    page,
  }) => {
    await openPage(page, 4);
    expect(await page.evaluate(() => matchMedia('(orientation: landscape)').matches)).toBe(true);
    // commandes montrées (pire cas)
    expect(await epure(page)).toBe(false);
    const top = (await page.locator('header.top').boundingBox())!;
    expect(top.height).toBeLessThanOrEqual(44);
    // chaque bouton de l'en-tête garde son nom écrit
    for (const id of ['mode-affichage', 'lien-telecharger', 'lien-compte']) {
      const b = page.getByTestId(id);
      if (await b.count()) await expect(b.locator('.ic-nom')).toBeVisible();
    }
    // barre d'onglets : masquée dans le lecteur couché
    await expect(page.locator('nav.tabs')).toBeHidden();
    // emplacement replié (puce), pas de rangée de sélecteurs dorés ; barre du lecteur sur une ligne
    await expect(page.getByTestId('puce')).toBeVisible();
    await expect(page.getByTestId('barre-sourate')).toBeHidden();
    const cbar = (await page.getByTestId('barre-coran').boundingBox())!;
    expect(cbar.height).toBeLessThanOrEqual(56);
    // libellés écrits des outils
    await expect(page.getByTestId('ouvrir-reglages-lecteur')).toContainText(/\S/);
    const z = await zoneTexte(page);
    expect(z.part, JSON.stringify(z)).toBeGreaterThanOrEqual(0.75);
    // commandes cachées : tout l'écran au texte
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    expect((await zoneTexte(page)).part).toBeGreaterThanOrEqual(0.99);
    // la page commence en haut de l'écran
    const pageTop = await page
      .getByTestId('mushaf-page')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(pageTop).toBeLessThanOrEqual(2);
  });

  test('2. menu d’un verset : entièrement visible, rien sous une barre, défilable', async ({
    page,
  }) => {
    await openPage(page, 4);
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    // verset au bas de la page (le pire cas : le menu ne doit pas sortir par le bas)
    const v = dernierVerset(page);
    await v.scrollIntoViewIfNeeded();
    await v.tap();
    const menu = page.getByTestId('menu-verset');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('menu-ecouter')).toBeVisible();
    const r = await menu.evaluate((d) => {
      const b = d.getBoundingClientRect();
      const items = [...d.querySelectorAll('li > button, li > a')].map((el) => {
        el.scrollIntoView({ block: 'nearest' });
        const x = el.getBoundingClientRect();
        const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        return {
          id: el.getAttribute('data-testid'),
          top: x.top,
          bottom: x.bottom,
          dessus: !!hit && d.contains(hit),
        };
      });
      return {
        top: b.top,
        bottom: b.bottom,
        H: innerHeight,
        scrollable: getComputedStyle(d).overflowY,
        items,
      };
    });
    expect(r.top, JSON.stringify(r)).toBeGreaterThanOrEqual(0);
    expect(r.bottom, JSON.stringify(r)).toBeLessThanOrEqual(r.H);
    expect(['auto', 'scroll']).toContain(r.scrollable);
    expect(r.items.length).toBeGreaterThanOrEqual(4);
    for (const it of r.items) {
      expect(it.top, JSON.stringify(it)).toBeGreaterThanOrEqual(0);
      expect(it.bottom, JSON.stringify(it)).toBeLessThanOrEqual(r.H);
      expect(it.dessus, JSON.stringify(it)).toBe(true);
    }
    // le dernier choix (Partager) se touche
    await expect(page.getByTestId('menu-partager')).toBeInViewport({ ratio: 1 });
    await close(page);
    await expect(menu).toBeHidden();
  });

  test('3. aucun en-tête semi-transparent : opaque ou absent, sans fondu', async ({ page }) => {
    await openPage(page, 4);
    // montrées : opaques
    for (const sel of ['header.top', '[data-testid="barre-coran"]'])
      expect(await page.locator(sel).evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    // aucune transition d'opacité (un fondu laisse un fantôme au-dessus des versets)
    for (const sel of ['header.top', '[data-testid="barre-coran"]', 'nav.tabs']) {
      const tr = await page
        .locator(sel)
        .evaluate(
          (e) =>
            getComputedStyle(e).transitionProperty + '|' + getComputedStyle(e).transitionDuration,
        );
      const [props, durs] = tr.split('|');
      const list = props!.split(',').map((x) => x.trim());
      const ds = durs!.split(',').map((x) => parseFloat(x));
      list.forEach((p, i) => {
        if (p === 'opacity' || p === 'all') expect(ds[i % ds.length], `${sel} : ${tr}`).toBe(0);
      });
    }
    // cachées : immédiatement absentes (aucun état intermédiaire)
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    const etat = await page.evaluate(() =>
      ['header.top', '[data-testid="barre-coran"]'].map(
        (s) => getComputedStyle(document.querySelector(s)!).opacity,
      ),
    );
    expect(etat).toEqual(['0', '0']);
    // défilement : rien de l'en-tête au-dessus du texte
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(100);
    const fant = await page.evaluate(() => {
      const h = document.querySelector('header.top')!;
      return getComputedStyle(h).opacity;
    });
    expect(fant).toBe('0');
    // un toucher les remontre, opaques d'un coup
    await montrer(page);
    expect(await page.locator('header.top').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  });

  test('4. écoute : barre audio réduite à la pastille (lecture/pause + verset), commandes montrées ou non', async ({
    page,
  }) => {
    await openPage(page, 604);
    await listen(page);
    const pill = page.getByTestId('pastille-audio');
    await expect(pill).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('pastille-jouer')).toHaveAccessibleName(/\S/);
    await expect(page.getByTestId('mini-barre')).toBeHidden();
    await montrer(page);
    await expect(pill).toBeVisible();
    const z = await zoneTexte(page);
    expect(z.part, JSON.stringify(z)).toBeGreaterThanOrEqual(0.75);
    await page.getByTestId('pastille-jouer').click();
    await expect(page.getByTestId('pastille-jouer')).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * Capture du client (12/10/2026, page 1, portrait 412 px) : la pastille « ⏸ Verset 1 » cachait le numéro de
 * page en bas du cadre. En fin de défilement, ni le numéro de page ni le dernier verset ne sont sous la pastille.
 */
async function pastilleSansChevauchement(page: Page) {
  await openPage(page, 1);
  await listen(page);
  const pill = page.getByTestId('pastille-audio');
  await expect(pill).toBeVisible({ timeout: 10_000 });
  // pause (la vue ne suit plus la récitation), puis tout en bas
  await page.getByTestId('pastille-jouer').click();
  await expect(page.getByTestId('pastille-jouer')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  await expect(pill).toBeVisible();
  const r = await page.evaluate(() => {
    const box = (sel: string) => {
      const els = [...document.querySelectorAll(sel)];
      const el = els[els.length - 1];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    };
    return {
      pastille: box('[data-testid="pastille-audio"]'),
      numero: box('[data-page="1"] [data-testid="page-n"]'),
      verset: box('[data-testid="mushaf-livre"] [data-aya]:not([data-aya$=":0"])'),
      H: innerHeight,
    };
  });
  expect(r.pastille, JSON.stringify(r)).not.toBeNull();
  expect(r.numero, JSON.stringify(r)).not.toBeNull();
  const croise = (
    a: { top: number; bottom: number; left: number; right: number },
    b: { top: number; bottom: number; left: number; right: number },
  ) => a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
  expect(croise(r.pastille!, r.numero!), JSON.stringify(r)).toBe(false);
  if (r.verset) expect(croise(r.pastille!, r.verset), JSON.stringify(r)).toBe(false);
  // marge : le numéro de page finit au moins 16 px au-dessus de la pastille
  expect(r.numero!.bottom, JSON.stringify(r)).toBeLessThanOrEqual(r.pastille!.top - 16 + 0.5);
}

test.describe('pastille d’écoute et fin de page', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone');
  test('paysage 915 × 412 : la pastille ne couvre ni le numéro de page ni le dernier verset', async ({
    page,
  }) => {
    await page.setViewportSize(PAYSAGE);
    await pastilleSansChevauchement(page);
  });
  test('portrait 412 × 915 : la pastille ne couvre ni le numéro de page ni le dernier verset', async ({
    page,
  }) => {
    await page.setViewportSize(PORTRAIT);
    await pastilleSansChevauchement(page);
  });
});

test.describe('captures paysage et portrait', () => {
  test.skip(!CAP, 'captures : CORAN_PAYSAGE_CAPTURES non défini');
  test('captures 915 × 412 et 412 × 915, clair et sombre', async ({ page }, info) => {
    test.skip(!info.project.name.startsWith('mobile'), 'téléphone');
    test.setTimeout(300_000);
    mkdirSync(CAP!, { recursive: true });
    for (const [nom, vp] of [
      ['915x412', PAYSAGE],
      ['412x915', PORTRAIT],
    ] as const) {
      await page.setViewportSize(vp);
      for (const scheme of ['light', 'dark'] as const) {
        const sfx = scheme === 'light' ? 'clair' : 'sombre';
        const save = (n: string) =>
          page.screenshot({ path: join(CAP!, `${ETAT}-${nom}-${sfx}-${n}.png`) });
        await page.emulateMedia({ colorScheme: scheme });
        await openPage(page, 4);
        const mode = scheme === 'light' ? 'clair' : 'sombre';
        for (let i = 0; i < 3; i++) {
          const b = page.getByTestId('mode-affichage');
          if ((await b.getAttribute('data-mode')) === mode) break;
          await b.click({ force: true });
        }
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await openPage(page, 4);
        await page.waitForTimeout(300);
        await save('p4-commandes');
        await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
        await page.waitForTimeout(400);
        await save('p4-texte');
        // pages 2 et 3 : signes de pause sur la ligne de leur mot
        for (const n of [2, 3]) {
          await openPage(page, n);
          await expect.poll(() => epure(page), { timeout: 8000 }).toBe(true);
          await page.waitForTimeout(300);
          await save(`p${n}-texte`);
        }
        await openPage(page, 4);
        await expect.poll(() => epure(page), { timeout: 8000 }).toBe(true);
        const v = dernierVerset(page);
        await v.scrollIntoViewIfNeeded();
        await v.tap();
        await expect(page.getByTestId('menu-verset')).toBeVisible();
        await page.waitForTimeout(400);
        await save('p4-menu-verset');
        await close(page);
        await openPage(page, 604);
        await listen(page);
        await expect(page.getByTestId('pastille-jouer'))
          .toBeVisible({ timeout: 8000 })
          .catch(() => {});
        await page
          .getByTestId('pastille-jouer')
          .click({ timeout: 4000 })
          .catch(() => {});
        await page.waitForTimeout(500);
        await save('p604-ecoute');
        await page.evaluate(() => scrollTo(0, 0));
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });
});
