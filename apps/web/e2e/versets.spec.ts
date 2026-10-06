import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { tanwinDisplay } from '@awform/content/text';
import { expect, test } from './fixtures';

/**
 * Versets dans les leçons (signalement du client, ad1 leçon 1, « L'intention ») et règle élargie : jamais un
 * verset ni une phrase arabe (3 mots ou plus) sur la même ligne que le français.
 * - le verset (al-Bayyina 98:5) est un bloc à part : texte Tanzil exact (aucune normalisation), référence et
 *   traduction dessous, lien vers la récitation du Complexe ;
 * - hadiths et phrases ordinaires : l'arabe sur sa ligne, le français dessous ;
 * - écrans principaux : aucune ligne RENDUE ne mêle 3 mots arabes et du texte latin.
 * Avec VERSETS_CAPTURES=avant|apres : captures 375 px clair / sombre dans reports/versets/<phase>/.
 */
const TANZIL = join(homedir(), 'awform-content', 'coran', 'tanzil-uthmani.tsv');
const PHASE = process.env.VERSETS_CAPTURES;
const DIR = join(import.meta.dirname, '..', '..', '..', 'reports', 'versets', PHASE ?? 'x');

function tanzil(s: number, a: number): string | null {
  if (!existsSync(TANZIL)) return null;
  const line = readFileSync(TANZIL, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${s}:${a}\t`));
  return line ? line.split('\t')[1]! : null;
}

/**
 * Lignes rendues où un mot d'une PHRASE arabe (segment d'au moins 3 mots : élément `lang="ar"` ou nœud de
 * texte), même sa fin seule, côtoie un mot latin. Les termes isolés (1 ou 2 mots) restent permis dans le français. Une « ligne » :
 * mots d'un même conteneur de texte (bloc qui n'est pas un élément de flex — un élément de flex se range dans
 * la ligne de son parent) dont les boîtes se chevauchent verticalement.
 */
function lignesMelees(page: Page, scope = 'main'): Promise<string[]> {
  return page
    .locator(scope)
    .first()
    .evaluate((root) => {
      const AR = /(?=\p{L})\p{sc=Arabic}/gu;
      const LA = /(?=\p{L})\p{sc=Latin}/gu;
      const container = (el: Element): Element => {
        let e: Element | null = el;
        while (e && e !== root) {
          const d = getComputedStyle(e).display;
          const parent = e.parentElement;
          const pd = parent ? getComputedStyle(parent).display : '';
          const flexItem = /flex/.test(pd);
          if (!/^inline|contents/.test(d) && !flexItem) return e;
          e = parent;
        }
        return root;
      };
      type W = {
        c: Element;
        seg: Node;
        top: number;
        bottom: number;
        ar: boolean;
        la: boolean;
        t: string;
      };
      const words: W[] = [];
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const s = n.nodeValue ?? '';
        const p = n.parentElement;
        if (!p || !s.trim() || p.closest('script,style,[hidden],.visually-hidden,.sr-only'))
          continue;
        const c = container(p);
        const seg: Node = p.closest('[lang="ar"]') ?? n;
        for (const m of s.matchAll(/\S+/g)) {
          const ar = (m[0].match(AR) ?? []).length >= 2;
          const la = (m[0].match(LA) ?? []).length >= 2;
          if (!ar && !la) continue;
          const r = document.createRange();
          r.setStart(n, m.index);
          r.setEnd(n, m.index + m[0].length);
          for (const b of r.getClientRects()) {
            if (b.width && b.height)
              words.push({ c, seg, top: b.top, bottom: b.bottom, ar, la, t: m[0] });
            break;
          }
        }
      }
      const segWords = new Map<Node, number>();
      for (const x of words) if (x.ar) segWords.set(x.seg, (segWords.get(x.seg) ?? 0) + 1);
      const out: string[] = [];
      const seen = new Set<W>();
      for (const w of words) {
        if (seen.has(w) || !w.ar) continue;
        const mid = (w.top + w.bottom) / 2;
        const line = words.filter((x) => x.c === w.c && x.top < mid && x.bottom > mid);
        line.forEach((x) => seen.add(x));
        const phrase = line.some((x) => x.ar && (segWords.get(x.seg) ?? 0) >= 3);
        const la = line.filter((x) => x.la);
        if (phrase && la.length)
          out.push(
            `${line
              .map((x) => x.t)
              .join(' ')
              .slice(0, 140)}`,
          );
      }
      return [...new Set(out)];
    });
}

async function ouvrir(page: Page, url: string) {
  await page.goto(url);
  await page.locator('main h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test('ad1 l01 « L’intention » : le verset est un bloc à part, Tanzil exact, traduction dessous', async ({
  page,
}) => {
  await ouvrir(page, '/lecons/ad1.l01');
  const fiqh = page.locator('section.fiqh');
  await fiqh.scrollIntoViewIfNeeded();
  const bloc = fiqh.locator('[data-testid="verset-bloc"][data-verse="98:5"]');
  await expect(bloc).toHaveCount(1);
  const texte = bloc.getByTestId('verset-texte');
  const sens = bloc.getByTestId('verset-sens');
  // texte : la sous-chaîne exacte du point du livre, elle-même une sous-chaîne octet pour octet du verset Tanzil
  const r = await page.request.get('/api/v1/units/ad1.l01');
  const unit = (await r.json()) as {
    unit: {
      lesson: {
        fiqh_adab: { points: Array<{ ar: string; verset_tanzil?: { i: number; j: number } }> };
      };
    };
  };
  const pt = unit.unit.lesson.fiqh_adab.points.find((p) => p.verset_tanzil)!;
  const exact = pt.ar.slice(pt.verset_tanzil!.i, pt.verset_tanzil!.j);
  await expect(texte).toHaveText(tanwinDisplay(exact), { useInnerText: false });
  expect(await texte.evaluate((e) => e.textContent)).toBe(tanwinDisplay(exact));
  const v = tanzil(98, 5);
  if (v) expect(v.includes(exact), 'sous-chaîne exacte du verset Tanzil 98:5').toBe(true);
  // police du Muṣḥaf, ornements hors du texte, direction
  await expect(texte).toHaveClass(/quran-text/);
  expect(await texte.evaluate((e) => e.closest('[dir]')?.getAttribute('dir'))).toBe('rtl');
  await expect(bloc.locator('.orn')).toHaveCount(2);
  // référence et traduction : chacune sur sa ligne, sous le verset
  await expect(bloc.getByTestId('verset-ref')).toContainText('98:5');
  await expect(sens).toContainText('culte sincère');
  const bt = (await texte.boundingBox())!;
  const bs = (await sens.boundingBox())!;
  expect(bs.y).toBeGreaterThanOrEqual(bt.y + bt.height - 1);
  // récitation du Complexe, jamais de voix de synthèse sur le verset
  await expect(bloc.getByTestId('ecouter-recitation')).toHaveAttribute('href', /s=98&a=5/);
  await expect(bloc.locator('[data-testid="ecouter"], button')).toHaveCount(0);
  // les autres points (phrases, hadiths) : l'arabe sur sa ligne, le français dessous, plus de « — »
  const points = fiqh.locator('li.pt');
  const n = await points.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const li = points.nth(i);
    if (await li.locator('[data-testid="verset-bloc"]').count()) continue;
    const ar = li.locator('.ar').first();
    const fr = li.locator('.arfr-fr').first();
    if (!(await ar.count()) || !(await fr.count())) continue;
    const ba = (await ar.boundingBox())!;
    const bf = (await fr.boundingBox())!;
    expect(bf.y, `point ${i + 1} : français sous l'arabe`).toBeGreaterThanOrEqual(
      ba.y + ba.height - 2,
    );
    expect(await li.innerText()).not.toMatch(/^\S.*—/);
  }
  expect(await lignesMelees(page, 'section.fiqh')).toEqual([]);

  if (PHASE) {
    mkdirSync(DIR, { recursive: true });
    // hauteur suffisante : la barre du haut et celle du bas ne recouvrent pas la rubrique
    await page.setViewportSize({ width: 375, height: 2400 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await fiqh.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await fiqh.screenshot({ path: join(DIR, `ad1-l01-intention-375-${scheme}.png`) });
    }
    // autres publics : enfant (en5 l16), ado (ado2 l02), sciences (ra1 l04, re2 l08)
    await page.emulateMedia({ colorScheme: 'light' });
    for (const id of ['en5.l16', 'ado2.l02', 'ra1.l04', 're2.l08']) {
      await ouvrir(page, `/lecons/${id}`);
      const b = page.getByTestId('verset-bloc').first();
      const cible = (await b.count())
        ? b.locator('xpath=ancestor::*[self::section or self::li or self::div][2]')
        : page.locator('main');
      await cible.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await cible.screenshot({ path: join(DIR, `${id}-375-light.png`) });
    }
  }
});

/** écrans principaux : leçons (adulte, enfant, ado, sciences), lectures, Coran, Au quotidien */
const ECRANS = [
  '/lecons/ad1.l01',
  '/lecons/ad1.l04',
  '/lecons/ad1.l20',
  '/lecons/ad2.l11',
  '/lecons/ad4.l16',
  '/lecons/en1.l05',
  '/lecons/en5.l16',
  '/lecons/ado1.l03',
  '/lecons/re1.l03',
  '/lecons/re2.l08',
  '/lecons/ra1.l02',
  '/lecons/ra1.l04',
  '/lectures/ad1-01',
  '/coran',
  '/quotidien',
  '/quotidien/adhkar',
];

test('aucune ligne rendue ne mêle une phrase arabe (3 mots ou plus) et du français', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'une fois suffit (téléphone)');
  test.setTimeout(600_000);
  // contrôle du détecteur : la FIN d'une phrase arabe sur la ligne du français est repérée, un terme isolé non
  await ouvrir(page, '/lecons/ad1.l01');
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'sonde';
    d.style.width = '220px';
    d.innerHTML =
      '<p><span lang="ar" dir="rtl">وَهَٰذَا كَلَامٌ طَوِيلٌ جِدًّا يَمْتَدُّ عَلَى سَطْرَيْنِ فِي الصَّفْحَةِ</span> — suite en français</p>' +
      '<p>Le mot <span lang="ar" dir="rtl">كِتَابٌ جَدِيدٌ</span> dans la phrase.</p>';
    document.querySelector('main')!.prepend(d);
  });
  const sonde = await lignesMelees(page, '#sonde');
  expect(sonde.length, sonde.join('\n')).toBe(1);
  expect(sonde[0]).toContain('suite');
  const bad: string[] = [];
  for (const url of ECRANS) {
    await page.goto(url);
    await page.locator('main').first().waitFor();
    await page.locator('main h1, main h2').first().waitFor({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    for (const l of await lignesMelees(page)) bad.push(`${url} : ${l}`);
  }
  expect(bad, bad.join('\n')).toEqual([]);
});
