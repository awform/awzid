import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { audioFileId } from '@awform/content/audio-cle';
import { buildVideoCahier, unitesDe, type PageIn } from '@awform/content/video-cahier';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Cahiers de lecture des enfants (en1) et des ados (ado1), 25/10/2026 — derrière l'interrupteur `cahier_lecture` (et
 * `video_v2` pour les vidéos) :
 *  - ouverture de chaque cahier (accès du niveau, sommaire, pages) et déblocage des grilles dès que leurs lettres sont
 *    enseignées (progression simulée : leçon atteinte) ;
 *  - vidéo vivante d'une grille (aucune scène muette) ;
 *  - « Construis le mot » : lettres glissées de droite à gauche, puis signes, au doigt (glissement tactile), à la souris,
 *    sans glisser (toucher la lettre, puis la case) et au clavier ; on écoute le mot et on le compare au modèle ;
 *  - « Trouve la syllabe » (enfants : « Réessaie », aucune pénalité), défi chrono, duel et « Construis » des ados avec
 *    score et médailles ; défi et mission d'un bilan ;
 *  - accessibilité AA (clair et sombre), cibles ≥ 44 px, animations réduites respectées.
 * L'audio est SIMULÉ (silence de 0,3 s) : le niveau du livre et celui du cahier (`cahier-lecture-<niveau>`) sont
 * simulés séparément pour vérifier leur réunion. CAHIER_JEUX_CAPTURES=<dossier> : captures 390 px (clair et sombre).
 */
const H = { 'x-awform': '1' };
const PAYS = 'LV';
const CAPTURES = process.env.CAHIER_JEUX_CAPTURES;
const NIVEAUX = ['en1', 'ado1'] as const;
type Niveau = (typeof NIVEAUX)[number];
type Cle =
  | ''
  | 'fatha'
  | 'kasra'
  | 'damma'
  | 'soukoun'
  | 'fathatan'
  | 'kasratan'
  | 'dammatan'
  | `shadda_${string}`;
interface DPage extends PageIn {
  id: string;
  type: string;
  n: number;
  jeu?: {
    lettre: string;
    construis: Array<{ ar: string; c: Array<[string, Cle]>; n: number }>;
    trouve: Array<{ k: 's' | 'm'; cible: string; choix: string[]; n: number }>;
    signes: Array<{ k: string; ar: string; n: number }>;
  };
  defi?: { max: number };
}
const donnees = Object.fromEntries(
  NIVEAUX.map((n) => [
    n,
    JSON.parse(
      readFileSync(new URL(`../static/cahier-data/${n}.json`, import.meta.url), 'utf8'),
    ) as {
      pages: DPage[];
    },
  ]),
) as Record<Niveau, { pages: DPage[] }>;
const page_ = (n: Niveau, id: string) => donnees[n].pages.find((p) => p.id === id)!;
/** grille d'essai de chaque cahier */
const GRILLE: Record<Niveau, string> = { en1: 'P083', ado1: 'P048' };
const NB_PAGES: Record<Niveau, number> = { en1: 127, ado1: 137 };

/** tous les textes arabes du cahier → fichiers audio simulés */
const FICHIERS = Object.fromEntries(
  NIVEAUX.map((n) => {
    const ids = new Set<string>();
    const voir = (x: unknown): void => {
      if (typeof x === 'string') {
        if (/[ء-ي]/.test(x)) ids.add(audioFileId(x));
      } else if (Array.isArray(x)) x.forEach(voir);
      else if (x && typeof x === 'object') Object.values(x).forEach(voir);
    };
    voir(donnees[n].pages);
    ids.delete('');
    return [n, [...ids]];
  }),
) as Record<Niveau, string[]>;
// 0,3 s de silence (MP3 24 kHz mono)
const SILENCE = Buffer.from(
  'SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAAPAAAGYAAtLS0tLS08PDw8PDw8S0tLS0tLWlpaWlpaWmlpaWlpaWl4eHh4eHiHh4eHh4eHlpaWlpaWlqWlpaWlpbS0tLS0tLTDw8PDw8PD0tLS0tLS4eHh4eHh4fDw8PDw8PD///////8AAAAATGF2YzYyLjExAAAAAAAAAAAAAAAAJANgAAAAAAAABmADyt9kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80TEAAAAA0gAAAAATEFNRTMuMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEUwAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEpgAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=',
  'base64',
);

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-cj-${test.info().project.name}-${Date.now()}@e2e.test`;
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
const CLES = ['cahier_lecture', 'video_v2'];
async function remettre(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string; pays?: string | null }> }>;
  };
  for (const f of d.fonctions.filter((x) => CLES.includes(x.cle)))
    for (const r of f.regles)
      if (r.pays === PAYS)
        await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
}
async function allumer(adm: Page, cle: string) {
  const r = await adm.request.post(`/api/v1/admin/fonctions/${cle}/regles`, {
    headers: H,
    data: { effet: 'on', pays: PAYS },
  });
  expect(r.status(), await r.text()).toBe(201);
}

/**
 * Audio simulé : le niveau du livre et celui du cahier (réunis par l'application) ; renvoie les fichiers demandés
 * (identifiants SHA-1 des textes, dans l'ordre).
 */
async function voixSimulee(page: Page, n: Niveau): Promise<string[]> {
  const demandes: string[] = [];
  const f = FICHIERS[n];
  const moitie = (k: 0 | 1) => f.filter((_, i) => i % 2 === k);
  for (const [niveau, fichiers] of [
    [n, moitie(0)],
    [`cahier-lecture-${n}`, moitie(1)],
  ] as const)
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
    demandes.push(new URL(r.request().url()).pathname.split('/').pop()!.replace('.mp3', ''));
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  return demandes;
}
/** leçon atteinte par l'élève, simulée (la progression vient de l'API) ; null : aucune progression connue */
async function atteinte(page: Page, n: Niveau, lecon: number | null) {
  await page.route('**/api/v1/progress?*', (r) =>
    lecon === null
      ? r.continue()
      : r.fulfill({
          json: {
            progress: [{ unitId: `${n}.l${String(lecon).padStart(2, '0')}`, status: 'terminee' }],
          },
        }),
  );
}
const ouvrirPage = async (page: Page, n: Niveau, id: string) => {
  await page.goto(`/cahier/${n}?p=${id}`);
  await expect(page.locator(`article.page-cahier[data-page="${id}"]`)).toBeVisible({
    timeout: 20_000,
  });
};
const attendreJeux = (page: Page) =>
  expect(page.getByTestId('jeux')).toBeVisible({ timeout: 20_000 });
async function cibles(
  page: Page,
  sel = '.cahier button, .cahier a.bouton, .cahier a.ligne, .cahier .nav a',
) {
  const petites = await page.locator(sel).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null && !(e as HTMLButtonElement).disabled)
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
const clairSombre = async (page: Page, f: () => Promise<void>) => {
  for (const m of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: m });
    await f();
  }
};

// ———————————————————————————————— « Construis le mot » : gestes ————————————————————————————————
type Gest = 'doigt' | 'souris' | 'toucher' | 'clavier';
const centre = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** glissement tactile réel (CDP : événements « touch » du navigateur → pointeur de type « touch ») */
async function glisserDoigt(page: Page, de: string, vers: string) {
  const a = await centre(page, de);
  const b = await centre(page, vers);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: a.x, y: a.y }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function glisserSouris(page: Page, de: string, vers: string) {
  const a = await centre(page, de);
  const b = await centre(page, vers);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}
async function deposer(page: Page, geste: Gest, de: string, vers: string) {
  if (geste === 'doigt') await glisserDoigt(page, de, vers);
  else if (geste === 'souris') await glisserSouris(page, de, vers);
  else if (geste === 'toucher') {
    await page.locator(de).first().click();
    await page.locator(vers).first().click();
  } else {
    // clavier : Entrée sur la tuile (la case suivante prend le focus), puis Entrée sur la case
    await page.locator(de).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(vers).first()).toBeFocused();
    await page.keyboard.press('Enter');
  }
}
const caseDe = (j: number) => `[data-testid="cons-case"][data-case="${j}"]`;
/** pose les lettres de droite à gauche (case 0 = la plus à droite) ; les cases déjà justes sont laissées */
async function poserLettres(page: Page, n: Niveau, geste: Gest) {
  const mot = await page.getByTestId('construis').getAttribute('data-mot');
  const c = donneesMot(n, mot!);
  await page.getByTestId('construis').scrollIntoViewIfNeeded();
  for (let j = 0; j < c.length; j++) {
    const vide = await page.locator(caseDe(j)).evaluate((e) => e.classList.contains('vide'));
    if (!vide) continue;
    // une tuile de cette lettre encore sur le plateau (les lettres doubles sont interchangeables)
    await deposer(page, geste, `[data-testid="cons-tuile"][data-lettre="${c[j]![0]}"]`, caseDe(j));
  }
  return { mot: mot!, c };
}
/** joue un mot : lettres de droite à gauche, puis un signe sur chaque lettre ; le mot est alors réussi */
async function construire(page: Page, n: Niveau, geste: Gest) {
  const { mot, c } = await poserLettres(page, n, geste);
  await expect(page.getByTestId('construis')).toHaveAttribute('data-phase', 'signes');
  for (let j = 0; j < c.length; j++) {
    const s = c[j]![1];
    if (!s) continue;
    await deposer(page, geste, `[data-testid="cons-signe"][data-signe="${s}"]`, caseDe(j));
  }
  await expect(page.getByTestId('construis')).toHaveAttribute('data-phase', 'fini');
  return mot;
}
const donneesMot = (n: Niveau, ar: string) => {
  for (const p of donnees[n].pages) {
    const m = p.jeu?.construis.find((x) => x.ar === ar);
    if (m) return m.c;
  }
  throw new Error(`mot inconnu : ${ar}`);
};

for (const n of NIVEAUX) {
  test.describe(`cahier ${n} : interrupteurs allumés (exception par pays)`, () => {
    test.use({ compte: null });
    let adm: Page;
    test.beforeAll(async ({ browser }) => {
      adm = await admin(browser);
      await remettre(adm);
      await allumer(adm, 'cahier_lecture');
      await allumer(adm, 'video_v2');
    });
    test.afterAll(async () => {
      if (adm) await remettre(adm);
    });
    let erreurs: string[] = [];
    test.beforeEach(async ({ page }) => {
      erreurs = [];
      page.on('pageerror', (e) => erreurs.push(e.message));
      await newAdult(page, `cj${n}`, PAYS);
      await page.setViewportSize({ width: 390, height: 844 });
    });
    test.afterEach(() => expect(erreurs).toEqual([]));

    test(`${n} : ouverture du cahier (sommaire, pages) et déblocage des grilles dès que leurs lettres sont enseignées`, async ({
      page,
    }) => {
      await voixSimulee(page, n);
      await atteinte(page, n, 1);
      await page.goto(`/cahier/${n}`);
      await expect(page.getByTestId('cahier')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('a.ligne[data-page]')).toHaveCount(NB_PAGES[n]);
      await expect(page.getByTestId('cahier-suite')).toBeVisible();
      // la grille du ب est annoncée « Après : Leçon 1 » (et non aux leçons 20-21 du livre imprimé)
      await expect(page.locator(`a.ligne[data-page="${GRILLE[n]}"] .etat`)).toContainText(
        'Leçon 1',
      );
      await page.locator(`a.ligne[data-page="${GRILLE[n]}"]`).click();
      await expect(page.locator(`article.page-cahier[data-page="${GRILLE[n]}"]`)).toBeVisible();
      // leçon 1 atteinte : enfants, une seule case ouverte (la fatḥa du ب) ; ados, les 3 voyelles brèves (leçon 1 du livre)
      const ouvertes = n === 'en1' ? 1 : 3;
      await expect(page.locator('.page-cahier .grille .el.cel:not(.verrou)')).toHaveCount(ouvertes);
      await expect(page.locator('.page-cahier .grille .el.cel.verrou')).toHaveCount(15 - ouvertes);
      await expect(page.getByTestId('grille-suite')).toBeVisible();
      await cibles(page);
      // la leçon 24 atteinte : les 15 cases sont ouvertes, plus aucune note de suite
      await atteinte(page, n, 24);
      await page.reload();
      await expect(page.locator('.page-cahier .grille .el.cel:not(.verrou)')).toHaveCount(15);
      await expect(page.locator('.page-cahier .grille .el.cel.verrou')).toHaveCount(0);
      await expect(page.getByTestId('grille-suite')).toHaveCount(0);
    });

    test(`${n} : gros caractères pour les enfants, caractères normaux pour les ados`, async ({
      page,
    }) => {
      await voixSimulee(page, n);
      await atteinte(page, n, 24);
      await ouvrirPage(page, n, GRILLE[n]);
      const taille = await page
        .locator('.page-cahier .grille .el.cel .ar')
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      if (n === 'en1') expect(taille).toBeGreaterThanOrEqual(44);
      else expect(taille).toBeLessThanOrEqual(40);
      await expect(page.locator('article.page-cahier')).toHaveAttribute(
        'data-public',
        n === 'en1' ? 'enfant' : 'ado',
      );
    });

    test(`${n} : vidéo vivante d'une grille (chargée au premier appui), aucune scène muette`, async ({
      page,
    }) => {
      const demandes = await voixSimulee(page, n);
      await atteinte(page, n, 24);
      await ouvrirPage(page, n, GRILLE[n]);
      const p = page_(n, GRILLE[n]);
      const v = buildVideoCahier(p, {
        hasAudio: (s) => FICHIERS[n].includes(audioFileId(s)),
        garde: new Set(),
      });
      expect(v.scenes.length).toBeGreaterThan(1);
      expect(v.sansVoix).toEqual([]);
      expect(unitesDe(v).length).toBeGreaterThan(20);
      await page.getByTestId('voir-video-cahier').click();
      await expect(page.getByTestId('vc')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.vc-u.joue').first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => demandes.length, { timeout: 15_000 }).toBeGreaterThan(0);
      await page.locator('.vc [data-k="fermer"]').click();
      await expect(page.getByTestId('vc')).toHaveCount(0);
    });

    test(`${n} : la vidéo s'ouvre sur chaque sorte de page (tableau, lettres, mots, phrases, texte, Coran) et joue`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const demandes = await voixSimulee(page, n);
      await atteinte(page, n, 26);
      const choisies = ['tableau', 'lettres', 'mots', 'phrases', 'texte']
        .map((t) => donnees[n].pages.find((p) => p.type === t))
        .filter((p): p is DPage => !!p);
      expect(choisies.length).toBeGreaterThanOrEqual(4);
      for (const p of choisies) {
        await ouvrirPage(page, n, p.id);
        const avant = demandes.length;
        await page.getByTestId('voir-video-cahier').click();
        await expect(page.getByTestId('vc'), p.id).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.vc-u.joue').first(), p.id).toBeVisible({ timeout: 20_000 });
        // chaque élément est dit par son fichier
        await expect.poll(() => demandes.length, { timeout: 15_000 }).toBeGreaterThan(avant);
        await page.locator('.vc [data-k="fermer"]').click();
        await expect(page.getByTestId('vc')).toHaveCount(0);
      }
    });

    test(`${n} : à la leçon 1, la vidéo ne montre que la case ouverte`, async ({ page }) => {
      await voixSimulee(page, n);
      await atteinte(page, n, 1);
      await ouvrirPage(page, n, GRILLE[n]);
      await page.getByTestId('voir-video-cahier').click();
      await expect(page.getByTestId('vc')).toBeVisible({ timeout: 20_000 });
      // une seule syllabe (la fatḥa du ب) dans toute la grille de la vidéo
      const textes = await page
        .locator('.vc-u')
        .evaluateAll((els) => els.map((e) => e.textContent));
      expect(textes.length).toBeLessThan(6);
    });
  });
}

// ———————————————————————————————— jeux des enfants (en1) ————————————————————————————————
test.describe('enfants (en1) : jeux de fin de grille', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    await allumer(adm, 'cahier_lecture');
    await allumer(adm, 'video_v2');
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  let erreurs: string[] = [];
  let sons: string[] = [];
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await newAdult(page, 'cjen', PAYS);
    await page.setViewportSize({ width: 390, height: 844 });
    sons = await voixSimulee(page, 'en1');
    await atteinte(page, 'en1', 24);
    await ouvrirPage(page, 'en1', 'P083');
    await attendreJeux(page);
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('jeux proposés : construis, trouve, colorie ; le code des jeux est chargé à la demande', async ({
    page,
  }) => {
    await expect(page.getByTestId('jeu-construis')).toBeEnabled();
    await expect(page.getByTestId('jeu-trouve')).toBeEnabled();
    await expect(page.getByTestId('jeu-colorie')).toBeEnabled();
    await expect(page.getByTestId('jeu-chrono')).toHaveCount(0);
    await expect(page.getByTestId('jeu-duel')).toHaveCount(0);
    // aucune transcription latine du nom d'un signe sur la page
    const texte = await page.locator('article.page-cahier').innerText();
    expect(texte).not.toMatch(/fat[hḥ]a|kasra|[dḍ]amma|sou?kou?n|shadda|chadda|tanw[iī]n/i);
    await cibles(page);
  });

  test('à la leçon 1, les jeux ne sont pas encore ouverts (rien que du déjà vu)', async ({
    page,
  }) => {
    await atteinte(page, 'en1', 1);
    await page.reload();
    await attendreJeux(page);
    await expect(page.getByTestId('jeu-construis')).toBeDisabled();
    await expect(page.getByTestId('jeu-trouve')).toBeDisabled();
  });

  for (const geste of ['doigt', 'souris', 'toucher', 'clavier'] as const) {
    test(`« Construis le mot » (${geste}) : lettres de droite à gauche, puis signes ; on écoute et on compare au modèle`, async ({
      page,
    }, info) => {
      test.skip(geste === 'doigt' && info.project.name !== 'mobile-chromium', 'tactile : mobile');
      test.skip(geste === 'souris' && info.project.name !== 'desktop-chromium', 'souris : bureau');
      await page.getByTestId('jeu-construis').click();
      await expect(page.getByTestId('construis')).toBeVisible();
      const avant = sons.length;
      const mot = await construire(page, 'en1', geste);
      await expect(page.getByTestId('cons-compare')).toBeVisible();
      await expect(page.getByTestId('cons-ton-mot')).toHaveText(mot);
      await expect(page.getByTestId('cons-modele')).toHaveText(mot);
      // le mot construit est dit à la réussite
      await expect.poll(() => sons.length).toBeGreaterThan(avant);
      await expect.poll(() => sons.at(-1)).toBe(audioFileId(mot));
      await expect(page.getByTestId('construis')).toHaveAttribute('data-public', 'enfant');
      // mot suivant puis fin de partie (3 mots) : étoile, jamais de médaille
      await page.getByTestId('cons-suivant').click();
      await construire(page, 'en1', geste);
      await page.getByTestId('cons-suivant').click();
      await construire(page, 'en1', geste);
      await page.getByTestId('cons-suivant').click();
      await expect(page.getByTestId('cons-fin')).toBeVisible();
      await expect(page.locator('[data-medaille]')).toHaveCount(0);
    });
  }

  test('« Construis le mot » : une erreur ne coûte rien, « Réessaie », la lettre retourne sur le plateau', async ({
    page,
  }) => {
    await page.getByTestId('jeu-construis').click();
    const mot = await page.getByTestId('construis').getAttribute('data-mot');
    const c = donneesMot('en1', mot!);
    const mauvaise = (await page
      .locator('[data-testid="cons-tuile"]')
      .evaluateAll(
        (els, l) => els.map((e) => (e as HTMLElement).dataset.lettre!).find((x) => x !== l),
        c[0]![0],
      ))!;
    const nb = await page.locator('[data-testid="cons-tuile"]').count();
    await page.locator(`[data-testid="cons-tuile"][data-lettre="${mauvaise}"]`).first().click();
    await page.locator('[data-testid="cons-case"][data-case="0"]').click();
    await expect(page.getByTestId('cons-retour')).toHaveAttribute('data-retour', 'reessaie');
    await expect(page.getByTestId('cons-retour')).toContainText('Réessaie');
    await expect(page.locator('[data-testid="cons-tuile"]')).toHaveCount(nb);
    // la partie continue, rien n'est perdu
    await construire(page, 'en1', 'toucher');
    await expect(page.getByTestId('cons-compare')).toBeVisible();
  });

  test('les signes montrés sont ceux de la leçon atteinte, par le signe lui-même (aucun nom latin)', async ({
    page,
  }) => {
    await atteinte(page, 'en1', 3);
    await page.reload();
    await attendreJeux(page);
    await page.getByTestId('jeu-construis').click();
    await poserLettres(page, 'en1', 'toucher');
    await expect(page.getByTestId('cons-signes')).toBeVisible();
    const signes = await page
      .locator('[data-testid="cons-signe"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.signe));
    for (const s of signes) expect(['fatha', 'kasra', 'damma']).toContain(s);
    // le glyphe est le signe sur un cercle pointillé, sans lettre latine
    const glyphes = await page.locator('[data-testid="cons-signe"] .ar').allTextContents();
    for (const g of glyphes) expect(/[A-Za-z]/.test(g)).toBe(false);
  });

  test('« Trouve la syllabe » : on entend, on touche la bonne parmi 3 ; « Réessaie », aucune pénalité', async ({
    page,
  }) => {
    await page.getByTestId('jeu-trouve').click();
    await expect(page.getByTestId('trouve')).toHaveAttribute('data-mode', 'doux');
    let faute = false;
    for (let i = 0; i < 8; i++) {
      await expect(page.getByTestId('trouve-manche')).toContainText(`${i + 1} sur 8`);
      await expect(page.getByTestId('trouve-choix')).toHaveCount(3);
      // la syllabe entendue : le dernier fichier demandé
      await expect.poll(() => sons.length).toBeGreaterThan(0);
      const id = sons.at(-1)!;
      const choix = page.getByTestId('trouve-choix');
      const textes = await choix.allTextContents();
      const bonne = textes.findIndex((t) => audioFileId(t.trim()) === id);
      expect(bonne, `choix ${textes.join(' ')}`).toBeGreaterThanOrEqual(0);
      if (i === 2 && !faute) {
        faute = true;
        const mauvaise = textes.findIndex((_, k) => k !== bonne);
        await choix.nth(mauvaise).click();
        await expect(page.getByTestId('trouve-retour')).toContainText('Réessaie');
        await expect(page.getByTestId('chrono-temps')).toHaveCount(0);
      }
      const avant = sons.length;
      await choix.nth(bonne).click();
      await expect(page.getByTestId('trouve-retour')).toContainText('Bravo');
      // manche suivante : un nouveau son
      if (i < 7) await expect.poll(() => sons.length, { timeout: 8000 }).toBeGreaterThan(avant);
    }
    await expect(page.getByTestId('trouve-fin')).toContainText('7 sur 8');
    await expect(page.locator('[data-medaille]')).toHaveCount(0);
    await page.getByTestId('trouve-rejouer').click();
    await expect(page.getByTestId('trouve-manche')).toContainText('1 sur 8');
  });

  test('« Je colorie » : on touche les syllabes de la lettre', async ({ page }) => {
    await page.getByTestId('jeu-colorie').click();
    await expect(page.getByTestId('chasse')).toBeVisible();
    const cibles_ = page.locator('[data-testid="chasse"] button[data-cible="1"]');
    const n = await cibles_.count();
    expect(n).toBeGreaterThanOrEqual(2);
    await page.locator('[data-testid="chasse"] button[data-cible="0"]').first().click();
    await expect(page.getByTestId('chasse-etat')).toContainText('Réessaie');
    for (let i = 0; i < n; i++) await cibles_.nth(i).click();
    await expect(page.getByTestId('chasse-etat')).toContainText('Tout est trouvé');
  });

  test('jeux de lettres des pages de syllabes (je colorie, je trouve la lettre)', async ({
    page,
  }) => {
    await ouvrirPage(page, 'en1', 'P006');
    await expect(page.getByTestId('chasse').first()).toBeVisible({ timeout: 15_000 });
    const cible = page.locator('[data-testid="chasse"] button[data-cible="1"]').first();
    await cible.click();
    await expect(cible).toHaveAttribute('aria-pressed', 'true');
  });

  test('la progression du jeu est gardée sur l’appareil : une étoile, jamais une médaille', async ({
    page,
  }) => {
    await page.getByTestId('jeu-colorie').click();
    const cibles_ = page.locator('[data-testid="chasse"] button[data-cible="1"]');
    for (let i = 0; i < (await cibles_.count()); i++) await cibles_.nth(i).click();
    await page.getByTestId('jeu-fermer').click();
    await expect(page.getByTestId('jeu-colorie')).toContainText('Fait');
    await page.reload();
    await attendreJeux(page);
    await expect(page.getByTestId('jeu-colorie')).toContainText('Fait');
  });

  test('accessibilité AA (clair et sombre) et cibles ≥ 44 px, jeux ouverts', async ({ page }) => {
    await clairSombre(page, () => axe(page));
    await cibles(page);
    await page.getByTestId('jeu-construis').click();
    await expect(page.getByTestId('construis')).toBeVisible();
    await clairSombre(page, () => axe(page));
    await cibles(page);
    // en pleine partie : lettres posées, plateau des signes
    const mot = await page.getByTestId('construis').getAttribute('data-mot');
    const c = donneesMot('en1', mot!);
    for (let j = 0; j < c.length; j++) {
      await page.locator(`[data-testid="cons-tuile"][data-lettre="${c[j]![0]}"]`).first().click();
      await page.locator(`[data-testid="cons-case"][data-case="${j}"]`).click();
    }
    await expect(page.getByTestId('cons-signes')).toBeVisible();
    await clairSombre(page, () => axe(page));
    await cibles(page);
    await page.getByTestId('jeu-fermer').click();
    await page.getByTestId('jeu-trouve').click();
    await expect(page.getByTestId('trouve-choix').first()).toBeVisible();
    await clairSombre(page, () => axe(page));
    await cibles(page);
  });

  test('animations réduites respectées', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('jeu-trouve').click();
    await expect.poll(() => sons.length).toBeGreaterThan(0);
    const id = sons.at(-1)!;
    const choix = page.getByTestId('trouve-choix');
    const textes = await choix.allTextContents();
    const bonne = textes.findIndex((t) => audioFileId(t.trim()) === id);
    expect(bonne).toBeGreaterThanOrEqual(0);
    await choix.nth(bonne).click();
    await expect(choix.nth(bonne)).toHaveClass(/bon/);
    const anim = await choix.nth(bonne).evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe('none');
    const trans = await choix.nth(bonne).evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(trans).toMatch(/^0s/);
  });
});

// ———————————————————————————————— jeux des ados (ado1) ————————————————————————————————
test.describe('ados (ado1) : défis, score et médailles', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    await allumer(adm, 'cahier_lecture');
    await allumer(adm, 'video_v2');
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  let erreurs: string[] = [];
  let sons: string[] = [];
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await newAdult(page, 'cjad', PAYS);
    await page.setViewportSize({ width: 390, height: 844 });
    attendus = 0;
    sons = await voixSimulee(page, 'ado1');
    await atteinte(page, 'ado1', 24);
    await ouvrirPage(page, 'ado1', 'P048');
    await attendreJeux(page);
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  /**
   * La syllabe entendue est la dernière demandée au serveur (on attend le son de la NOUVELLE manche) : on touche le choix
   * qui porte cette voix ; `faute` : on touche d'abord un mauvais choix (une erreur), `juste: false` : un seul mauvais choix.
   */
  let attendus = 0;
  const repondre = async (page: Page, o: { faute?: boolean; juste?: boolean } = {}) => {
    await expect.poll(() => sons.length, { timeout: 8000 }).toBeGreaterThan(attendus);
    const id = sons.at(-1)!;
    const choix = page.getByTestId('trouve-choix');
    const textes = await choix.allTextContents();
    const bonne = textes.findIndex((t) => audioFileId(t.trim()) === id);
    expect(bonne, textes.join(' ')).toBeGreaterThanOrEqual(0);
    const mauvaise = textes.findIndex((_, k) => k !== bonne);
    if (o.juste === false) await choix.nth(mauvaise).click();
    else {
      if (o.faute) {
        await choix.nth(mauvaise).click();
        await expect(page.getByTestId('trouve-retour')).toContainText('+2 s');
      }
      await choix.nth(bonne).click();
    }
    attendus = sons.length;
  };

  test('jeux des ados : défi chrono, construis, duel (pas de « Trouve » ni de « Je colorie »)', async ({
    page,
  }) => {
    for (const j of ['chrono', 'construis', 'duel'])
      await expect(page.getByTestId(`jeu-${j}`)).toBeEnabled();
    await expect(page.getByTestId('jeu-trouve')).toHaveCount(0);
    await expect(page.getByTestId('jeu-colorie')).toHaveCount(0);
    const texte = await page.locator('article.page-cahier').innerText();
    expect(texte).not.toMatch(/fat[hḥ]a|kasra|[dḍ]amma|sou?kou?n|shadda|chadda|tanw[iī]n/i);
  });

  test('défi chrono : 10 manches, +2 s par erreur, temps, médaille et record gardés', async ({
    page,
  }) => {
    await page.getByTestId('jeu-chrono').click();
    await expect(page.getByTestId('trouve')).toHaveAttribute('data-mode', 'chrono');
    await expect(page.getByTestId('chrono-temps')).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await expect(page.getByTestId('trouve-manche')).toContainText(`${i + 1} sur 10`);
      await expect(page.getByTestId('trouve-choix')).toHaveCount(4);
      // une erreur à la 5e manche : +2 s, on reste sur la manche jusqu'à la bonne réponse
      await repondre(page, { faute: i === 4 });
    }
    await expect(page.getByTestId('trouve-fin')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chrono-resultat')).toContainText('s, erreurs comprises');
    // une erreur : 2 s de plus ; le temps total reste dans les paliers, une médaille est donnée
    const med = await page.getByTestId('trouve-fin').getAttribute('data-med');
    expect(Number(med)).toBeGreaterThan(0);
    await expect(page.locator('[data-medaille]')).toBeVisible();
    await page.getByTestId('jeu-fermer').click();
    await expect(page.getByTestId('jeu-chrono').locator('[data-medaille]')).toBeVisible();
    await page.reload();
    await attendreJeux(page);
    await expect(page.getByTestId('jeu-chrono').locator('[data-medaille]')).toBeVisible();
  });

  test('duel à deux sur le même appareil : chacun son tour, score, gagnant, médaille', async ({
    page,
  }) => {
    await page.getByTestId('jeu-duel').click();
    await expect(page.getByTestId('trouve')).toHaveAttribute('data-mode', 'duel');
    const joueurs: string[] = [];
    for (let i = 0; i < 10; i++) {
      await expect(page.getByTestId('trouve-manche')).toContainText(`${i + 1} sur 10`);
      joueurs.push((await page.getByTestId('duel-joueur').getAttribute('data-joueur'))!);
      // le joueur 2 se trompe à chaque manche : un seul essai, la bonne réponse est montrée
      await repondre(page, { juste: i % 2 === 0 });
      if (i % 2 === 1)
        await expect(page.getByTestId('trouve-retour')).toContainText('bonne réponse');
    }
    expect(joueurs).toEqual(['1', '2', '1', '2', '1', '2', '1', '2', '1', '2']);
    await expect(page.getByTestId('duel-resultat')).toContainText('Le joueur 1 gagne', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('trouve-fin')).toContainText('Joueur 1 : 5 · Joueur 2 : 0');
    await expect(page.locator('[data-medaille="or"]')).toBeVisible();
  });

  test('« Construis le mot » des ados : plus rapide (vérifié quand les cases sont pleines), score et médaille', async ({
    page,
  }, info) => {
    await page.getByTestId('jeu-construis').click();
    await expect(page.getByTestId('construis')).toHaveAttribute('data-public', 'ado');
    // une erreur de lettre au premier mot : les ados sont vérifiés quand les cases sont pleines (pas avant), puis les
    // lettres mal placées retournent sur le plateau
    const mot = await page.getByTestId('construis').getAttribute('data-mot');
    const c = donneesMot('ado1', mot!);
    const lettres = c.map(([l]) => l);
    const inverse = [...lettres].reverse();
    if (inverse.join('') !== lettres.join('')) {
      for (let j = 0; j < inverse.length; j++) {
        await page
          .locator(`[data-testid="cons-tuile"][data-lettre="${inverse[j]}"]`)
          .first()
          .click();
        await page.locator(caseDe(j)).click();
        // aucune vérification avant la dernière case
        if (j < inverse.length - 1)
          await expect(page.getByTestId('cons-retour')).not.toHaveAttribute(
            'data-retour',
            'reessaie',
          );
      }
      await expect(page.getByTestId('cons-retour')).toHaveAttribute('data-retour', 'reessaie');
      await page.waitForTimeout(900);
    }
    // le reste du mot se joue au doigt (mobile) ou à la souris (bureau), puis les mots suivants en touchant
    await construire(page, 'ado1', info.project.name === 'mobile-chromium' ? 'doigt' : 'souris');
    for (let k = 0; k < 4; k++) {
      await page.getByTestId('cons-suivant').click();
      await construire(page, 'ado1', 'toucher');
    }
    await page.getByTestId('cons-suivant').click();
    await expect(page.getByTestId('cons-fin')).toContainText('sur 5 construits du premier coup');
    // une erreur au premier mot : pas d'or, mais une médaille (argent : 4 sur 5 au moins)
    await expect(page.locator('[data-medaille]')).toBeVisible();
  });

  test('le « Défi » de la page : score, médaille et record gardés', async ({ page }) => {
    await ouvrirPage(page, 'ado1', 'P004');
    await expect(page.getByTestId('defi')).toBeVisible();
    const max = page_('ado1', 'P004').defi!.max;
    await expect(page.getByTestId('defi-score')).toContainText(`0 sur ${max}`);
    for (let i = 0; i < Math.ceil(max * 0.9); i++)
      await page.getByRole('button', { name: 'Un de plus' }).click();
    await expect(page.getByTestId('defi-score')).toContainText(
      `${Math.ceil(max * 0.9)} sur ${max}`,
    );
    await expect(page.getByTestId('defi').locator('[data-medaille="argent"]')).toBeVisible();
    await page.getByTestId('defi-noter').click();
    await expect(page.getByTestId('defi-record')).toContainText(`Record : ${Math.ceil(max * 0.9)}`);
    await page.reload();
    await expect(page.getByTestId('defi-record')).toContainText('Record');
  });

  test('mission d’un bilan : médaille de bronze, d’argent ou d’or selon les mots lus du premier coup', async ({
    page,
  }) => {
    const bilan = donnees.ado1.pages.find((p) => p.type === 'bilan')!;
    await ouvrirPage(page, 'ado1', bilan.id);
    await page.getByTestId('bilan-fini').click();
    await expect(page.getByTestId('bilan-resultat')).toContainText('10 sur 10');
    await expect(page.getByTestId('bilan-medaille').locator('[data-medaille="or"]')).toBeVisible();
    // trois mots manqués sur dix : 7 sur 10 = bronze
    await ouvrirPage(page, 'ado1', bilan.id);
    for (const k of [0, 1, 2]) await page.locator(`.page-cahier .el[data-k="0.${k}"]`).click();
    await page.getByTestId('bilan-fini').click();
    await expect(page.getByTestId('bilan-resultat')).toContainText('7 sur 10');
    await expect(
      page.getByTestId('bilan-medaille').locator('[data-medaille="bronze"]'),
    ).toBeVisible();
  });

  test('accessibilité AA (clair et sombre) et cibles ≥ 44 px : jeux et médailles des ados', async ({
    page,
  }) => {
    await clairSombre(page, () => axe(page));
    await cibles(page);
    await page.getByTestId('jeu-chrono').click();
    await expect(page.getByTestId('trouve-choix').first()).toBeVisible();
    await clairSombre(page, () => axe(page));
    await cibles(page);
    for (let i = 0; i < 10; i++) {
      await expect(page.getByTestId('trouve-manche')).toContainText(`${i + 1} sur 10`);
      await repondre(page);
    }
    await expect(page.getByTestId('trouve-fin')).toBeVisible({ timeout: 15_000 });
    await clairSombre(page, () => axe(page));
    await page.getByTestId('jeu-fermer').click();
    await page.getByTestId('jeu-construis').click();
    await clairSombre(page, () => axe(page));
    await cibles(page);
    await ouvrirPage(page, 'ado1', 'P004');
    await clairSombre(page, () => axe(page));
    await cibles(page);
  });

  test('captures 390 px (clair et sombre) avec un jeu en cours', async ({ page }) => {
    test.skip(!CAPTURES, 'CAHIER_JEUX_CAPTURES non défini');
    test.setTimeout(300_000);
    const dir = join(CAPTURES!, 'ado1');
    mkdirSync(dir, { recursive: true });
    const prendre = async (nom: string) => {
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await page.waitForTimeout(250);
        await page.screenshot({
          path: join(dir, `${nom}_${m === 'light' ? 'clair' : 'sombre'}.png`),
        });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    };
    await page.goto('/cahier/ado1');
    await expect(page.getByTestId('cahier-suite')).toBeVisible();
    await prendre('01-sommaire');
    await ouvrirPage(page, 'ado1', 'P048');
    await page.locator('.page-cahier .bloc[data-bloc="grille"]').scrollIntoViewIfNeeded();
    await prendre('02-grille');
    await attendreJeux(page);
    await page.getByTestId('jeux').scrollIntoViewIfNeeded();
    await prendre('03-jeux-menu');
    // Construis le mot en cours : lettres posées, signes à poser
    await page.getByTestId('jeu-construis').click();
    const mot = await page.getByTestId('construis').getAttribute('data-mot');
    const c = donneesMot('ado1', mot!);
    for (let j = 0; j < c.length; j++) {
      await page.locator(`[data-testid="cons-tuile"][data-lettre="${c[j]![0]}"]`).first().click();
      await page.locator(`[data-testid="cons-case"][data-case="${j}"]`).click();
    }
    await expect(page.getByTestId('cons-signes')).toBeVisible();
    await page.getByTestId('construis').scrollIntoViewIfNeeded();
    await prendre('04-construis-en-cours');
    await page.getByTestId('jeu-fermer').click();
    // défi chrono en cours (manche 4) puis résultat avec médaille
    await page.getByTestId('jeu-chrono').click();
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId('trouve-manche')).toContainText(`${i + 1} sur 10`);
      await repondre(page);
    }
    await expect(page.getByTestId('trouve-manche')).toContainText('4 sur 10');
    await page.getByTestId('trouve').scrollIntoViewIfNeeded();
    await prendre('05-chrono-en-cours');
    for (let i = 3; i < 10; i++) {
      await expect(page.getByTestId('trouve-manche')).toContainText(`${i + 1} sur 10`);
      await repondre(page);
    }
    await expect(page.getByTestId('trouve-fin')).toBeVisible({ timeout: 15_000 });
    await prendre('06-chrono-resultat-medaille');
    await page.getByTestId('jeu-fermer').click();
    // duel en cours
    await page.getByTestId('jeu-duel').click();
    await expect(page.getByTestId('duel-joueur')).toBeVisible();
    await prendre('07-duel-en-cours');
    // défi de la page
    await ouvrirPage(page, 'ado1', 'P004');
    for (let i = 0; i < 28; i++) await page.getByRole('button', { name: 'Un de plus' }).click();
    await page.getByTestId('defi').scrollIntoViewIfNeeded();
    await prendre('08-defi');
  });
});

test.describe('captures des enfants (en1)', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    await allumer(adm, 'cahier_lecture');
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  test('captures 390 px (clair et sombre) avec un jeu en cours', async ({ page }) => {
    test.skip(!CAPTURES, 'CAHIER_JEUX_CAPTURES non défini');
    test.setTimeout(300_000);
    await newAdult(page, 'cjenc', PAYS);
    await page.setViewportSize({ width: 390, height: 844 });
    const sons = await voixSimulee(page, 'en1');
    await atteinte(page, 'en1', 24);
    const dir = join(CAPTURES!, 'en1');
    mkdirSync(dir, { recursive: true });
    const prendre = async (nom: string) => {
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await page.waitForTimeout(250);
        await page.screenshot({
          path: join(dir, `${nom}_${m === 'light' ? 'clair' : 'sombre'}.png`),
        });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    };
    await page.goto('/cahier/en1');
    await expect(page.getByTestId('cahier-suite')).toBeVisible();
    await prendre('01-sommaire');
    await ouvrirPage(page, 'en1', 'P083');
    await page.locator('.page-cahier .bloc[data-bloc="grille"]').scrollIntoViewIfNeeded();
    await prendre('02-grille-gros-caracteres');
    await atteinte(page, 'en1', 1);
    await page.reload();
    await expect(page.locator('.page-cahier .grille .el.cel.verrou').first()).toBeVisible();
    await page.locator('.page-cahier .bloc[data-bloc="grille"]').scrollIntoViewIfNeeded();
    await prendre('03-grille-ouverte-a-la-lecon-1');
    await atteinte(page, 'en1', 24);
    await page.reload();
    await attendreJeux(page);
    await page.getByTestId('jeux').scrollIntoViewIfNeeded();
    await prendre('04-jeux-menu');
    await page.getByTestId('jeu-construis').click();
    await page.getByTestId('construis').scrollIntoViewIfNeeded();
    await prendre('05-construis-lettres');
    const mot = await page.getByTestId('construis').getAttribute('data-mot');
    const c = donneesMot('en1', mot!);
    for (let j = 0; j < c.length; j++) {
      await page.locator(`[data-testid="cons-tuile"][data-lettre="${c[j]![0]}"]`).first().click();
      await page.locator(`[data-testid="cons-case"][data-case="${j}"]`).click();
    }
    await expect(page.getByTestId('cons-signes')).toBeVisible();
    await prendre('06-construis-signes');
    for (let j = 0; j < c.length; j++) {
      const s = c[j]![1];
      if (!s) continue;
      await page.locator(`[data-testid="cons-signe"][data-signe="${s}"]`).first().click();
      await page.locator(`[data-testid="cons-case"][data-case="${j}"]`).click();
    }
    await expect(page.getByTestId('cons-compare')).toBeVisible();
    await prendre('07-construis-reussi-modele');
    await page.getByTestId('jeu-fermer').click();
    await page.getByTestId('jeu-trouve').click();
    await expect.poll(() => sons.length).toBeGreaterThan(0);
    await page.getByTestId('trouve').scrollIntoViewIfNeeded();
    await prendre('08-trouve-la-syllabe');
    await page.getByTestId('jeu-fermer').click();
    await page.getByTestId('jeu-colorie').click();
    await page.locator('[data-testid="chasse"] button[data-cible="1"]').first().click();
    await page.getByTestId('chasse').scrollIntoViewIfNeeded();
    await prendre('09-je-colorie');
  });
});
