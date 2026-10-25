import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { tanwinUndo } from '@awform/content/text';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Mutashābihāt dans le hifẓ (25/10/2026) — interrupteur `mutashabihat` :
 *  - COUPÉ par défaut : ni tuile « Test des jumeaux », ni alerte, aucun fichier du module ;
 *  - « canal bêta » : pendant la révision (test au hasard) l'alerte « attention, verset jumeau » (première fois : une phrase ;
 *    jumeau déjà mémorisé : mise en avant), la carte (les deux versets Tanzil exacts, la différence surlignée, le repère « proposé
 *    par Awzid », la source), l'écoute du jumeau par AYYŪB seulement (jamais de synthèse), le test des jumeaux (une mauvaise
 *    réponse marque le mot dans la carte des erreurs), accessibilité AA en clair et en sombre.
 * Jumeaux de test : 99:7 et 99:8 (az-Zalzala), paire « reconnue par la source » (la part apprise est un événement du journal, indépendant du livre du carnet).
 */
const H = { 'x-awform': '1' };
const iso = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const ilYa = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-mut-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** carnet Adultes 2 commencé il y a 60 jours ; la part « 99:1-8 » du carnet (sourate az-Zalzala, qui contient 99:7 et 99:8) apprise il y a 3 jours */
async function apprendre(page: Page, profileId: string) {
  const r = await page.request.put(`/api/v1/hifz/profiles/${profileId}/plan`, {
    headers: H,
    data: { mode: 'carnet', bookCode: 'ad2', startDate: ilYa(60) },
  });
  expect(r.ok(), await r.text()).toBe(true);
  const p = await page.request.post('/api/v1/attempts', {
    headers: H,
    data: {
      events: [
        {
          id: crypto.randomUUID(),
          profileId,
          unitId: 'hifz',
          eventType: 'hifz',
          response: { day: ilYa(3), part: '99:1-8', kind: 'appris', source: 'auto' },
          deviceAt: new Date(Date.now() - 100_000).toISOString(),
        },
      ],
    },
  });
  expect((await p.json()).accepted, await p.text()).toHaveLength(1);
}
async function tanzil(page: Page, s: number, a: number): Promise<string> {
  const r = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
  return ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
}
async function marques(page: Page, profileId: string) {
  const r = await page.request.get(`/api/v1/hifz/profiles/${profileId}/marques`);
  return ((await r.json()) as { marques: Array<{ s: number; a: number; k: number; t: string }> })
    .marques;
}

test.describe('mutashābihāt', () => {
  test.describe.configure({ mode: 'serial' });
  let adm: Page;
  const beta = async (email: string) => {
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
  };
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/mutashabihat', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) {
      await adm.request.put('/api/v1/admin/fonctions/mutashabihat', {
        headers: H,
        data: { etat: 'off' },
      });
      await adm.context().close();
    }
  });
  let erreurs: string[] = [];
  test.beforeEach(({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('coupée hors du canal bêta : ni tuile, ni alerte', async ({ page }) => {
    const { profileId } = await newAdult(page, 'mt-ferme');
    await apprendre(page, profileId);
    await page.goto('/hifz');
    await expect(page.getByTestId('outils-hifz')).toBeVisible();
    await expect(page.getByTestId('outil-jumeaux')).toHaveCount(0);
    await page.goto('/hifz/test?verset=99:7');
    await expect(page.getByTestId('test-hasard')).toHaveAttribute('data-verset', '99:7');
    await page.getByTestId('voir-suite').click();
    await expect(page.getByTestId('test-note').or(page.getByTestId('suite-cachee'))).toHaveCount(0);
    await expect(page.getByTestId('jumeau-alerte')).toHaveCount(0);
  });

  test('alerte, carte du jumeau (différence surlignée, repère, source), écoute par Ayyūb seulement', async ({
    page,
  }) => {
    const { email, profileId } = await newAdult(page, 'mt-alerte');
    await apprendre(page, profileId);
    await beta(email);
    // récitation SIMULÉE : seul Ayyūb est demandé, jamais la synthèse des leçons
    const demandes: string[] = [];
    await page.route(/\/api\/v1\/quran\/audio\/reciters\/([^/]+)\/packs\/(\d+)/, (r) => {
      demandes.push(r.request().url());
      return r.fulfill({
        json: {
          format: 1,
          reciter: 'ayyoub-hafs',
          riwaya: 'hafs',
          credit: 'Récitation de test',
          sura: 99,
          hash: 't99',
          surlignage: 'verset',
          wifiSeulement: false,
          bytes: 10,
          durationMs: 300,
          files: [7, 8].map((aya) => ({
            aya,
            url: `/api/v1/quran/audio/file/ayyoub-hafs/99-${aya}.mp3`,
            bytes: 10,
            sha256: '',
            durationMs: 300,
            format: 'mp3',
            surlignage: 'verset',
          })),
        },
      });
    });
    const fichiers: string[] = [];
    await page.route('**/api/v1/quran/audio/file/**', (r) => {
      fichiers.push(new URL(r.request().url()).pathname);
      return r.fulfill({ body: Buffer.alloc(200), contentType: 'audio/mpeg' });
    });
    await page.route('**/api/v1/lecons-audio/**', (r) => {
      fichiers.push(`SYNTHESE ${r.request().url()}`);
      return r.abort();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hifz');
    await expect(page.getByTestId('outil-jumeaux')).toBeVisible();

    await page.goto('/hifz/test?verset=99:7');
    await expect(page.getByTestId('test-hasard')).toHaveAttribute('data-verset', '99:7');
    await page.getByTestId('voir-suite').click();
    const alerte = page.locator('[data-testid="jumeau-alerte"][data-verset="99:7"]');
    await expect(alerte).toBeVisible();
    // première fois : une phrase ; le jumeau est déjà mémorisé : mise en avant
    await expect(alerte.getByTestId('jumeau-premiere')).toBeVisible();
    await expect(alerte.getByTestId('jumeau-connu')).toBeVisible();
    await alerte.getByTestId('jumeau-bouton').click();
    const carte = alerte.getByTestId('jumeau-carte').first();
    await expect(carte).toBeVisible();
    // les deux versets sont le texte Tanzil exact, chacun sur sa ligne
    for (const a of [7, 8]) {
      const mots = await carte.locator(`[data-verset="99:${a}"] .mot`).allTextContents();
      expect(Buffer.from(tanwinUndo(mots.join(' ').replace(/\s+/g, ' ').trim()))).toEqual(
        Buffer.from(await tanzil(page, 99, a)),
      );
    }
    await expect(carte.locator('.diff').first()).toBeVisible();
    await expect(carte.getByTestId('jumeau-repere')).toContainText('proposé par Awzid');
    await expect(carte.getByTestId('jumeau-source').first()).toContainText('Shamela');
    await expect(carte.locator('a[href^="https://shamela.ws/"]').first()).toHaveAttribute(
      'rel',
      /noopener/,
    );
    // l'arabe n'est jamais sur la ligne du français
    await expect(carte.locator('.quran-text')).not.toContainText(/[A-Za-z]{3,}/);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const r = await new AxeBuilder({ page })
        .include('[data-testid="jumeau-alerte"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(r.violations.map((v) => v.id)).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // écoute : la récitation d'Ayyūb, jamais la synthèse
    await carte.getByTestId('jumeau-ecouter').click();
    await expect.poll(() => demandes.length).toBeGreaterThan(0);
    expect(demandes.every((u) => u.includes('/reciters/ayyoub-hafs/'))).toBe(true);
    await expect.poll(() => fichiers.length).toBeGreaterThan(0);
    expect(fichiers.every((f) => /\/ayyoub-hafs\/99-8\.mp3$/.test(f))).toBe(true);
    await expect(carte.getByText('Récitation de test')).toBeVisible();

    // la phrase d'explication ne revient plus (gardée sur l'appareil)
    await page.goto('/hifz/test?verset=99:7');
    await page.getByTestId('voir-suite').click();
    await expect(page.locator('[data-testid="jumeau-alerte"][data-verset="99:7"]')).toBeVisible();
    await expect(page.getByTestId('jumeau-premiere')).toHaveCount(0);
  });

  test('test des jumeaux : seulement des jumeaux mémorisés ; une erreur marque le mot ; une bonne réponse est « juste »', async ({
    page,
  }) => {
    const { email, profileId } = await newAdult(page, 'mt-test');
    await beta(email);
    // rien de mémorisé : aucun jumeau proposé
    await page.goto('/hifz/jumeaux');
    await expect(page.getByTestId('test-jumeaux-vide')).toBeVisible();
    await apprendre(page, profileId);
    await page.goto('/hifz/jumeaux');
    const q = page.getByTestId('jumeaux-question');
    await expect(q).toBeVisible();
    // seul le couple mémorisé (99:7, 99:8) est interrogé
    expect(['99:7', '99:8']).toContain(await q.getAttribute('data-verset'));
    const ref = (await q.getAttribute('data-verset'))!;
    const [s, a] = ref.split(':').map(Number);
    await expect(page.getByTestId('jumeaux-choix')).toHaveCount(2);
    // mauvaise réponse
    await page.locator('[data-testid="jumeaux-choix"][data-juste="false"]').click();
    await expect(page.getByTestId('jumeaux-resultat')).toContainText('Pas tout à fait');
    await expect(page.getByTestId('jumeau-carte')).toBeVisible();
    await expect
      .poll(
        async () =>
          (await marques(page, profileId)).some((m) => m.s === s && m.a === a && m.t === 'erreur'),
        {
          timeout: 15_000,
        },
      )
      .toBe(true);
    // bonne réponse à la question suivante
    await page.getByTestId('jumeaux-suivant').click();
    const q2 = page.getByTestId('jumeaux-question');
    await expect(page.getByTestId('jumeaux-resultat')).toHaveCount(0);
    const ref2 = (await q2.getAttribute('data-verset'))!;
    await page.locator('[data-testid="jumeaux-choix"][data-juste="true"]').click();
    await expect(page.getByTestId('jumeaux-resultat')).toContainText('Juste');
    const [s2, a2] = ref2.split(':').map(Number);
    await expect
      .poll(
        async () =>
          (await marques(page, profileId)).some((m) => m.s === s2 && m.a === a2 && m.t === 'juste'),
        {
          timeout: 15_000,
        },
      )
      .toBe(true);
  });
});
