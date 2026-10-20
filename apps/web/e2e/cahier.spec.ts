import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { audioFileId } from '@awform/content/audio-cle';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Cahier de lecture d'Adultes 1 (20/10/2026) — interrupteur `cahier_lecture` :
 *  - COUPÉ (défaut hors démonstration) : ni accès dans le niveau ni lien dans la leçon, page « pas encore ouvert »,
 *    aucun fichier du cahier chargé ;
 *  - ALLUMÉ par l'administrateur (exception par pays, sans redéploiement) : accès du niveau, sommaire, page du jour
 *    de la leçon (concordance), lecture guidée (la case s'allume au rythme de la voix) et 6 cases mémorisées, minute
 *    de lecture chronométrée, bilan à froid avec renvoi au rattrapage, atelier au toucher et au clavier, pont vers le
 *    Coran (récitation stockée seulement, jamais un fichier de synthèse), hors ligne une fois le niveau téléchargé,
 *    accessibilité AA (clair et sombre), cibles ≥ 44 px.
 * L'audio de synthèse du niveau est SIMULÉ (liste des fichiers du cahier, silence de 0,3 s) : le test ne dépend pas des
 * fichiers importés sur la machine. CAHIER_CAPTURES=<dossier> : captures 390 px (clair et sombre) de 8 écrans clés et
 * une planche (7 000 px de haut au plus).
 */
const H = { 'x-awform': '1' };
const PAYS = 'LT';
const CAPTURES = process.env.CAHIER_CAPTURES;
const donnees = JSON.parse(
  readFileSync(new URL('../static/cahier-data/ad1.json', import.meta.url), 'utf8'),
) as {
  pages: Array<{
    id: string;
    blocs: Array<{ el: unknown[] }>;
    texte?: { lignes: string[]; titre?: string };
  }>;
};
/** textes de synthèse du cahier (jamais le Coran) → identifiants des fichiers simulés */
const FICHIERS = (() => {
  const ids = new Set<string>();
  const voir = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(voir);
    if (!x || typeof x !== 'object') return;
    const e = x as { ar?: unknown; a?: unknown; sep?: string[] };
    if (typeof e.ar === 'string' && e.a && e.a !== 'q') ids.add(audioFileId(e.ar));
    for (const s of e.sep ?? []) ids.add(audioFileId(s));
    for (const v of Object.values(x)) if (v && typeof v === 'object') voir(v);
  };
  voir(donnees.pages);
  for (const p of donnees.pages) {
    for (const l of p.texte?.lignes ?? []) ids.add(audioFileId(l));
    if (p.texte?.titre) ids.add(audioFileId(p.texte.titre));
  }
  ids.delete('');
  return [...ids];
})();
// 0,3 s de silence (MP3 24 kHz mono) : la voix simulée de la lecture guidée
const SILENCE = Buffer.from(
  'SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAAPAAAGYAAtLS0tLS08PDw8PDw8S0tLS0tLWlpaWlpaWmlpaWlpaWl4eHh4eHiHh4eHh4eHlpaWlpaWlqWlpaWlpbS0tLS0tLTDw8PDw8PD0tLS0tLS4eHh4eHh4fDw8PDw8PD///////8AAAAATGF2YzYyLjExAAAAAAAAAAAAAAAAJANgAAAAAAAABmADyt9kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80TEAAAAA0gAAAAATEFNRTMuMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEUwAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEpgAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=',
  'base64',
);

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-cah-${test.info().project.name}-${Date.now()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
  );
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adm = await ctx.newPage();
  expect(
    (
      await adm.request.post('/api/v1/auth/login', {
        headers: H,
        data: { email, password: password() },
      })
    ).status(),
  ).toBe(200);
  const { secret } = (await (
    await adm.request.post('/api/v1/auth/totp/setup', { headers: H, data: {} })
  ).json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}
/** retire les exceptions de cahier_lecture (aucune trace pour les autres suites) */
async function remettre(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string }> }>;
  };
  for (const r of d.fonctions.find((f) => f.cle === 'cahier_lecture')?.regles ?? [])
    await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
}

/** fichiers du cahier (groupe à la demande) déjà chargés par la page */
const chargesCahier = async (page: Page) => {
  const liste = (await (await page.request.get('/_app/cahier.json')).json()) as string[];
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  return liste.filter((f) => vus.includes(f));
};
/** audio de synthèse du niveau simulé : la liste des fichiers du cahier, chacun 0,3 s de silence */
async function voixSimulee(page: Page, demandes: string[] = []) {
  await page.route('**/api/v1/lecons-audio/niveaux/ad1', (r) =>
    r.fulfill({
      json: {
        niveau: 'ad1',
        fichiers: FICHIERS,
        octets: FICHIERS.length * SILENCE.length,
        mention: '',
        credits: [],
      },
    }),
  );
  await page.route('**/api/v1/lecons-audio/fichiers/*.mp3', (r) => {
    demandes.push(new URL(r.request().url()).pathname);
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  return demandes;
}
async function cibles(page: Page) {
  const petites = await page
    .locator('.cahier button, .cahier a.bouton, .cahier a.ligne, .cahier .nav a')
    .evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            t: (e.textContent ?? '').trim().slice(0, 30),
            h: Math.round(r.height),
            w: Math.round(r.width),
          };
        })
        .filter((x) => x.h < 44 || x.w < 44),
    );
  expect(petites).toEqual([]);
}
async function axe(page: Page) {
  // page entière dans la fenêtre : la barre d'onglets (fixe, en bas) ne recouvre aucun élément analysé
  const vp = page.viewportSize()!;
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vp.width, height: h + 300 });
  await page.waitForTimeout(150);
  const r = await new AxeBuilder({ page })
    .include('.cahier')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160)})`).join(' | ')}`,
    ),
  ).toEqual([]);
  await page.setViewportSize(vp);
}
const ouvrirPage = async (page: Page, id: string) => {
  await page.goto(`/cahier/ad1?p=${id}`);
  await expect(page.locator(`article.page-cahier[data-page="${id}"]`)).toBeVisible({
    timeout: 20_000,
  });
};

test.describe.configure({ mode: 'serial' });

test('interrupteur COUPÉ (défaut) : ni accès ni lien, page fermée, aucun fichier du cahier', async ({
  page,
}) => {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  const f = (await (
    await page.request.get(`/api/v1/fonctions?profil=${me.profiles[0]!.id}`)
  ).json()) as { fonctions: Record<string, boolean> };
  expect(f.fonctions.cahier_lecture).toBe(false);
  await page.goto('/niveaux/ad1');
  await expect(page.getByTestId('unit').first()).toBeVisible();
  await expect(page.getByTestId('cahier-acces')).toHaveCount(0);
  await page.goto('/lecons/ad1.l01');
  await expect(page.locator('article.lesson h1')).toBeVisible();
  await expect(page.getByTestId('cahier-lien')).toHaveCount(0);
  expect(await chargesCahier(page)).toEqual([]);
  // adresse tapée à la main : « pas encore ouvert », et le code du cahier n'est jamais chargé (seule sa feuille de
  // style est reliée par la page, comme pour tout module à la demande d'une route)
  await page.goto('/cahier/ad1');
  await expect(page.getByTestId('cahier-ferme')).toBeVisible();
  expect((await chargesCahier(page)).filter((f) => f.endsWith('.js'))).toEqual([]);
});

test.describe('interrupteur ALLUMÉ (exception par pays, sans redéploiement)', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    const r = await adm.request.post('/api/v1/admin/fonctions/cahier_lecture/regles', {
      headers: H,
      data: { effet: 'on', pays: PAYS },
    });
    expect(r.status(), await r.text()).toBe(201);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  let erreurs: string[] = [];
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await newAdult(page, 'cah', PAYS);
    await page.setViewportSize({ width: 390, height: 844 });
  });
  // aucune erreur de script dans la page, quel que soit l'écran
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('accès du niveau, sommaire, page du jour de la leçon ; cahier chargé à la première ouverture', async ({
    page,
  }) => {
    // la leçon 1 propose sa page du jour (concordance) : la page 4 ; le cahier n'est chargé qu'à ce moment
    await page.goto('/lecons/ad1.l01');
    await expect(page.getByTestId('cahier-lien')).toBeVisible();
    expect(await chargesCahier(page)).toEqual([]);
    await page.getByTestId('cahier-lien').click();
    await expect(page).toHaveURL(/\/cahier\/ad1\?p=P004$/);
    await expect(page.locator('article.page-cahier h1')).toContainText('Leçon 1');
    expect((await chargesCahier(page)).length).toBeGreaterThan(0);
    // accès dans le niveau (le niveau ouvert est gardé pour le hors ligne, avec son cahier), puis le sommaire
    await page.goto('/niveaux/ad1');
    await page.getByTestId('cahier-acces').click();
    await expect(page.getByTestId('cahier')).toBeVisible();
    // 121 pages du parcours, puis les 11 pages de rattrapage
    await expect(page.locator('a.ligne[data-page]')).toHaveCount(132);
    await expect(page.locator('a.ligne[data-page="P122"]')).toBeVisible();
    await expect(page.getByTestId('cahier-suite')).toContainText('page 1');
    await page.locator('a.ligne[data-page="P004"]').click();
    await expect(page.locator('article.page-cahier h1')).toContainText('Leçon 1');
    // l'arabe est affiché tel quel, sur sa propre ligne de case ; la page suivante s'ouvre
    await expect(page.locator('.page-cahier .el .ar').first()).toHaveAttribute('dir', 'rtl');
    await page.locator('a[rel="next"]').click();
    await expect(page).toHaveURL(/p=P005$/);
  });

  test('lecture guidée : chaque case s’allume au rythme de la voix ; 6 cases mémorisées', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await ouvrirPage(page, 'P008');
    const ordre = await page
      .locator('article.page-cahier .el[data-k]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.k!));
    expect(ordre.length).toBe(9);
    await page.evaluate(() => {
      const w = window as unknown as { __actifs: string[] };
      w.__actifs = [];
      new MutationObserver(() => {
        const a = document.querySelector('.page-cahier .el.actif') as HTMLElement | null;
        if (a && w.__actifs.at(-1) !== a.dataset.k) w.__actifs.push(a.dataset.k!);
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.getByTestId('lire-modele').click();
    await expect(page.getByTestId('arreter')).toBeVisible();
    await expect(page.locator('button.case[data-case="0"]')).toHaveAttribute(
      'aria-pressed',
      'true',
      {
        timeout: 40_000,
      },
    );
    expect(
      await page.evaluate(() => (window as unknown as { __actifs: string[] }).__actifs),
    ).toEqual(ordre);
    expect(sons.length).toBeGreaterThanOrEqual(9);
    // toucher un mot le fait entendre
    const avant = sons.length;
    await page.locator('.page-cahier .el[data-k="0.3"]').click();
    await expect.poll(() => sons.length).toBeGreaterThan(avant);
    // lectures seul, case cochée à la main ; tout est gardé sur l'appareil
    await page.getByTestId('lu-seul').click();
    await page.getByTestId('lu-seul').click();
    await page.locator('button.case[data-case="1"]').click();
    await page.reload();
    await expect(page.locator('article.page-cahier')).toBeVisible();
    for (const [i, v] of [
      [0, 'true'],
      [1, 'true'],
      [2, 'false'],
      [3, 'true'],
      [4, 'true'],
      [5, 'false'],
    ] as const)
      await expect(page.locator(`button.case[data-case="${i}"]`)).toHaveAttribute(
        'aria-pressed',
        v,
      );
    await cibles(page);
  });

  test('minute de lecture chronométrée, bilan à froid et renvoi au rattrapage', async ({
    page,
  }) => {
    await page.clock.install();
    await voixSimulee(page);
    const minute = donnees.pages.find((p) => /Minute de lecture n°1/.test(JSON.stringify(p)))!.id;
    await ouvrirPage(page, minute);
    await page.getByTestId('mesure-demarrer').click();
    await expect(page.locator('.mesure [role="timer"]')).toContainText('60');
    await page.clock.fastForward(61_000);
    await expect(page.getByTestId('mesure-valeur')).toBeVisible();
    await page.getByTestId('mesure-valeur').fill('38');
    await page.getByTestId('mesure-enregistrer').click();
    await expect(page.getByTestId('mesure-historique')).toContainText('38');

    const bilan = donnees.pages.find((p) =>
      /Bilan de lecture à froid n°1/.test(JSON.stringify(p)),
    )!.id;
    await ouvrirPage(page, bilan);
    const sons: string[] = [];
    page.on('request', (r) => r.url().includes('/lecons-audio/fichiers/') && sons.push(r.url()));
    // à froid : toucher un mot le marque « à revoir », sans le faire entendre
    await page.locator('.page-cahier .el[data-k="0.0"]').click();
    await page.locator('.page-cahier .el[data-k="0.1"]').click();
    await expect(page.locator('.page-cahier .el.rate')).toHaveCount(2);
    expect(sons).toEqual([]);
    await page.getByTestId('bilan-fini').click();
    await expect(page.getByTestId('bilan-resultat')).toContainText('8 sur 10');
    await expect(page.locator('[data-rattrapage]').first()).toBeVisible();
    const cible = await page.locator('[data-rattrapage]').first().getAttribute('data-rattrapage');
    await page.locator('[data-rattrapage]').first().click();
    await expect(page).toHaveURL(new RegExp(`p=${cible}$`));
    await expect(page.locator('article.page-cahier h1')).toContainText('Rattrapage');
  });

  test('atelier « je compose le mot » au toucher et au clavier', async ({ page }) => {
    const sons = await voixSimulee(page);
    const grille = donnees.pages.find((p) =>
      /La grille de la lettre ب/.test(JSON.stringify(p)),
    )!.id;
    await ouvrirPage(page, grille);
    await page.getByTestId('atelier-ouvrir').click();
    await expect(page.getByTestId('atelier')).toBeVisible();
    // au toucher : ثَبَتَ (3 fatḥa, la case suivante s'active seule)
    for (let i = 0; i < 3; i++) await page.locator('button.signe[data-signe="fatha"]').click();
    await page.getByTestId('atelier-valider').click();
    await expect(page.getByTestId('atelier-retour')).toHaveAttribute('data-retour', 'juste');
    await expect.poll(() => sons.length).toBeGreaterThan(0);
    // au clavier : mot suivant, une erreur, puis la bonne réponse (touches 1 à 7, flèches, Entrée)
    await page.getByTestId('atelier-suivant').click();
    await page.getByTestId('atelier').focus();
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('atelier-retour')).toHaveAttribute('data-retour', 'faux');
    await page.keyboard.press('ArrowRight');
    for (const k of ['1', '1', '1']) await page.keyboard.press(k);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('atelier-retour')).toHaveAttribute('data-retour', 'juste');
    await cibles(page);
  });

  test('pont vers le Coran : récitation stockée seulement, jamais un fichier de synthèse', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    const recitations: string[] = [];
    page.on('request', (r) => /\/quran\//.test(r.url()) && recitations.push(r.url()));
    const fatiha = donnees.pages.find((p) => /Al-Fātiḥa/.test(JSON.stringify(p)))!.id;
    await ouvrirPage(page, fatiha);
    await expect(page.locator('.page-cahier .el.verset')).toHaveCount(7);
    await page.locator('.page-cahier .el.verset').first().click();
    await expect.poll(() => recitations.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(recitations.some((u) => u.includes('ayyoub-hafs'))).toBe(true);
    await page.getByTestId('lire-modele').click();
    await page.waitForTimeout(1500);
    await page
      .getByTestId('arreter')
      .click()
      .catch(() => undefined);
    expect(sons).toEqual([]);
    // reconnaissance (graphies du muṣḥaf) : même règle
    const mushaf = donnees.pages.find((p) => /Graphies du muṣḥaf/.test(JSON.stringify(p)))!.id;
    await ouvrirPage(page, mushaf);
    await page.locator('.page-cahier .mushaf .el').first().click();
    await page.waitForTimeout(1000);
    expect(sons).toEqual([]);
  });

  test('hors ligne : le niveau téléchargé, le cahier s’ouvre et se lit sans réseau', async ({
    page,
    context,
  }) => {
    // le service worker d'abord (il garde les fichiers demandés au téléchargement du niveau), puis le niveau
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.goto('/niveaux/ad1');
    await expect(page.getByTestId('cahier-acces')).toBeVisible();
    await expect(page.getByTestId('etat-hors-ligne')).toContainText('Disponible', {
      timeout: 60_000,
    });
    expect(
      await page.evaluate(
        () =>
          new Promise<boolean>((ok) => {
            const r = indexedDB.open('awform');
            r.onsuccess = () => {
              const g = r.result.transaction('kv').objectStore('kv').get('cahier-data:ad1');
              g.onsuccess = () => ok(!!g.result);
              g.onerror = () => ok(false);
            };
            r.onerror = () => ok(false);
          }),
      ),
    ).toBe(true);
    await context.setOffline(true);
    await page.goto('/cahier/ad1?p=P047');
    await expect(page.locator('article.page-cahier[data-page="P047"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.page-cahier .grille .el')).toHaveCount(15);
    await page.locator('button.case[data-case="0"]').click();
    await expect(page.locator('button.case[data-case="0"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await context.setOffline(false);
  });

  test('accessibilité AA (clair et sombre), cibles ≥ 44 px', async ({ page }) => {
    await voixSimulee(page);
    await page.goto('/cahier/ad1');
    await expect(page.getByTestId('cahier-suite')).toBeVisible();
    for (const m of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: m });
      await axe(page);
    }
    await cibles(page);
    for (const id of ['P047', 'P026', 'P115']) {
      await ouvrirPage(page, id);
      if (id === 'P047') await page.getByTestId('atelier-ouvrir').click();
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await axe(page);
      }
      await cibles(page);
    }
    const bilan = donnees.pages.find((p) =>
      /Bilan de lecture à froid n°1/.test(JSON.stringify(p)),
    )!.id;
    await ouvrirPage(page, bilan);
    await page.locator('.page-cahier .el[data-k="0.0"]').click();
    await page.getByTestId('bilan-fini').click();
    for (const m of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: m });
      await axe(page);
    }
  });

  test('captures 390 px de 8 écrans clés (clair et sombre) et planche', async ({ page }) => {
    test.skip(!CAPTURES, 'CAHIER_CAPTURES non défini');
    test.setTimeout(600_000);
    const dir = CAPTURES!;
    mkdirSync(dir, { recursive: true });
    await voixSimulee(page);
    const fichiers: string[] = [];
    const prendre = async (nom: string, pleine = false) => {
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await page.waitForTimeout(250);
        const f = join(dir, `${nom}_${m === 'light' ? 'clair' : 'sombre'}.png`);
        await page.screenshot({ path: f, fullPage: pleine });
        fichiers.push(f);
      }
      await page.emulateMedia({ colorScheme: 'light' });
    };
    const id = (re: RegExp) => donnees.pages.find((p) => re.test(JSON.stringify(p)))!.id;
    // 1. accès dans le niveau
    await page.goto('/niveaux/ad1');
    await expect(page.getByTestId('cahier-acces')).toBeVisible();
    await prendre('01-niveau-acces');
    // 2. sommaire
    await page.goto('/cahier/ad1');
    await expect(page.getByTestId('cahier-suite')).toBeVisible();
    await prendre('02-sommaire');
    // 3. grille de 15 cases ; 4. lecture guidée en cours (la case allumée)
    await ouvrirPage(page, id(/La grille de la lettre ب/));
    await page.locator('.page-cahier .bloc[data-bloc="grille"]').scrollIntoViewIfNeeded();
    await prendre('03-grille');
    await page.getByTestId('lire-modele').click();
    await expect(page.locator('.page-cahier .el.actif[data-k="0.1.1"]')).toBeVisible({
      timeout: 20_000,
    });
    await prendre('04-lecture-guidee');
    await page.getByTestId('arreter').click();
    // 5. atelier validé
    await page.getByTestId('atelier-ouvrir').click();
    for (let i = 0; i < 3; i++) await page.locator('button.signe[data-signe="fatha"]').click();
    await page.getByTestId('atelier-valider').click();
    await page.getByTestId('atelier').scrollIntoViewIfNeeded();
    await prendre('05-atelier');
    // 6. bilan à froid et rattrapage
    await ouvrirPage(page, id(/Bilan de lecture à froid n°1/));
    await page.locator('.page-cahier .el[data-k="0.2"]').click();
    await page.locator('.page-cahier .el[data-k="0.4"]').click();
    await page.getByTestId('bilan-fini').click();
    await page.getByTestId('bilan').scrollIntoViewIfNeeded();
    await prendre('06-bilan');
    // 7. texte suivi et lecture chronométrée
    await ouvrirPage(page, id(/Texte suivi : Au marché \(1\/2\)/));
    await page.locator('.page-cahier .texte').scrollIntoViewIfNeeded();
    await prendre('07-texte');
    // 8. pont vers le Coran
    await ouvrirPage(page, id(/Al-Fātiḥa/));
    await page.locator('.page-cahier .sourate').scrollIntoViewIfNeeded();
    await prendre('08-coran');
    // planche : une ligne claire, une ligne sombre (pixels CSS, 7 000 px de haut au plus)
    const img = (f: string) =>
      `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()!.replace('.png', '')}</figcaption></figure>`;
    const p = await page.context().newPage();
    await p.setViewportSize({ width: 1700, height: 1000 });
    await p.setContent(
      `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#efe7d6;font:14px sans-serif;color:#084c38}h1{font-size:22px;margin:0 0 8px}.r{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}figure{margin:0}img{width:195px;display:block;border-radius:8px}figcaption{font-size:10px;width:195px;overflow:hidden;white-space:nowrap}</style><h1>Awzid · Cahier de lecture d'Adultes 1 · 8 écrans clés (390 px, clair puis sombre)</h1><div class="r">${fichiers
        .filter((f) => f.endsWith('clair.png'))
        .map(img)
        .join('')}</div><div class="r">${fichiers
        .filter((f) => f.endsWith('sombre.png'))
        .map(img)
        .join('')}</div>`,
    );
    const fp = join(dir, 'PLANCHE_cahier.png');
    await p.screenshot({ path: fp, fullPage: true, scale: 'css' });
    expect(await p.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(7000);
    await p.close();
    writeFileSync(join(dir, 'captures.json'), JSON.stringify(fichiers, null, 1));
  });
});
