import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { audioFileId } from '@awform/content/audio-cle';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Cahier « Je parle » d'Adultes 2 (24/10/2026) — interrupteur `cahier_parler` :
 *  - COUPÉ (défaut, démonstration comprise) : ni accès dans le niveau, page « fonction non disponible », aucun code du
 *    cahier chargé ;
 *  - « CANAL BÊTA » réglé par l'administrateur (état « beta » + compte ajouté au canal) : accès du niveau, carnet de
 *    voyage, ouverture d'étape, une phrase touchée se joue dans le LECTEUR DISCRET (fichier de la clé `audioKey`),
 *    6 cases gardées, conversation en bulles (A à droite, B à gauche), « À toi de parler » (bouton du tuteur désactivé,
 *    arabe de la consigne sur sa ligne), antisèche (une ligne touchée se joue), révision floutée, bilan et étoiles ;
 *    accessibilité AA (clair et sombre), cibles ≥ 44 px, clavier.
 * L'audio du niveau est SIMULÉ (liste des fichiers du cahier, silence de 0,3 s) : les audios du N2 ne sont pas encore
 * installés. CAHIER_PARLER_CAPTURES=<dossier> : captures 390 et 1280 px (clair et sombre) de 8 écrans et une planche.
 */
const H = { 'x-awform': '1' };
const CAPTURES = process.env.CAHIER_PARLER_CAPTURES;
interface F {
  ar: string;
  fr: string;
}
const donnees = JSON.parse(
  readFileSync(new URL('../static/cahier-data/parler-ad2.json', import.meta.url), 'utf8'),
) as {
  etapes: Array<{
    id: string;
    fin?: boolean;
    pages: Array<{ id: string; type: string; refs: string[] }>;
    antiseche?: Array<[string, string]>;
    jour?: F;
  }>;
  phrases: Record<string, F & { f?: F[] }>;
  conversations: Record<string, { r: Array<F & { q: string }> }>;
};
type Donnees = typeof donnees;
/** textes d'un cahier → identifiants des fichiers simulés */
const fichiersDe = (d: Donnees) => {
  const ids = new Set<string>();
  for (const p of Object.values(d.phrases)) for (const f of p.f ?? [p]) ids.add(audioFileId(f.ar)!);
  for (const c of Object.values(d.conversations)) for (const r of c.r) ids.add(audioFileId(r.ar)!);
  return [...ids];
};
const FICHIERS = fichiersDe(donnees);
/** données d'un autre niveau (cahiers du niveau 3 et suivants) */
const donneesDe = (n: string) =>
  JSON.parse(
    readFileSync(new URL(`../static/cahier-data/parler-${n}.json`, import.meta.url), 'utf8'),
  ) as Donnees;
// 0,3 s de silence (MP3 24 kHz mono)
const SILENCE = Buffer.from(
  readFileSync(new URL('./cahier.spec.ts', import.meta.url), 'utf8').match(
    /const SILENCE = Buffer\.from\(\s*'([^']+)'/,
  )![1]!,
  'base64',
);
const e02 = donnees.etapes.find((e) => e.id === 'e02')!;
const cartes = e02.pages.find((p) => p.type === 'cartes')!.id;
const conv = e02.pages.find((p) => p.type === 'conversation')!;
const tuteur = e02.pages.find((p) => p.type === 'tuteur')!.id;
const fin1 = donnees.etapes.find((e) => e.id === 'fin1')!;
const revision = fin1.pages.find((p) => p.type === 'revision')!.id;
const bilan = fin1.pages.find((p) => p.type === 'bilan')!;

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-par-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** fichiers du cahier (groupe à la demande) déjà chargés par la page */
const chargesParler = async (page: Page) => {
  const liste = (await (await page.request.get('/_app/parler.json')).json()) as string[];
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  return liste.filter((f) => vus.includes(f));
};
/** audio du niveau simulé : chaque texte du cahier a son fichier (0,3 s de silence) */
async function voixSimulee(
  page: Page,
  demandes: string[] = [],
  niveau = 'ad2',
  fichiers: string[] = FICHIERS,
) {
  await page.route(`**/api/v1/lecons-audio/niveaux/${niveau}`, (r) =>
    r.fulfill({
      json: {
        niveau,
        fichiers,
        octets: fichiers.length * SILENCE.length,
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
    .locator('.parler button, .parler a, .parler label')
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
  const vp = page.viewportSize()!;
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vp.width, height: h + 300 });
  await page.waitForTimeout(150);
  const r = await new AxeBuilder({ page })
    .include('.parler')
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
const ouvrir = async (page: Page, e: string, p?: string, niveau = 'ad2') => {
  await page.goto(`/cahier-parler/${niveau}?e=${e}${p ? `&p=${p}` : ''}`);
  await expect(page.locator(`article.etape-vue[data-page="${p ?? 'ouverture'}"]`)).toBeVisible({
    timeout: 20_000,
  });
};

test.describe.configure({ mode: 'serial' });

test('interrupteur COUPÉ (défaut) : ni accès ni page, aucun fichier du cahier', async ({
  page,
}) => {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  const f = (await (
    await page.request.get(`/api/v1/fonctions?profil=${me.profiles[0]!.id}`)
  ).json()) as { fonctions: Record<string, boolean> };
  expect(f.fonctions.cahier_parler).toBe(false);
  await page.goto('/niveaux/ad2');
  await expect(page.getByTestId('unit').first()).toBeVisible();
  await expect(page.locator('a.cahier-acces[href$="/cahier-parler/ad2"]')).toHaveCount(0);
  expect(await chargesParler(page)).toEqual([]);
  // adresse tapée à la main : « fonction non disponible », le code du cahier n'est jamais chargé
  await page.goto('/cahier-parler/ad2');
  await expect(page.getByTestId('parler-ferme')).toBeVisible();
  expect((await chargesParler(page)).filter((x) => x.endsWith('.js'))).toEqual([]);
  // ni ses données
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  expect(vus.filter((v) => v.includes('parler-ad2'))).toEqual([]);
});

test.describe('« canal bêta » réglé par l’administrateur', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    // l'état « beta » reste dans la base de test (remise à zéro à chaque lancement) : aucune autre suite ne lit
    // cet interrupteur, et le remettre ici gênerait l'autre projet (téléphone, ordinateur) qui tourne en même temps
    const r = await adm.request.put('/api/v1/admin/fonctions/cahier_parler', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) await adm.context().close();
  });
  let erreurs: string[] = [];
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const { email } = await newAdult(page, 'parler');
    await page.setViewportSize({ width: 390, height: 844 });
    // hors du canal bêta : toujours fermé
    const avant = (await (await page.request.get('/api/v1/fonctions')).json()) as {
      fonctions: Record<string, boolean>;
    };
    expect(avant.fonctions.cahier_parler).toBe(false);
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
    const apres = (await (await page.request.get('/api/v1/fonctions')).json()) as {
      canal: string;
      fonctions: Record<string, boolean>;
    };
    expect(apres.canal).toBe('beta');
    expect(apres.fonctions.cahier_parler).toBe(true);
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('accès du niveau, carnet, étape ; une phrase se joue dans le lecteur discret ; 6 cases gardées', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await page.goto('/niveaux/ad2');
    await expect(page.locator('a.cahier-acces[href$="/cahier-parler/ad2"]')).toBeVisible();
    expect(await chargesParler(page)).toEqual([]);
    await page.locator('a.cahier-acces[href$="/cahier-parler/ad2"]').click();
    await expect(page.getByTestId('parler')).toBeVisible({ timeout: 20_000 });
    expect((await chargesParler(page)).length).toBeGreaterThan(0);
    // carnet : 5 parties, 24 étapes de leçon, 5 fins de partie et la grille finale
    await expect(page.locator('.bande-partie')).toHaveCount(5);
    await expect(page.locator('a.etape[data-etape]')).toHaveCount(donnees.etapes.length);
    await page.locator('a.etape[data-etape="e02"]').click();
    // ouverture : titre, phrase du jour (arabe sur sa ligne), sommaire de l'étape
    await expect(page.locator('.ouverture h1')).toHaveText('Le quartier');
    await expect(page.getByTestId('parler-jour').locator('.ar')).toHaveText(e02.jour!.ar);
    await expect(page.getByTestId('parler-jour').locator('.ar')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('parler-commencer').click();
    await expect(page).toHaveURL(new RegExp(`e=e02&p=${cartes}$`));
    // un toucher sur une phrase la joue : le lecteur discret apparaît, le fichier de la clé est demandé
    const phrase = page.getByTestId('parler-phrase').first();
    const id = await phrase.getAttribute('data-audio');
    expect(FICHIERS).toContain(id);
    await phrase.click();
    await expect(page.getByTestId('lecteur')).toBeVisible();
    await expect.poll(() => sons.some((s) => s.endsWith(`/${id}.mp3`))).toBe(true);
    await expect(phrase).toHaveClass(/lecteur-actif/);
    // 6 cases (3 avec le modèle, 3 seul), gardées sur l'appareil
    await page.locator('button.case[data-case="0"]').click();
    await page.locator('button.case[data-case="4"]').click();
    await expect(page.locator('button.case[data-case="4"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('article.etape-vue')).toBeVisible();
    for (const [i, v] of [
      [0, 'true'],
      [1, 'false'],
      [4, 'true'],
    ] as const)
      await expect(page.locator(`button.case[data-case="${i}"]`)).toHaveAttribute(
        'aria-pressed',
        v,
      );
    await cibles(page);
  });

  test('antisèche : tableau à deux colonnes, une ligne touchée se fait entendre', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await ouvrir(page, 'e02');
    await page.getByTestId('parler-lien-antiseche').click();
    const anti = page.getByTestId('parler-antiseche');
    await expect(anti).toBeVisible();
    const lignes = anti.locator('ol.lignes > li');
    await expect(lignes).toHaveCount(e02.antiseche!.length);
    // l'arabe et le français, chacun dans sa cellule ; à 390 px, l'arabe au-dessus de la traduction
    const l0 = lignes.first();
    await expect(l0.locator('.ar')).toHaveText(e02.antiseche![0]![0]);
    await expect(l0.locator('.fr')).toHaveText(e02.antiseche![0]![1]);
    const [a, f] = [await l0.locator('.ar').boundingBox(), await l0.locator('.fr').boundingBox()];
    expect(a!.y).toBeLessThan(f!.y);
    await lignes.nth(2).locator('button').click();
    const id = await lignes.nth(2).locator('button').getAttribute('data-audio');
    await expect.poll(() => sons.some((s) => s.endsWith(`/${id}.mp3`))).toBe(true);
    // sur un grand écran : deux colonnes, l'arabe à droite
    await page.setViewportSize({ width: 1280, height: 900 });
    const [a2, f2] = [await l0.locator('.ar').boundingBox(), await l0.locator('.fr').boundingBox()];
    expect(a2!.x).toBeGreaterThan(f2!.x);
    expect(Math.abs(a2!.y - f2!.y)).toBeLessThan(40);
    await cibles(page);
  });

  test('conversation en bulles, « À toi de parler », révision floutée, bilan et étoiles', async ({
    page,
  }) => {
    await voixSimulee(page);
    await ouvrir(page, 'e02', conv.id);
    const bulles = page.locator('.bulle');
    await expect(bulles).toHaveCount(donnees.conversations[conv.refs[0]!]!.r.length);
    const a = await page.locator('.bulle.A').first().boundingBox();
    const b = await page.locator('.bulle.B').first().boundingBox();
    // A en vert à droite, B en doré à gauche
    expect(a!.x + a!.width).toBeGreaterThan(b!.x + b!.width);
    expect(a!.x).toBeGreaterThan(b!.x);
    // « À toi de parler » : scénario, arabe de la consigne sur sa propre ligne, bouton du tuteur désactivé
    await page.locator('a[rel="next"]').click();
    await expect(page).toHaveURL(new RegExp(`p=${tuteur}$`));
    const t = page.getByTestId('parler-tuteur');
    await expect(t).toBeVisible();
    expect(await t.locator('p').first().textContent()).not.toMatch(/[؀-ۿ]/);
    await expect(t.locator('.consigne-ar').first()).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('parler-tuteur-bouton')).toBeDisabled();
    // révision : l'arabe est flouté, puis découvert et jouable
    await ouvrir(page, 'fin1', revision);
    await expect(page.locator('.flou').first()).toBeVisible();
    const n = await page.locator('.flou').count();
    await page.getByTestId('parler-voir').first().click();
    await expect(page.locator('.flou')).toHaveCount(n - 1);
    await expect(page.locator('ol.revision [data-testid="parler-phrase"]').first()).toBeVisible();
    // bilan : oui / presque / pas encore, gardé ; une étoile par thème réussi
    await ouvrir(page, 'fin1', bilan.id);
    const total = await page.locator('.etoile').count();
    expect(total).toBeGreaterThan(3);
    await expect(page.locator('.etoile.reussi')).toHaveCount(0);
    // tous les « oui » pour le premier thème (les premières lignes du bilan portent sur « saluer »)
    const lignes = page.locator('ol.bilan > li');
    const nb = await lignes.count();
    for (let i = 0; i < nb; i++) await lignes.nth(i).getByText('oui', { exact: true }).click();
    await expect(page.locator('.etoile.reussi')).toHaveCount(total);
    await lignes.first().getByText('presque', { exact: true }).click();
    await expect(page.locator('.etoile.reussi')).toHaveCount(total - 1);
    // l'écriture sur l'appareil (IndexedDB) se termine avant le rechargement
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('.etoile.reussi')).toHaveCount(total - 1);
    await expect(lignes.first().locator('input[value="presque"]')).toBeChecked();
    await cibles(page);
  });

  test('accessibilité AA (clair et sombre) et clavier', async ({ page }) => {
    test.setTimeout(240_000);
    const sons = await voixSimulee(page);
    await page.goto('/cahier-parler/ad2');
    await expect(page.getByTestId('parler')).toBeVisible({ timeout: 20_000 });
    for (const m of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: m });
      await axe(page);
    }
    await cibles(page);
    for (const [e, p] of [
      ['e02', undefined],
      ['e02', cartes],
      ['e02', conv.id],
      ['e02', tuteur],
      ['e02', 'antiseche'],
      ['fin1', revision],
      ['fin1', bilan.id],
    ] as const) {
      await ouvrir(page, e, p);
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await axe(page);
      }
      await cibles(page);
    }
    // clavier : Tab jusqu'à une phrase, Entrée la joue
    await page.emulateMedia({ colorScheme: 'light' });
    await ouvrir(page, 'e02', cartes);
    const premiere = page.getByTestId('parler-phrase').first();
    const id = await premiere.getAttribute('data-audio');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await premiere.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(premiere).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => sons.some((s) => s.endsWith(`/${id}.mp3`))).toBe(true);
    // case cochée au clavier (Espace)
    await page.locator('button.case[data-case="2"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('button.case[data-case="2"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('captures 390 et 1280 px de 8 écrans (clair et sombre) et planche', async ({ page }) => {
    test.skip(!CAPTURES, 'CAHIER_PARLER_CAPTURES non défini');
    test.skip(test.info().project.name !== 'desktop-chromium', 'une seule série de captures');
    test.setTimeout(600_000);
    const dir = CAPTURES!;
    mkdirSync(dir, { recursive: true });
    await voixSimulee(page);
    const fichiers: string[] = [];
    const ecrans: Array<[string, string | null, string | null]> = [
      ['01-carnet', null, null],
      ['02-ouverture-etape', 'e02', null],
      ['03-cartes-phrases', 'e02', cartes],
      ['04-conversation', 'e02', conv.id],
      ['05-a-toi-de-parler', 'e02', tuteur],
      ['06-antiseche', 'e02', 'antiseche'],
      ['07-revision', 'fin1', revision],
      ['08-bilan', 'fin1', bilan.id],
    ];
    for (const largeur of [390, 1280]) {
      await page.setViewportSize({ width: largeur, height: largeur === 390 ? 844 : 900 });
      for (const [nom, e, p] of ecrans) {
        if (e) await ouvrir(page, e, p ?? undefined);
        else {
          await page.goto('/cahier-parler/ad2');
          await expect(page.getByTestId('parler')).toBeVisible({ timeout: 20_000 });
        }
        if (nom === '03-cartes-phrases') await page.getByTestId('parler-phrase').first().click();
        if (nom === '07-revision') await page.getByTestId('parler-voir').first().click();
        if (nom === '08-bilan') {
          const l = page.locator('ol.bilan > li');
          for (let i = 0; i < 4; i++) await l.nth(i).getByText('oui', { exact: true }).click();
        }
        for (const m of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: m });
          await page.waitForTimeout(300);
          const f = join(dir, `${nom}_${largeur}_${m === 'light' ? 'clair' : 'sombre'}.png`);
          await page.screenshot({ path: f });
          fichiers.push(f);
        }
        await page.emulateMedia({ colorScheme: 'light' });
      }
    }
    // planche : une ligne par largeur et par mode
    const img = (f: string) =>
      `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()!.replace('.png', '')}</figcaption></figure>`;
    const p = await page.context().newPage();
    await p.setViewportSize({ width: 1700, height: 1000 });
    const ligne = (re: RegExp) =>
      `<div class="r">${fichiers
        .filter((f) => re.test(f))
        .map(img)
        .join('')}</div>`;
    await p.setContent(
      `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#efe7d6;font:14px sans-serif;color:#084c38}h1{font-size:22px;margin:0 0 8px}.r{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}figure{margin:0}img{width:195px;display:block;border-radius:8px}figcaption{font-size:10px;width:195px;overflow:hidden;white-space:nowrap}</style><h1>Awzid · Cahier « Je parle » d'Adultes 2 · 8 écrans (390 px et 1280 px, clair puis sombre)</h1>${ligne(/_390_clair/)}${ligne(/_390_sombre/)}${ligne(/_1280_clair/)}${ligne(/_1280_sombre/)}`,
    );
    await p.screenshot({
      path: join(dir, 'PLANCHE_cahier_parler.png'),
      fullPage: true,
      scale: 'css',
    });
    await p.close();
    writeFileSync(join(dir, 'captures.json'), JSON.stringify(fichiers, null, 1));
  });

  // ---------------------------------------------------------------- cahiers du niveau 3 et suivants (25/10/2026)
  const NIVEAUX_PARLER = [
    ...['ad2', 'ad3', 'ad4', 'ad5', 'ad6', 'ad7', 'ad8', 'ad9', 'ad10'],
    ...['en2', 'en3', 'en4', 'en5'],
    ...['ado2', 'ado3', 'ado4'],
  ];
  /** écrans d'un cahier : étape → page (cartes, conversation…) ; `antiseche` pour les phrases utiles */
  const ecransDe = (d: Donnees) =>
    d.etapes.flatMap((e) => [
      { e: e.id, p: undefined as string | undefined },
      ...e.pages.map((p) => ({ e: e.id, p: p.id })),
      ...(!e.fin && e.antiseche?.length ? [{ e: e.id, p: 'antiseche' }] : []),
    ]);
  /** première étape et page où une phrase porte l'étiquette demandée */
  function pageAvecEtiquette(d: Donnees, u: string) {
    for (const e of d.etapes)
      for (const p of e.pages.filter((x) => x.type === 'cartes'))
        for (const r of p.refs)
          if ((d.phrases[r]!.f ?? [d.phrases[r]!]).some((f) => (f as F & { u?: string }).u === u))
            return { e: e.id, p: p.id, r };
    return null;
  }

  test('accès depuis chaque livre : le cahier « Je parle » du niveau, pour les 16 niveaux', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    for (const n of NIVEAUX_PARLER) {
      await page.goto(`/niveaux/${n}`);
      await expect(
        page.locator(`a.cahier-acces[href$="/cahier-parler/${n}"]`),
        `accès depuis le livre ${n}`,
      ).toBeVisible({ timeout: 20_000 });
    }
    // le lien mène au carnet du bon niveau, avec ses étapes (une par thème, les fins de partie, la grille finale)
    await page.goto('/niveaux/en4');
    await page.locator('a.cahier-acces[href$="/cahier-parler/en4"]').click();
    await expect(page.getByTestId('parler')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('parler')).toHaveAttribute('data-serie', 'en');
    await expect(page.locator('a.etape[data-etape]')).toHaveCount(donneesDe('en4').etapes.length);
    await expect(page.locator('.bande-partie')).toHaveCount(5);
  });

  test('variantes de style : gros caractères pour les enfants, étiquettes garçon / fille, adultes inchangés', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const taille = async (n: string) => {
      const d = donneesDe(n);
      await voixSimulee(page, [], n, fichiersDe(d));
      const e = d.etapes.find((x) => !x.fin)!;
      const cartes = e.pages.find((x) => x.type === 'cartes')!;
      await ouvrir(page, e.id, cartes.id, n);
      // 2e carte : taille ordinaire (la 1re est la phrase du jour, plus grande)
      return page
        .locator('.phrase-carte')
        .nth(1)
        .locator('.ar')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    };
    const [ad, ado, en] = [await taille('ad3'), await taille('ado2'), await taille('en3')];
    expect(en).toBeGreaterThanOrEqual(33);
    expect(en).toBeGreaterThan(ado);
    expect(ado).toBeGreaterThan(ad);
    // une étiquette « à un garçon » / « à une fille » pour les enfants et les ados, « à un homme » / « à une femme » pour les adultes
    for (const [n, a, b] of [
      ['en3', 'à un garçon', 'à une fille'],
      ['ado2', 'à un garçon', 'à une fille'],
      ['ad3', 'à un homme', 'à une femme'],
    ] as const) {
      const d = donneesDe(n);
      await voixSimulee(page, [], n, fichiersDe(d));
      for (const u of [a, b]) {
        const ou = pageAvecEtiquette(d, u);
        expect(ou, `${n} : ${u}`).not.toBeNull();
        await ouvrir(page, ou!.e, ou!.p, n);
        await expect(
          page.locator(`[data-ref="${ou!.r}"] .tag`).filter({ hasText: u }).first(),
        ).toBeVisible();
      }
      const tags = (await page.locator('.parler .tag').allTextContents()).join(' | ');
      expect(tags).not.toMatch(n === 'ad3' ? /garçon|fille/ : /\b(homme|femme)s?\b/);
    }
    await cibles(page);
  });

  test('zéro muet dans l’interface : chaque phrase de chaque écran se joue (adultes 3, enfants 3, ados 2)', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'une seule série (parcours long)');
    test.setTimeout(900_000);
    for (const n of ['ad3', 'en3', 'ado2']) {
      const d = donneesDe(n);
      const fichiers = fichiersDe(d);
      await voixSimulee(page, [], n, fichiers);
      let phrases = 0;
      for (const { e, p } of ecransDe(d)) {
        await ouvrir(page, e, p, n);
        // l'index audio du niveau arrive après la page : on attend que plus aucune phrase ne soit muette
        await expect
          .poll(() => page.locator('.parler .phrase.muet').count(), { message: `${n} ${e} ${p}` })
          .toBe(0);
        const ids = await page
          .locator('.parler [data-testid="parler-phrase"]')
          .evaluateAll((els) => els.map((x) => x.getAttribute('data-audio')));
        for (const id of ids) expect(fichiers, `${n} ${e} ${p}`).toContain(id);
        phrases += ids.length;
      }
      expect(phrases, n).toBeGreaterThan(300);
    }
  });

  test('captures 390 px (clair et sombre) de 3 cahiers : adultes 5, enfants 3, ados 3', async ({
    page,
  }) => {
    const dir = process.env.CAHIER_PARLER_CAPTURES_TOUS;
    test.skip(!dir, 'CAHIER_PARLER_CAPTURES_TOUS non défini');
    test.skip(test.info().project.name !== 'mobile-chromium', 'captures à 390 px');
    test.setTimeout(600_000);
    mkdirSync(dir!, { recursive: true });
    const fichiersPng: string[] = [];
    for (const n of ['ad5', 'en3', 'ado3']) {
      const d = donneesDe(n);
      await voixSimulee(page, [], n, fichiersDe(d));
      const e1 = d.etapes.find((x) => !x.fin)!;
      const cartes = e1.pages.find((x) => x.type === 'cartes')!.id;
      const conv = e1.pages.find((x) => x.type === 'conversation')!.id;
      const bilan = d.etapes
        .find((x) => x.id === 'fin1')!
        .pages.find((x) => x.type === 'bilan')!.id;
      const ecrans: Array<[string, string | null, string | null]> = [
        ['01-carnet', null, null],
        ['02-ouverture-etape', e1.id, null],
        ['03-cartes-phrases', e1.id, cartes],
        ['04-conversation', e1.id, conv],
        ['05-antiseche', e1.id, 'antiseche'],
        ['06-bilan', 'fin1', bilan],
      ];
      await page.setViewportSize({ width: 390, height: 844 });
      for (const [nom, e, p] of ecrans) {
        if (e) await ouvrir(page, e, p ?? undefined, n);
        else {
          await page.goto(`/cahier-parler/${n}`);
          await expect(page.getByTestId('parler')).toBeVisible({ timeout: 20_000 });
        }
        if (nom === '03-cartes-phrases') await page.getByTestId('parler-phrase').first().click();
        if (nom === '06-bilan') {
          const l = page.locator('ol.bilan > li');
          for (let i = 0; i < 3; i++) await l.nth(i).getByText('oui', { exact: true }).click();
        }
        for (const m of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: m });
          await page.waitForTimeout(300);
          const f = join(dir!, `${n}_${nom}_390_${m === 'light' ? 'clair' : 'sombre'}.png`);
          await page.screenshot({ path: f });
          fichiersPng.push(f);
        }
        await page.emulateMedia({ colorScheme: 'light' });
      }
    }
    // planche : une ligne par cahier et par mode
    const img = (f: string) =>
      `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()!.replace('.png', '')}</figcaption></figure>`;
    const p = await page.context().newPage();
    await p.setViewportSize({ width: 1500, height: 1000 });
    const ligne = (re: RegExp) =>
      `<div class="r">${fichiersPng
        .filter((f) => re.test(f))
        .map(img)
        .join('')}</div>`;
    await p.setContent(
      `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#efe7d6;font:14px sans-serif;color:#084c38}h1{font-size:22px;margin:0 0 8px}.r{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}figure{margin:0}img{width:230px;display:block;border-radius:8px}figcaption{font-size:10px;width:230px;overflow:hidden;white-space:nowrap}</style><h1>Awzid · Cahiers « Je parle » d'Adultes 5, d'Enfants 3 et d'Ados 3 · 6 écrans (390 px, clair puis sombre)</h1>${['ad5', 'en3', 'ado3'].map((n) => ligne(new RegExp(`${n}_.*_clair`)) + ligne(new RegExp(`${n}_.*_sombre`))).join('')}`,
    );
    await p.screenshot({
      path: join(dir!, 'PLANCHE_cahiers_parler_tous.png'),
      fullPage: true,
      scale: 'css',
    });
    await p.close();
    writeFileSync(join(dir!, 'captures.json'), JSON.stringify(fichiersPng, null, 1));
  });
});
