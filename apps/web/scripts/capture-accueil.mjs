// Captures de la page d'accueil publique (maquettes) : ordinateur 1440×900 et téléphone 390×844, clair et sombre.
// Usage (serveur de prévisualisation lancé à part, port libre) : node scripts/capture-accueil.mjs http://127.0.0.1:4391 ../../maquettes
import { chromium } from '@playwright/test';
const base = process.argv[2];
const out = process.argv[3];
const chemin = process.argv[4] ?? '/bienvenue';
const browser = await chromium.launch();
const cas = [
  ['ordi', { width: 1440, height: 900 }, 1, false],
  ['mobile', { width: 390, height: 844 }, 2, true],
];
for (const [nom, viewport, dpr, mobile] of cas)
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: dpr,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: scheme,
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    await page.goto(base + chemin);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const large = await page.evaluate(() => document.documentElement.scrollWidth);
    const suffixe = scheme === 'dark' ? '-sombre' : '';
    await page.screenshot({ path: `${out}/accueil-${nom}${suffixe}.png`, fullPage: true });
    console.log(nom, scheme, 'scrollWidth', large, 'viewport', viewport.width);
    await ctx.close();
  }
await browser.close();
