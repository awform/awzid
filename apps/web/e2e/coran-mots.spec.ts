import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { tanwinDisplay } from '@awform/content/text';
import { splitBasmala } from '@awform/hifz';
import {
  estReconnu,
  mesurer,
  pourcent,
  prochaineEtape,
  rangsConnus,
  type Entree,
  type Rangs,
} from '../src/lib/coran-mots/calcul';
import { commandes } from './coran';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Mots du Coran » (25/10/2026) — interrupteur `coran_mots` :
 *  - COUPÉ (défaut) ou compte hors « canal bêta » : ni bande « Je reconnais X % » dans le lecteur, ni soulignement, ni page
 *    `/coran/mots`, aucune donnée demandée à l'API ;
 *  - « CANAL BÊTA » : « Je reconnais X % des mots de cette sourate » calculé d'après les leçons RÉELLEMENT faites (il monte
 *    quand l'élève avance), « Prochaine étape : ces N mots te feraient passer à Y % » avec les mots et leur leçon, mots
 *    reconnus soulignés (réglage gardé sur l'appareil), page du Muṣḥaf comprise ; le texte du Coran reste identique d'un
 *    octet avec ou sans soulignement ; AUCUNE voix de synthèse ;
 *  - recherche par mot arabe (avec ou sans voyelles) et par racine, fiche racine (la famille, jamais un sens « à vérifier »),
 *    sources et licences (corpus.quran.com, tanzil.net, GNU GPL v3) ; accessibilité AA en clair et en sombre, cibles ≥ 44 px.
 * CORAN_MOTS_CAPTURES=<dossier> : captures 390 et 1 280 px, en clair et en sombre.
 */
const H = { 'x-awform': '1' };
const CAPTURES = process.env.CORAN_MOTS_CAPTURES;
const sql = (q: string) =>
  execFileSync('psql', [process.env.TEST_DATABASE_URL!, '-Atqc', q], { encoding: 'utf8' });

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-cm-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** Adulte au niveau 1 des livres (filière Adultes). */
async function adulteNiveau1(page: Page, label: string) {
  const a = await newAdult(page, label);
  const r = await page.request.post(`/api/v1/profiles/${a.profileId}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect(r.status(), await r.text()).toBe(201);
  return a;
}
/** Leçons du niveau « terminées » jusqu'à la n-ième (comme si l'élève les avait faites). */
function lecons(profileId: string, level: string, n: number) {
  sql(
    `INSERT INTO progress (profile_id, unit_id, status) SELECT '${profileId}', u.id, 'terminee' FROM unit u
     WHERE u.level_code = '${level}' AND u.n <= ${n} ON CONFLICT DO NOTHING`,
  );
}

interface Savoir {
  rangs: Rangs;
  v: Entree[][];
  connus: Set<number>;
}
/** Ce que l'élève sait et les mots d'une sourate, tels que servis par l'API (référence du calcul). */
async function savoir(page: Page, profileId: string, sura: number): Promise<Savoir> {
  const c = await (
    await page.request.get(`/api/v1/profiles/${profileId}/coran-mots/connus`)
  ).json();
  expect(c.disponible).toBe(true);
  const rangs = (await (await page.request.get('/api/v1/coran-mots/rangs')).json()) as Rangs;
  const d = (await (await page.request.get(`/api/v1/coran-mots/sourates/${sura}`)).json()) as {
    v: Entree[][];
  };
  return { rangs, v: d.v, connus: rangsConnus(rangs, c) };
}

/** Voix et audio de synthèse : aucun appel, jamais (surveillés pendant tout le test). */
async function surveillerVoix(page: Page): Promise<() => Promise<string[]>> {
  const requetes: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/v1\/(lecons-audio|tuteur|conversation)|\/synthese|\/tts/.test(r.url()))
      requetes.push(r.url());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __voix: string[] };
    w.__voix = [];
    const ss = window.speechSynthesis;
    if (ss) {
      const speak = ss.speak.bind(ss);
      ss.speak = (u) => {
        w.__voix.push(u.text);
        speak(u);
      };
    }
  });
  return async () => [
    ...requetes,
    ...(await page.evaluate(() => (window as unknown as { __voix?: string[] }).__voix ?? [])),
  ];
}

async function ouvrirLecteur(page: Page, query: string) {
  await page.goto(`/coran/lecteur?${query}`);
  await expect(page.getByTestId('barre-coran')).toBeAttached();
  await commandes(page);
  await expect(page.getByTestId('cm-bande')).toBeVisible({ timeout: 20_000 });
}
const pct = (s: Savoir) => {
  const m = mesurer(s.v, s.connus);
  return { m, p: pourcent(m.compris, m.mots) };
};
/** Les phrases de la bande, comme l'application les écrit (une décimale seulement si l'entier ne montrerait pas le gain). */
function ecrit(s: Savoir) {
  const { p } = pct(s);
  const e = prochaineEtape(s.v, s.connus, s.rangs);
  const apres = e.rangs.length ? pourcent(e.apres.compris, e.apres.mots) : null;
  const fin = apres !== null && Math.round(apres) === Math.round(p);
  const nb = (x: number) => (fin ? x.toFixed(1).replace('.', ',') : String(Math.round(x)));
  return {
    titre: `Je reconnais ${nb(p)} % des mots de cette sourate`,
    suite: apres === null ? null : nb(apres),
  };
}
async function axe(page: Page, selecteur: string) {
  const r = await new AxeBuilder({ page })
    .include(selecteur)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}
async function cibles(page: Page, selecteur: string) {
  const petites = await page.locator(selecteur).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: (e.textContent ?? '').trim().slice(0, 30), h: Math.round(r.height) };
      })
      .filter((x) => x.h < 43.5),
  );
  expect(petites).toEqual([]);
}

test.describe('interrupteur coupé ou compte hors du canal bêta', () => {
  test.use({ compte: null });
  test('ni bande, ni soulignement, ni page, ni donnée', async ({ page }) => {
    const demandes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/coran-mots')) demandes.push(r.url());
    });
    const a = await adulteNiveau1(page, 'cm-ferme');
    lecons(a.profileId, 'ad1', 30);
    await page.goto('/coran/lecteur?s=112&vue=versets');
    await expect(page.getByTestId('texte-coran')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('cm-bande')).toHaveCount(0);
    await expect(page.locator('.quran-text .w.mc')).toHaveCount(0);
    // adresse tapée à la main : « fonction non ouverte », aucune donnée
    await page.goto('/coran/mots');
    await expect(page.getByTestId('cm-ferme')).toBeVisible();
    await expect(page.getByTestId('cm-q')).toHaveCount(0);
    // le serveur refuse aussi
    const r = await page.request.get('/api/v1/coran-mots/sourates/112');
    expect(r.status()).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('fonction_coupee');
    expect(demandes.filter((u) => !u.endsWith('/api/v1/coran-mots/sourates/112'))).toEqual([]);
  });
});

test.describe('« canal bêta » réglé par l’administrateur', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/coran_mots', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) await adm.context().close();
  });
  let erreurs: string[] = [];
  let profileId = '';
  let voix: () => Promise<string[]>;
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    voix = await surveillerVoix(page);
    const a = await adulteNiveau1(page, 'cm');
    profileId = a.profileId;
    const avant = (await (await page.request.get('/api/v1/fonctions')).json()) as {
      fonctions: Record<string, boolean>;
    };
    expect(avant.fonctions.coran_mots).toBe(false); // hors du canal bêta : fermé
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email: a.email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
    const apres = (await (await page.request.get('/api/v1/fonctions')).json()) as {
      canal: string;
      fonctions: Record<string, boolean>;
    };
    expect(apres.canal).toBe('beta');
    expect(apres.fonctions.coran_mots).toBe(true);
  });
  test.afterEach(async () => {
    expect(erreurs).toEqual([]);
    expect(await voix(), 'aucune voix de synthèse, ni sur un verset ni ailleurs').toEqual([]);
  });

  test('« Je reconnais X % des mots de cette sourate » suit les leçons réellement faites, et monte quand on avance', async ({
    page,
  }) => {
    lecons(profileId, 'ad1', 3);
    const s1 = await savoir(page, profileId, 1);
    const a = pct(s1);
    const ta = ecrit(s1);
    await ouvrirLecteur(page, 's=1&vue=versets');
    await expect(page.getByTestId('cm-titre')).toHaveText(ta.titre);
    await expect(page.getByTestId('cm-bande').getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(Math.round(a.p)),
    );
    await expect(page.getByTestId('cm-pleins')).toContainText('Parmi les noms, les verbes');
    // prochaine étape : les mots du calcul, au plus 5, qui font gagner des mots
    const e = prochaineEtape(s1.v, s1.connus, s1.rangs);
    expect(e.rangs.length).toBeGreaterThan(0);
    const suite = page.getByTestId('cm-suite');
    await expect(suite).toContainText('Prochaine étape :');
    await expect(suite).toContainText(`passer à ${ta.suite} %`);
    if (e.rangs.length > 1)
      await expect(suite).toContainText(`ces ${e.rangs.length} mots te feraient`);
    await page.getByTestId('cm-voir-mots').click();
    const liste = page.getByTestId('cm-mots').locator('li');
    await expect(liste).toHaveCount(e.rangs.length);
    for (const [i, r] of e.rangs.entries()) {
      await expect(liste.nth(i)).toHaveAttribute('data-rang', String(r));
      // l'arabe sur sa propre ligne, jamais mêlé au français
      await expect(liste.nth(i).locator('.ar')).toHaveText(s1.rangs[r]![0]);
    }
    // une leçon du niveau en cours est un lien vers cette leçon
    const lien = page.getByTestId('cm-mots').locator('a').first();
    if (await lien.count()) {
      const cible = await lien.getAttribute('href');
      expect(cible).toMatch(/^\/lecons\/ad1\.l\d+$/);
    }
    // l'élève avance : le chiffre monte (leçons de tout le niveau 1 faites)
    lecons(profileId, 'ad1', 99);
    const s2 = await savoir(page, profileId, 1);
    const b = pct(s2);
    expect(b.p).toBeGreaterThan(a.p);
    await page.reload();
    await commandes(page);
    await expect(page.getByTestId('cm-titre')).toHaveText(ecrit(s2).titre, { timeout: 20_000 });
  });

  test('mots reconnus soulignés : exactement ceux du calcul, réglage gardé, texte identique d’un octet', async ({
    page,
  }) => {
    lecons(profileId, 'ad1', 99);
    const s = await savoir(page, profileId, 112);
    const reconnus = s.v.flat().filter((x) => estReconnu(x, s.connus)).length;
    expect(reconnus).toBeGreaterThan(0);
    await ouvrirLecteur(page, 's=112&vue=versets');
    const mots = page.locator('[data-testid="texte-coran"] .w.mc');
    await expect(mots).toHaveCount(reconnus);
    // texte de chaque verset : celui de Tanzil (la basmala d'en-tête est à part), avec ou sans soulignement
    const texte = async () =>
      page
        .locator('[data-testid="texte-coran"] [data-verse]')
        .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    const attendu: string[] = [];
    const r = await page.request.get('/api/v1/quran/verses?s=112&from=1&to=4');
    const versets = ((await r.json()) as { verses: Array<{ text: string }> }).verses;
    const bas = (
      (await (await page.request.get('/api/v1/quran/verses?s=1&from=1&to=1')).json()) as {
        verses: Array<{ text: string }>;
      }
    ).verses[0]!.text;
    versets.forEach((v, i) => {
      // basmala d'en-tête séparée comme dans le lecteur
      const { rest } = splitBasmala(112, i + 1, v.text, bas);
      attendu.push(
        rest
          .split(' ')
          .map((w) => tanwinDisplay(w))
          .join(' '),
      );
    });
    const avec = await texte();
    expect(avec).toEqual(attendu);
    // réglage : éteint → plus aucun soulignement, texte identique ; gardé après rechargement
    const sw = page.getByTestId('cm-souligner');
    await expect(sw).toBeChecked();
    await sw.uncheck();
    await expect(mots).toHaveCount(0);
    expect(await texte()).toEqual(avec);
    await page.reload();
    await commandes(page);
    await expect(page.getByTestId('cm-bande')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cm-souligner')).not.toBeChecked();
    await expect(mots).toHaveCount(0);
    await page.getByTestId('cm-souligner').check();
    await expect(mots).toHaveCount(reconnus);
    expect(await texte()).toEqual(avec);
  });

  test('vue « page du Muṣḥaf » : même bande, mêmes soulignements', async ({ page }) => {
    lecons(profileId, 'ad1', 99);
    await ouvrirLecteur(page, 'page=604&vue=page');
    await expect(page.locator('[data-testid="mushaf-page"] .w.mc').first()).toBeAttached({
      timeout: 20_000,
    });
    const n = await page.locator('[data-testid="mushaf-page"] .w.mc').count();
    expect(n).toBeGreaterThan(5);
    await page.getByTestId('cm-souligner').uncheck();
    await expect(page.locator('[data-testid="mushaf-page"] .w.mc')).toHaveCount(0);
  });

  test('accessibilité AA, clair et sombre ; cibles de 44 px au moins', async ({ page }, info) => {
    lecons(profileId, 'ad1', 20);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await ouvrirLecteur(page, 's=1&vue=versets');
      await page.getByTestId('cm-voir-mots').click();
      await axe(page, '[data-testid="cm-bande"]');
      await axe(page, '[data-testid="texte-coran"]');
      await cibles(
        page,
        '[data-testid="cm-bande"] button, [data-testid="cm-bande"] a, .cm-souligner',
      );
      if (CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        const dev = info.project.name.startsWith('mobile') ? '390' : '1280';
        await page.screenshot({ path: join(CAPTURES, `lecteur-${dev}-${scheme}.png`) });
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('recherche par mot (avec ou sans voyelles) : versets de Tanzil, mot repéré, familles, sources', async ({
    page,
  }, info) => {
    lecons(profileId, 'ad1', 99);
    await page.goto('/coran/mots');
    await expect(page.getByTestId('cm-q')).toBeVisible();
    const total = async (q: string) =>
      (
        (await (
          await page.request.get(`/api/v1/coran-mots/recherche?q=${encodeURIComponent(q)}`)
        ).json()) as {
          total: number;
        }
      ).total;
    const sans = await total('كتاب');
    expect(sans).toBeGreaterThan(200);
    expect(await total('كِتَابٌ')).toBe(sans);
    await page.getByTestId('cm-q').fill('كِتَابٌ');
    await page.getByTestId('cm-q').press('Enter');
    await expect(page.getByTestId('cm-total')).toContainText(/\d+ occurrences/);
    const items = page.getByTestId('cm-resultats').locator('li');
    await expect(items).toHaveCount(20);
    // chaque verset affiché est celui de Tanzil (affichage des tanwīns du Muṣḥaf), le mot trouvé est repéré
    const api = (await (
      await page.request.get(`/api/v1/coran-mots/recherche?q=${encodeURIComponent('كتاب')}`)
    ).json()) as {
      items: Array<{ ref: string; texte: string; i: number }>;
    };
    for (const [k, it] of api.items.slice(0, 6).entries()) {
      const li = items.nth(k);
      await expect(li.locator('.quran-text')).toHaveText(
        it.texte
          .split(' ')
          .map((w) => tanwinDisplay(w))
          .join(' '),
      );
      await expect(li.locator('.mot.hit')).toHaveText(tanwinDisplay(it.texte.split(' ')[it.i]!));
      await expect(li.locator('a.ref')).toHaveAttribute(
        'href',
        `/coran/lecteur?s=${it.ref.split(':')[0]}&a=${it.ref.split(':')[1]}`,
      );
    }
    await page.getByTestId('cm-plus').click();
    await expect(items).toHaveCount(40);
    // familles de mots : « علم » est le mot de plusieurs lemmes (savoir, science, savant…) ; filtrer par un lemme
    await page.getByTestId('cm-q').fill('علم');
    await page.getByTestId('cm-q').press('Enter');
    const chips = page.getByTestId('cm-lemmes').locator('button');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThan(1);
    await chips.first().click();
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    // sources et licences
    const sources = page.getByTestId('cm-sources');
    await expect(sources.locator('a[href="http://corpus.quran.com"]')).toBeVisible();
    await expect(sources.locator('a[href="http://tanzil.net"]')).toBeVisible();
    await expect(
      sources.locator('a[href="https://www.gnu.org/licenses/gpl-3.0.html"]'),
    ).toBeVisible();
    await expect(sources).toContainText('GNU GPL v3');
    // accessibilité et cibles
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await axe(page, '[data-testid="cm-recherche"]');
      if (CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        const dev = info.project.name.startsWith('mobile') ? '390' : '1280';
        await page.screenshot({ path: join(CAPTURES, `recherche-mot-${dev}-${scheme}.png`) });
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await cibles(page, '[data-testid="cm-recherche"] button, [data-testid="cm-recherche"] input');
  });

  test('par racine : la famille de mots et leur fréquence ; JAMAIS un sens « à vérifier » ; ce que l’élève connaît', async ({
    page,
  }, info) => {
    lecons(profileId, 'ad1', 99);
    await page.goto('/coran/mots');
    await page.getByTestId('cm-mode-racine').click();
    await expect(page.getByTestId('cm-mode-racine')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('cm-q').fill('كتب');
    await page.getByTestId('cm-q').press('Enter');
    const fiche = page.getByTestId('cm-fiche');
    await expect(fiche).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('cm-frequence')).toContainText('319 fois');
    const famille = page.getByTestId('cm-famille').locator('li');
    expect(await famille.count()).toBeGreaterThan(5);
    // les 200 sens rédigés sont « à vérifier » : aucun n'est affiché, la fiche ne montre que la famille
    await expect(page.getByTestId('cm-sens')).toHaveCount(0);
    await expect(fiche).not.toContainText('Sens de base');
    // le mot déjà enseigné est reconnu, un mot de niveau plus avancé est annoncé
    await expect(famille.first()).toContainText('Tu connais ce mot');
    await expect(fiche).toContainText(/Tu l’apprendras au niveau \d+/);
    await expect(page.getByTestId('cm-total')).toContainText('319 occurrences');
    // un lemme choisi : seulement ses occurrences
    const premier = famille.first().locator('button');
    const bw = await premier.getAttribute('data-lemme');
    const n = (await (
      await page.request.get(
        `/api/v1/coran-mots/recherche?mode=racine&q=${encodeURIComponent('كتب')}&lemme=${encodeURIComponent(bw!)}`,
      )
    ).json()) as { total: number };
    await premier.click();
    await expect(page.getByTestId('cm-total')).toContainText(`${n.total} occurrences`);
    // racine inexistante
    await page.getByTestId('cm-q').fill('ضضض');
    await page.getByTestId('cm-q').press('Enter');
    await expect(page.getByTestId('cm-aucun')).toBeVisible();
    await expect(fiche).toHaveCount(0);
    // retour et accessibilité
    await page.getByTestId('cm-q').fill('كتب');
    await page.getByTestId('cm-q').press('Enter');
    await expect(fiche).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await axe(page, '[data-testid="cm-recherche"]');
      if (CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        const dev = info.project.name.startsWith('mobile') ? '390' : '1280';
        await page.screenshot({ path: join(CAPTURES, `racine-${dev}-${scheme}.png`) });
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('depuis la bande : « Chercher un mot ou une racine » et « Sources et licences »', async ({
    page,
  }) => {
    await ouvrirLecteur(page, 's=1&vue=versets');
    await page.getByTestId('cm-chercher').click();
    await expect(page).toHaveURL(/\/coran\/mots$/);
    await expect(page.getByTestId('cm-q')).toBeVisible();
    await page.goBack();
    await commandes(page);
    await page.getByTestId('cm-sources').click();
    await expect(page).toHaveURL(/\/coran\/mots#sources$/);
    await expect(
      page.getByTestId('cm-sources').filter({ hasText: 'Quranic Arabic Corpus' }),
    ).toBeVisible();
  });
});
