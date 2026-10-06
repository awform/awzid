import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { close } from './coran';
import { expect, test } from './fixtures';

/**
 * A34 — Muṣḥaf de Médine « à l'identique » dans le lecteur unique (`/coran/lecteur`), mode PARTIEL : une page
 * publiée (copie Content Sync du SERVEUR, ~/awform-data/qf-mushaf, + polices QCF du Complexe) s'affiche en
 * 15 lignes exactes dans le cadre commun ; une page non publiée garde la mise en page fluide. Lancé avec
 * E2E_MUSHAF_EXACT=1 sur la VM (données jamais dans le dépôt) ; sauté sinon.
 * Captures : A34_CAPTURES=<dossier>.
 */
const ON = process.env.E2E_MUSHAF_EXACT_ON === '1';
const CAP = process.env.A34_CAPTURES;
const mobile = (name: string) => name.startsWith('mobile');

async function exactPage(page: Page, n: number) {
  const art = page.locator(`[data-testid="mushaf-page"][data-page="${n}"]`);
  await expect(art).toHaveAttribute('data-exact', '1', { timeout: 15_000 });
  return art;
}

test.describe('A34 — mise en page exacte (partielle)', () => {
  test.skip(!ON, 'données Content Sync absentes (E2E_MUSHAF_EXACT=1 et ~/awform-data requis)');

  test('page publiée : 15 lignes exactes, crédit ; page non publiée : mise en page fluide', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=3');
    const art = await exactPage(page, 3);
    await expect(art.locator('[data-testid="page-exacte"] .ligne')).toHaveCount(15);
    // glyphes : police de la page chargée (QCF_P003), jamais de texte Tanzil visible à la place
    expect(await page.evaluate(() => document.fonts.check('20px QCF_P003', 'ﭑ'))).toBe(true);
    // texte de référence Tanzil pour lecteurs d'écran : un bouton par verset
    await expect(art.locator('[data-exact-verse="2:6"]')).toHaveCount(1);
    await page.getByTestId('infos-texte').click();
    await expect(page.getByTestId('credit-exact')).toContainText('Quran Foundation');
    await close(page);
    // page 604 : publiée (copie complète, production) → exacte ; sinon (prélancement) → page fluide, sans message
    const etat = await (await page.request.get('/api/v1/quran/mushaf-exact')).json();
    await page.goto('/coran/lecteur?page=604');
    if (etat.partiel && !etat.pages?.includes(604)) {
      await expect(page.locator('[data-page="604"] [data-verse="112:1"]')).toBeVisible();
      await expect(page.locator('[data-page="604"]')).not.toHaveAttribute('data-exact', '1');
    } else {
      const p604 = await exactPage(page, 604);
      await expect(p604.locator('[data-testid="page-exacte"] .ligne')).toHaveCount(15);
    }
  });

  test('toucher un verset : menu du verset et surlignage, comme sur la page fluide', async ({
    page,
  }) => {
    await page.goto('/coran/lecteur?page=3');
    const art = await exactPage(page, 3);
    const g = art.locator('[data-aya="2:6"]').first();
    await g.click();
    await expect(page.getByTestId('menu-verset')).toBeVisible();
    await expect(art.locator('[data-aya="2:6"].on').first()).toBeVisible();
    // tous les glyphes du verset sont surlignés, aucun autre
    const on = await art
      .locator('.on')
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-aya')))]);
    expect(on).toEqual(['2:6']);
    await close(page);
  });

  test('grand écran : traduction à gauche ; téléphone : glisser pour tourner (pages exactes)', async ({
    page,
  }, info) => {
    await page.goto('/coran/lecteur?page=3');
    await exactPage(page, 3);
    if (mobile(info.project.name)) {
      const swipe = (dx: number) =>
        page.getByTestId('mushaf-livre').evaluate((el, d) => {
          const r = el.getBoundingClientRect();
          const y = r.top + 100;
          const x0 = r.left + r.width / 2;
          const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
          el.dispatchEvent(
            new TouchEvent('touchstart', { touches: [t(x0)], changedTouches: [t(x0)] }),
          );
          el.dispatchEvent(
            new TouchEvent('touchend', { touches: [], changedTouches: [t(x0 + d)] }),
          );
        }, dx);
      await swipe(120);
      await exactPage(page, 4);
      await swipe(-120);
      await exactPage(page, 3);
      // 375 px : la puce montre « v. … · p. 3 · juzʾ 1 » en entier, sans débordement horizontal
      await page.setViewportSize({ width: 375, height: 800 });
      const puce = page.getByTestId('puce');
      await expect(puce).toContainText('juzʾ 1');
      const cut = await puce.locator('.cd').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(cut).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } else {
      const panel = page.locator('aside[data-testid="mp-panneau-traduction"]');
      if (!(await panel.isVisible())) await page.getByTestId('mp-trad').click();
      await expect(panel.locator('[data-trad="2:6"]')).toBeVisible();
      await exactPage(page, 3);
    }
  });

  test('page qui finit par l’en-tête de la sourate suivante (copie complète) : 15 lignes, basmala en tête de la suivante', async ({
    page,
  }) => {
    const etat = await (await page.request.get('/api/v1/quran/mushaf-exact')).json();
    test.skip(!!etat.partiel && !etat.pages?.includes(77), 'pages 76-77 non publiées');
    await page.goto('/coran/lecteur?page=76');
    const p76 = await exactPage(page, 76);
    const last = p76.locator('[data-testid="page-exacte"] .ligne').last();
    await expect(last).toHaveAttribute('data-sura-start', '4');
    await page.goto('/coran/lecteur?page=77');
    const p77 = await exactPage(page, 77);
    await expect(p77.locator('[data-testid="page-exacte"] .ligne').first()).toHaveClass(/basmala/);
  });

  test('captures : page exacte, clair et sombre', async ({ page }, info) => {
    test.skip(!CAP, 'A34_CAPTURES non défini');
    mkdirSync(CAP!, { recursive: true });
    const w = mobile(info.project.name) ? 375 : 1366;
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: mobile(info.project.name) ? 812 : 900 });
      const list = (process.env.A34_PAGES ?? '2,3').split(',').map(Number);
      for (const n of list) {
        await page.goto(`/coran/lecteur?page=${n}`);
        await exactPage(page, n);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        await page.screenshot({
          path: join(
            CAP!,
            `${mobile(info.project.name) ? 'mobile-375' : 'bureau'}-p${n}-${scheme === 'light' ? 'clair' : 'sombre'}.png`,
          ),
          fullPage: true,
        });
      }
    }
  });
});
