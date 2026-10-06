import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Chantier A21b — leçons vivantes PARTOUT : une leçon par famille de niveau hors pilotes (enfants, ados,
 * adultes), nouveaux modèles tirés des livres (racine et schème, conjugaison, nombres, heure), jamais en
 * religion ni en lecture du Coran, réglage par niveau, hors ligne (code chargé à la demande puis gardé) ;
 * captures 375 px de chaque nouveau modèle dans reports/a21b/.
 */
const model = (page: Page, m: string) => page.locator(`[data-testid="vivante"][data-model="${m}"]`);
/** arabe et français sur une même ligne dans le temps affiché (boîtes qui se chevauchent en hauteur) */
const memeLigne = (root: Element) => {
  const bad: string[] = [];
  for (const fr of root.querySelectorAll('.fr'))
    for (const ar of root.querySelectorAll('[lang="ar"]')) {
      if (fr.contains(ar) || ar.contains(fr)) continue;
      const a = fr.getBoundingClientRect();
      const b = ar.getBoundingClientRect();
      if (!a.height || !b.height) continue;
      if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(fr.textContent ?? '');
    }
  return bad;
};
/**
 * Carte vivante : vide (aucun texte visible dans la scène) ? recouverte (barre de navigation du bas ou autre
 * élément au-dessus de ses boutons ou de sa scène) ?
 */
const controle = (card: Element) => {
  const stage = card.querySelector('.stage');
  const visible = (el: Element) => {
    for (let x: Element | null = el; x && x !== card; x = x.parentElement)
      if (Number(getComputedStyle(x).opacity) < 0.3 || getComputedStyle(x).visibility === 'hidden')
        return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textes = stage
    ? [...stage.querySelectorAll('*')].filter(
        (e) =>
          !e.closest('.tag') &&
          !e.closest('svg.deco') &&
          [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) &&
          visible(e),
      )
    : [];
  const dessus = (el: Element | null) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = Math.min(r.bottom - 2, innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return !!hit && !card.contains(hit);
  };
  return {
    vide: textes.length === 0,
    recouverte: dessus(card.querySelector('[data-testid="vivante-pause"]')) || dessus(stage),
  };
};
const DIR = process.env.A21B_CAPTURES_DIR ?? join('..', '..', 'reports', 'a21b');

test('A21b : une leçon par famille de niveau, hors pilotes — animations après les parties', async ({
  page,
}) => {
  for (const unit of ['en3.l02', 'ado3.l02', 'ad7.l02']) {
    await page.goto(`/lecons/${unit}`);
    await expect(page.locator('h1')).toBeVisible();
    for (const slot of ['lecture', 'mots', 'dialogue'])
      await expect(
        page.locator(`[data-testid="vivante"][data-slot="${slot}"]`).first(),
        `${unit} ${slot}`,
      ).toBeAttached();
    const m = page.locator('[data-testid="vivante"][data-slot="mots"]');
    await m.scrollIntoViewIfNeeded();
    await expect(m).toHaveAttribute('data-state', 'lecture');
    await expect(m.locator('[lang="ar"]').first()).toBeVisible(); // l'arabe est du texte
    // règle du client : l'arabe et la traduction ne partagent jamais une ligne
    for (const viv of await page.locator('[data-testid="vivante"]').all()) {
      await viv.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1600);
      expect(await viv.evaluate(memeLigne), `${unit}`).toEqual([]);
    }
    await expect(page.getByTestId('vivante-condense')).toHaveCount(1);
  }
});

test('A21b : jamais d’animation en religion ni en lecture du Coran', async ({ page }) => {
  for (const unit of ['re1.l01', 'qc1.l01']) {
    await page.goto(`/lecons/${unit}`);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page.getByTestId('vivante')).toHaveCount(0);
  }
});

test('A21b : racine et schème — les trois lettres glissent dans le schème, le mot du livre se forme', async ({
  page,
}) => {
  await page.goto('/lecons/en5.l02');
  const m = model(page, 'racine');
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute('data-state', 'lecture');
  const b = m.locator('.plus.racine');
  await expect(b).toBeVisible();
  await expect(b.locator('.rl')).toHaveCount(3);
  // lettres de la racine en couleur dans le schème et dans le mot (texte, balisage des livres)
  await expect(b.locator('.moule span[class^="c"]')).toHaveCount(3);
  await expect(b.locator('.mot span[class^="c"]')).toHaveCount(3);
});

test('A21b : conjugaison — pronom, radical, terminaison balisée du livre, ligne par ligne', async ({
  page,
}) => {
  await page.goto('/lecons/ad3.l01');
  const m = model(page, 'conjugaison');
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute('data-state', 'lecture');
  const rows = m.locator('.plus.conj .row');
  await expect(rows.nth(2)).toBeAttached(); // trois lignes au moins (modèle chargé à la demande)
  await expect(rows.first().locator('.pr')).toBeVisible();
  await expect(m.locator('.plus.conj .w span[class^="c"]').first()).toBeAttached();
});

test('A21b : nombres et heure — chiffre, quantité et mot du livre ; horloge de la traduction', async ({
  page,
}) => {
  await page.goto('/lecons/ado1.l22');
  const n = model(page, 'nombre');
  await n.scrollIntoViewIfNeeded();
  await expect(n).toHaveAttribute('data-state', 'lecture');
  await expect(n.locator('.plus.nombre .chiffre')).toBeVisible();
  await expect(n.locator('.plus.nombre .dots i').first()).toBeAttached();
  await page.goto('/lecons/en4.l12');
  const h = model(page, 'heure');
  await h.scrollIntoViewIfNeeded();
  await expect(h).toHaveAttribute('data-state', 'lecture');
  await expect(h.locator('.plus.heure svg.clock')).toBeVisible();
  await expect(h.locator('.plus.heure .ph [lang="ar"]')).toBeVisible();
});

test('A21b : démonstration — choix du livre et de la leçon, exemples des modèles', async ({
  page,
}) => {
  await page.goto('/demo/vivante');
  await expect(page.getByTestId('vivante-exemples').locator('a[data-exemple]')).toHaveCount(7);
  await page.getByTestId('vivante-livre').selectOption('ad4');
  await expect(page.getByTestId('vivante-lecon').locator('option').first()).toBeAttached();
  await expect(page.getByTestId('vivante-ouvrir')).toHaveAttribute('href', /\/lecons\/ad4\.l\d\d$/);
  await page.getByTestId('vivante-ouvrir').click();
  await expect(page.getByTestId('vivante').first()).toBeAttached();
});

test('A21b : hors ligne — code des leçons vivantes gardé au téléchargement du niveau, nouveaux modèles sans réseau', async ({
  page,
  context,
}) => {
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // le code des leçons vivantes n'est pas préchargé avec la coquille (chargé à la demande)
  const skip = await page.evaluate(() => fetch('/_app/vivante.json').then((r) => r.json()));
  expect((skip as string[]).length).toBeGreaterThan(0);
  const row = page.locator('tr[data-level="en5"]');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(row.getByTestId('etat')).toContainText("sur l'appareil");
  // gardé par le service worker après le téléchargement du niveau
  await expect
    .poll(
      () =>
        page.evaluate(async (files) => {
          const keys = await caches.keys();
          for (const f of files)
            if (
              !(await Promise.all(keys.map((k) => caches.open(k).then((c) => c.match(f))))).some(
                Boolean,
              )
            )
              return false;
          return true;
        }, skip as string[]),
      { timeout: 15_000 },
    )
    .toBe(true);
  await context.setOffline(true);
  await page.goto('/niveaux/en5');
  await page.locator('a[href="/lecons/en5.l02"]').click();
  const m = model(page, 'racine');
  await m.scrollIntoViewIfNeeded();
  await expect(m.locator('.plus.racine')).toBeVisible();
  await context.setOffline(false);
});

test('A21b : aucune carte vivante vide ni recouverte par la barre du bas (téléphone)', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'barre du bas : téléphone');
  test.setTimeout(180_000);
  for (const unit of ['en5.l02', 'ad3.l01', 'ado1.l22', 'en4.l12', 'en3.l02', 'ad7.l02']) {
    await page.goto(`/lecons/${unit}`);
    await expect(page.getByTestId('vivante').first()).toBeAttached();
    for (const card of await page.locator('[data-testid="vivante"]').all()) {
      await card.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
      await expect(card).toHaveAttribute('data-state', 'lecture');
      await page.waitForTimeout(1500);
      await card.getByTestId('vivante-pause').click();
      await card.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
      const model = await card.getAttribute('data-model');
      // barre du bas et défilement stabilisés (machine chargée) : contrôle relevé jusqu'à stabilité
      await expect
        .poll(
          async () => {
            await card.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
            return card.evaluate(controle);
          },
          { message: `${unit} ${model}` },
        )
        .toEqual({
          vide: false,
          recouverte: false,
        });
    }
  }
});
test('A21b : captures — chaque nouveau modèle, téléphone 375 px, clair et sombre', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'captures sur téléphone seulement');
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const mode of ['clair', 'sombre'] as const) {
    await page.emulateMedia({ colorScheme: mode === 'sombre' ? 'dark' : 'light' });
    await page.addInitScript((x) => localStorage.setItem('awzid.mode', x), mode);
    await page.goto('/demo/vivante');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('body').screenshot({ path: join(DIR, `${mode}-01-demo.png`) });
    for (const [unit, m, name, wait] of [
      ['en5.l02', 'racine', '02-racine-schema', 3600],
      ['ad3.l01', 'conjugaison', '03-conjugaison', 6400],
      ['ado1.l22', 'nombre', '04-nombres', 2300],
      ['en4.l12', 'heure', '05-heure', 2600],
    ] as const) {
      await page.goto(`/lecons/${unit}`);
      const loc = model(page, m);
      await loc.scrollIntoViewIfNeeded();
      await expect(loc).toHaveAttribute('data-state', 'lecture');
      await page.evaluate(() => document.fonts.ready);
      // milieu du premier temps (contenu entièrement formé), puis pause : capture fixe, jamais un temps vide
      await page.waitForTimeout(wait);
      await loc.getByTestId('vivante-pause').click();
      await expect(loc).toHaveAttribute('data-state', 'pause');
      await loc.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
      await expect
        .poll(
          async () => {
            await loc.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
            return loc.evaluate(controle);
          },
          { message: `${unit} ${m}` },
        )
        .toEqual({
          vide: false,
          recouverte: false,
        });
      await loc.screenshot({ path: join(DIR, `${mode}-${name}.png`) });
    }
  }
});
