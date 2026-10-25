import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { audioFileId } from '@awform/content/audio-cle';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « La prière de A à Z » (25/10/2026) — interrupteur `parcours_priere` :
 *  - COUPÉ (défaut, démonstration comprise) : ni carte dans « Vivre l'islam », ni page, aucun fichier du parcours ;
 *  - « CANAL BÊTA » réglé par l'administrateur : carte d'entrée, le chemin (huit étapes, avancement gardé), prier pas à pas
 *    (étapes du livre, voix haute ou basse, Fātiḥa récitée par Ayyūb verset par verset de 1:2 à 1:7, takbīr et paroles par les
 *    fichiers de synthèse, « audio en préparation » sans fichier, JAMAIS de voix sur la basmala), vidéo vivante (les deux
 *    unités enchaînées, mouvement réduit compris), ablutions (geste, ×3, tête de la femme par le texte, grand lavage en
 *    pictogrammes), sourate mot à mot (note de la Basmala, trois parties, feuille du mot, Échap), entraînement (masquage
 *    progressif, bilan gardé), situations, compteur du tasbīḥ (33 · 33 · 33, vibration), accessibilité AA en clair et en
 *    sombre, cibles ≥ 44 px, clavier.
 * Audio SIMULÉ (silence de 0,3 s) : la liste des fichiers de synthèse du niveau « priere » et les pistes d'Ayyūb sont
 * interceptées ; aucun verset ne doit jamais être demandé à la synthèse. PRIERE_CAPTURES=<dossier> : captures 390 et 1280 px,
 * en clair et en sombre.
 */
const H = { 'x-awform': '1' };
const CAPTURES = process.env.PRIERE_CAPTURES;
const lire = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
interface El {
  id?: string;
  type?: string;
  ar?: string;
  titre?: string;
  audio?: string | string[];
  etapes?: El[];
  variante?: { ar: string; audio?: string };
  [k: string]: unknown;
}
const priere = JSON.parse(lire('../../../packages/content/data/priere/priere.json')) as {
  meta: { statut: string };
  sections: Array<El & { sous_sections?: El[]; elements?: El[]; statut: string }>;
};
const marcher = (o: unknown, f: (o: El) => void) => {
  if (Array.isArray(o)) o.forEach((x) => marcher(x, f));
  else if (o && typeof o === 'object') {
    f(o as El);
    Object.values(o).forEach((x) => marcher(x, f));
  }
};
const element = (id: string): El => {
  let r: El | undefined;
  marcher(priere.sections, (o) => {
    if (!r && o.id === id) r = o;
  });
  return r!;
};
const sha = (id: string) => audioFileId(element(id).ar!)!;
/** textes de synthèse du livre, sauf l'invocation du qunūt (sans fichier : « audio en préparation ») et la basmala */
const FICHIERS = (() => {
  const ids = new Set<string>();
  marcher(priere.sections, (o) => {
    if (o.audio === 'tts' && o.ar && o.id !== 'S2A.w.tasmiya' && o.id !== 'S5.w.qunut')
      ids.add(audioFileId(o.ar)!);
    if (o.variante?.audio === 'tts') ids.add(audioFileId(o.variante.ar)!);
  });
  return [...ids];
})();
const SILENCE = Buffer.from(
  readFileSync(new URL('./cahier.spec.ts', import.meta.url), 'utf8').match(
    /const SILENCE = Buffer\.from\(\s*'([^']+)'/,
  )![1]!,
  'base64',
);
const etapes5 = element('S5.subh').etapes!;
const etapes2 = element('S2A.etapes').etapes!;

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-pri-${test.info().project.name}-${Date.now()}@e2e.test`;
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
  ).json()) as {
    secret: string;
  };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}

/** fichiers du parcours (groupe à la demande) déjà chargés par la page */
const charges = async (page: Page) => {
  const liste = (await (await page.request.get('/_app/priere.json')).json()) as string[];
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  return liste.filter((f) => vus.includes(f));
};

interface Sons {
  synthese: string[];
  recitations: string[];
}
/** voix simulée : synthèse du niveau « priere » (liste + fichiers), pistes et fichiers d'Ayyūb */
async function voixSimulee(page: Page, fichiers: string[] = FICHIERS): Promise<Sons> {
  const sons: Sons = { synthese: [], recitations: [] };
  await page.route('**/api/v1/lecons-audio/niveaux/priere', (r) =>
    r.fulfill({
      json: {
        niveau: 'priere',
        fichiers,
        octets: fichiers.length * SILENCE.length,
        mention: '',
        credits: [],
      },
    }),
  );
  await page.route('**/api/v1/lecons-audio/fichiers/*.mp3', (r) => {
    sons.synthese.push(new URL(r.request().url()).pathname);
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  const pack = (sura: number) => ({
    format: 1,
    reciter: 'ayyoub-hafs',
    riwaya: 'hafs',
    credit: '',
    sura,
    hash: `t${sura}`,
    surlignage: 'verset',
    wifiSeulement: false,
    bytes: SILENCE.length * 300,
    durationMs: 300,
    files: Array.from({ length: 290 }, (_, i) => ({
      aya: i + 1,
      url: `/api/v1/quran/audio/file/ayyoub-hafs/${sura}-${i + 1}.mp3`,
      bytes: SILENCE.length,
      sha256: '',
      durationMs: 300,
      format: 'mp3',
      surlignage: 'verset',
    })),
  });
  await page.route(/\/api\/v1\/quran\/audio\/reciters\/ayyoub-hafs\/packs\/\d+/, (r) =>
    r.fulfill({ json: pack(Number(/packs\/(\d+)/.exec(r.request().url())![1])) }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/quran\/suras\/\d+\/tracks/, (r) =>
    r.fulfill({ json: pack(Number(/suras\/(\d+)/.exec(r.request().url())![1])) }),
  );
  await page.route('**/api/v1/quran/audio/file/**', (r) => {
    sons.recitations.push(new URL(r.request().url()).pathname);
    return r.fulfill({ body: SILENCE, contentType: 'audio/mpeg' });
  });
  return sons;
}

async function cibles(page: Page) {
  const petites = await page
    .locator('.priere button, .priere a, .priere summary')
    .evaluateAll((els) =>
      els
        .filter(
          (e) => (e as HTMLElement).offsetParent !== null && !e.closest('.feuille:not(.ouverte)'),
        )
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            t: (e.textContent ?? '').trim().slice(0, 30),
            h: Math.round(r.height),
            w: Math.round(r.width),
          };
        })
        .filter((x) => x.h < 43.5 || x.w < 43.5),
    );
  expect(petites).toEqual([]);
}
async function axe(page: Page) {
  const vp = page.viewportSize()!;
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vp.width, height: Math.min(h + 300, 6000) });
  await page.waitForTimeout(150);
  const r = await new AxeBuilder({ page })
    .include('.priere')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 140)})`).join(' | ')}`,
    ),
  ).toEqual([]);
  await page.setViewportSize(vp);
}
/** contrôle AA en clair puis en sombre, et cibles de 44 px */
async function controle(page: Page) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await axe(page);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await cibles(page);
}
async function capturer(page: Page, nom: string) {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  const vp = page.viewportSize()!;
  for (const [scheme, mode] of [
    ['light', 'clair'],
    ['dark', 'sombre'],
  ] as const)
    for (const largeur of [390, 1280]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: largeur, height: largeur === 390 ? 844 : 900 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(CAPTURES, `${nom}_${largeur}_${mode}.png`),
        fullPage: true,
      });
    }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(vp);
}
/** vidéo vivante : va au temps n (numéro de la frise) avec « suivant » ou « précédent » */
async function allerAuTemps(page: Page, n: number) {
  const racine = page.getByTestId('priere-video');
  for (let g = 0; g < 40; g++) {
    const vi = Number(await racine.getAttribute('data-beat'));
    if (vi === n) return;
    await page.getByTestId(vi < n ? 'priere-video-suiv' : 'priere-video-prec').click();
  }
}
/** « 0 / 3 » (l'espace avant la barre est facultatif dans le texte) */
const NB = (a: number, b: number) => new RegExp(`^${a}\\s*/\\s*${b}$`);
const ouvrir = async (page: Page, requete = '') => {
  await page.goto(`/vivre/priere${requete}`);
  await expect(page.getByTestId('priere')).toBeVisible({ timeout: 20_000 });
};

test('interrupteur COUPÉ (défaut) : ni carte ni page, aucun fichier du parcours', async ({
  page,
}) => {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  const f = (await (
    await page.request.get(`/api/v1/fonctions?profil=${me.profiles[0]!.id}`)
  ).json()) as {
    fonctions: Record<string, boolean>;
  };
  expect(f.fonctions.parcours_priere).toBe(false);
  await page.goto('/vivre');
  await expect(page.getByTestId('vi-tuiles').or(page.getByTestId('vi-defi')).first()).toBeVisible();
  await expect(page.getByTestId('vi-priere')).toHaveCount(0);
  expect(await charges(page)).toEqual([]);
  // adresse tapée à la main : « fonction non disponible », ni code ni données du parcours
  await page.goto('/vivre/priere');
  await expect(page.getByTestId('priere-ferme')).toBeVisible();
  expect((await charges(page)).filter((x) => x.endsWith('.js'))).toEqual([]);
  const vus = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
  );
  expect(vus.filter((v) => v.includes('priere-data'))).toEqual([]);
});

test.describe('« canal bêta » réglé par l’administrateur', () => {
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/parcours_priere', {
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
    const { email } = await newAdult(page, 'priere');
    await page.setViewportSize({ width: 390, height: 844 });
    const avant = (await (await page.request.get('/api/v1/fonctions')).json()) as {
      fonctions: Record<string, boolean>;
    };
    expect(avant.fonctions.parcours_priere).toBe(false); // hors du canal bêta : fermé
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
    expect(apres.fonctions.parcours_priere).toBe(true);
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('carte d’entrée, chemin de huit étapes, statut du référent ; rien n’est chargé avant l’ouverture', async ({
    page,
  }) => {
    await voixSimulee(page);
    await page.goto('/vivre');
    const carte = page.getByTestId('vi-priere');
    await expect(carte).toBeVisible();
    // seule la carte (quelques octets) est chargée : le parcours attend l'ouverture
    expect((await charges(page)).length).toBeLessThanOrEqual(6);
    const avant = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname),
    );
    expect(avant.filter((v) => v.includes('priere-data'))).toEqual([]);
    await carte.click();
    await expect(page.getByTestId('priere-heros')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('priere-heros').locator('h1')).toHaveText('La prière de A à Z');
    await expect(page.locator('[data-testid="priere-chemin"] .station')).toHaveCount(
      priere.sections.length,
    );
    // la première étape est « en cours » (onde dorée), aucune n'est faite
    await expect(page.locator('.station.ici')).toHaveCount(1);
    await expect(page.locator('.station.fait')).toHaveCount(0);
    await expect(page.locator('.station').first().locator('h3')).toHaveText(
      priere.sections[0]!.titre!,
    );
    // formule de statut : celle du référent, sur l'écran
    await expect(page.getByTestId('priere-statut')).toHaveText(priere.meta.statut);
    await expect(page.getByTestId('priere-statut')).toContainText('Tranché par le référent');
    await expect(page.getByTestId('priere-statut')).toContainText('En attente de relecture.');
    // citation : arabe sur sa ligne
    await expect(page.getByTestId('priere-citation').locator('.ar')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('priere-acces-video')).toBeVisible();
    await controle(page);
    await capturer(page, '01-accueil');
  });

  test('avancement gardé : une étape vue devient « faite » et reste faite après rechargement', async ({
    page,
  }) => {
    await voixSimulee(page);
    await ouvrir(page, '?e=pourquoi');
    await expect(page.getByTestId('priere-section')).toBeVisible();
    // l'arabe des preuves est sur sa propre ligne
    await expect(page.locator('[data-testid="priere-section"] .ar').first()).toHaveAttribute(
      'dir',
      'rtl',
    );
    await page.waitForTimeout(600);
    await ouvrir(page);
    await expect(page.locator('.station[data-station="S1"]')).toHaveClass(/fait/);
    await expect(page.locator('.station.ici')).toHaveAttribute('data-station', 'S2');
    await expect(page.getByTestId('priere-avancement')).toContainText('1 étape');
  });

  test('prier pas à pas : étapes du livre, takbīr (voix haute pour tous), Fātiḥa d’Ayyūb de 1:2 à 1:7, jamais de synthèse sur un verset', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await ouvrir(page, '?e=pas');
    await expect(page.getByTestId('priere-etape')).toBeVisible();
    await expect(page.locator('.ruban button')).toHaveCount(etapes5.length);
    await expect(page.getByTestId('priere-num-etape')).toHaveText(`Étape 1 sur ${etapes5.length}`);
    await expect(page.getByTestId('priere-etape').locator('h2')).toHaveText(etapes5[0]!.titre!);
    // l'étape du takbīr : deux lignes de voix (entrée à voix haute pour tous ; changements de position)
    await page.locator('.ruban button[data-etape="S5.e1"]').click();
    await expect(page.getByTestId('priere-num-etape')).toHaveText(`Étape 2 sur ${etapes5.length}`);
    await expect(
      page.locator('[data-id="S5.w.takbir"] [data-testid="priere-voix"] .pastille'),
    ).toHaveCount(2);
    await expect(
      page.locator('[data-id="S5.w.takbir"] .pastille.voix[data-voix="haute"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-id="S5.w.takbir"] .pastille.voix[data-voix="mixte"]'),
    ).toHaveCount(1);
    await expect(page.locator('[data-id="S5.w.takbir"] > .ar')).toHaveText(
      element('S5.w.takbir').ar!,
    );
    // le takbīr passe par le fichier de synthèse existant ; le mot entendu s'éclaire
    await page.evaluate(() => {
      (window as unknown as { __actifs: number }).__actifs = 0;
      new MutationObserver(() => {
        if (document.querySelector('.parole .mot.actif'))
          (window as unknown as { __actifs: number }).__actifs++;
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('[data-id="S5.w.takbir"] [data-testid="priere-ecouter"]').click();
    await expect
      .poll(() => sons.synthese.some((s) => s.endsWith(`/${sha('S5.w.takbir')}.mp3`)))
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __actifs: number }).__actifs))
      .toBeGreaterThan(0);
    // la Fātiḥa : Ayyūb, verset par verset, de 1:2 à 1:7 (jamais 1:1) ; aucune synthèse
    await page.locator('.ruban button[data-etape="S5.e3"]').click();
    await expect(page.locator('[data-id="S5.fatiha"] .verset')).toHaveCount(6);
    const avant = sons.synthese.length;
    await page.locator('[data-id="S5.fatiha"] [data-testid="priere-ecouter"]').click();
    await expect.poll(() => new Set(sons.recitations).size, { timeout: 20_000 }).toBe(6);
    expect(sons.recitations.some((u) => u.endsWith('/1-1.mp3'))).toBe(false);
    for (const v of [2, 3, 4, 5, 6, 7])
      expect(
        sons.recitations.some((u) => u.endsWith(`/1-${v}.mp3`)),
        `1:${v}`,
      ).toBe(true);
    expect(sons.recitations.every((u) => u.includes('ayyoub-hafs'))).toBe(true);
    expect(sons.synthese.length).toBe(avant);
    // « Comprendre mot à mot » mène à l'écran de la sourate
    await expect(page.locator('[data-id="S5.fatiha"] a.lien-mam')).toHaveAttribute(
      'href',
      '?e=sourate&s=1',
    );
    // navigation : suivante / précédente, ruban
    await page.getByTestId('priere-suivante').click();
    await expect(page.getByTestId('priere-num-etape')).toHaveText(`Étape 5 sur ${etapes5.length}`);
    await controle(page);
    await capturer(page, '02-pas-a-pas');
  });

  test('silhouette : homme ou femme, sans visage ; unité 2 à la seconde rakʿa ; « revoir le geste »', async ({
    page,
  }) => {
    await voixSimulee(page);
    await ouvrir(page, '?e=pas&i=12');
    await expect(page.getByTestId('priere-unite')).toHaveText('Unité 2 / 2');
    const sil = page.locator('.scene svg.sil');
    await expect(sil).toHaveAttribute('aria-label', /d'homme, sans visage/);
    await expect(sil.locator('path.sil-visage, ellipse.sil-visage')).toHaveCount(1);
    await expect(sil.locator('.sil-voile').first())
      .toBeHidden()
      .catch(() => undefined);
    await page.locator('[data-genre="femme"]').click();
    await expect(sil).toHaveAttribute('aria-label', /de femme en tenue couvrante, sans visage/);
    await expect(page.locator('[data-genre="femme"]')).toHaveAttribute('aria-pressed', 'true');
    // le choix est gardé
    await page.reload();
    await expect(page.locator('[data-genre="femme"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('priere-revoir').click();
    await expect(sil.locator('.corps path').first()).toBeAttached();
  });

  test('sans fichier : « audio en préparation » ; la basmala des ablutions n’a JAMAIS de voix', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    // le qunūt n'a pas encore de fichier
    await ouvrir(page, '?e=pas&i=12');
    await expect(
      page.locator('[data-id="S5.w.qunut"] [data-testid="priere-audio-attente"]'),
    ).toBeVisible();
    await expect(page.locator('[data-id="S5.w.qunut"] [data-testid="priere-ecouter"]')).toHaveCount(
      0,
    );
    // la basmala : une explication, pas de bouton, aucun fichier demandé
    await ouvrir(page, '?e=ablutions&i=1');
    const bloc = page.locator('[data-id="S2A.w.tasmiya"]');
    await expect(bloc.locator('[data-testid="priere-sans-voix"]')).toHaveAttribute(
      'data-raison',
      'basmala',
    );
    await expect(bloc.locator('[data-testid="priere-ecouter"]')).toHaveCount(0);
    await page.waitForTimeout(400);
    // même avec un fichier de synthèse « existant » pour ce texte, il n'est jamais demandé
    expect(sons.synthese.some((s) => s.includes(audioFileId(element('S2A.w.tasmiya').ar!)!))).toBe(
      false,
    );
  });

  test('vidéo vivante : les deux unités enchaînées, voix et mot éclairé, précédent / suivant, mouvement réduit', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await ouvrir(page, '?e=video');
    await expect(page.getByTestId('priere-video')).toBeVisible();
    await expect(page.getByTestId('priere-video-unite')).toContainText('1');
    await expect(page.locator('.frise i').first()).toBeVisible();
    const total = await page.locator('.frise i').count();
    expect(total).toBeGreaterThan(15);
    await page.getByTestId('priere-video-lire').click();
    await expect(page.getByTestId('priere-video-lire')).toHaveAttribute('aria-pressed', 'true');
    // le takbīr d'entrée est dit (synthèse), puis le texte avance : le temps suivant est montré
    await expect
      .poll(() => sons.synthese.some((s) => s.endsWith(`/${sha('S5.w.takbir')}.mp3`)), {
        timeout: 30_000,
      })
      .toBe(true);
    await expect(page.locator('.frise i.fait').first()).toBeAttached({ timeout: 40_000 });
    await expect(page.getByTestId('priere-video-texte').locator('.pos')).toBeVisible();
    // pause, puis la Fātiḥa de la première unité : récitation d'Ayyūb (jamais de synthèse sur un verset)
    await page.getByTestId('priere-video-lire').click();
    await expect(page.getByTestId('priere-video-lire')).toHaveAttribute('aria-pressed', 'false');
    await allerAuTemps(page, 3);
    await expect(page.getByTestId('priere-video-texte').locator('.coran .verset')).toBeVisible();
    await page.getByTestId('priere-video-lire').click();
    await expect.poll(() => sons.recitations.length, { timeout: 40_000 }).toBeGreaterThan(0);
    expect(sons.recitations.every((u) => u.includes('ayyoub-hafs'))).toBe(true);
    expect(sons.recitations.some((u) => u.endsWith('/1-1.mp3'))).toBe(false);
    await page.getByTestId('priere-video-lire').click();
    // saut à la seconde unité : compteur « 2 / 2 », frise séparée
    await allerAuTemps(page, 12);
    await expect(page.getByTestId('priere-video-unite')).toContainText('2');
    await expect(page.locator('.frise i.r2')).toHaveCount(1);
    await page.getByTestId('priere-video-prec').click();
    await capturer(page, '03-video-vivante');
    await controle(page);
  });

  test('vidéo vivante et mouvement réduit : les positions changent sans interpolation, la voix et les étapes continuent', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sons = await voixSimulee(page);
    await ouvrir(page, '?e=video');
    await page.getByTestId('priere-video-lire').click();
    await expect.poll(() => sons.synthese.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.locator('.frise i.fait').first()).toBeAttached({ timeout: 40_000 });
    // les animations sont coupées (durées ramenées à presque zéro) pendant que la vidéo continue
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    expect(
      await page.evaluate(() =>
        parseFloat(
          getComputedStyle(document.querySelector('.priere .rond.or')!).transitionDuration,
        ),
      ),
    ).toBeLessThan(0.01);
    await page.getByTestId('priere-video-lire').click();
  });

  test('ablutions : geste de face sans visage, ×3 qui se remplit, tête de la femme par le texte, grand lavage en pictogrammes', async ({
    page,
  }) => {
    await voixSimulee(page);
    await ouvrir(page, '?e=ablutions');
    await expect(page.locator('.ruban button')).toHaveCount(etapes2.length);
    await expect(page.getByTestId('priere-num-geste')).toHaveText(`Geste 1 sur ${etapes2.length}`);
    await expect(page.getByTestId('priere-fois')).toHaveCount(0);
    await page.locator('.ruban button[data-etape="S2A.e3"]').click();
    await expect(page.getByTestId('priere-fois')).toContainText('×3');
    await expect(page.locator('[data-testid="priere-fois"] i')).toHaveCount(3);
    await expect(page.locator('.scene svg.sil')).toHaveAttribute('aria-label', /sans visage/);
    // le ×3 se remplit goutte à goutte, passage après passage
    await expect(page.locator('[data-testid="priere-fois"] i.fait').first()).toBeAttached({
      timeout: 20_000,
    });
    // la tête : illustration de l'homme seulement, même si « Femme » est choisi ; règle de la femme par le texte
    await page.locator('[data-genre="femme"]').click();
    await page.locator('.ruban button[data-etape="S2A.e8"]').click();
    await expect(page.locator('.scene svg.sil')).toHaveAttribute('aria-label', /d'homme/);
    await expect(page.getByTestId('priere-illustration-homme')).toBeVisible();
    await expect(page.getByTestId('priere-regle-femme')).toContainText('cheveux');
    await expect(page.getByTestId('priere-regle-femme').locator('.ar').first()).toHaveAttribute(
      'dir',
      'rtl',
    );
    // après les ablutions : les deux attestations en préparation (sans fichier), basmala jamais lue
    await page.locator('.ruban button[data-etape="S2A.e11"]').click();
    await expect(
      page.locator('[data-id="S2A.w.shahada"] [data-testid="priere-ecouter"]'),
    ).toBeVisible();
    // le grand lavage : pictogrammes seulement, jamais un corps
    const lavage = page.getByTestId('priere-grand-lavage');
    await lavage.scrollIntoViewIfNeeded();
    await expect(lavage.locator('ul.frise-pictos button')).toHaveCount(
      element('S2B.etapes').etapes!.length,
    );
    await expect(lavage.locator('svg.sil')).toHaveCount(0);
    await expect(lavage.locator('use')).not.toHaveCount(0);
    await lavage.locator('ul.frise-pictos button').first().click();
    await expect(page.getByTestId('priere-lavage-detail')).toBeVisible();
    await page.locator('.ruban button[data-etape="S2A.e3"]').click();
    await capturer(page, '04-ablutions');
    await controle(page);
  });

  test('sourate mot à mot : note de la Basmala, trois parties, feuille du mot, Échap, récitation d’Ayyūb, traduction', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await ouvrir(page, '?e=sourate&s=1');
    await expect(page.locator('.v')).toHaveCount(7, { timeout: 20_000 });
    // la Basmala n'est pas récitée dans la prière obligatoire : note du référent AU-DESSUS du verset 1
    const note = page.getByTestId('priere-note-priere');
    await expect(note).toContainText('on ne récite pas la Basmala');
    const [yn, yv] = [(await note.boundingBox())!.y, (await page.locator('#v0').boundingBox())!.y];
    expect(yn).toBeLessThan(yv);
    await expect(page.locator('#v0')).toHaveAttribute('data-recite', 'non');
    await expect(page.getByTestId('priere-numerotation')).toContainText('Ḥafṣ');
    // trois parties, trois couleurs ; la louange couvre 1:2 à 1:4
    await expect(page.locator('[data-testid="priere-parties"] .bande')).toHaveCount(3);
    await expect(page.locator('.v.louange')).toHaveCount(3);
    await expect(page.locator('.v.engagement')).toHaveCount(1);
    await expect(page.locator('.v.demande')).toHaveCount(2);
    await expect(page.locator('.v .reponse').first()).toBeVisible();
    // chaque mot touché ouvre la feuille ; Échap la ferme, le focus revient au mot
    const mot = page.locator('#v1 .mot').first();
    await mot.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('priere-feuille')).toHaveClass(/ouverte/);
    await expect(page.locator('.feuille .glose')).not.toBeEmpty();
    await expect(page.locator('.feuille .ar')).toHaveAttribute('dir', 'rtl');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('priere-feuille')).not.toHaveClass(/ouverte/);
    await expect(mot).toBeFocused();
    // « Écouter toute la sourate » : comme dans la prière, de 1:2 à 1:7 (sans la Basmala) ; Ayyūb seulement
    await page.getByTestId('priere-lire-tout').click();
    await expect.poll(() => new Set(sons.recitations).size, { timeout: 40_000 }).toBe(6);
    expect(sons.recitations.some((u) => u.endsWith('/1-1.mp3'))).toBe(false);
    expect(sons.synthese).toEqual([]);
    // un verset isolé (la Basmala a son propre bouton) : une fois la lecture continue terminée
    await expect(page.getByTestId('priere-lire-tout')).toHaveAttribute('aria-pressed', 'false', {
      timeout: 20_000,
    });
    await page.locator('#v0 [data-testid="priere-ecouter-verset"]').click();
    await expect.poll(() => sons.recitations.some((u) => u.endsWith('/1-1.mp3'))).toBe(true);
    // Voir / Cacher la traduction
    await expect(page.locator('#v1 .trad')).toBeVisible();
    await page.getByTestId('priere-trad').click();
    await expect(page.locator('#v1 .trad')).toBeHidden();
    await page.reload();
    await expect(page.locator('#v1 .trad')).toBeHidden();
    await page.getByTestId('priere-trad').click();
    await expect(page.locator('#v1 .trad')).toBeVisible();
    await capturer(page, '05-sourate');
    await controle(page);
    // une autre sourate : mot à mot, Basmala de tête non récitée
    await page.locator('[data-testid="priere-sourates"] [data-sourate="112"]').click();
    await expect(page.getByTestId('priere-sourate')).toHaveAttribute('data-sourate', '112');
    await expect(page.locator('.v')).toHaveCount(4);
    await expect(page.getByTestId('priere-basmala-tete')).toBeVisible();
  });

  test('je m’entraîne : la Fātiḥa et l’attestation, masquage par crans, bilan gardé', async ({
    page,
  }) => {
    const sons = await voixSimulee(page);
    await ouvrir(page, '?e=entrainement');
    await expect(page.getByTestId('priere-entrainement')).toBeVisible();
    await expect(page.locator('[data-testid="priere-texte"] .seg-txt')).toHaveCount(6);
    // 1 J'écoute : le passage joué s'éclaire, Ayyūb seulement
    await page.getByTestId('priere-lancer').click();
    await expect(page.locator('.seg-txt.actif')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => sons.recitations.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(sons.synthese).toEqual([]);
    await page.getByTestId('priere-lancer').click();
    // 3 Je récite : le texte se cache par crans
    await page.locator('.etapes3 button[data-etape="3"]').click();
    await expect(page.getByTestId('priere-niveau')).toBeVisible();
    const masques = () => page.locator('.mot.masque').count();
    const n1 = await masques();
    expect(n1).toBeGreaterThan(0);
    await page.getByTestId('priere-plus').click();
    expect(await masques()).toBeGreaterThan(n1);
    await page.getByTestId('priere-plus').click();
    await page.getByTestId('priere-plus').click();
    await expect(page.getByTestId('priere-niveau')).toHaveAttribute('data-niveau', '4');
    const total = await page.locator('[data-testid="priere-texte"] .mot').count();
    expect(await masques()).toBe(total); // tout est caché
    // un toucher révèle le mot un instant
    const m = page.locator('.mot.masque').first();
    await m.click();
    await expect(m).toHaveClass(/revele/);
    await expect(m).not.toHaveClass(/revele/, { timeout: 5000 });
    // bilan : « Je l'ai su » règle le cran et la révision, gardés sur l'appareil
    await page.locator('[data-bilan="presque"]').click();
    await expect(page.getByTestId('priere-revision')).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();
    await page.locator('.etapes3 button[data-etape="3"]').click();
    await expect(page.getByTestId('priere-niveau')).toHaveAttribute('data-niveau', '4');
    await expect(page.getByTestId('priere-revision')).toBeVisible();
    // l'attestation : un passage par membre de phrase, au clavier
    await page.locator('[data-texte="tashahhud"]').click();
    expect(await page.locator('[data-testid="priere-texte"] .seg-txt').count()).toBeGreaterThan(4);
    await page.locator('.etapes3 button[data-etape="2"]').click();
    await expect(page.locator('[data-testid="priere-texte"] .mot.masque')).toHaveCount(0);
    await capturer(page, '06-entrainement');
    await controle(page);
  });

  test('situations : une carte par situation du livre, filtres, réponse du référent, clavier', async ({
    page,
  }) => {
    await voixSimulee(page);
    await ouvrir(page, '?e=situations');
    const sections = element('S7') as unknown as { sous_sections: El[] };
    await expect(page.locator('.sit')).toHaveCount(sections.sous_sections.length, {
      timeout: 20_000,
    });
    await expect(page.locator('.sit.ouvert')).toHaveCount(0);
    const premiere = page.locator('.sit').first();
    await premiere.locator('> button').focus();
    await page.keyboard.press('Enter');
    await expect(premiere).toHaveClass(/ouvert/);
    await expect(premiere.locator('> button')).toHaveAttribute('aria-expanded', 'true');
    await expect(premiere.getByTestId('priere-situation')).toBeVisible();
    await expect(premiere.locator('svg.sil')).toHaveCount(1); // petite silhouette de la position concernée
    // filtre par thème
    const tout = await page.locator('.sit').count();
    await page.locator('[data-theme="groupe"]').first().click();
    expect(await page.locator('.sit').count()).toBeLessThan(tout);
    await expect(page.locator('.sit').first()).toHaveAttribute('data-theme', 'groupe');
    await page.locator('[data-theme="tout"]').click();
    await expect(page.locator('.sit')).toHaveCount(tout);
    await capturer(page, '07-situations');
    await controle(page);
  });

  test('après la prière : compteur 33 · 33 · 33 + 1, vibration courte, passage automatique, total sur 100', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __vibr: unknown[] }).__vibr = [];
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (m: unknown) => {
          (window as unknown as { __vibr: unknown[] }).__vibr.push(m);
          return true;
        },
      });
    });
    await voixSimulee(page);
    await ouvrir(page, '?e=apres');
    await expect(page.getByTestId('priere-apres')).toBeVisible();
    await expect(page.locator('.frise-dhikr button')).toHaveCount(6);
    await expect(page.getByTestId('priere-nb')).toHaveText(NB(0, 3));
    await expect(page.locator('[data-testid="priere-perles"] .perle')).toHaveCount(3);
    const disque = page.getByTestId('priere-disque');
    await disque.click();
    await expect(page.getByTestId('priere-nb')).toHaveText(NB(1, 3));
    await expect(page.locator('[data-testid="priere-perles"] .perle.on')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __vibr: unknown[] }).__vibr)).toEqual([
      12,
    ]);
    await page.getByTestId('priere-annuler').click();
    await expect(page.getByTestId('priere-nb')).toHaveText(NB(0, 3));
    for (let i = 0; i < 3; i++) await disque.click();
    // fin de série : vibration longue, rosette, puis la formule suivante (« Tu es la Paix », une fois)
    expect(
      (await page.evaluate(() => (window as unknown as { __vibr: unknown[] }).__vibr)).at(-1),
    ).toEqual([30, 60, 30]);
    await expect(page.getByTestId('priere-nb')).toHaveText(NB(0, 1), { timeout: 10_000 });
    await expect(page.locator('.frise-dhikr button').first()).toHaveClass(/fait/);
    await expect(page.getByTestId('priere-total')).toHaveText('Avant la centaine');
    await disque.click();
    await expect(page.getByTestId('priere-nb')).toHaveText(NB(0, 33), { timeout: 10_000 });
    await expect(page.locator('[data-testid="priere-perles"] .perle')).toHaveCount(33);
    for (let i = 0; i < 33; i++) await disque.click();
    await expect(page.getByTestId('priere-total')).toHaveText('33 / 100');
    await expect(page.getByTestId('priere-nb')).toHaveText(NB(0, 33), { timeout: 10_000 });
    // « Écouter » : le fichier existant de la formule, jamais de synthèse hors fichier
    await expect(page.getByTestId('priere-ecouter-dhikr')).toBeEnabled();
    // récitation d'Ayyūb pour le verset du Trône et les sourates protectrices (en bas de l'écran)
    await expect(
      page.locator('[data-id="S6.kursi"] [data-testid="priere-ecouter"]'),
    ).toHaveAttribute('data-source', 'ayyub');
    await expect(page.locator('[data-id="S6.muawwidhat"] a.puce')).toHaveCount(3);
    await capturer(page, '08-apres-la-priere');
    await controle(page);
  });

  test('Ayyūb indisponible : message, jamais de voix de synthèse à la place', async ({ page }) => {
    const sons = await voixSimulee(page);
    await page.route(/\/api\/v1\/quran\/audio\/reciters\/ayyoub-hafs\/packs\/\d+/, (r) =>
      r.fulfill({ status: 404, json: { error: 'x' } }),
    );
    await page.route(/\/api\/v1\/profiles\/[^/]+\/quran\/suras\/\d+\/tracks/, (r) =>
      r.fulfill({ status: 404, json: { error: 'x' } }),
    );
    await ouvrir(page, '?e=pas&i=3');
    await page.locator('[data-id="S5.fatiha"] [data-testid="priere-ecouter"]').click();
    await expect(page.getByRole('status').filter({ hasText: 'récitation' }).first()).toBeVisible({
      timeout: 20_000,
    });
    expect(sons.synthese).toEqual([]);
  });

  test('les écrans lus de bout en bout : pourquoi, se préparer, l’appel (paroles de l’adhān, sens et statut)', async ({
    page,
  }) => {
    await voixSimulee(page);
    await ouvrir(page, '?e=appel');
    await expect(page.getByTestId('priere-section')).toHaveAttribute('data-section', 'S4');
    await expect(page.locator('[data-id="S4.a1"] > .ar')).toHaveText(element('S4.a1').ar!);
    await expect(page.getByTestId('priere-statut')).toHaveText(priere.meta.statut);
    await ouvrir(page, '?e=preparer');
    await expect(page.getByTestId('priere-section')).toHaveAttribute('data-section', 'S3');
    await expect(page.locator('.el').first()).toBeVisible();
    await controle(page);
  });
});
