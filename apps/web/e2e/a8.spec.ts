import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { close, openDisplay, openSettings } from './coran';
import { expect, test } from './fixtures';

/**
 * Chantier A8 — muṣḥafs des riwāyāt (textes OFFICIELS et polices du Complexe du Roi Fahd) dans l'écran de
 * lecture unique (vues « page » et « versets »). Ḥafṣ par défaut ; texte du Complexe affiché tel quel ; police
 * chargée à la demande ; riwāya toujours écrite en clair ; ni tajwid ni traduction hors Ḥafṣ ; surlignage
 * seulement quand la riwāya du récitateur est celle du muṣḥaf affiché (fichiers d'ESSAI non coraniques : bips).
 * Captures seulement avec A8_CAPTURES=<dossier> (ex. reports/a8).
 */
const CAP = process.env.A8_CAPTURES;
async function shot(page: Page, name: string, project: string) {
  if (!CAP) return;
  mkdirSync(CAP, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, `${project}-${name}.png`), fullPage: true });
}
const STATIC = fileURLToPath(new URL('../static/riwayat', import.meta.url));
const sura = (key: string, s: number) =>
  JSON.parse(readFileSync(join(STATIC, key, `${String(s).padStart(3, '0')}.json`), 'utf8')) as {
    name: string;
    t: [number, number, number, string][];
  };
const index = (key: string) =>
  JSON.parse(readFileSync(join(STATIC, key, 'index.json'), 'utf8')) as {
    pages: [number, number][];
  };
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
const fontReady = (page: Page, key: string) =>
  expect
    .poll(() => page.evaluate((f) => document.fonts.check(`20px ${f}`), `awzid-rw-${key}`))
    .toBe(true);

test('Muṣḥaf Warsh page par page : texte du Complexe tel quel, police à la demande, riwāya en clair', async ({
  page,
}, info) => {
  const rw: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/riwayat/')) rw.push(new URL(r.url()).pathname);
  });
  await page.goto('/coran/lecteur?page=1&vue=page');
  await expect(page.locator('[data-verse="1:7"]')).toBeVisible();
  // Ḥafṣ par défaut : aucune donnée ni police d'une autre riwāya chargée, pas de badge « autre riwāya »
  await expect(page.getByTestId('mp-riwaya-affichee')).toHaveCount(0);
  await expect(page.getByTestId('credit-texte')).toContainText('Tanzil');
  expect(rw).toEqual([]);

  await openDisplay(page);
  await expect(page.getByTestId('choix-mushaf')).toHaveValue('hafs');
  await page.getByTestId('choix-mushaf').selectOption('warsh');
  await close(page);
  const badge = page.getByTestId('mp-riwaya-affichee').getByTestId('badge-riwaya');
  await expect(badge).toHaveAttribute('data-riwaya', 'warsh');
  await expect(badge).toContainText('Warsh ʿan Nāfiʿ');
  await expect(badge).toContainText('autre riwāya');
  const s1 = sura('warsh', 1);
  const v1 = page.locator('[data-page="1"] [data-verse="1:1"]');
  await expect(v1).toBeVisible();
  await expect(v1).toHaveText(s1.t[0]![3]);
  // tous les versets de la page = chaînes du fichier du Complexe (aucune retouche, aucun numéro ajouté)
  const shown = await page
    .locator('[data-page="1"] .quran-text')
    .evaluateAll((els) => els.map((e) => [e.getAttribute('data-verse'), e.textContent]));
  expect(shown).toEqual(s1.t.map(([a, , , text]) => [`1:${a}`, text]));
  await expect(page.locator('[data-page="1"] .n')).toHaveCount(0);
  await expect(page.locator('[data-page="1"] .basmala')).toHaveCount(0);
  await expect(page.locator('[data-page="1"] .band-title')).toContainText(s1.name);
  await fontReady(page, 'warsh');
  expect(rw.filter((p) => p.endsWith('.ttf'))).toEqual(['/riwayat/warsh/kfgqpc_warsh_v30.ttf']);
  // ni tajwid ni traduction hors Ḥafṣ ; crédit du Complexe avec la version
  await expect(page.getByTestId('mp-trad')).toHaveCount(0);
  await openDisplay(page);
  await expect(page.getByTestId('tajwid')).toHaveCount(0);
  await expect(page.getByTestId('mp-hafs-seulement')).toBeVisible();
  await close(page);
  await expect(page.getByTestId('credit-texte')).toContainText(
    'Complexe du Roi Fahd pour l’impression du Noble Coran',
  );
  await expect(page.getByTestId('credit-texte')).toContainText('kfgqpc_warsh_v30');
  await page.getByTestId('infos-texte').click();
  await expect(page.getByTestId('mp-trad-hafs')).toBeVisible();
  await close(page);
  await shot(page, '01-warsh-p1', info.project.name);

  // pages d'après les données du Complexe : la page 50 commence au verset donné par l'index de Warsh
  const [s50, a50] = index('warsh').pages[49]!;
  await page.goto('/coran/lecteur?page=50&vue=page');
  const first50 = page.locator(`[data-page="50"] [data-verse="${s50}:${a50}"]`);
  await expect(first50).toBeVisible();
  expect(await first50.textContent()).toBe(sura('warsh', s50).t.find(([a]) => a === a50)![3]);
  expect(await serious(page)).toEqual([]);

  // réglage gardé sur l'appareil : la vue « versets » affiche aussi Warsh, sans ḥizb (absent des données)
  await page.goto('/coran/lecteur?s=1&vue=versets');
  const lire = page.locator('[data-testid="texte-coran"] [data-verse="1:1"]');
  await expect(lire).toHaveText(s1.t[0]![3]);
  await page
    .getByTestId((await page.getByTestId('puce').isVisible()) ? 'puce' : 'barre-sourate')
    .click();
  await expect(page.getByTestId('sel-onglet-hizb')).toHaveCount(0);
  await close(page);
  // Mémoriser reste en Ḥafṣ (choix du muṣḥaf désactivé)
  await page.goto('/coran/memoriser');
  await expect(
    page.locator('[data-testid="mushaf-livre"], [data-testid="texte-coran"]').first(),
  ).toBeVisible();
  await openDisplay(page);
  await expect(page.getByTestId('choix-mushaf')).toHaveValue('hafs');
  await expect(page.getByTestId('choix-mushaf')).toBeDisabled();
  await page.locator('[data-mask="0"]').check({ force: true });
  await close(page);
});

test('Qālūn : surlignage seulement quand la riwāya du récitateur est celle du muṣḥaf affiché', async ({
  page,
}, info) => {
  await page.goto('/coran/ecouter?r=essai-qalun&s=1');
  // texte Ḥafṣ par défaut : récitation d'une autre riwāya, explication et passage au texte de Qālūn
  await openSettings(page);
  await expect(page.getByTestId('autre-riwaya')).toBeVisible();
  await page.getByTestId('voir-riwaya').click();
  await expect(page.getByTestId('meme-riwaya')).toBeVisible();
  await close(page);
  await expect(page.getByTestId('mp-riwaya-affichee')).toContainText('Qālūn');
  const q1 = sura('qalun', 1);
  await expect(page.locator('[data-verse="1:1"]').first()).toHaveText(q1.t[0]![3]);
  await fontReady(page, 'qalun');
  await expect(page.getByTestId('credit-texte')).toContainText('kfgqpc_qalun_v30');
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 8000 });
  await expect(page.locator('.aya.on[data-aya="1:2"], .aya.now[data-aya="2"]')).toHaveCount(1);
  await shot(page, '03-qalun-surlignage', info.project.name);
  await page.getByTestId('arreter-audio').click();

  // texte d'une autre riwāya (Warsh) avec la récitation de Qālūn : jamais de surlignage
  await openDisplay(page);
  await page.getByTestId('choix-mushaf').selectOption('warsh');
  await close(page);
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 8000 });
  await expect(page.getByTestId('sans-surlignage')).toBeVisible();
  await expect(page.locator('[data-aya="1:2"]')).not.toHaveClass(/\bon\b/);
  await page.getByTestId('arreter-audio').click();
  await openDisplay(page);
  await page.getByTestId('choix-mushaf').selectOption('hafs');
  await close(page);
});

test('téléphone 320 px : muṣḥaf Warsh lisible, sans défilement horizontal', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'largeur de téléphone seulement');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/coran/lecteur?page=3&m=warsh&vue=page');
  await expect(page.locator('[data-page="3"] .quran-text').first()).toBeVisible();
  await fontReady(page, 'warsh');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, '05-warsh-320px', info.project.name);
});
