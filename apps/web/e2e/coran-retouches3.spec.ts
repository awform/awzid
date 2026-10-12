import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { tanwinUndo } from '@awform/content/text';
import { EXACT_ON, listen, openSelector, tanzil } from './coran';
import { expect, test } from './fixtures';

/**
 * Lecteur du Coran — retouches 3 (essai du client, 12/10/2026, Xiaomi 412 × 915 et 915 × 412, Chrome Android) :
 * 1. la proposition « Écouter ici / Reprendre où j'étais / + » tient sur UNE ligne, ne chevauche ni la pastille
 *    d'écoute ni la ligne lue (surlignée), et se ferme seule après un choix ou un toucher ailleurs ;
 * 2. téléphone couché : la pastille « Verset N » est dans le coin bas gauche, compacte, dans une marge réservée
 *    (elle ne couvre jamais le texte) ;
 * 3. zoom au doigt : le glisser atteint les quatre bords de la page, y compris le bas et son numéro ;
 * 4. ۞ (début de ḥizb) en « Grand texte » : ornement dessiné (aria-hidden), plus d'astérisque ; texte Tanzil
 *    intact (octet par octet).
 * Captures : CORAN_R3_CAPTURES=<dossier>, CORAN_R3_ETAT=avant|apres.
 */
const CAP = process.env.CORAN_R3_CAPTURES;
const ETAT = process.env.CORAN_R3_ETAT ?? 'apres';
const PAYSAGE = { width: 915, height: 412 };
const PORTRAIT = { width: 412, height: 915 };
const VUES = [
  ['portrait 412 × 915', PORTRAIT],
  ['paysage 915 × 412', PAYSAGE],
] as const;

type Box = { top: number; bottom: number; left: number; right: number };
const croise = (a: Box, b: Box) =>
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5 &&
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5;
const epure = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-epure'));

async function openPage(page: Page, n: number) {
  await page.goto(`/coran/lecteur?page=${n}&vue=page`);
  const art = page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`);
  if (EXACT_ON) await expect(art).toHaveAttribute('data-exact', '1', { timeout: 15_000 });
  else await expect(art).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  return art;
}

/** Écoute lancée (pastille ou barre), puis « Aller » au verset `a` de la sourate affichée PENDANT la lecture. */
async function propositionPendantLecture(page: Page, a: number) {
  await openPage(page, 1);
  await listen(page);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-testid="pastille-jouer"]')
              ?.getAttribute('aria-pressed') === 'true' ||
            document.querySelector('[data-testid="jouer"]')?.getAttribute('aria-pressed') ===
              'true',
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await openSelector(page);
  await page.getByTestId('sel-verset').fill(String(a));
  await page.getByTestId('sel-verset-aller').click();
  await expect(page.getByTestId('proposition')).toBeVisible();
  await expect(page.getByTestId('reprendre-lecture')).toBeVisible();
}

/** Boîtes : proposition, ses boutons, pastille, lignes du verset surligné (une boîte par ligne). */
const mesures = (page: Page, key: string) =>
  page.evaluate((key) => {
    const bx = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const vu = (el: Element | null) => {
      for (let x = el; x; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)
          return false;
      }
      return !!el;
    };
    const ligne = document.querySelector(`[data-testid="mushaf-livre"] [data-aya="${key}"]`);
    const lignes = ligne
      ? [...ligne.getClientRects()]
          .filter((r) => r.width > 4 && r.height > 4)
          .map((r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right }))
      : [];
    const pastille = document.querySelector('[data-testid="pastille-audio"]');
    const barre = document.querySelector('.ecoute.on');
    return {
      prop: bx(document.querySelector('[data-testid="proposition"]')),
      boutons: [...document.querySelectorAll('[data-testid="proposition"] button')].map(bx),
      pastille: vu(pastille) ? bx(pastille) : null,
      barre: vu(barre) ? bx(barre) : null,
      lignes,
      surligne: !!ligne?.classList.contains('on'),
      W: innerWidth,
      H: innerHeight,
    };
  }, key);

async function verifierProposition(page: Page, key: string) {
  const m = await mesures(page, key);
  const j = JSON.stringify(m);
  expect(m.prop, j).not.toBeNull();
  // une seule ligne : tous les boutons à la même hauteur, la bulle pas plus haute qu'un bouton (+ bordure)
  const tops = m.boutons.map((b) => b!.top);
  expect(Math.max(...tops) - Math.min(...tops), j).toBeLessThanOrEqual(2);
  expect(m.prop!.bottom - m.prop!.top, j).toBeLessThanOrEqual(72);
  // dans l'écran
  expect(m.prop!.left, j).toBeGreaterThanOrEqual(0);
  expect(m.prop!.right, j).toBeLessThanOrEqual(m.W);
  expect(m.prop!.bottom, j).toBeLessThanOrEqual(m.H);
  // ni la pastille, ni la barre audio, ni la ligne lue
  if (m.pastille) expect(croise(m.prop!, m.pastille), j).toBe(false);
  if (m.barre) expect(croise(m.prop!, m.barre), j).toBe(false);
  expect(m.lignes.length, j).toBeGreaterThan(0);
  for (const l of m.lignes) {
    expect(croise(m.prop!, l), j).toBe(false);
    if (m.pastille) expect(croise(m.pastille, l), j).toBe(false);
  }
}

test.describe('retouches 3 : proposition, pastille, zoom, ۞', () => {
  test.skip(({ isMobile }) => !isMobile, 'essai du client : téléphone');

  for (const [nom, vp] of VUES) {
    test(`1. ${nom} : proposition sur une ligne, sans chevauchement, fermée après un choix`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      // 1:7 : dernier verset de la page 1, au BAS de l'écran (pire cas de la capture du client)
      await propositionPendantLecture(page, 7);
      await expect(page.locator('[data-testid="mushaf-livre"] [data-aya="1:7"].on')).toBeAttached();
      await expect
        .poll(async () => {
          const m = await mesures(page, '1:7');
          return !!m.prop && m.lignes.every((l) => !croise(m.prop!, l));
        })
        .toBe(true);
      await verifierProposition(page, '1:7');
      // commandes cachées (pastille seule) : toujours sans chevauchement
      await expect.poll(() => epure(page), { timeout: 5000 }).toBe(true);
      await expect(page.getByTestId('pastille-audio')).toBeVisible();
      await expect(page.getByTestId('proposition')).toBeVisible();
      await verifierProposition(page, '1:7');
      // chaque bouton a un nom
      for (const id of ['ecouter-ici', 'reprendre-lecture', 'ici-actions'])
        await expect(page.getByTestId(id)).toHaveAccessibleName(/\S/);
      // un choix la ferme
      await page.getByTestId('reprendre-lecture').click();
      await expect(page.getByTestId('proposition')).toHaveCount(0);
    });

    test(`1 bis. ${nom} : proposition fermée par un toucher ailleurs`, async ({ page }) => {
      await page.setViewportSize(vp);
      await propositionPendantLecture(page, 3);
      const art = (await page.locator('[data-testid="mushaf-page"][data-page="1"]').boundingBox())!;
      await page.touchscreen.tap(art.x + art.width / 2, Math.max(art.y, 0) + 30);
      await expect(page.getByTestId('proposition')).toHaveCount(0);
    });
  }

  test('2. paysage : pastille compacte dans le coin bas gauche, dans une marge réservée', async ({
    page,
  }) => {
    await page.setViewportSize(PAYSAGE);
    await openPage(page, 1);
    await listen(page);
    const pill = page.getByTestId('pastille-audio');
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('pastille-jouer').click();
    await expect(page.getByTestId('pastille-jouer')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
    await expect(page.getByTestId('pastille-ouvrir')).toHaveAccessibleName(/\S/);
    await expect(page.getByTestId('pastille-ouvrir')).toContainText(/\d/);
    // à chaque hauteur de défilement : aucune ligne de texte sous la pastille
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= H; y += 150) {
      await page.evaluate((y) => scrollTo(0, y), y);
      const r = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="pastille-audio"]')!.getBoundingClientRect();
        const pb = { top: p.top, bottom: p.bottom, left: p.left, right: p.right };
        const mots = [
          ...document.querySelectorAll(
            '[data-testid="mushaf-livre"] .w, [data-testid="mushaf-livre"] .n, [data-testid="mushaf-livre"] [data-testid="page-n"]',
          ),
        ]
          .flatMap((e) => [...e.getClientRects()])
          .filter((b) => b.width > 1 && b.height > 1)
          .map((b) => ({ top: b.top, bottom: b.bottom, left: b.left, right: b.right }));
        return { pb, mots, W: innerWidth, H: innerHeight };
      });
      // coin bas gauche, compacte
      expect(r.pb.left, JSON.stringify(r.pb)).toBeLessThanOrEqual(16);
      expect(r.H - r.pb.bottom, JSON.stringify(r.pb)).toBeLessThanOrEqual(16);
      expect(r.pb.right - r.pb.left, JSON.stringify(r.pb)).toBeLessThanOrEqual(64);
      const sous = r.mots.filter((m) => croise(r.pb, m));
      expect(sous, `y=${y} ${JSON.stringify(r.pb)}`).toEqual([]);
    }
  });

  for (const [nom, vp] of VUES) {
    test(`3. ${nom} : zoom au doigt, le glisser atteint les quatre bords et le numéro de page`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await openPage(page, 4);
      await expect.poll(() => epure(page), { timeout: 6000 }).toBe(true);
      await pincer(page, 2.4);
      await expect
        .poll(async () => Number(await page.getByTestId('mushaf-livre').getAttribute('data-zoom')))
        .toBeGreaterThan(2);
      const page4 = page.locator('[data-testid="mushaf-page"][data-page="4"]');
      const bord = async () => {
        const b = await page4.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const n = el.querySelector('[data-testid="page-n"]')!.getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            n: { top: n.top, bottom: n.bottom, left: n.left, right: n.right },
            W: innerWidth,
            H: innerHeight,
          };
        });
        return b;
      };
      // vers la gauche de la page (le doigt glisse vers la droite)
      await glisser(page, 1500, 0);
      let b = await bord();
      expect(b.left, JSON.stringify(b)).toBeGreaterThanOrEqual(-0.5);
      expect(b.left, JSON.stringify(b)).toBeLessThan(b.W / 2);
      // bord droit
      await glisser(page, -3000, 0);
      b = await bord();
      expect(b.right, JSON.stringify(b)).toBeLessThanOrEqual(b.W + 0.5);
      expect(b.right, JSON.stringify(b)).toBeGreaterThan(b.W / 2);
      // bas de la page : cadre et numéro de page visibles
      await glisser(page, 0, -6000);
      b = await bord();
      expect(b.bottom, JSON.stringify(b)).toBeLessThanOrEqual(b.H + 0.5);
      expect(b.bottom, JSON.stringify(b)).toBeGreaterThan(b.H / 2);
      expect(b.n.bottom, JSON.stringify(b)).toBeLessThanOrEqual(b.H);
      expect(b.n.top, JSON.stringify(b)).toBeGreaterThanOrEqual(0);
      // numéro de page (au milieu du bas de la page) amené au milieu de l'écran : visible, rien dessus
      await glisser(page, b.W / 2 - (b.n.left + b.n.right) / 2, 0);
      b = await bord();
      expect(b.n.left, JSON.stringify(b)).toBeGreaterThanOrEqual(0);
      expect(b.n.right, JSON.stringify(b)).toBeLessThanOrEqual(b.W);
      expect(b.n.bottom, JSON.stringify(b)).toBeLessThanOrEqual(b.H);
      const surNumero = await page.evaluate(() => {
        const n = document.querySelector('[data-page="4"] [data-testid="page-n"]')!;
        const r = n.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return !!hit && (n === hit || n.contains(hit));
      });
      expect(surNumero).toBe(true);
      // haut de la page
      await glisser(page, 0, 6000);
      b = await bord();
      expect(b.top, JSON.stringify(b)).toBeGreaterThanOrEqual(-0.5);
      expect(b.top, JSON.stringify(b)).toBeLessThan(b.H / 2);
    });
  }

  for (const [nom, vp] of VUES) {
    test(`4. ${nom} : ۞ dessiné en ornement (sans astérisque), texte Tanzil intact`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      // « Grand texte » : vue par versets
      await page.goto('/coran/lecteur?vue=versets&s=2&a=26');
      const v = page.locator('[data-testid="texte-coran"] [data-verse="2:26"]');
      await expect(v).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      const src = await tanzil(page, '2:26');
      expect(src.startsWith('۞ ')).toBe(true);
      // texte intact, octet par octet (le signe est gardé dans le texte, seulement remplacé à l'affichage ;
      // tanwīn affiché : inverse exacte, comme les autres contrôles « affiché = Tanzil »)
      const affiche = (await v.textContent())!;
      expect(affiche.startsWith('۞ ')).toBe(true);
      expect(tanwinUndo(affiche)).toBe(src);
      const orn = v.locator('.hizb svg');
      await expect(orn).toHaveCount(1);
      await expect(orn).toHaveAttribute('aria-hidden', 'true');
      await expect(orn).toBeVisible();
      const r = await v.locator('.hizb').evaluate((el) => {
        const s = el.querySelector('svg')!.getBoundingClientRect();
        const t = el.querySelector('.hizb-t')!;
        const tr = t.getBoundingClientRect();
        return { svg: s.width, glyphe: tr.width * tr.height, texte: t.textContent };
      });
      // l'ornement a une vraie taille ; le caractère source n'est plus dessiné (aucun « * »)
      expect(r.svg).toBeGreaterThan(12);
      expect(r.glyphe).toBeLessThanOrEqual(1);
      expect(r.texte).toBe('۞');
      // page fluide (page 5) : même ornement, même texte
      await page.goto('/coran/lecteur?page=5&vue=page');
      const pv = page.locator('[data-testid="mushaf-livre"] [data-verse="2:26"]');
      if (!EXACT_ON) {
        await expect(pv).toBeVisible({ timeout: 15_000 });
        expect(tanwinUndo((await pv.textContent())!)).toBe(src);
        await expect(pv.locator('.hizb svg[aria-hidden="true"]')).toHaveCount(1);
      }
    });
  }
});

/** Pincement (deux doigts) au milieu du cadre de la page : facteur `f`. */
async function pincer(page: Page, f: number) {
  await page.getByTestId('mushaf-livre').evaluate((el, f) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = Math.max(r.top, 0) + Math.min(r.height, innerHeight) / 3;
    const tt = (id: number, x: number) =>
      new Touch({ identifier: id, target: el, clientX: x, clientY: cy });
    const send = (type: string, xs: number[]) => {
      const ts = xs.map((x, i) => tt(i + 1, x));
      el.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : ts,
          changedTouches: ts,
          targetTouches: type === 'touchend' ? [] : ts,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    send('touchstart', [cx - 40, cx + 40]);
    for (let k = 1; k <= 5; k++)
      send('touchmove', [cx - 40 * (1 + ((f - 1) * k) / 5), cx + 40 * (1 + ((f - 1) * k) / 5)]);
    send('touchend', [cx - 40 * f, cx + 40 * f]);
  }, f);
}

/** Glisser d'un doigt sur la page zoomée (dx, dy en pixels, en plusieurs pas). */
async function glisser(page: Page, dx: number, dy: number) {
  await page.getByTestId('mushaf-livre').evaluate(
    (el, [dx, dy]) => {
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width / 2;
      const y0 = Math.max(r.top, 0) + Math.min(r.bottom, innerHeight) / 2 - Math.max(r.top, 0) / 2;
      const send = (type: string, x: number, y: number) => {
        const t = new Touch({ identifier: 9, target: el, clientX: x, clientY: y });
        el.dispatchEvent(
          new TouchEvent(type, {
            touches: type === 'touchend' ? [] : [t],
            changedTouches: [t],
            targetTouches: type === 'touchend' ? [] : [t],
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      send('touchstart', x0, y0);
      for (let k = 1; k <= 10; k++) send('touchmove', x0 + (dx * k) / 10, y0 + (dy * k) / 10);
      send('touchend', x0 + dx, y0 + dy);
    },
    [dx, dy] as const,
  );
  await page.waitForTimeout(100);
}

test.describe('captures retouches 3', () => {
  test.skip(!CAP, 'captures : CORAN_R3_CAPTURES non défini');
  test('captures 412 × 915 et 915 × 412, clair et sombre', async ({ page }, info) => {
    test.skip(!info.project.name.startsWith('mobile'), 'téléphone');
    test.setTimeout(400_000);
    mkdirSync(CAP!, { recursive: true });
    for (const [nom, vp] of [
      ['412x915', PORTRAIT],
      ['915x412', PAYSAGE],
    ] as const) {
      await page.setViewportSize(vp);
      for (const scheme of ['light', 'dark'] as const) {
        const sfx = scheme === 'light' ? 'clair' : 'sombre';
        const save = (n: string) =>
          page.screenshot({ path: join(CAP!, `${ETAT}-${nom}-${sfx}-${n}.png`) });
        await page.emulateMedia({ colorScheme: scheme });
        await openPage(page, 1);
        const mode = scheme === 'light' ? 'clair' : 'sombre';
        for (let i = 0; i < 3; i++) {
          const b = page.getByTestId('mode-affichage');
          if ((await b.getAttribute('data-mode')) === mode) break;
          await b.click({ force: true });
        }
        // 1. proposition pendant la lecture (Aller à 1:7)
        await propositionPendantLecture(page, 7).catch(() => {});
        await page.waitForTimeout(400);
        await save('1-proposition-commandes');
        await expect
          .poll(() => epure(page), { timeout: 5000 })
          .toBe(true)
          .catch(() => {});
        await page.waitForTimeout(200);
        await save('1-proposition-pastille');
        // 2. pastille seule (lecture en pause)
        await page.waitForTimeout(3000);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(300);
        await save('2-pastille');
        // 3. zoom au doigt, en bas de la page
        await openPage(page, 4);
        await expect
          .poll(() => epure(page), { timeout: 6000 })
          .toBe(true)
          .catch(() => {});
        await pincer(page, 2.4).catch(() => {});
        await glisser(page, 0, -6000).catch(() => {});
        await page.waitForTimeout(300);
        await save('3-zoom-bas');
        // 4. ۞ en « Grand texte »
        await page.goto('/coran/lecteur?vue=versets&s=2&a=26');
        await page
          .locator('[data-testid="texte-coran"] [data-verse="2:26"]')
          .waitFor({ timeout: 15_000 })
          .catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        await page
          .locator('[data-testid="texte-coran"] [data-aya="26"]')
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await page.waitForTimeout(800);
        await save('4-hizb-grand-texte');
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });
});
