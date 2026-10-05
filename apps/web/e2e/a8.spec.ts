import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Chantier A8 — muṣḥafs des riwāyāt (textes OFFICIELS et polices du Complexe du Roi Fahd) dans Lire, Écouter
 * et le Muṣḥaf page par page. Ḥafṣ par défaut ; texte du Complexe affiché tel quel ; police chargée à la
 * demande ; riwāya toujours écrite en clair ; ni tajwid ni traduction hors Ḥafṣ ; surlignage seulement quand
 * la riwāya du récitateur est celle du muṣḥaf affiché (fichiers d'ESSAI non coraniques : bips).
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
  await page.goto('/coran/mushaf?page=1');
  await expect(page.locator('[data-verse="1:7"]')).toBeVisible();
  // Ḥafṣ par défaut : aucune donnée ni police d'une autre riwāya chargée
  await expect(page.getByTestId('mp-mushaf')).toHaveValue('hafs');
  await expect(page.getByTestId('badge-riwaya').first()).toContainText('Ḥafṣ');
  expect(rw).toEqual([]);

  await page.getByTestId('mp-mushaf').selectOption('warsh');
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
  // nom de sourate du Complexe, police du Complexe chargée à la demande (une seule)
  await expect(page.locator('[data-page="1"] .band-title')).toContainText(s1.name);
  await fontReady(page, 'warsh');
  expect(rw).toContain('/riwayat/warsh/kfgqpc_warsh_v30.ttf');
  expect(rw.filter((p) => p.endsWith('.ttf'))).toEqual(['/riwayat/warsh/kfgqpc_warsh_v30.ttf']);
  // ni tajwid ni traduction hors Ḥafṣ ; crédit du Complexe avec la version
  await expect(page.getByTestId('mp-tajwid')).toHaveCount(0);
  await expect(page.getByTestId('mp-trad')).toHaveCount(0);
  await expect(page.getByTestId('mp-panneau-traduction')).toHaveCount(0);
  await expect(page.getByTestId('mp-trad-hafs')).toBeVisible();
  await expect(page.getByTestId('mp-credit')).toContainText(
    'Complexe du Roi Fahd pour l’impression du Noble Coran',
  );
  await expect(page.getByTestId('mp-credit')).toContainText('kfgqpc_warsh_v30');
  await shot(page, '01-warsh-p1', info.project.name);

  // pages d'après les données du Complexe : la page 50 commence au verset donné par l'index de Warsh
  const [s50, a50] = index('warsh').pages[49]!;
  await page.getByTestId('mp-page').fill('50');
  await page.getByTestId('mp-page').press('Enter');
  const first50 = page.locator(`[data-page="50"] [data-verse="${s50}:${a50}"]`);
  await expect(first50).toBeVisible();
  expect(await first50.textContent()).toBe(sura('warsh', s50).t.find(([a]) => a === a50)![3]);
  expect(await serious(page)).toEqual([]);
  if (CAP) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, '02-warsh-p50-sombre', info.project.name);
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // réglage commun aux onglets, gardé sur l'appareil : Lire affiche aussi Warsh
  await page.goto('/coran/lecteur?s=1');
  await expect(page.getByTestId('choix-mushaf')).toHaveValue('warsh');
  const lire = page.locator('[data-testid="sourate-texte"] [data-verse="1:1"]');
  await expect(lire).toBeVisible();
  await expect(lire).toHaveText(s1.t[0]![3]);
  await expect(page.getByTestId('aller-type').locator('option[value="hizb"]')).toHaveCount(0);
  await expect(page.getByTestId('credit-texte')).toContainText('Warsh ʿan Nāfiʿ');
  // Mémoriser reste en Ḥafṣ (aucun choix de muṣḥaf)
  await page.goto('/coran/memoriser');
  await expect(page.getByTestId('choix-mushaf')).toHaveCount(0);
});

test('Qālūn : surlignage seulement quand la riwāya du récitateur est celle du muṣḥaf affiché', async ({
  page,
}, info) => {
  await page.goto('/coran/ecouter?r=essai-qalun&s=1');
  // texte Ḥafṣ par défaut : récitation d'une autre riwāya, pas de surlignage
  await expect(page.getByTestId('choix-mushaf')).toHaveValue('hafs');
  await expect(page.getByTestId('autre-riwaya')).toBeVisible();
  await page.getByTestId('voir-riwaya').click();
  await expect(page.getByTestId('choix-mushaf')).toHaveValue('qalun');
  await expect(page.getByTestId('meme-riwaya')).toBeVisible();
  const q1 = sura('qalun', 1);
  const t1 = page.locator('[data-testid="texte-coran"] [data-verse="1:1"]');
  await expect(t1).toBeVisible();
  await expect(t1).toHaveText(q1.t[0]![3]);
  await fontReady(page, 'qalun');
  await expect(page.getByTestId('credit-texte')).toContainText('kfgqpc_qalun_v30');
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 8000 });
  await expect(page.locator('[data-testid="texte-coran"] [aria-current="true"]')).toHaveCount(1);
  await shot(page, '03-qalun-ecouter', info.project.name);
  await page.getByTestId('arreter-audio').click();

  // texte d'une autre riwāya (Warsh) avec la récitation de Qālūn : jamais de surlignage
  await page.getByTestId('choix-mushaf').selectOption('warsh');
  await expect(page.getByTestId('autre-riwaya')).toContainText('Warsh ʿan Nāfiʿ');
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 8000 });
  await expect(page.locator('[data-testid="texte-coran"] [aria-current="true"]')).toHaveCount(0);
  await page.getByTestId('arreter-audio').click();

  // Muṣḥaf page par page en Qālūn : le verset entendu est surligné
  await page.goto('/coran/mushaf?page=1&m=qalun');
  await expect(page.getByTestId('mp-mushaf')).toHaveValue('qalun');
  await expect(page.locator('[data-page="1"] [data-verse="1:1"]')).toHaveText(q1.t[0]![3]);
  await page.getByTestId('mp-ecouter').click();
  const panel = page.getByTestId('mp-audio');
  await page.getByTestId('mp-recitateur').selectOption('essai-qalun');
  await panel.getByTestId('jouer').click();
  await expect(panel.getByTestId('position')).toContainText('Verset 2', { timeout: 8000 });
  await expect(page.locator('[data-page="1"] .aya.on')).toHaveCount(1);
  await expect(page.getByTestId('mp-sans-surlignage')).toHaveCount(0);
  await shot(page, '04-qalun-mushaf-surlignage', info.project.name);
  await panel.getByTestId('arreter-audio').click();
  // récitation de Ḥafṣ sur le muṣḥaf de Qālūn : pas de surlignage, explication et retour possible
  await page.getByTestId('mp-recitateur').selectOption('essai-hafs');
  await expect(page.getByTestId('mp-sans-surlignage')).toBeVisible();
});

test('téléphone 320 px : muṣḥaf Warsh lisible, sans défilement horizontal', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'largeur de téléphone seulement');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/coran/mushaf?page=3&m=warsh');
  await expect(page.locator('[data-page="3"] .quran-text').first()).toBeVisible();
  await fontReady(page, 'warsh');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, '05-warsh-320px', info.project.name);
  if (CAP) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, '06-warsh-320px-sombre', info.project.name);
  }
});
