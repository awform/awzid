import type { Page } from '@playwright/test';
import { close, EXACT_ON, expectVerse, openDisplay, setTajwid, verseOf } from './coran';
import { expect, test } from './fixtures';

/**
 * Muṣḥaf PAR PAGE (vue « page » de l'écran de lecture unique, Coran épuré) : pages du Muṣḥaf de Médine, double
 * page sur ordinateur, une page sur téléphone, cadre orné, Ḥafṣ par défaut (autres riwāyāt : a8.spec.ts).
 * Texte Tanzil jamais modifié.
 */
const verseTexts = (page: Page, root = 'mushaf-livre') =>
  page
    .locator(`[data-testid="${root}"] .quran-text`)
    .evaluateAll((els) =>
      els.map(
        (e) => `${e.getAttribute('data-verse') ?? e.getAttribute('data-basmala')}|${e.textContent}`,
      ),
    );
const isMobile = (name: string) => name.startsWith('mobile');

test('pages du Muṣḥaf : double page (ordinateur) ou une page, cadre, versets exacts, flèches', async ({
  page,
}, info) => {
  await page.goto('/coran/lecteur?page=1&vue=page');
  const pages = page.getByTestId('mushaf-page');
  // page fluide : texte visible ; page exacte (A34) : texte Tanzil accessible, à l'identique
  await expectVerse(page, '1:7');
  if (isMobile(info.project.name)) await expect(pages).toHaveCount(1);
  else {
    await expect(pages).toHaveCount(2);
    await expectVerse(page, '2:5');
    const [r, l] = await pages.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
    expect(r!).toBeGreaterThan(l!);
  }
  await expect(pages.first().locator('svg.frame')).toHaveCount(1);
  await expect(pages.first().locator('svg.rosette')).toHaveCount(4);
  await expect(page.locator('[data-page="1"] :is([data-verse], [data-exact-verse])')).toHaveCount(
    7,
  );
  for (const id of ['mp-suiv', 'mp-prec']) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.height, id).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId('mp-suiv').click();
  await expect(
    page.locator(isMobile(info.project.name) ? '[data-page="2"]' : '[data-page="3"]'),
  ).toBeVisible();
  if (!isMobile(info.project.name)) {
    await page.keyboard.press('ArrowLeft'); // livre arabe : la flèche gauche avance
    await expect(page.locator('[data-page="5"]')).toBeVisible();
  }
});

test('texte Tanzil identique dans les deux vues ; tajwid sans changer le texte ; Ḥafṣ par défaut', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?s=2&vue=versets');
  await expect(page.locator('[data-verse="2:255"]')).toBeVisible();
  const versets = await page.locator('[data-verse="2:255"]').textContent();
  await page.goto('/coran/lecteur?s=2&a=255&vue=page');
  const livre = page.getByTestId('mushaf-livre');
  await expectVerse(page, '2:255', livre);
  // page fluide : même texte que la vue « versets » ; page exacte : texte Tanzil accessible (expectVerse)
  if (!(await verseOf(livre, '2:255').getAttribute('data-exact-verse')))
    expect(await verseOf(livre, '2:255').textContent()).toBe(versets);
  await expect(page.locator('[data-page="42"]')).toBeVisible();
  await expect(page.locator('[data-aya="2:255"]').first()).toHaveClass(/\bon\b/);
  await openDisplay(page);
  const warsh = page.getByTestId('choix-mushaf').locator('label:has([data-mushaf="warsh"])');
  await expect(warsh).toContainText('Warsh ʿan Nāfiʿ');
  await expect(page.getByTestId('choix-mushaf')).toHaveAttribute('data-value', 'hafs');
  // tajwid : sur notre muṣḥaf habituel (la page exacte n'a pas de couleurs) — comparaison sur la page fluide
  if (EXACT_ON) await page.locator('label:has([data-style="fluide"])').click();
  await close(page);
  await expect(page.locator('[data-page="42"]')).not.toHaveAttribute('data-exact', '1');
  const before = await verseTexts(page);
  await setTajwid(page, true);
  await close(page);
  await expect(page.locator('[data-testid="mushaf-livre"] .tj').first()).toBeVisible();
  expect(await verseTexts(page)).toEqual(before);
  await setTajwid(page, false);
  await close(page);
  await expect(page.locator('[data-testid="mushaf-livre"] .tj')).toHaveCount(0);
  if (EXACT_ON) {
    await openDisplay(page);
    await page.locator('label:has([data-style="exact"])').click();
    await close(page);
  }
});

test('options : mémoriser (voile, voir), lecture seule, une page', async ({ page }, info) => {
  await page.goto('/coran/lecteur?page=1&vue=page');
  await expectVerse(page, '1:7');
  await openDisplay(page);
  await page.locator('[data-mask="3"]').check({ force: true });
  await close(page);
  await expect(page.locator('[data-page="1"] .w.voile').first()).toBeVisible();
  expect(await page.locator('[data-verse="1:2"] .w.voile').count()).toBeGreaterThan(0);
  await page.locator('[data-aya="1:2"]').click();
  await page.getByTestId('menu-voir').click();
  await expect(page.locator('[data-verse="1:2"] .w.voile')).toHaveCount(0);
  await openDisplay(page);
  await page.locator('[data-mask="0"]').check({ force: true });
  await page.getByTestId('mp-lecture-seule').check();
  await close(page);
  await page.locator('[data-aya="1:3"]').first().click({ force: true });
  await expect(page.getByTestId('menu-verset')).toBeHidden();
  await expect(page.locator('[data-aya="1:3"]').first()).not.toHaveClass(/\bon\b/);
  await openDisplay(page);
  await page.getByTestId('mp-lecture-seule').uncheck();
  if (!isMobile(info.project.name)) {
    await page.getByTestId('mp-vue-mobile').check();
    await close(page);
    await expect(page.getByTestId('mushaf-page')).toHaveCount(1);
    await openDisplay(page);
    await page.getByTestId('mp-vue-mobile').uncheck();
    await close(page);
    await expect(page.getByTestId('mushaf-page')).toHaveCount(2);
  } else await close(page);
});
