import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Arabe et français sur la même ligne (signalement du client) : chaque nœud de texte affiché doit être
 * d'UNE seule écriture, et son plus proche ancêtre porteur de `dir` doit avoir la bonne direction
 * (arabe → rtl, latin → ltr). Cas réels des livres : objectifs, notions, consignes, bulles, syllabes,
 * tajwīd, références de hadith. Avec BIDI_CAPTURES=avant|apres : captures à 360 et 320 px dans
 * reports/bidi/<phase>/.
 */
const CASES: { id: string; url: string; text: string | RegExp }[] = [
  { id: '01-objectif-pluriels', url: '/lecons/ad2.l11', text: 'former les pluriels réguliers' },
  { id: '02-tajwid-ghunna', url: '/lecons/ad2.l11', text: 'Chant du nez complet' },
  { id: '11-exercice-tajwid', url: '/lecons/ad2.l11', text: 'le chant du nez dure 2 temps' },
  { id: '03-notion-conjugaison', url: '/lecons/en4.l07', text: 'Au présent, la lettre du début' },
  { id: '04-consigne-exercice', url: '/lecons/ad1.l01', text: 'trois points au-dessus' },
  { id: '05-bulle-scene', url: '/lecons/ad1.l08', text: /ainsi que j.écris mon prénom/ },
  { id: '06-syllabes-ar-latin', url: '/lecons/ad1.l23', text: '= nous' },
  { id: '07-sciences-termes', url: '/lecons/ra1.l02', text: 'Les savants ajoutent trois notions' },
  { id: '08-notion-fatha', url: '/lecons/ad1.l01', text: /La fat[hḥ]a \(/ },
  { id: '09-dialogue-note', url: '/lecons/ad1.l10', text: /s.adresse à un homme/ },
  { id: '10-exemple-long', url: '/lecons/ad1.l20', text: 'œuvrer (rang 45)' },
];

const PHASE = process.env.BIDI_CAPTURES;
const DIR = join(import.meta.dirname, '..', '..', '..', 'reports', 'bidi', PHASE ?? 'x');

async function target(page: Page, c: (typeof CASES)[number]): Promise<Locator> {
  await page.goto(c.url);
  await page.locator('main h1').first().waitFor();
  const t = page.getByText(c.text).first();
  await t.waitFor({ timeout: 15_000 });
  return t.locator('xpath=ancestor-or-self::*[self::p or self::li or self::div][1]');
}

/** Nœuds de texte fautifs : deux écritures mêlées, ou direction de l'ancêtre contraire à l'écriture. */
function fautes(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const AR = /(?=\p{L})\p{sc=Arabic}/u;
    const LA = /(?=\p{L})\p{sc=Latin}/u;
    const out: string[] = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const s = n.nodeValue ?? '';
      const ar = AR.test(s);
      const la = LA.test(s);
      if (!ar && !la) continue;
      const dir = n.parentElement?.closest('[dir]')?.getAttribute('dir') ?? 'ltr';
      if (ar && la) out.push(`mêlé : ${s}`);
      else if (ar && dir !== 'rtl') out.push(`arabe hors rtl : ${s}`);
      else if (la && dir !== 'ltr') out.push(`latin hors ltr : ${s}`);
    }
    return out;
  });
}

test('arabe et français : chaque segment est isolé dans sa direction (cas réels des livres)', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'une fois suffit (téléphone)');
  test.setTimeout(300_000);
  const bad: string[] = [];
  for (const c of CASES) {
    const el = await target(page, c);
    for (const f of await fautes(el)) bad.push(`${c.id} ${f}`);
    if (PHASE) {
      mkdirSync(DIR, { recursive: true });
      for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 760 });
        await page.evaluate(() => document.fonts.ready);
        await el.scrollIntoViewIfNeeded();
        await el.screenshot({ path: join(DIR, `${width}-${c.id}.png`) });
      }
      await page.setViewportSize({ width: 412, height: 839 });
    }
  }
  expect(bad, bad.join('\n')).toEqual([]);
});
