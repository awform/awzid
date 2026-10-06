import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Chantier A21 — leçons vivantes : une animation après chaque partie (10 à 20 s, sans son, départ quand elle
 * arrive à l'écran), passer / revoir / pause, voix seulement après un appui, version calme
 * (prefers-reduced-motion), condensé de fin avec 3 questions éclair, hors ligne, réglage par niveau,
 * page de démonstration ; captures (téléphone 375 px, clair et sombre) dans reports/a21/.
 */
const motion = (page: Page, slot: string) =>
  page.locator(`[data-testid="vivante"][data-slot="${slot}"]`);
const audioAsked = (page: Page) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/lecons-audio/fichiers/')) asked.push(r.url());
  });
  return asked;
};

test('A21 : une animation après chaque partie de la leçon pilote, sans son, passer / revoir / pause', async ({
  page,
}) => {
  const asked = audioAsked(page);
  await page.goto('/lecons/en1.l01');
  for (const slot of ['lettres', 'lecture', 'mots', 'dialogue', 'retiens'])
    await expect(motion(page, slot)).toHaveCount(1);
  // placée juste après la partie « mots » (ordre de la page)
  await expect(
    page.locator('article.lesson > section:has(.words) + .vivante-hote [data-slot="mots"]'),
  ).toHaveCount(1);
  const m = motion(page, 'mots');
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute('data-state', 'lecture'); // départ seul, à l'écran
  await expect(m.locator('.b.mot svg use').first()).toBeAttached(); // image existante du livre
  await expect(m.locator('.b.mot [lang="ar"]').first()).toBeVisible(); // l'arabe est du texte
  await m.getByTestId('vivante-pause').click();
  await expect(m).toHaveAttribute('data-state', 'pause');
  await m.getByTestId('vivante-passer').click();
  await expect(m).toHaveAttribute('data-state', 'passee');
  await m.getByTestId('vivante-revoir').click();
  await expect(m).toHaveAttribute('data-state', 'lecture');
  // aucun son sans geste
  expect(asked).toEqual([]);
  // aucune image de personnage dans les animations
  await expect(page.locator('[data-testid="vivante"] use[href*="maryam"]')).toHaveCount(0);
});

test('A21 : la voix des livres seulement après un appui sur « Voix »', async ({ page }) => {
  test.skip(!process.env.E2E_LECONS_AUDIO, 'audio des leçons absent (~/lecons-audio)');
  const asked = audioAsked(page);
  await page.goto('/lecons/en1.l01');
  const m = motion(page, 'lettres');
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute('data-state', 'lecture');
  await page.waitForTimeout(800);
  expect(asked).toEqual([]);
  const res = page.waitForResponse((r) => r.url().includes('/lecons-audio/fichiers/'));
  await m.getByTestId('vivante-voix').click();
  expect([200, 206]).toContain((await res).status());
  await expect(m.getByTestId('vivante-voix')).toHaveAttribute('aria-pressed', 'true');
});

test('A21 : version calme (prefers-reduced-motion) — aucun départ seul, lecture au geste', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lecons/ado1.l01');
  const m = motion(page, 'lecture');
  await m.scrollIntoViewIfNeeded();
  await expect(m.locator('.calm-note')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(m).toHaveAttribute('data-state', 'attente');
  await m.getByTestId('vivante-lire').click();
  await expect(m).toHaveAttribute('data-state', 'lecture');
});

test('A21 : condensé de fin — enchaînement puis 3 questions éclair, score', async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto('/lecons/ad1.l01');
  const c = page.getByTestId('vivante-condense');
  await c.scrollIntoViewIfNeeded();
  // jamais de départ seul : il attend un appui
  await expect(c).toHaveAttribute('data-state', 'attente');
  await expect(c).toContainText('3 questions éclair');
  await c.getByTestId('condense-lancer').click();
  await expect(c).toHaveAttribute('data-state', 'lecture');
  for (let n = 0; n < 3; n++) {
    const q = c.getByTestId('question-eclair');
    for (let k = 0; k < 40 && !(await q.isVisible()); k++) await page.clock.runFor(5_000);
    await expect(q).toBeVisible();
    if (n === 0 && info.project.name.startsWith('mobile')) {
      const dir = process.env.A21_CAPTURES_DIR ?? join('..', '..', 'reports', 'a21');
      mkdirSync(dir, { recursive: true });
      await c.screenshot({ path: join(dir, 'clair-08-condense-question.png') });
    }
    await q.locator('button.opt:not(.listen)').first().click();
    await expect(q.getByRole('status')).toBeVisible();
    await page.clock.runFor(2_000);
  }
  await expect(c).toHaveAttribute('data-state', 'finie');
  await expect(c).toContainText('sur 3 questions réussies');
});

test('A21 : hors ligne — niveau téléchargé, l’animation apparaît sans réseau', async ({
  page,
  context,
}) => {
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const row = page.locator('tr[data-level="en1"]');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(row.getByTestId('etat')).toContainText("sur l'appareil");
  await context.setOffline(true);
  await page.goto('/niveaux/en1');
  await page.locator('a[href="/lecons/en1.l01"]').click();
  const m = motion(page, 'mots');
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute('data-state', 'lecture');
  await context.setOffline(false);
});

test('A21 / A21b : actives partout par défaut, réglage par niveau, interrupteur général', async ({
  page,
}) => {
  // A21b : hors pilote aussi, par défaut
  await page.goto('/lecons/en1.l02');
  await expect(page.getByTestId('vivante').first()).toBeAttached();
  // niveau en1 désactivé : plus rien dans ce niveau, le reste inchangé
  await page.goto('/demo/vivante');
  await page.locator('[data-viv-level="en1"]').uncheck();
  await page.goto('/lecons/en1.l02');
  await expect(page.locator('h1')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('vivante')).toHaveCount(0);
  await page.goto('/lecons/en2.l01');
  await expect(page.getByTestId('vivante').first()).toBeAttached();
  // interrupteur général : plus rien, même sur un pilote
  await page.goto('/demo/vivante');
  await page.getByTestId('vivante-actif').uncheck();
  await page.goto('/lecons/ad1.l01');
  await expect(page.locator('h1')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('vivante')).toHaveCount(0);
});
test('A21 : captures — téléphone 375 px, clair et sombre', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'captures sur téléphone seulement');
  test.setTimeout(300_000);
  const DIR = process.env.A21_CAPTURES_DIR ?? join('..', '..', 'reports', 'a21');
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const mode of ['clair', 'sombre'] as const) {
    await page.emulateMedia({ colorScheme: mode === 'sombre' ? 'dark' : 'light' });
    await page.addInitScript((m) => localStorage.setItem('awzid.mode', m), mode);
    const shot = async (name: string, loc = page.locator('body')) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2600); // fin des animations du temps en cours
      await loc.screenshot({ path: join(DIR, `${mode}-${name}.png`) });
    };
    await page.goto('/demo/vivante');
    await shot('01-demo');
    for (const [unit, slot, name] of [
      ['en1.l01', 'lettres', '02-en1-lettres'],
      ['en1.l01', 'mots', '03-en1-mots'],
      ['ado1.l01', 'lecture', '04-ado1-structure'],
      ['ad1.l01', 'dialogue', '05-ad1-dialogue'],
    ] as const) {
      await page.goto(`/lecons/${unit}`);
      const m = motion(page, slot);
      await m.scrollIntoViewIfNeeded();
      await expect(m).toHaveAttribute('data-state', 'lecture');
      await shot(name, m);
    }
    // ḥarakāt mises en relief (2e temps de « je lis » d'ado1)
    await page.goto('/lecons/ado1.l01');
    const h = motion(page, 'lecture');
    await h.scrollIntoViewIfNeeded();
    await expect(h.locator('.b.harakat')).toBeVisible({ timeout: 20_000 });
    await shot('04b-ado1-harakat', h);
    // schéma de structure (dernier temps du dialogue d'en1)
    await page.goto('/lecons/en1.l01');
    const d = motion(page, 'dialogue');
    await d.scrollIntoViewIfNeeded();
    await expect(d.locator('.b.schema')).toBeVisible({ timeout: 40_000 });
    await shot('06-en1-schema', d);
    // condensé : question éclair
    await page.goto('/lecons/en1.l01');
    const c = page.getByTestId('vivante-condense');
    await c.scrollIntoViewIfNeeded();
    await shot('07-en1-condense', c);
  }
});
