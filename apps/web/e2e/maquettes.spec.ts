import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newAdult, test } from './fixtures';

/**
 * Maquettes de la refonte visuelle de l'intérieur (branche design-wip) : « Aujourd'hui », une leçon (ad1.l01),
 * Madjaliss (liste et une séance), sur ordinateur (1440×900) et téléphone (390×844), en clair et en sombre.
 * Lancé SEULEMENT avec MAQUETTES_DIR (dossier de sortie) et MAQUETTES_PREFIXE (« avant » ou « apres ») ;
 * compte de test neuf (jamais un compte réel).
 */
const DIR = process.env.MAQUETTES_DIR;
const PREFIXE = process.env.MAQUETTES_PREFIXE ?? 'apres';
test.use({ compte: null, parEtapes: true });

test('maquettes : Aujourd’hui, leçon, Madjaliss', async ({ page }, info) => {
  test.skip(!DIR || info.project.name !== 'desktop-chromium', 'maquettes : à la demande seulement');
  test.setTimeout(240_000);
  mkdirSync(DIR!, { recursive: true });
  await newAdult(page, 'maquettes');
  const ecrans: Array<[string, string, boolean]> = [
    ['aujourdhui', '/aujourdhui', true],
    ['lecon', '/lecons/ad1.l01', false],
    ['madjaliss-liste', '/madjaliss', true],
    ['madjaliss-seance', '/madjaliss/akhdari/5', false],
  ];
  const tailles: Array<[string, number, number]> = [
    ['ordi', 1440, 900],
    ['tel', 390, 844],
  ];
  for (const [appareil, w, h] of tailles) {
    await page.setViewportSize({ width: w, height: h });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [nom, url, pleine] of ecrans) {
        await page.goto(url);
        await page.locator('main h1').first().waitFor();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        const mode = scheme === 'light' ? 'clair' : 'sombre';
        await page.screenshot({
          path: join(DIR!, `${PREFIXE}-${nom}-${appareil}-${mode}.png`),
          fullPage: pleine,
        });
      }
    }
  }
});
