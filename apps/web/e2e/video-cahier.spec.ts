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
 * Vidéos vivantes du cahier de lecture (25/10/2026) — bouton « Regarder la vidéo » de chaque page du cahier, derrière
 * les interrupteurs `cahier_lecture` ET `video_v2` (aucun interrupteur nouveau) :
 *  - cahier ouvert SEUL (video_v2 coupé) : aucun bouton, le lecteur n'est jamais chargé ;
 *  - les deux ALLUMÉS (exceptions par pays, sans redéploiement) : le lecteur est chargé au premier appui (pas avant),
 *    la vidéo s'ouvre, joue, et met chaque syllabe en surbrillance AU SON EXACT (événement « playing » du fichier), en
 *    grand, avec la flèche qui avance de droite à gauche, puis la pause « À toi : répète » ; une grille se lit ligne
 *    par ligne ; le texte affiché est celui du cahier ; chaque texte qui a un fichier est dit ; aucune synthèse sur le
 *    Coran (récitation stockée seulement) ; préchargement de 4 fichiers au plus ; accessibilité AA, cibles ≥ 44 px.
 * L'audio de synthèse du niveau est SIMULÉ (liste des fichiers du cahier, silence de 0,3 s).
 * VIDEO_CAHIER_CAPTURES=<dossier> : captures 390 px (clair et sombre) de 3 séances (une lettre, une grille, des mots).
 */
const H = { 'x-awform': '1' };
/** pays où cahier_lecture ET video_v2 sont allumés / où cahier_lecture seul l'est */
const PAYS = 'FI';
const PAYS_SEUL = 'EE';
const CAPTURES = process.env.VIDEO_CAHIER_CAPTURES;
const donnees = JSON.parse(
  readFileSync(new URL('../static/cahier-data/ad1.json', import.meta.url), 'utf8'),
) as { pages: Array<PageIn & { texte?: { lignes: string[]; titre?: string } }> };
const page_ = (id: string) => donnees.pages.find((p) => p.id === id)!;
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
  // lettres d'étiquette des tableaux (voix de la lettre seule)
  for (const p of donnees.pages)
    for (const b of p.blocs)
      for (const r of b.el as Array<{ lettre?: string }>)
        if (r.lettre) ids.add(audioFileId(r.lettre));
  ids.delete('');
  return [...ids];
})();
const aVoix = (s: string) => FICHIERS.includes(audioFileId(s));
const generer = (id: string) => buildVideoCahier(page_(id), { hasAudio: aVoix, garde: new Set() });
// 0,3 s de silence (MP3 24 kHz mono) : la voix simulée
const SILENCE = Buffer.from(
  'SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAAPAAAGYAAtLS0tLS08PDw8PDw8S0tLS0tLWlpaWlpaWmlpaWlpaWl4eHh4eHiHh4eHh4eHlpaWlpaWlqWlpaWlpbS0tLS0tLTDw8PDw8PD0tLS0tLS4eHh4eHh4fDw8PDw8PD///////8AAAAATGF2YzYyLjExAAAAAAAAAAAAAAAAJANgAAAAAAAABmADyt9kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80TEAAAAA0gAAAAATEFNRTMuMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEUwAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEpgAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TErAAAA0gAAAAAMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=',
  'base64',
);

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-vcah-${test.info().project.name}-${Date.now()}@e2e.test`;
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
/** retire les exceptions posées pour nos deux pays (aucune trace pour les autres suites) */
async function remettre(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string; pays?: string | null }> }>;
  };
  for (const f of d.fonctions.filter((x) => CLES.includes(x.cle)))
    for (const r of f.regles)
      if (r.pays === PAYS || r.pays === PAYS_SEUL)
        await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
}
async function allumer(adm: Page, cle: string, pays: string) {
  const r = await adm.request.post(`/api/v1/admin/fonctions/${cle}/regles`, {
    headers: H,
    data: { effet: 'on', pays },
  });
  expect(r.status(), await r.text()).toBe(201);
}

/** fichiers du groupe « vidéos » (à la demande) déjà chargés par la page */
const chargesVideo = async (page: Page) => {
  const liste = (await (await page.request.get('/_app/video.json')).json()) as string[];
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  return liste.filter((f) => vus.includes(f) && f.endsWith('.js'));
};
/** audio de synthèse du niveau simulé ; renvoie la liste des fichiers demandés */
async function voixSimulee(page: Page) {
  const demandes: string[] = [];
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
    demandes.push(new URL(r.request().url()).pathname.split('/').pop()!.replace('.mp3', ''));
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  return demandes;
}
const ouvrirPage = async (page: Page, id: string) => {
  await page.goto(`/cahier/ad1?p=${id}`);
  await expect(page.locator(`article.page-cahier[data-page="${id}"]`)).toBeVisible({
    timeout: 20_000,
  });
};
const ouvrirVideo = async (page: Page, id: string) => {
  await ouvrirPage(page, id);
  await page.getByTestId('voir-video-cahier').click();
  await expect(page.getByTestId('vc')).toBeVisible({ timeout: 20_000 });
};
/** observation dans la page : éléments allumés, instants des sons, flèche, pastille, fichiers en mémoire */
async function observer(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __vc: Record<string, unknown[]> & { maxLive: number } };
    w.__vc = { joue: [], audios: [], playing: [], erreurs: [], pastilles: [] } as never;
    // les lecteurs audio (hors de la page : aucun événement ne remonte au document) sont suivis à leur création
    const Audio0 = window.Audio;
    const Audio1 = function (this: unknown, ...args: ConstructorParameters<typeof Audio>) {
      const a = new Audio0(...args);
      w.__vc.audios.push(a);
      // enregistrés à la création : ils passent AVANT le gestionnaire du lecteur (même événement)
      a.addEventListener('playing', () => w.__vc.playing.push(performance.now()));
      a.addEventListener('error', () => w.__vc.erreurs.push(performance.now()));
      return a;
    } as unknown as typeof Audio;
    Audio1.prototype = Audio0.prototype;
    window.Audio = Audio1;
    let dernier = '';
    new MutationObserver(() => {
      const j = document.querySelector('.vc-u.joue');
      const txt = j?.querySelector('.a')?.textContent ?? '';
      const p = document.querySelector('.vc-cs')?.textContent ?? '';
      if (p && w.__vc.pastilles.at(-1) !== p) w.__vc.pastilles.push(p);
      if (!j || `${j.getAttribute('data-i')}` === dernier) return;
      dernier = `${j.getAttribute('data-i')}`;
      const fl = j.closest('.vc-l1')?.querySelector<HTMLElement>('.vc-fl');
      // la voix qui joue à cet instant : a-t-elle commencé à l'instant même (position de lecture) ?
      const dep = (w.__vc.playing as number[]).at(-1);
      w.__vc.joue.push({
        depuis: dep === undefined ? null : performance.now() - dep,
        t: performance.now(),
        txt,
        focus: document.querySelector('.vc-focus .a')?.textContent ?? null,
        ligne: j.closest('.vc-l1')?.getAttribute('data-g'),
        fl: fl ? parseFloat(/-?[\d.]+/.exec(fl.style.transform)?.[0] ?? 'NaN') : NaN,
      });
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
    });
  });
}
type Vu = {
  depuis: number | null;
  t: number;
  txt: string;
  focus: string | null;
  ligne: string;
  fl: number;
};
const lireObs = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __vc: { joue: Vu[]; audios: unknown[]; erreurs: unknown[]; pastilles: string[] };
    };
    return {
      joue: w.__vc.joue,
      audios: w.__vc.audios.length,
      erreurs: w.__vc.erreurs.length,
      pastilles: w.__vc.pastilles,
    };
  });
async function cibles(page: Page) {
  const petites = await page.locator('.vc button').evaluateAll((els) =>
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
  const r = await new AxeBuilder({ page })
    .include('.vc')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160)})`).join(' | ')}`,
    ),
  ).toEqual([]);
}

test.describe('cahier_lecture seul (video_v2 coupé) : aucune vidéo', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    await allumer(adm, 'cahier_lecture', PAYS_SEUL);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  test('aucun bouton « Regarder la vidéo », le lecteur n’est jamais chargé', async ({ page }) => {
    await newAdult(page, 'vcs', PAYS_SEUL);
    await page.setViewportSize({ width: 390, height: 844 });
    await voixSimulee(page);
    await ouvrirPage(page, 'P047');
    await expect(page.getByTestId('lire-modele')).toBeVisible();
    await expect(page.getByTestId('voir-video-cahier')).toHaveCount(0);
    expect(await chargesVideo(page)).toEqual([]);
  });
});

test.describe('cahier_lecture ET video_v2 allumés : « Regarder la vidéo »', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    await allumer(adm, 'cahier_lecture', PAYS);
    await allumer(adm, 'video_v2', PAYS);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  let erreurs: string[] = [];
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await newAdult(page, 'vcah', PAYS);
    await page.setViewportSize({ width: 390, height: 844 });
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('le bouton est sur les pages à lire, pas sur le bilan, la minute ni le guide ; lecteur chargé au premier appui', async ({
    page,
  }) => {
    await voixSimulee(page);
    for (const p of donnees.pages
      .filter((x) => ['bilan', 'minute', 'guide'].includes(x.type))
      .slice(0, 4)) {
      await page.goto(`/cahier/ad1?p=${p.id}`);
      await expect(page.locator(`article.page-cahier[data-page="${p.id}"]`)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId('voir-video-cahier'), p.id).toHaveCount(0);
    }
    await ouvrirPage(page, 'P004');
    await expect(page.getByTestId('voir-video-cahier')).toBeVisible();
    // jamais préchargé : aucun fichier du groupe « vidéos » avant le premier appui
    expect(await chargesVideo(page)).toEqual([]);
    await page.getByTestId('voir-video-cahier').click();
    await expect(page.getByTestId('vc')).toBeVisible({ timeout: 20_000 });
    expect((await chargesVideo(page)).length).toBeGreaterThan(0);
    // fermer rend la page telle quelle
    await page.locator('.vc [data-k="fermer"]').click();
    await expect(page.getByTestId('vc')).toHaveCount(0);
    await expect(page.getByTestId('voir-video-cahier')).toBeFocused();
  });

  test('la vidéo joue : chaque syllabe s’allume AU SON EXACT, en grand, la flèche avance de droite à gauche, puis « À toi : répète »', async ({
    page,
  }) => {
    const demandes = await voixSimulee(page);
    await ouvrirPage(page, 'P004');
    await observer(page);
    await page.getByTestId('voir-video-cahier').click();
    await expect(page.getByTestId('vc')).toBeVisible({ timeout: 20_000 });
    // 1re ligne : les 3 voyelles de la première lettre ; la pastille bascule en « répète » ; la 2e ligne démarre
    await expect(page.locator('.vc-cs.a-toi')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vc-l1.act[data-g="1"]')).toBeVisible({ timeout: 20_000 });
    const obs = await lireObs(page);
    const attendues = generer('P004').scenes[0]!.lignes[0]!.unites.map((u) => u.ar);
    const l0 = obs.joue.filter((j) => j.ligne === '0');
    // l’ordre est celui du cahier ; l’élément allumé est celui qui s’affiche en grand
    expect(l0.map((j) => j.txt)).toEqual(attendues);
    expect(l0.map((j) => j.focus)).toEqual(attendues);
    // au son exact : à chaque allumage, le fichier de cet élément vient de commencer à jouer (événement « playing », < 150 ms)
    for (const j of l0) {
      expect(j.depuis, j.txt).not.toBeNull();
      expect(j.depuis!, j.txt).toBeLessThan(150);
    }
    expect(obs.audios).toBeGreaterThanOrEqual(3);
    expect(obs.erreurs).toBe(0);
    // la flèche avance de droite à gauche : sa position diminue d’une syllabe à l’autre
    expect(l0.map((j) => j.fl).every((x, i, a) => i === 0 || x < a[i - 1]!)).toBe(true);
    expect(obs.pastilles).toContain('Écoute');
    expect(obs.pastilles).toContain('À toi : répète');
    // les fichiers demandés sont ceux des syllabes montrées (rien d’autre pour cette ligne)
    for (const u of generer('P004').scenes[0]!.lignes[0]!.unites)
      expect(demandes, u.ar).toContain(audioFileId(u.ar));
  });

  test('une grille se lit ligne par ligne, de droite à gauche', async ({ page }) => {
    await voixSimulee(page);
    await ouvrirPage(page, 'P047');
    await observer(page);
    await page.getByTestId('voir-video-cahier').click();
    await expect(page.getByTestId('vc')).toBeVisible({ timeout: 20_000 });
    const sc = generer('P047').scenes[0]!;
    await expect(page.locator('.vc-l1')).toHaveCount(sc.lignes.length);
    await expect(page.locator('.vc-lt b')).toHaveText(sc.lignes.map((_, i) => String(i + 1)));
    for (const r of await page.locator('.vc-r').all())
      await expect(r).toHaveAttribute('dir', 'rtl');
    // les lignes passent l’une après l’autre : 1, puis 2 (jamais deux à la fois)
    await expect(page.locator('.vc-l1.act[data-g="0"]')).toBeVisible();
    await expect(page.locator('.vc-l1.act')).toHaveCount(1);
    await expect(page.locator('.vc-l1.act[data-g="1"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.vc-l1.act')).toHaveCount(1);
    // les trois cases de la 2e ligne s'allument l'une après l'autre
    await expect
      .poll(async () => (await lireObs(page)).joue.filter((j) => j.ligne === '1').length, {
        timeout: 20_000,
      })
      .toBe(3);
    const obs = await lireObs(page);
    for (const g of ['0', '1']) {
      const att = sc.lignes[Number(g)]!.unites.map((u) => u.ar);
      expect(
        obs.joue.filter((j) => j.ligne === g).map((j) => j.txt),
        `ligne ${g}`,
      ).toEqual(att);
    }
    // les 3 cases d’une ligne sont l’une à côté de l’autre sur une seule rangée
    const ys = await page
      .locator('.vc-l1[data-g="0"] .vc-u')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
    // l'arabe de la première case est à DROITE des suivantes
    const xs = await page
      .locator('.vc-l1[data-g="0"] .vc-u')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(xs[0]).toBeGreaterThan(xs[1]!);
    expect(xs[1]).toBeGreaterThan(xs[2]!);
  });

  test('le texte affiché est celui du cahier, octet pour octet, scène après scène ; chaque texte qui a un fichier est dit', async ({
    page,
  }) => {
    const demandes = await voixSimulee(page);
    for (const id of ['P047', 'P003']) {
      await ouvrirVideo(page, id);
      await expect(page.locator('.vc-l1.act')).toBeVisible();
      // on parcourt toutes les lignes (suivante), en notant l’arabe de chaque scène telle qu’affichée
      const vues = await page.evaluate(async () => {
        const out: string[][] = [];
        const titres: string[] = [];
        let derniere = '';
        for (let i = 0; i < 400; i++) {
          if (document.querySelector('.vc-fin')) break;
          const cle = [...document.querySelectorAll('.vc-l1')]
            .map((e) => (e as HTMLElement).dataset.g)
            .join(',');
          if (cle !== derniere) {
            derniere = cle;
            out.push([...document.querySelectorAll('.vc-u .a')].map((a) => a.textContent ?? ''));
            titres.push(document.querySelector('.vc-bt')?.textContent ?? '');
          }
          (document.querySelector('[data-k="suiv"]') as HTMLElement).click();
          await new Promise((r) => setTimeout(r, 40));
        }
        return { out, titres };
      });
      const gen = generer(id).scenes;
      expect(vues.out).toEqual(gen.map((s) => s.lignes.flatMap((l) => l.unites.map((u) => u.ar))));
      // les libellés français sont ceux du cahier
      expect(vues.titres).toEqual(gen.map((s) => s.titre));
      await expect(page.locator('.vc-fin')).toBeVisible();
      await page.locator('.vc [data-k="fermer"]').click();
    }
    // chaque texte vu (et qui a un fichier) a été demandé : aucune scène muette
    for (const id of ['P047', 'P003'])
      for (const u of unitesDe(generer(id)).slice(0, 3))
        expect(demandes).toContain(audioFileId(u.ar));
  });

  test('Coran : aucune synthèse (récitation stockée seulement) ; le texte reste celui du Muṣḥaf', async ({
    page,
  }) => {
    const demandes = await voixSimulee(page);
    const recitations: string[] = [];
    page.on('request', (r) => /\/quran\//.test(r.url()) && recitations.push(r.url()));
    await ouvrirVideo(page, 'P115');
    const gen = generer('P115').scenes;
    expect(unitesDe(generer('P115')).every((u) => u.voix !== 'oui')).toBe(true);
    await expect(page.locator('.vc-u .a.quran-text').first()).toHaveText(
      gen[0]!.lignes[0]!.unites[0]!.ar,
    );
    await expect.poll(() => recitations.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(recitations.some((u) => u.includes('ayyoub-hafs'))).toBe(true);
    await page.waitForTimeout(1500);
    expect(demandes).toEqual([]);
  });

  test('préchargement : 4 fichiers au plus en mémoire à la fois', async ({ page }) => {
    await voixSimulee(page);
    await page.addInitScript(() => {
      const vivants = new Set<HTMLMediaElement>();
      const w = window as unknown as { __maxVivants: number };
      w.__maxVivants = 0;
      const proto = HTMLMediaElement.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, 'src')!;
      Object.defineProperty(proto, 'src', {
        ...d,
        set(this: HTMLMediaElement, v: string) {
          d.set!.call(this, v);
          if (v) vivants.add(this);
          w.__maxVivants = Math.max(w.__maxVivants, vivants.size);
        },
      });
      const rm = proto.removeAttribute;
      proto.removeAttribute = function (this: Element, n: string) {
        if (n === 'src') vivants.delete(this as HTMLMediaElement);
        return rm.call(this, n);
      };
    });
    await ouvrirVideo(page, 'P004');
    await expect(page.locator('.vc-l1.act[data-g="2"]')).toBeVisible({ timeout: 40_000 });
    const max = await page.evaluate(
      () => (window as unknown as { __maxVivants: number }).__maxVivants,
    );
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(4);
  });

  test('pause, reprise, vitesse et lignes suivante/précédente', async ({ page }) => {
    await voixSimulee(page);
    await ouvrirVideo(page, 'P047');
    await expect(page.locator('.vc-l1.act[data-g="0"]')).toBeVisible();
    await page.locator('.vc [data-k="lire"]').click();
    await expect(page.getByTestId('vc')).toHaveAttribute('data-pause', '');
    await page.locator('.vc [data-k="suiv"]').click();
    await expect(page.locator('.vc-l1.act[data-g="1"]')).toBeVisible();
    await page.locator('.vc [data-k="prec"]').click();
    await expect(page.locator('.vc-l1.act[data-g="0"]')).toBeVisible();
    await page.locator('.vc [data-k="vitesse"]').click();
    await expect(page.locator('.vc [data-k="vitesse"]')).toContainText('1,25');
    await page.locator('.vc [data-k="lire"]').click();
    await expect(page.getByTestId('vc')).not.toHaveAttribute('data-pause', '');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vc')).toHaveCount(0);
  });

  test('accessibilité AA (clair et sombre), cibles ≥ 44 px', async ({ page }) => {
    await voixSimulee(page);
    for (const id of ['P004', 'P047']) {
      await ouvrirVideo(page, id);
      await expect(page.locator('.vc-u.joue')).toBeVisible({ timeout: 20_000 });
      await page.locator('.vc [data-k="lire"]').click();
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await page.waitForTimeout(450);
        await axe(page);
      }
      await cibles(page);
      await page.locator('.vc [data-k="fermer"]').click();
    }
  });

  test('animations réduites : fondus seuls, la vidéo joue quand même', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await voixSimulee(page);
    await ouvrirVideo(page, 'P004');
    await expect(page.locator('.vc-u.joue')).toBeVisible({ timeout: 20_000 });
    const t = await page.locator('.vc-u.joue').evaluate((e) => getComputedStyle(e).transform);
    expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  });

  test('captures 390 px de 3 séances (une lettre, une grille, des mots), clair et sombre', async ({
    page,
  }) => {
    test.skip(!CAPTURES, 'VIDEO_CAHIER_CAPTURES non défini');
    test.setTimeout(600_000);
    const dir = CAPTURES!;
    mkdirSync(dir, { recursive: true });
    await voixSimulee(page);
    const prendre = async (nom: string) => {
      for (const m of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: m });
        await page.waitForTimeout(350);
        await page.screenshot({
          path: join(dir, `${nom}_${m === 'light' ? 'clair' : 'sombre'}.png`),
        });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    };
    // la voix simulée ne dure que 0,3 s : le lecteur est mis en pause dans la tâche qui suit l'allumage de l'élément (son
    // exact) ; les lecteurs audio sont hors de la page, leurs événements ne remontent pas au document : suivi à la création
    await page.addInitScript(() => {
      const Audio0 = window.Audio;
      const Audio1 = function (this: unknown, ...args: ConstructorParameters<typeof Audio>) {
        const a = new Audio0(...args);
        a.addEventListener('playing', () =>
          setTimeout(() => {
            const w = window as unknown as { __cible?: string };
            const j = document.querySelector('.vc-u.joue .a');
            if (w.__cible && j?.textContent === w.__cible) {
              w.__cible = undefined;
              (document.querySelector('.vc [data-k="lire"]') as HTMLElement).click();
            }
          }, 0),
        );
        return a;
      } as unknown as typeof Audio;
      Audio1.prototype = Audio0.prototype;
      window.Audio = Audio1;
    });
    const figer = async (txt: string) => {
      await page.evaluate((c) => ((window as unknown as { __cible?: string }).__cible = c), txt);
      await expect(page.getByTestId('vc')).toHaveAttribute('data-pause', '', { timeout: 40_000 });
    };
    const reprendre = () => page.locator('.vc [data-k="lire"]').click();
    const lignes = (id: string) => generer(id).scenes[0]!.lignes;
    // 1. une lettre : P004 (les trois voyelles d’une lettre) — l’élément dit, en grand, et la pause de répétition
    await ouvrirVideo(page, 'P004');
    await figer(lignes('P004')[0]!.unites[1]!.ar);
    await prendre('01-lettre-surlignage');
    await reprendre();
    await expect(page.locator('.vc-cs.a-toi')).toBeVisible({ timeout: 20_000 });
    await page.locator('.vc [data-k="lire"]').click();
    await prendre('01-lettre-repetition');
    await page.locator('.vc [data-k="fermer"]').click();
    // 2. une grille : P047 — 2e case de la 2e ligne
    await ouvrirVideo(page, 'P047');
    await page.locator('.vc [data-k="suiv"]').click();
    await figer(lignes('P047')[1]!.unites[1]!.ar);
    await prendre('02-grille-surlignage');
    await reprendre();
    await expect(page.locator('.vc-cs.a-toi')).toBeVisible({ timeout: 20_000 });
    await page.locator('.vc [data-k="lire"]').click();
    await prendre('02-grille-repetition');
    await page.locator('.vc [data-k="fermer"]').click();
    // 3. des mots : P008 (neuf mots, trois par ligne)
    await ouvrirVideo(page, 'P008');
    await figer(lignes('P008')[0]!.unites[1]!.ar);
    await prendre('03-mots-surlignage');
    await reprendre();
    await expect(page.locator('.vc-cs.a-toi')).toBeVisible({ timeout: 20_000 });
    await page.locator('.vc [data-k="lire"]').click();
    await prendre('03-mots-repetition');
    await page.locator('.vc [data-k="fermer"]').click();
  });
});
