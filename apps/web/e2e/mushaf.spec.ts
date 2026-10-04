import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Muṣḥaf PAR PAGE (ergonomie d'Ayat, aucun contenu d'Ayat) : pages du Muṣḥaf de Médine, double page sur
 * ordinateur, une page avec balayage sur téléphone, cadre orné, choix du muṣḥaf (Warsh désactivé), traduction
 * du sens QuranEnc à côté (verset en cours surligné), barre de commandes, options. Texte Tanzil jamais modifié.
 * Captures seulement avec MUSHAF_CAPTURES=<dossier> (ex. reports/mushaf-pages).
 */
const CAP = process.env.MUSHAF_CAPTURES;
async function shot(page: Page, name: string, project: string) {
  if (!CAP) return;
  mkdirSync(CAP, { recursive: true });
  await page.waitForTimeout(400); // fin des transitions légères (apparition des pages)
  await page.screenshot({ path: join(CAP, `${project}-${name}.png`), fullPage: true });
}
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
const verseTexts = (page: Page, root = 'mushaf-livre') =>
  page
    .locator(`[data-testid="${root}"] .quran-text`)
    .evaluateAll((els) =>
      els.map(
        (e) => `${e.getAttribute('data-verse') ?? e.getAttribute('data-basmala')}|${e.textContent}`,
      ),
    );
const isMobile = (name: string) => name.startsWith('mobile');
/** Barre simplifiée (04/10/2026) : sourate et page toujours visibles ; le reste dans le menu « Plus ». */
async function openPlus(page: Page) {
  const d = page.getByTestId('mp-options');
  if (!(await d.evaluate((x) => (x as HTMLDetailsElement).open)))
    await d.locator('summary').first().click();
  await expect(d.locator('.pop')).toBeVisible();
}
async function closePlus(page: Page) {
  const d = page.getByTestId('mp-options');
  if (await d.evaluate((x) => (x as HTMLDetailsElement).open))
    await d.locator('summary').first().click();
}

test('pages du Muṣḥaf : double page (ordinateur) ou une page, cadre, versets exacts, navigation', async ({
  page,
}, info) => {
  const audio: string[] = [];
  page.on('request', (r) => {
    if (/\/audio\//.test(r.url())) audio.push(r.url());
  });
  await page.goto('/coran/mushaf?page=1');
  const pages = page.getByTestId('mushaf-page');
  await expect(page.locator('[data-verse="1:7"]')).toBeVisible();
  if (isMobile(info.project.name)) {
    await expect(pages).toHaveCount(1);
  } else {
    // double page « livre » : page impaire à droite, page paire à gauche
    await expect(pages).toHaveCount(2);
    await expect(page.locator('[data-verse="2:5"]')).toBeVisible();
    const [r, l] = await pages.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
    expect(r!).toBeGreaterThan(l!);
  }
  // cadre orné (SVG) et rosaces
  await expect(pages.first().locator('svg.frame')).toHaveCount(1);
  await expect(pages.first().locator('svg.rosette')).toHaveCount(4);
  await expect(page.locator('[data-page="1"] [data-verse]')).toHaveCount(7);
  await shot(page, '01-page1', info.project.name);

  // barre simplifiée : actions principales visibles, cibles tactiles ≥ 48 px
  for (const id of [
    'mp-sourate',
    'mp-page',
    'mp-ecouter',
    'mp-tajwid',
    'mp-trad',
    'mp-suiv',
    'mp-prec',
  ]) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.height, id).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId('mp-options').locator('summary')).toBeVisible();
  // aller à une page, à un juzʾ, page suivante
  await page.getByTestId('mp-page').fill('50');
  await page.getByTestId('mp-page').press('Enter');
  await expect(page.locator('[data-page="50"]')).toBeVisible();
  await openPlus(page);
  await page.getByTestId('mp-juz').selectOption('30');
  await expect(page.locator('[data-page="582"]')).toBeVisible();
  await closePlus(page);
  await page.getByTestId('mp-suiv').click();
  await expect(
    page.locator(isMobile(info.project.name) ? '[data-page="583"]' : '[data-page="584"]'),
  ).toBeVisible();
  await page.getByTestId('mp-page').fill('604');
  await page.getByTestId('mp-page').press('Enter');
  await expect(page.locator('[data-page="604"] [data-sura-start]')).toHaveCount(3);
  await shot(page, '02-page604', info.project.name);
  // aucune requête audio sans geste de l'utilisateur
  expect(audio).toEqual([]);
});

test('texte Tanzil identique à l’onglet Lire ; tajwid en couleurs sans changer le texte ; Warsh désactivé', async ({
  page,
}, info) => {
  await page.goto('/coran/lecteur?s=2');
  await expect(page.locator('[data-verse="2:255"]')).toBeVisible();
  const lire = await page.locator('[data-verse="2:255"]').textContent();

  await page.goto('/coran/mushaf?s=2&a=255');
  const v = page.locator('[data-testid="mushaf-livre"] [data-verse="2:255"]');
  await expect(v).toBeVisible();
  expect(await v.textContent()).toBe(lire);
  await expect(page.locator('[data-page="42"]')).toBeVisible();
  await expect(page.locator('[data-aya="2:255"]')).toHaveClass(/\bon\b/);

  await openPlus(page);
  const warsh = page.getByTestId('mp-mushaf').locator('option[value="warsh"]');
  expect(await warsh.evaluate((o) => (o as HTMLOptionElement).disabled)).toBe(true);
  await expect(warsh).toContainText('Warsh');
  await closePlus(page);
  const before = await verseTexts(page);
  // bouton « Tajwid » de la barre (bascule) : couleurs sans changer le texte
  await page.getByTestId('mp-tajwid').click();
  await expect(page.getByTestId('mp-tajwid')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="mushaf-livre"] .tj').first()).toBeVisible();
  expect(await verseTexts(page)).toEqual(before);
  await shot(page, '03-tajwid-p42', info.project.name);
  if (CAP) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, '09-sombre-tajwid', info.project.name);
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.getByTestId('mp-tajwid').click();
  await expect(page.locator('[data-testid="mushaf-livre"] .tj')).toHaveCount(0);
  await openPlus(page);
  await page.getByTestId('mp-mushaf').selectOption('hafs-tajwid');
  await expect(page.getByTestId('mp-tajwid')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('mp-mushaf').selectOption('hafs');
});

test('traduction du sens à côté : source recopiée, verset en cours surligné, anglais, crédit', async ({
  page,
  request,
}, info) => {
  await page.goto('/coran/mushaf?s=2&a=255');
  const panel = page.getByTestId('mp-panneau-traduction');
  await expect(panel).toBeVisible();
  const li = panel.locator('[data-trad="2:255"]');
  await expect(li).toHaveClass(/\bon\b/);
  const src = (await (await request.get('/traductions/french_rashid/002.json')).json()) as {
    t: [number, string, string][];
  };
  const want = src.t.find((x) => x[0] === 255)![1];
  await expect(li.locator('.ttext')).toHaveText(want);
  await expect(panel).toContainText('QuranEnc.com');
  await expect(panel).toContainText('1.0.3');
  // toucher un verset du Muṣḥaf surligne sa traduction
  await page.locator('[data-aya="2:256"]').click();
  await expect(panel.locator('[data-trad="2:256"]')).toHaveClass(/\bon\b/);
  await expect(panel.locator('[data-trad="2:255"]')).not.toHaveClass(/\bon\b/);
  await shot(page, '04-traduction-fr', info.project.name);
  // panneau repliable
  await page.getByTestId('mp-replier-traduction').click();
  await expect(page.getByTestId('mp-replier-traduction')).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.locator('[data-trad]')).toHaveCount(0);
  await page.getByTestId('mp-replier-traduction').click();
  await expect(panel.locator('[data-trad="2:256"]')).toHaveClass(/\bon\b/);
  await openPlus(page);
  await page.getByTestId('mp-traduction').selectOption('english_rwwad');
  await expect(panel.locator('[data-trad="2:256"] .ttext')).toContainText('compulsion');
  await expect(panel).toHaveAttribute('lang', 'en');
  await page.getByTestId('mp-traduction').selectOption('');
  await expect(panel).toHaveCount(0);
  await closePlus(page);
  // bouton « Traduction » : remet la dernière traduction choisie
  await page.getByTestId('mp-trad').click();
  await expect(panel).toHaveAttribute('lang', 'en');
  await page.getByTestId('mp-trad').click();
  await expect(panel).toHaveCount(0);
});

test('options : test de mémorisation, lecture seule, vue mobile ; recherche', async ({
  page,
}, info) => {
  await page.goto('/coran/mushaf?page=1');
  await expect(page.locator('[data-verse="1:7"]')).toBeVisible();
  const opts = page.getByTestId('mp-options');
  await opts.locator('summary').click();
  await page.getByTestId('mp-memo').selectOption('3');
  await opts.locator('summary').click(); // menu refermé : le texte est libre
  await expect(page.locator('[data-page="1"] .w.voile').first()).toBeVisible();
  const hidden = await page.locator('[data-verse="1:2"] .w.voile').count();
  expect(hidden).toBeGreaterThan(0);
  await page.locator('[data-aya="1:2"]').click();
  await expect(page.locator('[data-verse="1:2"] .w.voile')).toHaveCount(0);
  await shot(page, '05-memorisation', info.project.name);
  await opts.locator('summary').click();
  await page.getByTestId('mp-memo').selectOption('0');
  await page.getByTestId('mp-lecture-seule').check();
  await opts.locator('summary').click();
  await page.locator('[data-aya="1:3"]').click({ force: true });
  await expect(page.locator('[data-aya="1:3"]')).not.toHaveClass(/\bon\b/);
  await opts.locator('summary').click();
  await page.getByTestId('mp-lecture-seule').uncheck();
  if (!isMobile(info.project.name)) {
    await page.getByTestId('mp-vue-mobile').check();
    await expect(page.getByTestId('mushaf-page')).toHaveCount(1);
    await page.getByTestId('mp-vue-mobile').uncheck();
    await expect(page.getByTestId('mushaf-page')).toHaveCount(2);
  }
  // recherche : référence puis mots arabes dans les sourates ouvertes (menu « Plus » encore ouvert)
  await page.getByTestId('mp-recherche').fill('112:1');
  await page.getByTestId('mp-recherche').press('Enter');
  await expect(page.locator('[data-page="604"]')).toBeVisible();
  await expect(page.locator('[data-aya="112:1"]')).toHaveClass(/\bon\b/);
  await openPlus(page);
  await page.getByTestId('mp-recherche').fill('الفلق');
  await page.getByTestId('mp-recherche').press('Enter');
  await expect(page.getByTestId('mp-resultats')).toContainText('Al-Falaq');
});

test('téléphone : une page, balayage pour tourner, 320 px sans défilement horizontal ; accessibilité', async ({
  page,
}, info) => {
  await page.goto('/coran/mushaf?page=3');
  await expect(page.locator('[data-page="3"]')).toBeVisible();
  if (isMobile(info.project.name)) {
    await expect(page.getByTestId('mushaf-page')).toHaveCount(1);
    const swipe = (dx: number) =>
      page.getByTestId('mushaf-livre').evaluate((el, d) => {
        const r = el.getBoundingClientRect();
        const y = r.top + 100;
        const x0 = r.left + r.width / 2;
        const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
        el.dispatchEvent(
          new TouchEvent('touchstart', { touches: [t(x0)], changedTouches: [t(x0)] }),
        );
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x0 + d)] }));
      }, dx);
    await swipe(120); // vers la droite : page suivante (livre arabe)
    await expect(page.locator('[data-page="4"]')).toBeVisible();
    await swipe(-120);
    await expect(page.locator('[data-page="3"]')).toBeVisible();
    await shot(page, '06-telephone', info.project.name);
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(page.locator('[data-page="3"]')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
    await shot(page, '07-320px', info.project.name);
    // menu « Plus » ouvert à 320 px : rien ne déborde non plus
    await openPlus(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await shot(page, '08-320px-commandes', info.project.name);
    await closePlus(page);
    if (CAP) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await shot(page, '10-sombre-320px', info.project.name);
      await page.emulateMedia({ colorScheme: 'light' });
    }
  } else {
    await page.keyboard.press('ArrowLeft'); // livre arabe : la flèche gauche avance
    await expect(page.locator('[data-page="5"]')).toBeVisible();
    await expect(
      page.getByTestId('mushaf-livre').locator('xpath=..').locator('.pos'),
    ).toContainText('5–6');
    if (CAP) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await shot(page, '09-sombre', info.project.name);
      await page.emulateMedia({ colorScheme: 'light' });
    }
  }
  // « Écouter » : le panneau d'écoute s'ouvre au geste (récitateur, répétition)
  await page.getByTestId('mp-ecouter').click();
  await expect(page.getByTestId('mp-audio')).toBeVisible();
  await expect(page.getByTestId('mp-recitateur')).toBeVisible();
  expect(await serious(page)).toEqual([]);
});
