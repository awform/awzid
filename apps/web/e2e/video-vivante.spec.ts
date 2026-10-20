import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Vidéos vivantes (19/10/2026) — interrupteur `video_vivante` :
 *  - COUPÉ (défaut hors démonstration) : aucun bouton, le lecteur n'est jamais chargé, la leçon reste entière ;
 *  - ALLUMÉ par l'administrateur (exception par pays, sans redéploiement) : « Voir en vidéo » en haut de l'unité,
 *    lecteur plein écran chargé au premier appui ; les 5 modes sur une leçon (ad1.l01), les modes d'un bilan
 *    (ad1.l05 : ni « par lettre » ni quiz, l'épreuve n'a pas de corrigé) ; reprise ; traduction ; animations
 *    réduites ; accessibilité (axe AA) clair et sombre ; cibles ≥ 44 px.
 * VIDEO_CAPTURES=<dossier> : captures 390 px (clair et sombre) des moments clés des 25 unités d'Adultes 1, et une
 * planche par groupe de 5 unités.
 */
const H = { 'x-awform': '1' };
const PAYS = 'LU';
const CAPTURES = process.env.VIDEO_CAPTURES;
/** niveau des captures (Adultes 1 par défaut ; VIDEO_CAPTURES_LIVRE=ad2…) */
const LIVRE = process.env.VIDEO_CAPTURES_LIVRE ?? 'ad1';
/** unités à capturer (toutes par défaut ; VIDEO_CAPTURES_UNITES=l21,l22…) */
const UNITES = (process.env.VIDEO_CAPTURES_UNITES ?? '').split(',').filter(Boolean);

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-vv-${test.info().project.name}-${Date.now()}@e2e.test`;
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
/**
 * retire les exceptions de video_vivante et video_v2 posées pour un pays (aucune trace pour les autres suites ; la
 * suite v1 et la suite v2 ont chacune leur pays : l'une ne retire jamais les règles de l'autre)
 */
async function remettre(adm: Page, pays = PAYS) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string; pays?: string | null }> }>;
  };
  for (const f of d.fonctions.filter((x) => x.cle === 'video_vivante' || x.cle === 'video_v2'))
    for (const r of f.regles)
      if (r.pays === pays)
        await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
}
/** exception par pays (sans redéploiement) */
async function allumer(adm: Page, cle: string, pays: string) {
  const r = await adm.request.post(`/api/v1/admin/fonctions/${cle}/regles`, {
    headers: H,
    data: { effet: 'on', pays },
  });
  expect(r.status(), await r.text()).toBe(201);
}

/** fichiers du lecteur (groupe à la demande) déjà chargés par la page */
const chargesVideo = async (page: Page) => {
  const liste = (await (await page.request.get('/_app/video.json')).json()) as string[];
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  return liste.filter((f) => vus.includes(f));
};

async function cibles(page: Page) {
  const petites = await page.locator('.vv button, .vv a').evaluateAll((els) =>
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
    .include('.vv')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}
/** ouvre la vidéo de l'unité (bouton en haut de la leçon) et attend le choix des modes */
async function ouvrir(page: Page, unite: string) {
  await page.goto(`/lecons/${unite}`);
  await page.getByTestId('voir-video').click();
  await expect(page.getByTestId('vv')).toBeVisible();
  await expect(page.locator('.vv .mode').first()).toBeVisible();
}
const modes = (page: Page) =>
  page.locator('.vv .mode').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mode));
const scene = (page: Page) => page.locator('.vv-sc').getAttribute('data-scene');
const fermer = (page: Page) => page.locator('.vv [data-k="fermer"]').click();

test.describe.configure({ mode: 'serial' });

test('interrupteur COUPÉ (défaut) : aucun bouton, aucun fichier du lecteur, leçon entière', async ({
  page,
}) => {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  const f = (await (
    await page.request.get(`/api/v1/fonctions?profil=${me.profiles[0]!.id}`)
  ).json()) as { fonctions: Record<string, boolean> };
  expect(f.fonctions.video_vivante).toBe(false);
  await page.goto('/lecons/ad1.l01');
  await expect(page.locator('article.lesson h1')).toBeVisible();
  await expect(page.getByTestId('voir-video')).toHaveCount(0);
  expect(await chargesVideo(page)).toEqual([]);
});

test.describe('interrupteur ALLUMÉ (exception par pays, sans redéploiement)', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    const r = await adm.request.post('/api/v1/admin/fonctions/video_vivante/regles', {
      headers: H,
      data: { effet: 'on', pays: PAYS },
    });
    expect(r.status(), await r.text()).toBe(201);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });
  test.beforeEach(async ({ page }) => {
    await newAdult(page, 'vv', PAYS);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('leçon 1 : bouton en haut, lecteur chargé au premier appui, les 5 modes', async ({
    page,
  }) => {
    await page.goto('/lecons/ad1.l01');
    await expect(page.getByTestId('voir-video')).toBeVisible();
    expect(await chargesVideo(page)).toEqual([]);
    await page.getByTestId('voir-video').click();
    await expect(page.getByTestId('vv')).toBeVisible();
    expect((await chargesVideo(page)).length).toBeGreaterThan(0);
    // interrupteur `video_v2` coupé : le lecteur v1, jamais la v2
    expect((await chargesVideo(page)).some((f) => /lecteur-v2\./.test(f))).toBe(false);
    expect((await chargesVideo(page)).some((f) => /\/lecteur\.[\w-]+\.css$/.test(f))).toBe(true);
    expect(await modes(page)).toEqual(['lettre', 'courte', 'longue', 'quiz', 'revision']);

    // par lettre : choix de la lettre, tracé (ب validé), nom, repère, 4 formes
    await page.locator('.vv .mode[data-mode="lettre"]').click();
    await page.locator('.vv .rangee .tuile').first().click();
    expect(await scene(page)).toBe('lettre-1');
    await expect(page.locator('.vv svg.trace').first()).toBeVisible();
    await expect(page.locator('.vv .src')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.vv .forme')).toHaveCount(4, { timeout: 25_000 });
    await expect(page.locator('.vv .temps')).toHaveText(/Scène 1 \/ 1/);
    await fermer(page);

    // courte : ouverture, puis les lettres de la leçon
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="courte"]').click();
    expect(await scene(page)).toBe('ouverture');
    await page.locator('.vv [data-k="suiv"]').click();
    expect(await scene(page)).toBe('courte-lettres');
    await fermer(page);

    // révision d'une leçon : « Je retiens » (et ce que le livre reprend des leçons précédentes)
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="revision"]').click();
    expect(await scene(page)).toBe('ouverture');
    await page.locator('.vv [data-k="suiv"]').click();
    expect(await scene(page)).toBe('recap');
    await fermer(page);

    // quiz : un exercice du livre, jouable
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="quiz"]').click();
    expect(await scene(page)).toMatch(/^q-/);
    await expect(page.locator('.vv .opt').first()).toBeVisible();
    await page.locator('.vv .opt').first().click();
    // réponse, ou solution montrée après le délai
    await expect(page.locator('.vv .retour').first()).toBeVisible({ timeout: 30_000 });
    await cibles(page);
    await fermer(page);

    // longue : toute l'unité ; reprise à la dernière scène ; traduction ; « À toi de jouer la scène ! » à la fin
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="longue"]').click();
    expect(await scene(page)).toBe('ouverture');
    const total = Number(
      /\/ (\d+)/.exec((await page.locator('.vv .temps').textContent()) ?? '')![1],
    );
    expect(total).toBeGreaterThan(15);
    await page.locator('.vv [data-k="suiv"]').click();
    await page.locator('.vv [data-k="suiv"]').click();
    await expect(page.locator('.vv .temps')).toHaveText(/Scène 3 \//);
    await page.locator('.vv [data-k="suiv"]').click();
    // « Voir / Cacher la traduction » : affichée par défaut, cachée au choix (les consignes restent)
    await page.getByTestId('vv-trad').click();
    await expect(page.getByTestId('vv')).toHaveClass(/sans-trad/);
    await page.getByTestId('vv-trad').click();
    await expect(page.getByTestId('vv')).not.toHaveClass(/sans-trad/);
    for (let i = 4; i < total; i++) await page.locator('.vv [data-k="suiv"]').click();
    expect(await scene(page)).toBe('jouer');
    await expect(page.locator('.vv .roles button').first()).toBeVisible();
    await fermer(page);
    await page.getByTestId('voir-video').click();
    await expect(page.getByTestId('vv-reprendre')).toHaveText(new RegExp(`scène ${total}`));
    await cibles(page);
  });

  test('bilan 1 : ni « par lettre » ni quiz (épreuve sans corrigé) ; révision des leçons 1 à 4', async ({
    page,
  }) => {
    await ouvrir(page, 'ad1.l05');
    expect(await modes(page)).toEqual(['courte', 'longue', 'revision']);
    await page.locator('.vv .mode[data-mode="revision"]').click();
    expect(await scene(page)).toBe('ouverture');
    await page.locator('.vv [data-k="suiv"]').click();
    expect(await scene(page)).toBe('rappel-lettres');
    await expect(page.locator('.vv .grille.lettres .ar').first()).toBeVisible();
    await fermer(page);
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="longue"]').click();
    // l'exercice d'une épreuve : affiché tel quel, « À toi ! », sans corrigé
    for (let i = 0; i < 30 && !/^q-/.test((await scene(page)) ?? ''); i++)
      await page.locator('.vv [data-k="suiv"]').click();
    expect(await scene(page)).toMatch(/^q-/);
    await expect(page.locator('.vv .anneau b')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.vv .opt.bon')).toHaveCount(0);
  });

  test('accessibilité AA (clair et sombre), animations réduites, cibles ≥ 44 px', async ({
    page,
  }) => {
    await ouvrir(page, 'ad1.l02');
    await axe(page);
    await cibles(page);
    await page.locator('.vv .mode[data-mode="lettre"]').click();
    await page.locator('.vv .rangee .tuile').first().click();
    await expect(page.locator('.vv .forme').first()).toBeVisible({ timeout: 25_000 });
    await page.locator('.vv [data-k="lire"]').click();
    await axe(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await axe(page);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    expect(
      await page
        .locator('.vv .apparait')
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe('vv-fondu');
    await cibles(page);
  });

  test('Adultes 2, leçon 1 : sans « par lettre », phrase vedette en tête de la courte, mots-clés, « À retenir »', async ({
    page,
  }) => {
    await ouvrir(page, 'ad2.l01');
    expect(await modes(page)).toEqual(['courte', 'longue', 'quiz', 'revision']);
    await page.locator('.vv .mode[data-mode="courte"]').click();
    expect(await scene(page)).toBe('ouverture');
    await page.locator('.vv [data-k="suiv"]').click();
    expect(await scene(page)).toBe('courte-vedette');
    await fermer(page);
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="longue"]').click();
    const vus: string[] = [];
    for (let i = 0; i < 40 && !vus.includes('recap'); i++) {
      const id = (await scene(page)) ?? '';
      vus.push(id);
      if (id === 'motscles') await expect(page.locator('.vv .cles .carte').first()).toBeVisible();
      if (id === 'recap') await expect(page.locator('.vv .carte .fr').first()).toBeVisible();
      await page.locator('.vv [data-k="suiv"]').click();
    }
    expect(vus).toEqual(
      expect.arrayContaining(['motscles', 'vedette', 'lexique', 'dialogue', 'recap']),
    );
    await cibles(page);
  });

  test('captures 390 px des 25 unités (clair et sombre) et planches', async ({ page }) => {
    test.skip(!CAPTURES, 'VIDEO_CAPTURES non défini');
    test.setTimeout(3_600_000);
    const dir = CAPTURES!;
    mkdirSync(dir, { recursive: true });
    const CLES = [
      'ouverture',
      'lettre-1',
      'rappel-lettres',
      'notion',
      'syllabes',
      'motscles',
      'ligne',
      'vedette',
      'phrases',
      'mots',
      'lexique',
      'q-',
      'dialogue',
      'recap',
    ];
    const planche: Record<string, string[]> = {};
    for (let n = 1; n <= 25; n++) {
      const u = `l${String(n).padStart(2, '0')}`;
      if (UNITES.length && !UNITES.includes(u)) continue;
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
      await ouvrir(page, `${LIVRE}.${u}`);
      const fichiers: string[] = [];
      const prendre = async (nom: string) => {
        for (const m of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: m });
          await page.waitForTimeout(150);
          const f = join(dir, `${u}_${nom}_${m === 'light' ? 'clair' : 'sombre'}.png`);
          await page.screenshot({ path: f });
          fichiers.push(f);
        }
        await page.emulateMedia({ colorScheme: 'light' });
      };
      await prendre('00-modes');
      await page.locator('.vv .mode[data-mode="longue"]').click();
      const total = Number(
        /\/ (\d+)/.exec((await page.locator('.vv .temps').textContent()) ?? '')![1],
      );
      const vus = new Set<string>();
      for (let i = 0; i < total; i++) {
        const id = (await scene(page)) ?? '';
        const cle = CLES.find((c) => (c === 'q-' ? id.startsWith('q-') : c === id));
        if (cle && !vus.has(cle)) {
          vus.add(cle);
          // le moment clé : la scène bien avancée (la lettre et ses formes, les premiers mots…)
          await page.waitForTimeout(cle === 'lettre-1' ? 14_000 : cle === 'notion' ? 7000 : 4500);
          await page.locator('.vv [data-k="lire"]').click();
          await prendre(`${String(i + 1).padStart(2, '0')}-${id}`);
          await page.locator('.vv [data-k="lire"]').click();
        }
        if (i < total - 1) await page.locator('.vv [data-k="suiv"]').click();
      }
      await fermer(page);
      planche[u] = fichiers;
    }
    // une planche par groupe de 5 unités : une ligne claire et une ligne sombre par unité
    for (let g = 0; g < 5; g++) {
      const us = Object.keys(planche).slice(g * 5, g * 5 + 5);
      if (!us.length) continue;
      const img = (f: string) =>
        `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()!.replace('.png', '')}</figcaption></figure>`;
      const lignes = us
        .map(
          (u) =>
            `<h2>${u}</h2><div class="r">${planche[u]!.filter((f) => f.endsWith('clair.png'))
              .map(img)
              .join('')}</div><div class="r">${planche[u]!.filter((f) => f.endsWith('sombre.png'))
              .map(img)
              .join('')}</div>`,
        )
        .join('');
      const p = await page.context().newPage();
      await p.setViewportSize({ width: 2400, height: 1000 });
      await p.setContent(
        `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#efe7d6;font:14px sans-serif;color:#084c38}h1{font-size:22px;margin:0 0 8px}h2{margin:14px 0 4px;font-size:16px}.r{display:flex;gap:6px;margin-bottom:6px}figure{margin:0}img{width:180px;display:block;border-radius:8px}figcaption{font-size:9px;width:180px;overflow:hidden;white-space:nowrap}</style><h1>Awzid · Vidéos vivantes · ${LIVRE} · unités ${us[0]} à ${us.at(-1)} (390 px, clair puis sombre)</h1>${lignes}`,
      );
      // pixels CSS (planche de 7 000 px de haut au plus, contrôlée)
      const fp = join(dir, `PLANCHE_${us[0]}-${us.at(-1)}.png`);
      await p.screenshot({ path: fp, fullPage: true, scale: 'css' });
      expect(await p.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        7000,
      );
      await p.close();
    }
    writeFileSync(join(dir, 'captures.json'), JSON.stringify(planche, null, 1));
  });
});

// ———————————————————————————— V2 (interrupteur `video_v2`, 20/10/2026) ————————————————————————————
/** pays des exceptions de la suite v2 (la suite v1 garde le sien) */
const PAYS2 = 'BE';
/** VIDEO_V2_CAPTURES=<dossier> : contrôle 360 px (horloge ×20, tous les modes) et captures v2, clair et sombre */
const V2_CAPTURES = process.env.VIDEO_V2_CAPTURES;
/** niveaux du contrôle et des captures v2 (Adultes 1 et 2 par défaut) */
const LIVRES_V2 = (process.env.VIDEO_V2_LIVRES ?? 'ad1,ad2').split(',').filter(Boolean);

/** scène suivante (bouton « suivant ») ; l'intertitre d'un nouveau chapitre passe d'abord */
async function suivante(page: Page) {
  const s0 = await scene(page);
  await page.locator('.vv [data-k="suiv"]').click();
  await expect.poll(() => scene(page), { timeout: 10_000 }).not.toBe(s0);
}
async function jusqua(page: Page, id: string) {
  for (let i = 0; i < 40 && (await scene(page)) !== id; i++) await suivante(page);
  expect(await scene(page)).toBe(id);
}
/** journal de test du lecteur (créé avant l'ouverture : sons, scènes, sous-titres, chapitres, réductions) */
type JV = { sons: unknown[]; zoom: string[]; vite: number };
const journalV2 = (page: Page) =>
  page.addInitScript(() => {
    (window as unknown as { __vv: JV }).__vv = { sons: [], zoom: [], vite: 1 };
  });

test.describe('v2 allumée (video_vivante et video_v2, exception par pays)', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm, PAYS2);
    await allumer(adm, 'video_vivante', PAYS2);
    await allumer(adm, 'video_v2', PAYS2);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm, PAYS2);
  });
  test.beforeEach(async ({ page }) => {
    await newAdult(page, 'vv2', PAYS2);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('leçon 6, courte : lecteur v2 seul, sommaire, chapitres, intertitre, minuteur, sous-titres, récapitulatif', async ({
    page,
  }) => {
    await page.goto('/lecons/ad1.l07');
    expect(await chargesVideo(page)).toEqual([]);
    await page.getByTestId('voir-video').click();
    await expect(page.locator('.vv .mode').first()).toBeVisible();
    // le lecteur v2, jamais la v1
    const charges = await chargesVideo(page);
    expect(charges.some((f) => /lecteur-v2\.[\w-]+\.css$/.test(f))).toBe(true);
    expect(charges.some((f) => /\/lecteur\.[\w-]+\.css$/.test(f))).toBe(false);
    expect(await modes(page)).toEqual(['lettre', 'courte', 'longue', 'quiz', 'revision']);

    await page.locator('.vv .mode[data-mode="courte"]').click();
    // sommaire de 2 s : les chapitres de la vidéo, numérotés ; barre découpée en autant de segments
    await expect(page.getByTestId('vv-sommaire')).toBeVisible();
    const n = await page.locator('.vv .barre .sg').count();
    expect(n).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId('vv-sommaire').locator('li')).toHaveCount(n);
    await expect(page.getByTestId('vv-sommaire')).toContainText('Découvrir');
    await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('ouverture');
    await expect(page.locator('.vv-t .nch')).toHaveText(`1/${n}`);
    await expect(page.locator('.vv-t .s')).toHaveText('Découvrir');
    // chapitre suivant : intertitre « Chapitre 2 sur n · Lire », puis la grille des lettres et leur consigne
    await page.locator('.vv [data-k="suiv"]').click();
    await expect(page.locator('.vv .inter-ch')).toContainText(`Chapitre 2 sur ${n}`);
    await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('courte-lettres');
    await expect(page.locator('.vv-t .s')).toHaveText('Lire');
    await expect(page.locator('.vv .lgr .lc').first()).toBeVisible();
    await expect(page.getByTestId('vv-bandeau')).not.toBeEmpty();
    // « À toi ! » : minuteur discret (anneau et secondes restantes) dans la pastille
    await expect(page.locator('.vv .cs.a-toi .mn b')).toHaveText(/^\d+$/, { timeout: 40_000 });
    // les mots : sous-titre (traduction du livre), commandé par « Voir / Cacher la traduction »
    await jusqua(page, 'courte-mots');
    await expect(page.locator('.vv .st:not(.vide) .x').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('vv-trad').click();
    await expect(page.getByTestId('vv')).toHaveClass(/sans-trad/);
    expect(await page.locator('.vv .st').evaluate((e) => getComputedStyle(e).visibility)).toBe(
      'hidden',
    );
    await page.getByTestId('vv-trad').click();
    await expect(page.getByTestId('vv')).not.toHaveClass(/sans-trad/);
    // récapitulatif final (« Ce que tu as vu ») : dernier chapitre, « Retenir »
    await jusqua(page, 'recap-courte');
    await expect(page.locator('.vv .bil')).toBeVisible();
    await expect(page.locator('.vv-t .s')).toHaveText('Retenir');
    await expect(page.locator('.vv .sc-h')).toHaveText(/Ce que tu as vu/i);
    await expect(page.getByTestId('vv-fin')).toBeVisible({ timeout: 60_000 });
    await cibles(page);
  });

  test('Adultes 2, leçon 1 : courte (phrase vedette puis mots, récapitulatif) ; longue : « Retenir » en dernier', async ({
    page,
  }) => {
    await ouvrir(page, 'ad2.l01');
    expect(await modes(page)).toEqual(['courte', 'longue', 'quiz', 'revision']);
    await page.locator('.vv .mode[data-mode="courte"]').click();
    await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('ouverture');
    await suivante(page);
    expect(await scene(page)).toBe('courte-vedette');
    await fermer(page);
    await page.getByTestId('voir-video').click();
    await page.locator('.vv .mode[data-mode="longue"]').click();
    await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('ouverture');
    const vus: string[] = [];
    for (let i = 0; i < 60; i++) {
      vus.push((await scene(page)) ?? '');
      await page.locator('.vv [data-k="suiv"]').click();
      if (await page.getByTestId('vv-fin').isVisible()) break;
      await expect
        .poll(
          async () =>
            (await page.getByTestId('vv-fin').isVisible()) || (await scene(page)) !== vus.at(-1),
          { timeout: 10_000 },
        )
        .toBe(true);
      if (await page.getByTestId('vv-fin').isVisible()) break;
    }
    // « Je retiens » passe après « À toi de jouer la scène ! » : « Retenir » est toujours le dernier chapitre
    expect(vus.at(-1)).toBe('recap');
    expect(vus.at(-2)).toBe('jouer');
    expect(vus).toEqual(expect.arrayContaining(['motscles', 'vedette', 'lexique', 'dialogue']));
  });

  test('accessibilité AA (clair et sombre), cibles ≥ 44 px, animations réduites : fondus seuls', async ({
    page,
  }) => {
    await ouvrir(page, 'ad1.l02');
    await axe(page);
    await cibles(page);
    await page.locator('.vv .mode[data-mode="courte"]').click();
    await expect(page.getByTestId('vv-sommaire')).toBeVisible();
    // apparitions finies, puis pause (une animation figée à mi-course fausserait les contrastes)
    await page.waitForTimeout(1000);
    await page.locator('.vv [data-k="lire"]').click();
    await axe(page);
    await page.locator('.vv [data-k="lire"]').click();
    await jusqua(page, 'courte-lettres');
    await expect(page.locator('.vv .lgr .lc').first()).toBeVisible();
    await page.waitForTimeout(900);
    await page.locator('.vv [data-k="lire"]').click();
    await axe(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await axe(page);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const anim = await page
      .locator('.vv .apparait')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe('vv-fondu');
    // aucun glissement ni zoom : la lettre dite ne grandit pas
    await page
      .locator('.vv .lc')
      .first()
      .evaluate((e) => e.classList.add('joue'));
    expect(
      await page
        .locator('.vv .lc .gl .ar')
        .first()
        .evaluate((e) => getComputedStyle(e).transform),
    ).toBe('none');
    await cibles(page);
  });

  test('contrôle 360 px (aucune réduction de taille, tous les modes, horloge ×20) et captures v2 clair et sombre', async ({
    page,
  }) => {
    test.skip(!V2_CAPTURES, 'VIDEO_V2_CAPTURES non défini');
    test.skip(test.info().project.name !== 'mobile-chromium', 'une seule série de captures');
    test.setTimeout(14_400_000);
    const dir = V2_CAPTURES!;
    mkdirSync(dir, { recursive: true });
    await journalV2(page);
    await page.setViewportSize({ width: 360, height: 740 });
    const vite = (v: number) =>
      page.evaluate((x) => ((window as unknown as { __vv: JV }).__vv.vite = x), v);
    const reductions: Record<string, string[]> = {};
    const planche: Record<string, string[]> = {};
    const CLES = [
      'lettre-1',
      'rappel-lettres',
      'notion',
      'syllabes',
      'motscles',
      'phrases',
      'vedette',
      'mots',
      'lexique',
      'q-',
      'dialogue',
      'jouer',
      'recap',
    ];
    for (const livre of LIVRES_V2)
      for (let n = 1; n <= 25; n++) {
        const u = `${livre}.l${String(n).padStart(2, '0')}`;
        if (UNITES.length && !UNITES.includes(u.slice(4)) && !UNITES.includes(u)) continue;
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
        await page.goto(`/lecons/${u}`);
        // 1. contrôle 360 px : chaque mode (chaque lettre) joué jusqu'au bout, horloge ×20 sans son
        await vite(20);
        await page.getByTestId('voir-video').click();
        await expect(page.locator('.vv .mode').first()).toBeVisible();
        for (const m of await modes(page)) {
          for (let k = 0, nl = 1; k < nl; k++) {
            await page.locator(`.vv .mode[data-mode="${m}"]`).click();
            const tuiles = page.locator('.vv .vv-dep .tuile');
            if (m === 'lettre' && (await tuiles.count())) {
              nl = await tuiles.count();
              await tuiles.nth(k).click();
            }
            for (let t = 0; t < 3000 && !(await page.getByTestId('vv-fin').isVisible()); t++) {
              // « À toi de jouer la scène ! » attend un rôle : la scène suivante
              if (await page.locator('.vv .roles button').first().isVisible())
                await page.locator('.vv [data-k="suiv"]').click();
              await page.waitForTimeout(200);
            }
            await expect(page.getByTestId('vv-fin')).toBeVisible();
            await page.locator('.vv .vv-dep .bouton.clair').click();
          }
        }
        reductions[u] = await page.evaluate(() =>
          (window as unknown as { __vv: JV }).__vv.zoom.splice(0),
        );
        await fermer(page);
        // 2. captures, horloge réelle
        await vite(1);
        await page.getByTestId('voir-video').click();
        await expect(page.locator('.vv .mode').first()).toBeVisible();
        const fichiers: string[] = [];
        const prendre = async (nom: string) => {
          for (const c of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme: c });
            await page.waitForTimeout(150);
            const f = join(dir, `${u}_${nom}_${c === 'light' ? 'clair' : 'sombre'}.png`);
            await page.screenshot({ path: f });
            fichiers.push(f);
          }
          await page.emulateMedia({ colorScheme: 'light' });
        };
        /** le moment voulu, en pause le temps des deux captures */
        const moment = async (nom: string) => {
          await page.locator('.vv [data-k="lire"]').click();
          await prendre(nom);
          await page.locator('.vv [data-k="lire"]').click();
        };
        await prendre('00-modes');
        const ms = await modes(page);
        if (ms.includes('courte')) {
          await page.locator('.vv .mode[data-mode="courte"]').click();
          await expect(page.getByTestId('vv-sommaire')).toBeVisible();
          await page.waitForTimeout(1200);
          await moment('01-sommaire');
          await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('ouverture');
          await page.waitForTimeout(2500);
          await moment('02-ouverture');
          await page.locator('.vv [data-k="suiv"]').click();
          await expect(page.locator('.vv .inter-ch')).toBeVisible();
          await page.waitForTimeout(500);
          await moment('03-intertitre');
          for (let i = 0; i < 12; i++) {
            const id = (await scene(page)) ?? '';
            if (id === 'courte-lettres') {
              await expect(page.locator('.vv .cs.a-toi')).toBeVisible({ timeout: 60_000 });
              await page.waitForTimeout(1200);
              await moment('04-courte-lettres-a-toi');
            } else if (id === 'courte-mots' || id === 'courte-vedette') {
              await expect(page.locator('.vv .st:not(.vide)')).toBeVisible({ timeout: 30_000 });
              await page.waitForTimeout(700);
              await moment(`05-${id}-sous-titre`);
            } else if (id === 'recap-courte') {
              await expect(page.locator('.vv .bil')).toBeVisible();
              await page.waitForTimeout(2500);
              await moment('06-recapitulatif');
              break;
            }
            if (await page.getByTestId('vv-fin').isVisible()) break;
            await suivante(page);
          }
          await fermer(page);
          await page.getByTestId('voir-video').click();
        }
        await page.locator('.vv .mode[data-mode="longue"]').click();
        await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('ouverture');
        const vus = new Set<string>();
        for (let i = 0; i < 60; i++) {
          const id = (await scene(page)) ?? '';
          const cle = CLES.find((c) => (c === 'q-' ? id.startsWith('q-') : c === id));
          if (cle && !vus.has(cle)) {
            vus.add(cle);
            await page.waitForTimeout(cle === 'lettre-1' ? 12_000 : cle === 'notion' ? 6000 : 4000);
            await moment(`${String(10 + i).padStart(2, '0')}-${id}`);
          }
          await page.locator('.vv [data-k="suiv"]').click();
          if (await page.getByTestId('vv-fin').isVisible()) break;
          await expect
            .poll(
              async () =>
                (await page.getByTestId('vv-fin').isVisible()) || (await scene(page)) !== id,
              { timeout: 10_000 },
            )
            .toBe(true);
          if (await page.getByTestId('vv-fin').isVisible()) break;
        }
        await fermer(page);
        planche[u] = fichiers;
      }
    writeFileSync(join(dir, 'controle-360.json'), JSON.stringify(reductions, null, 1));
    // planches : 5 unités chacune, une ligne claire et une ligne sombre par unité, 7 000 px de haut au plus
    const us = Object.keys(planche);
    for (let g = 0; g * 5 < us.length; g++) {
      const lot = us.slice(g * 5, g * 5 + 5);
      const img = (f: string) =>
        `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()!.replace('.png', '')}</figcaption></figure>`;
      const lignes = lot
        .map(
          (u) =>
            `<h2>${u}</h2><div class="r">${planche[u]!.filter((f) => f.endsWith('clair.png'))
              .map(img)
              .join('')}</div><div class="r">${planche[u]!.filter((f) => f.endsWith('sombre.png'))
              .map(img)
              .join('')}</div>`,
        )
        .join('');
      const p = await page.context().newPage();
      await p.setViewportSize({ width: 3000, height: 1000 });
      await p.setContent(
        `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#efe7d6;font:14px sans-serif;color:#084c38}h1{font-size:22px;margin:0 0 8px}h2{margin:12px 0 4px;font-size:16px}.r{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}figure{margin:0}img{width:150px;display:block;border-radius:8px}figcaption{font-size:9px;width:150px;overflow:hidden;white-space:nowrap}</style><h1>Awzid · Vidéos vivantes v2 · ${lot[0]} à ${lot.at(-1)} (360 px, clair puis sombre)</h1>${lignes}`,
      );
      const fp = join(dir, `PLANCHE_V2_${lot[0]}-${lot.at(-1)}.png`);
      await p.screenshot({ path: fp, fullPage: true, scale: 'css' });
      expect(await p.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        7000,
      );
      await p.close();
    }
    writeFileSync(join(dir, 'captures.json'), JSON.stringify(planche, null, 1));
    // aucune réduction de taille sur un téléphone de 360 px
    expect(Object.entries(reductions).filter(([, z]) => z.length)).toEqual([]);
  });
});
