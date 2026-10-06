import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { close, openDisplay, setTajwid } from './coran';
import { expect, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot 29 — tajwid en couleurs (Ḥafṣ) dans Lire, Mémoriser (et Écouter avec un récitateur en Ḥafṣ) :
 * désactivé par défaut, chargé à la demande par sourate, texte Tanzil inchangé au caractère près, légende et
 * crédit, soulignés (daltonisme), palette enfant à quatre familles, sombre, 320 px, hors ligne.
 * Captures seulement avec TAJWID_CAPTURES=<dossier> (ex. reports/lot29).
 */
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

/** Texte affiché de chaque verset et basmala (contenu textuel, toutes enveloppes confondues). */
const texts = (page: Page, root: string) =>
  page
    .locator(`[data-testid="${root}"] .quran-text`)
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));

/** Couleur calculée d'un morceau et valeur du jeton dans le thème courant (en rgb). */
const colorOf = (page: Page, sel: string, token: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el, tk) => {
      const probe = document.createElement('span');
      probe.style.color = `var(--${tk})`;
      el.parentElement!.appendChild(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { got: getComputedStyle(el).color, want };
    }, token);

test('lire : désactivé par défaut, couleurs à la demande, texte identique, légende, soulignés, sombre', async ({
  page,
}) => {
  const reqs: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/tajwid/')) reqs.push(new URL(r.url()).pathname);
  });
  await page.goto('/coran/lecteur?s=114&vue=versets');
  await expect(page.locator('[data-verse="114:6"]')).toBeVisible();
  await expect(page.locator('[data-testid="texte-coran"] .tj')).toHaveCount(0);
  const before = await texts(page, 'texte-coran');
  expect(reqs).toEqual([]);

  // Coran épuré : le bouton du tajwid est dans la feuille « Affichage »
  await openDisplay(page);
  const btn = page.getByTestId('tajwid');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
  // intégrité : le texte affiché est exactement le même, caractère pour caractère
  expect(await texts(page, 'texte-coran')).toEqual(before);
  expect(reqs).toEqual(['/tajwid/114.json']);

  // légende repliée dans la feuille, toujours accessible
  const leg = page.getByTestId('tajwid-legende');
  await leg.locator('summary').click();
  await expect(leg.locator('[data-legende]')).toHaveCount(12);
  // termes arabes isolés dans les libellés français (ordre d'affichage juste)
  await expect(leg.locator('[data-legende="tj-ghunna"] bdi[lang="ar"]')).toHaveText('الْغُنَّةُ');
  await expect(leg).toContainText('le son nasal');
  await expect(leg).toContainText('allongement');
  await expect(page.getByTestId('tajwid-credit').first()).toContainText('CC BY 4.0');
  // daltonisme : soulignés par famille en plus des couleurs
  await page.getByTestId('tajwid-motifs').check();
  await close(page);
  const light = await colorOf(
    page,
    '[data-testid="texte-coran"] .tj[data-tj="tj-ghunna"]',
    'tj-ghunna',
  );
  expect(light.got).toBe(light.want);
  await expect(page.getByTestId('texte-coran')).toHaveClass(/motifs/);
  const deco = await page
    .locator('[data-testid="texte-coran"] .tj[data-tjf="nasal"]')
    .first()
    .evaluate((el) => getComputedStyle(el).textDecorationStyle);
  expect(deco).toBe('wavy');
  expect(await serious(page)).toEqual([]);

  // réglage gardé sur l'appareil ; mode sombre : couleurs de la palette sombre
  await page.reload();
  await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await colorOf(
    page,
    '[data-testid="texte-coran"] .tj[data-tj="tj-ghunna"]',
    'tj-ghunna',
  );
  expect(dark.got).toBe(dark.want);
  expect(dark.got).not.toBe(light.got);
  expect(await serious(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: 'light' });
});

test('très petit écran (320 px) : pas de défilement horizontal avec le tajwid et sa légende', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/coran/lecteur?s=2&vue=versets');
  await expect(page.locator('[data-verse="2:5"]')).toBeVisible();
  await setTajwid(page, true);
  await page.getByTestId('tajwid-legende').locator('summary').click();
  const over = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await over()).toBeLessThanOrEqual(0);
  await close(page);
  await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
  expect(await over()).toBeLessThanOrEqual(0);
});

test('hors ligne : sourate déjà vue gardée sur l’appareil ; sinon texte sans couleur et message', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?s=113&vue=versets');
  await setTajwid(page, true);
  await close(page);
  await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
  // plus de réseau pour les annotations
  await page.route('**/tajwid/**', (r) => r.abort());
  await page.goto('/coran/lecteur?s=109&vue=versets');
  await expect(page.locator('[data-verse="109:6"]')).toBeVisible();
  await expect(page.getByTestId('tajwid-absent')).toBeVisible();
  await expect(page.locator('[data-testid="texte-coran"] .tj')).toHaveCount(0);
  await page.goto('/coran/lecteur?s=113&vue=versets');
  await expect(page.locator('[data-verse="113:5"] .tj').first()).toBeVisible();
  await expect(page.getByTestId('tajwid-absent')).toHaveCount(0);
});

test('riwāya : bouton absent pour un autre muṣḥaf, présent en Ḥafṣ ; mémoriser avec masquage', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?s=1&m=qalun&vue=versets');
  await openDisplay(page);
  await expect(page.getByTestId('tajwid')).toHaveCount(0);
  await page.getByTestId('choix-mushaf').selectOption('hafs');
  await expect(page.getByTestId('tajwid')).toBeVisible();
  await close(page);

  await page.goto('/coran/memoriser');
  await page.goto('/coran/lecteur?s=113&vue=versets');
  await expect(page.locator('[data-verse="113:5"]')).toBeVisible();
  await openDisplay(page);
  await page.locator('[data-mask="0"]').check({ force: true });
  await close(page);
  const before = await texts(page, 'texte-coran');
  await setTajwid(page, true);
  await close(page);
  await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
  // le masquage progressif marche aussi en couleurs
  await openDisplay(page);
  await page.locator('[data-mask="2"]').check({ force: true });
  await close(page);
  await expect(page.locator('[data-testid="texte-coran"] .w.voile').first()).toBeVisible();
  await openDisplay(page);
  await page.locator('[data-mask="0"]').check({ force: true });
  await close(page);
  expect(await texts(page, 'texte-coran')).toEqual(before);
  expect(await serious(page)).toEqual([]);
});

test.describe('famille', () => {
  test.use({ compte: 'parent' });
  test('enfant : quatre familles, chant du nez en vert, grand texte', async ({ page }) => {
    await pickProfile(page, 'Amina');
    await page.goto('/coran/lecteur?s=114&vue=versets');
    await expect(page.locator('html')).toHaveAttribute('data-public', 'enfant');
    await setTajwid(page, true);
    const leg = page.getByTestId('tajwid-legende');
    await expect(leg.locator('[data-legende]')).toHaveCount(4);
    await expect(leg).toContainText('le chant du nez (الْغُنَّةُ)');
    await expect(leg).toContainText('le son long');
    await expect(leg).toContainText('le rebond');
    await expect(leg).toContainText('ne prononce pas');
    await close(page);
    const c = await colorOf(page, '[data-testid="texte-coran"] .tj[data-tjk="tjk-nez"]', 'tjk-nez');
    expect(c.got).toBe(c.want);
    const [r, g, b] = c.got.match(/\d+/g)!.map(Number);
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
    const size = await page
      .locator('[data-testid="texte-coran"] .aya')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(28);
    expect(await serious(page)).toEqual([]);
  });
});

/**
 * Compte parent NEUF avec un adolescent (« Sami ») : le compte parent commun aux autres e2e n'est pas modifié
 * (comptes.spec attend ses deux enfants).
 */
async function parentWithTeen(page: Page) {
  const signup = await page.request.post('/api/v1/auth/signup', {
    headers: { 'x-awform': '1' },
    data: {
      kind: 'parent',
      birthYear: 1985,
      email: `parent29-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`,
      password: password(),
      country: 'FR',
      locale: 'fr',
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(signup.status(), await signup.text()).toBeLessThan(300);
  const res = await page.request.post('/api/v1/profiles', {
    headers: { 'x-awform': '1' },
    data: {
      pseudonym: 'Sami',
      avatar: 'lune',
      birthYear: new Date().getFullYear() - 16,
      levelCode: 'ado1',
      password: password(),
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  await pickProfile(page, 'Sami');
}

test.describe('adolescent', () => {
  test.use({ compte: null });
  test('ado : palette complète, « le son nasal »', async ({ page }) => {
    await parentWithTeen(page);
    await page.goto('/coran/lecteur?s=114&vue=versets');
    await expect(page.locator('html')).toHaveAttribute('data-public', 'ado');
    await setTajwid(page, true);
    await expect(page.getByTestId('tajwid-legende').locator('[data-legende]')).toHaveCount(12);
    await expect(page.getByTestId('tajwid-legende')).toContainText('le son nasal');
    await close(page);
    await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

// ------------------------------------------------------------------ captures (sur demande)
const DIR = process.env.TAJWID_CAPTURES ?? '';
test.describe('captures', () => {
  test.skip(!DIR, 'captures du lot 29 : TAJWID_CAPTURES non défini');
  test.use({ compte: 'parent' });
  test('captures — Lire en tajwid : enfant, ado, adulte, sombre, 320 px', async ({
    page,
  }, info) => {
    mkdirSync(DIR, { recursive: true });
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    const shot = async (name: string, s: number) => {
      await page.goto(`/coran/lecteur?s=${s}&vue=versets`);
      await page.locator(`[data-testid="texte-coran"] .tj`).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: true });
    };
    const on = () =>
      page.evaluate(() => localStorage.setItem('awzid.tajwid', '{"on":true,"motifs":false}'));
    await pickProfile(page, 'Amina');
    await on();
    await shot('tajwid-enfant', 114);
  });
  test.describe('ado', () => {
    test.use({ compte: null });
    test('captures — ado, ado sombre', async ({ page }, info) => {
      mkdirSync(DIR, { recursive: true });
      const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
      await parentWithTeen(page);
      await page.evaluate(() => localStorage.setItem('awzid.tajwid', '{"on":true,"motifs":false}'));
      for (const [name, scheme] of [
        ['tajwid-ado', 'light'],
        ['tajwid-ado-sombre', 'dark'],
      ] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/coran/lecteur?s=114&vue=versets');
        await page.locator(`[data-testid="texte-coran"] .tj`).first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: true });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    });
  });
  test.describe('adulte', () => {
    test.use({ compte: 'adulte' });
    test('captures — adulte, sombre, 320 px, soulignés', async ({ page }, info) => {
      mkdirSync(DIR, { recursive: true });
      const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
      await page.goto('/coran');
      await page.evaluate(() => localStorage.setItem('awzid.tajwid', '{"on":true,"motifs":false}'));
      const shot = async (name: string, s: number, full = true) => {
        await page.goto(`/coran/lecteur?s=${s}&vue=versets`);
        await page.locator(`[data-testid="texte-coran"] .tj`).first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
      };
      await shot('tajwid-adulte', 114);
      await shot('tajwid-adulte-baqara', 2, false);
      await page.emulateMedia({ colorScheme: 'dark' });
      await shot('tajwid-adulte-sombre', 114);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.evaluate(() => localStorage.setItem('awzid.tajwid', '{"on":true,"motifs":true}'));
      await shot('tajwid-adulte-soulignes', 113);
      if (dev === 'mobile') {
        await page.setViewportSize({ width: 320, height: 720 });
        await shot('tajwid-adulte-320px', 114);
      }
    });
  });
});
