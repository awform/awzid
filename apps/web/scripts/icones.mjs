// Icônes de l'application, générées à partir des SVG de la marque (non modifiés) avec Chromium (Playwright).
// Usage (une fois, ou si la marque change) : node scripts/icones.mjs
// Sources : static/awzid-icone.svg et static/awzid-icone-petite.svg (= static/favicon.svg).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const STATIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');
const lire = (f) => readFileSync(join(STATIC, f), 'utf8');
mkdirSync(join(STATIC, 'icons'), { recursive: true });

const EMERAUDE = '#0B6E4F';
const icone = lire('awzid-icone.svg');
const petite = lire('awzid-icone-petite.svg');

// « maskable » : symbole (couleurs de l'icône, lisibles sur émeraude) dans les 66 % centraux, fond plein, sans coins arrondis
const interieur = icone.match(/<g transform="[^"]*">([\s\S]*)<\/g>/)[1];
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${EMERAUDE}"/><g transform="translate(256 256) scale(1.72) translate(-160 -144)">${interieur}</g></svg>`;
// apple-touch : iOS remplit la transparence en noir et arrondit lui-même : fond émeraude derrière les coins de l'icône
const apple = icone.replace(
  /(<svg[^>]*>)/,
  `$1<rect width="1024" height="1024" fill="${EMERAUDE}"/>`,
);

const cibles = [
  [petite, 16, 'favicon-16.png'],
  [petite, 32, 'favicon-32.png'],
  [petite, 48, 'favicon-48.png'],
  [apple, 180, 'apple-touch-icon.png'],
  [icone, 192, 'icons/icon-192.png'],
  [icone, 512, 'icons/icon-512.png'],
  [maskable, 512, 'icons/icon-maskable-512.png'],
];

const browser = await chromium.launch();
try {
  for (const [svg, n, nom] of cibles) {
    const page = await browser.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block;width:${n}px;height:${n}px}</style><img src="${uri}">`,
    );
    await page.evaluate(() => document.querySelector('img').decode());
    writeFileSync(join(STATIC, nom), await page.screenshot({ omitBackground: true, type: 'png' }));
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('icônes générées :', cibles.map((c) => c[2]).join(', '));
