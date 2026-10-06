import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import {
  demoReciters,
  fileKey,
  installDemoReciters,
  removeDemoReciters,
  serveDemoAudio,
  type DemoReciter,
} from './audio-demo';
import { close, openDisplay, openSettings } from './coran';
import { expect, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Corrections du lecteur signalées par le client (06/10/2026) :
 * 1. le verset LU (clé du fichier audio demandé) = le verset TOUCHÉ, pour chaque récitateur actif de la démo et
 *    chaque riwāya (vrais fichiers), en vue versets, page fluide et page exacte (A34) ;
 * 2. la puce d'emplacement en entier (« Al-Baqara · verset 90 · page 14 · juzʾ 1 ») ;
 * 3. un seul point d'entrée « Réglages » (icône ET libellé), tuiles des enfants ;
 * 4. la palette « vert, blanc, or » pour les adultes partout ; enfants et ados gardent leur thème.
 * Captures : CORFIX_CAPTURES=<dossier>.
 */
const CAP = process.env.CORFIX_CAPTURES;
const EXACT = process.env.E2E_MUSHAF_EXACT_ON === '1';
const mobile = (name: string) => name.startsWith('mobile');
async function shot(page: Page, name: string, project: string) {
  if (!CAP) return;
  mkdirSync(CAP, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(CAP, `${mobile(project) ? 'mobile-375' : 'bureau'}-${name}.png`),
  });
}

/** Prêt : récitateurs chargés (« Écouter » activé). */
async function ready(page: Page) {
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
}
/** Touche le verset, choisit « Répéter ce verset » ou « Écouter d'ici » ; renvoie le 1er fichier demandé. */
async function tapAndPlay(
  page: Page,
  asked: string[],
  target: Locator,
  action: 'menu-repeter' | 'menu-ecouter',
): Promise<string> {
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await expect(page.getByTestId('menu-verset')).toBeVisible();
  asked.length = 0;
  await page.getByTestId(action).click();
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
  return asked[0]!;
}
async function stop(page: Page) {
  const b = page.getByTestId('arreter-audio');
  if (await b.isEnabled().catch(() => false)) await b.click();
}

const DEMO = demoReciters();
// sourates copiées : al-Fātiḥa (basmala = verset 1 en Ḥafṣ, fichier annexe en Qālūn), al-Baqara (« الم » :
// 2:1 en Ḥafṣ, pas en Qālūn), al-Mulk (30/31 versets selon la riwāya ; as-Sūsī en sourate entière), al-Ikhlāṣ
const SURAS = [1, 2, 67, 112];
/** versets touchés (numérotation du muṣḥaf AFFICHÉ, celui de la riwāya du récitateur) */
const VERSES: [number, number][] = [
  [1, 1],
  [1, 7],
  [2, 1],
  [2, 5],
  [2, 90],
  [112, 2],
];

test.describe('1. verset lu = verset touché (vraies récitations de la démo)', () => {
  test.skip(!DEMO?.length, 'démo absente (Docker, awform-db-1) : sauté');
  test.describe.configure({ timeout: 300_000 });
  const ids = (DEMO ?? []).map((r) => r.id);
  test.beforeAll(() => installDemoReciters(ids, SURAS));
  test.afterAll(() => removeDemoReciters(ids));

  test('vue versets : chaque récitateur, chaque riwāya (muṣḥaf qui suit le récitateur)', async ({
    page,
  }) => {
    const asked = await serveDemoAudio(page);
    for (const r of DEMO as DemoReciter[]) {
      for (const [s, a] of VERSES) {
        await page.goto(`/coran/lecteur?r=${r.id}&s=${s}&a=${a}&vue=versets`);
        await ready(page);
        // le muṣḥaf affiché est celui de la riwāya du récitateur
        if (r.riwaya === 'hafs')
          await expect(page.getByTestId('mp-riwaya-affichee')).toHaveCount(0);
        else
          await expect(
            page.getByTestId('mp-riwaya-affichee').getByTestId('badge-riwaya'),
          ).toHaveAttribute('data-riwaya', r.riwaya);
        const v = page.locator(`[data-testid="texte-coran"] [data-aya="${a}"]`);
        for (const action of ['menu-repeter', 'menu-ecouter'] as const) {
          const key = await tapAndPlay(page, asked, v, action);
          expect(key, `${r.id} ${s}:${a} ${action}`).toBe(fileKey(r.id, s, a));
          // surlignage du verset entendu = verset touché
          await expect(page.locator('[data-testid="texte-coran"] .aya.now')).toHaveAttribute(
            'data-aya',
            String(a),
            { timeout: 15_000 },
          );
          await expect(page.getByTestId('position')).toContainText(`Verset ${a}`);
          await stop(page);
        }
      }
    }
  });

  test('al-Mulk : découpage différent du texte (ad-Dūrī 31/30, as-Sūsī en entier) → sourate entière, dit', async ({
    page,
  }) => {
    const asked = await serveDemoAudio(page);
    for (const r of (DEMO as DemoReciter[]).filter((x) => ['duri', 'susi'].includes(x.riwaya))) {
      await page.goto(`/coran/lecteur?r=${r.id}&s=67&a=5&vue=versets`);
      await ready(page);
      const key = await tapAndPlay(
        page,
        asked,
        page.locator('[data-testid="texte-coran"] [data-aya="5"]'),
        'menu-repeter',
      );
      // jamais le fichier « 67:5 » d'une autre numérotation : la sourate depuis son début
      expect(key, r.id).toBe(fileKey(r.id, 67, r.riwaya === 'susi' ? 0 : 1));
      await expect(page.locator('[data-testid="texte-coran"] .aya.now')).toHaveCount(0);
      if (r.riwaya === 'duri') await expect(page.getByTestId('avis-lecteur')).toBeVisible();
      await stop(page);
    }
  });

  test('pages (fluide et exacte) : début, milieu, fin de page, 1er verset, al-Fātiḥa', async ({
    page,
  }) => {
    const asked = await serveDemoAudio(page);
    const hafs = (DEMO as DemoReciter[]).filter((r) => r.riwaya === 'hafs').slice(0, 2);
    // [page, verset] : début de page (2:6 p. 3, 2:89 p. 14), milieu (2:90), fin (2:93), basmala (1:1), 1:7
    const cases: [number, number, number][] = [
      [1, 1, 1],
      [1, 1, 7],
      [3, 2, 6],
      [14, 2, 89],
      [14, 2, 90],
      [14, 2, 93],
    ];
    for (const style of EXACT ? (['fluide', 'exact'] as const) : (['fluide'] as const)) {
      await page.goto('/coran/lecteur?page=1');
      await page.evaluate((st) => {
        const k = 'awzid.mushaf.v1';
        const p = JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, unknown>;
        localStorage.setItem(k, JSON.stringify({ ...p, style: st, size: 0, memo: 0, vue: 'page' }));
      }, style);
      for (const r of hafs)
        for (const [p, s, a] of cases) {
          await page.goto(`/coran/lecteur?r=${r.id}&page=${p}`);
          const art = page.locator(`[data-testid="mushaf-page"][data-page="${p}"]`);
          if (style === 'exact')
            await expect(art).toHaveAttribute('data-exact', '1', { timeout: 15_000 });
          else await expect(art).not.toHaveAttribute('data-exact', '1');
          await ready(page);
          // jamais de page plus large que l'écran (la mesure des lignes exactes dézoomait tout le téléphone)
          const [iw, sw] = await page.evaluate(() => [
            innerWidth,
            document.documentElement.scrollWidth,
          ]);
          expect(iw, `${style} p.${p}`).toBe(page.viewportSize()!.width);
          expect(sw).toBeLessThanOrEqual(iw!);
          const v = art.locator(`[data-aya="${s}:${a}"]`).first();
          for (const action of ['menu-repeter', 'menu-ecouter'] as const) {
            const key = await tapAndPlay(page, asked, v, action);
            expect(key, `${style} ${r.id} p.${p} ${s}:${a} ${action}`).toBe(fileKey(r.id, s, a));
            const on = await art
              .locator('.on[data-aya]')
              .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-aya')))]);
            expect(on, `${style} ${s}:${a}`).toEqual([`${s}:${a}`]);
            await stop(page);
          }
        }
    }
    // page d'une autre riwāya (Qālūn, page 1 du Complexe) : al-Fātiḥa sans basmala comptée (fichier annexe)
    const q = (DEMO as DemoReciter[]).find((r) => r.riwaya === 'qalun');
    if (q) {
      await page.goto(`/coran/lecteur?r=${q.id}&page=1`);
      await ready(page);
      for (const a of [1, 7]) {
        const key = await tapAndPlay(
          page,
          asked,
          page.locator(`[data-page="1"] [data-aya="1:${a}"]`),
          'menu-repeter',
        );
        expect(key).toBe(fileKey(q.id, 1, a));
        await stop(page);
      }
    }
  });

  test('cause du défaut : changer de muṣḥaf change le récitateur (prévenu), et inversement', async ({
    page,
  }) => {
    const asked = await serveDemoAudio(page);
    const h = (DEMO as DemoReciter[]).find((r) => r.riwaya === 'hafs');
    test.skip(!h || !DEMO!.some((r) => r.riwaya === 'qalun'), 'Ḥafṣ et Qālūn requis dans la démo');
    // riwāya d'un récitateur (démo, ou fichiers d'essai de la base de test)
    const riwayaOf = (id: string) =>
      DEMO!.find((r) => r.id === id)?.riwaya ?? (id === 'essai-qalun' ? 'qalun' : 'hafs');
    const v3 = page.locator('[data-testid="texte-coran"] [data-aya="3"]');
    // texte Ḥafṣ + récitateur Ḥafṣ ; on passe le MUṢḤAF en Qālūn : le récitateur suit (avant : il restait en
    // Ḥafṣ et lisait le verset de même NUMÉRO, un autre verset que celui touché)
    await page.goto(`/coran/lecteur?r=${h!.id}&s=1&a=3&vue=versets`);
    await ready(page);
    await openDisplay(page);
    await page.locator('label:has([data-mushaf="qalun"])').click();
    await close(page);
    await expect(page.getByTestId('avis-lecteur')).toContainText('Le récitateur change');
    await expect(page.getByTestId('avis-lecteur')).toContainText('Qālūn');
    const key = await tapAndPlay(page, asked, v3, 'menu-repeter');
    expect(key.endsWith('/001003'), key).toBe(true);
    expect(riwayaOf(key.split('/')[0]!)).toBe('qalun');
    await stop(page);
    // on revient à Ḥafṣ : un récitateur Ḥafṣ est repris, jamais Qālūn sur le texte de Ḥafṣ
    await openDisplay(page);
    await page.locator('label:has([data-mushaf="hafs"])').click();
    await close(page);
    const k2 = await tapAndPlay(page, asked, v3, 'menu-repeter');
    expect(riwayaOf(k2.split('/')[0]!)).toBe('hafs');
    expect(k2.endsWith('/001003'), k2).toBe(true);
    await stop(page);
    // inversement : choisir un récitateur de Qālūn fait passer le muṣḥaf en Qālūn (prévenu)
    await openSettings(page);
    const q = DEMO!.find((r) => r.riwaya === 'qalun')!;
    await page.getByTestId('choix-recitateur').selectOption(q.id);
    await close(page);
    await expect(page.getByTestId('avis-lecteur')).toContainText('passe en Qālūn');
    await expect(page.getByTestId('mp-riwaya-affichee')).toContainText('Qālūn');
    expect(await tapAndPlay(page, asked, v3, 'menu-repeter')).toBe(fileKey(q.id, 1, 3));
    await stop(page);
    // muṣḥaf sans récitateur (Warsh) : on le dit, rien ne se lit dans une autre numérotation
    await openDisplay(page);
    await page.locator('label:has([data-mushaf="warsh"])').click();
    await close(page);
    await expect(page.getByTestId('avis-lecteur')).toContainText('Pas encore de récitateur');
  });
});

test('2. puce : « sourate · verset · page · juzʾ » en entier et lisible (téléphone, 5 langues)', async ({
  page,
}, info) => {
  test.skip(!mobile(info.project.name), 'puce : téléphone et tablette');
  for (const w of [320, 375, 414, 768]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/coran/lecteur?s=2&a=90');
    const puce = page.getByTestId('puce');
    await expect(puce).toHaveAttribute('aria-label', 'Al-Baqara · verset 90 · page 14 · juzʾ 1');
    await expect(puce.locator('.cs')).toHaveText('Al-Baqara');
    // blocs insécables séparés par « · » (dessiné entre eux)
    await expect(puce.locator('.cd .nw')).toHaveText(['verset 90', 'page 14', 'juzʾ 1']);
    // deux lignes au plus, rien de coupé, pas de défilement horizontal
    const m = await puce.evaluate((el) => {
      const cd = el.querySelector('.cd') as HTMLElement;
      return {
        cut: cd.scrollWidth > cd.clientWidth + 1,
        h: el.getBoundingClientRect().height,
        page: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(m.cut, `${w}`).toBe(false);
    expect(m.page, `${w}`).toBe(true);
    if (w === 375) await shot(page, 'puce', info.project.name);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  try {
    for (const [lang, txt] of [
      ['en', 'verse 90 · page 14 · juzʾ 1'],
      ['es', 'aleya 90 · página 14 · juzʾ 1'],
      ['de', 'Vers 90 · Seite 14 · Dschuzʾ 1'],
      ['ar', 'الآية'],
    ] as const) {
      await setLocale(page, lang);
      await page.goto('/coran/lecteur?s=2&a=90');
      const cd = page.getByTestId('puce').locator('.cd');
      await expect(page.getByTestId('puce')).toHaveAttribute('aria-label', new RegExp(txt));
      const label = (await page.getByTestId('puce').getAttribute('aria-label')) ?? '';
      await expect(cd.locator('.nw')).toHaveCount(3);
      expect(label).not.toMatch(/\.\.|\bv\.|\bp\./);
      const cut = await cd.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(cut, lang).toBe(false);
    }
  } finally {
    await setLocale(page, 'fr');
  }
});
/** Langue de l'interface (langues en préparation montrées, comme le lot 15). */
async function setLocale(page: Page, code: string) {
  await page.goto('/compte');
  const b = page.locator(`[data-locale="${code}"]`);
  if (!(await b.isVisible())) await page.getByTestId('langues-preparation').check();
  if ((await b.getAttribute('aria-pressed')) === 'true' || (await b.getAttribute('aria-current')))
    return;
  await Promise.all([page.waitForEvent('load'), b.click()]);
}

test('3. un seul point d’entrée « Réglages » (icône et libellé) : toutes les sections, rien ailleurs', async ({
  page,
}, info) => {
  await page.goto('/coran/lecteur?page=3');
  const b = page.getByTestId('ouvrir-reglages-lecteur');
  await expect(b).toBeVisible();
  await expect(b).toHaveText('Réglages');
  await expect(b.locator('svg')).toHaveCount(1);
  // plus d'icône mystère « ⋯ » ni de feuille « Affichage » à part
  await expect(page.getByTestId('ouvrir-affichage')).toHaveCount(0);
  await b.click();
  const p = page.getByTestId('reglages');
  await expect(p).toBeVisible();
  for (const id of [
    'reglages-ecoute',
    'reglages-recitateur',
    'reglages-mushaf',
    'affichage',
    'reglages-memoriser',
    'hors-ligne-sourate',
  ])
    await expect(p.getByTestId(id)).toHaveCount(1);
  for (const txt of [
    'Écoute',
    'Récitateur',
    'Muṣḥaf',
    'Affichage',
    'Traduction',
    'Mémoriser',
    'Hors ligne',
  ])
    await expect(p.locator('.sauts')).toContainText(txt);
  // Muṣḥaf : les deux styles de page (choix gardé) et les riwāyāt décrites comme la liste des récitateurs
  await expect(p.getByTestId('style-page').locator('[data-style]')).toHaveCount(2);
  await expect(p.locator('[data-mushaf]')).toHaveCount(7);
  await expect(p.locator('label:has([data-mushaf="warsh"])')).toContainText('Maghreb');
  await p.locator('label:has([data-style="fluide"])').click();
  await shot(page, 'reglages-adulte', info.project.name);
  await close(page);
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('awzid.mushaf.v1') ?? '{}') as { style?: string }).style,
    ),
  ).toBe('fluide');
  // la taille du texte agrandit le texte coranique
  const fs0 = await page
    .locator('[data-page="3"] .flow')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await b.click();
  await p.getByTestId('taille-2').check({ force: true });
  await close(page);
  const fs2 = await page
    .locator('[data-page="3"] .flow')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fs2).toBeGreaterThan(fs0 * 1.4);
  await b.click();
  await p.getByTestId('taille-0').check({ force: true });
  await p.locator('label:has([data-style="exact"])').click();
  await close(page);
});

test.describe('famille', () => {
  test.use({ compte: 'parent' });
  test('3 bis. enfant : quatre grosses tuiles (Écouter, Répéter, Plus grand, Masquer) ; 4. thème gardé', async ({
    page,
  }, info) => {
    await pickProfile(page, 'Yanis');
    await page.goto('/coran/lecteur?page=604');
    // 4. l'enfant garde le Jardin, y compris dans l'espace Coran (pas de palette verdure)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'jardin');
    await expect(page.locator('html')).not.toHaveAttribute('data-palette', /.+/);
    await page.getByTestId('ouvrir-reglages-lecteur').click();
    const tiles = page.getByTestId('reglages-enfant');
    await expect(tiles.locator('.tuile')).toHaveCount(4);
    for (const id of ['tuile-ecouter', 'tuile-repeter', 'tuile-grand', 'tuile-masquer']) {
      const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBeGreaterThanOrEqual(96);
    }
    // le reste est là pour le parent, replié
    await expect(page.getByTestId('reglages-parent')).not.toHaveAttribute('open', '');
    await shot(page, 'reglages-enfant', info.project.name);
    await page.getByTestId('tuile-grand').click();
    await expect(page.getByTestId('tuile-grand')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('tuile-masquer').click();
    await expect(page.getByTestId('tuile-masquer')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('tuile-masquer').click();
    await page.getByTestId('tuile-grand').click();
    await page.getByTestId('tuile-grand').click();
    await expect(page.getByTestId('tuile-grand')).toHaveAttribute('aria-pressed', 'false');
    await close(page);
  });
});

test.describe('ado', () => {
  test.use({ compte: null });
  test('4. ado : « Nuit étoilée » gardée dans l’espace Coran', async ({ page }) => {
    // compte adulte de 16 ans (profil « ado »), créé pour ce test : la famille de test reste inchangée
    const r = await page.request.post('/api/v1/auth/signup', {
      headers: { 'x-awform': '1' },
      data: {
        kind: 'adulte',
        email: `ado-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`,
        password: password(),
        country: 'FR',
        locale: 'fr',
        birthYear: new Date().getFullYear() - 16,
        pseudonym: 'Ines',
        consents: ['cgu'],
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    await page.goto('/coran/lecteur?page=604');
    await expect(page.locator('html')).toHaveAttribute('data-public', 'ado');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nuit');
    await expect(page.locator('html')).not.toHaveAttribute('data-palette', /.+/);
  });
});
test('4. adulte : palette « vert, blanc, or » partout (thème clair par défaut)', async ({
  page,
}, info) => {
  for (const p of ['/aujourdhui', '/', '/quotidien', '/coran/lecteur?page=1']) {
    await page.goto(p);
    await expect(page.locator('html')).toHaveAttribute('data-public', 'adulte');
    await expect(page.locator('html'), p).toHaveAttribute('data-palette', 'verdure');
  }
  await page.goto('/aujourdhui');
  await shot(page, 'theme-adulte', info.project.name);
});
