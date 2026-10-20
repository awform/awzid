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
/** retire les exceptions de video_vivante (aucune trace pour les autres suites) */
async function remettre(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string }> }>;
  };
  for (const r of d.fonctions.find((f) => f.cle === 'video_vivante')?.regles ?? [])
    await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
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
      'ligne',
      'vedette',
      'phrases',
      'mots',
      'q-',
      'dialogue',
      'recap',
    ];
    const planche: Record<string, string[]> = {};
    for (let n = 1; n <= 25; n++) {
      const u = `l${String(n).padStart(2, '0')}`;
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
      await ouvrir(page, `ad1.${u}`);
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
        `<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#efe7d6;font:14px sans-serif;color:#084c38}h1{font-size:22px;margin:0 0 8px}h2{margin:14px 0 4px;font-size:16px}.r{display:flex;gap:6px;margin-bottom:6px}figure{margin:0}img{width:180px;display:block;border-radius:8px}figcaption{font-size:9px;width:180px;overflow:hidden;white-space:nowrap}</style><h1>Awzid · Vidéos vivantes · Adultes 1 · unités ${us[0]} à ${us.at(-1)} (390 px, clair puis sombre)</h1>${lignes}`,
      );
      await p.screenshot({ path: join(dir, `PLANCHE_${us[0]}-${us.at(-1)}.png`), fullPage: true });
      await p.close();
    }
    writeFileSync(join(dir, 'captures.json'), JSON.stringify(planche, null, 1));
  });
});
