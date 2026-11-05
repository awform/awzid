import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Lectures (4/11/2026) — interrupteurs `khalil` et `histoires` (défaut « beta » : canal bêta seulement), à 375 px :
 *  - par défaut (compte hors canal bêta) : pages fermées, aucune carte d'entrée ;
 *  - Khalīl ouvert : le sommaire ne contient AUCUN chapitre du jihād ; les vœux sont suivis de la course ; texte arabe en lang="ar" ;
 *  - Histoires ouvertes : Nouh, bascule enfant / adulte, verset 7:59 tel quel, lecteur audio qui enchaîne les passages, surligne
 *    le bloc et SAUTE la place du verset (aucun fichier demandé pour un verset). Le son est simulé (court WAV silencieux).
 */
const H = { 'x-awform': '1' };

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-lx-${test.info().project.name}-${Date.now()}@e2e.test`;
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
async function regler(adm: Page, f: Record<'khalil' | 'histoires', 'on' | 'off' | 'beta'>) {
  for (const [nom, etat] of Object.entries(f)) {
    const r = await adm.request.put(`/api/v1/admin/fonctions/${nom}`, {
      headers: H,
      data: { etat },
    });
    expect(r.status(), await r.text()).toBe(200);
  }
}
/** WAV silencieux de 0,15 s (8 kHz, 8 bits) : remplace la narration pendant l'essai */
function wav(): Buffer {
  const n = 1200;
  const b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  return b;
}
const sansDebordement = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

test.describe('Lectures : Khalīl et Histoires', () => {
  test.use({ compte: null, viewport: { width: 375, height: 812 } });
  let adm: Page;
  let erreurs: string[] = [];
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
  });
  test.afterAll(async () => {
    if (adm) {
      await regler(adm, { khalil: 'beta', histoires: 'beta' });
      await adm.context().close();
    }
  });
  test.beforeEach(({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('hors canal bêta : fermé, aucune carte', async ({ page }) => {
    await regler(adm, { khalil: 'beta', histoires: 'beta' });
    await newAdult(page, 'lx-ferme');
    await page.goto('/khalil');
    await expect(page.getByTestId('kh-ferme')).toBeVisible({ timeout: 20_000 });
    await page.goto('/histoires');
    await expect(page.getByTestId('hx-ferme')).toBeVisible();
    await page.goto('/quotidien');
    await expect(page.getByTestId('lx-cartes')).toHaveCount(0);
  });

  test('Khalīl : aucun chapitre du jihād ; les vœux puis la course ; arabe isolé', async ({
    page,
  }) => {
    await regler(adm, { khalil: 'on', histoires: 'off' });
    await newAdult(page, 'lx-khalil');
    await page.goto('/quotidien');
    await expect(page.getByTestId('lx-khalil')).toBeVisible({ timeout: 20_000 });
    await page.goto('/khalil');
    const som = page.getByTestId('kh-sommaire');
    await expect(som).toBeVisible({ timeout: 20_000 });
    await expect(som).not.toContainText(/jih[aā]d/i);
    expect(await som.locator('[data-k="jihad"]').count()).toBe(0);
    await som.locator('[data-k="nudhur"]').click();
    await expect(page.getByTestId('kh-chapitre')).toContainText('vœux');
    await expect(page.locator('.unite .ar[lang="ar"]').first()).toBeVisible();
    await page.getByTestId('kh-suivant').click();
    await expect(page.getByTestId('kh-chapitre')).toContainText('course');
    await expect(page.locator('main')).not.toContainText('Chapitre [du jihād]');
    await sansDebordement(page);
  });

  test('Histoires : Nouh, bascule, verset tel quel, lecteur qui enchaîne, récite 7:59 (Ayyūb) puis reprend', async ({
    page,
  }) => {
    await regler(adm, { khalil: 'off', histoires: 'on' });
    const demandes: string[] = [];
    await page.route('**/histoires/audio/**', (route) => {
      demandes.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() });
    });
    // récitation d'Ayyūb : même service que les leçons (paquet de la sourate, puis fichier du verset)
    const paquets: string[] = [];
    await page.route(/\/api\/v1\/quran\/audio\/reciters\/[^/]+\/packs\/\d+/, (r) => {
      const u = r.request().url();
      paquets.push(u);
      const sura = Number(/packs\/(\d+)/.exec(u)![1]);
      if (!u.includes('/ayyoub-hafs/'))
        return r.fulfill({ status: 404, json: { error: 'recitateur_indisponible' } });
      return r.fulfill({
        json: {
          format: 1,
          reciter: 'ayyoub-hafs',
          riwaya: 'hafs',
          credit: '',
          sura,
          hash: `t${sura}`,
          surlignage: 'verset',
          wifiSeulement: false,
          bytes: 1000,
          durationMs: 300,
          files: Array.from({ length: 206 }, (_, i) => ({
            aya: i + 1,
            url: `/api/v1/quran/audio/file/ayyoub-hafs/${sura}-${i + 1}.mp3`,
            bytes: 1000,
            sha256: '',
            durationMs: 300,
            format: 'mp3',
            surlignage: 'verset',
          })),
        },
      });
    });
    await page.route('**/api/v1/quran/audio/file/**', (route) => {
      demandes.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() });
    });
    await newAdult(page, 'lx-histoires');
    await page.goto('/histoires');
    await expect(page.getByTestId('hx-sommaire')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-r="03_nouh"]').click();
    await expect(page.getByTestId('hx-enfant')).toBeVisible();
    await expect(page.locator('.illu svg').first()).toBeVisible();
    await page.getByTestId('hx-b-adulte').click();
    const adulte = page.getByTestId('hx-adulte');
    await expect(adulte).toBeVisible();
    await expect(adulte.locator('.coran .ar').first()).toContainText('لَقَدْ أَرْسَلْنَا نُوحًا');
    await expect(adulte).not.toContainText('Sources et choix');
    // lecteur : passage 1, puis enchaînement ; à la place du verset 7:59 (entrée 8), la récitation d'Ayyūb, puis la synthèse
    await expect(page.getByTestId('hx-lecteur')).toBeVisible();
    await page.getByTestId('hx-jouer').click();
    await expect(page.getByTestId('hx-pos')).toContainText(/Passage \d+ sur 69/);
    await expect(adulte.locator('.en-cours')).toHaveCount(1);
    // le navigateur peut redemander un fichier (plages) : on compte les fichiers distincts, dans l'ordre
    const distincts = () => [...new Set(demandes)];
    await expect.poll(() => distincts().length, { timeout: 20_000 }).toBeGreaterThanOrEqual(9);
    expect(demandes[0]).toBe('/histoires/audio/prophetes/03_nouh/adulte/p001.mp3');
    const nouh = (n: number) =>
      `/histoires/audio/prophetes/03_nouh/adulte/p${String(n).padStart(3, '0')}.mp3`;
    expect(distincts().slice(0, 9)).toEqual(
      // l'entrée 8 du manifeste est la place du verset 7:59 : aucun fichier de synthèse (p008), la récitation de 7:59
      // (seul ce verset), puis la synthèse reprend à p009
      [
        ...[1, 2, 3, 4, 5, 6, 7].map(nouh),
        '/api/v1/quran/audio/file/ayyoub-hafs/7-59.mp3',
        nouh(9),
      ],
    );
    expect(paquets.every((u) => u.includes('/ayyoub-hafs/packs/7'))).toBe(true);
    expect(demandes.some((d) => d.endsWith('/p008.mp3'))).toBe(false);
    await page.getByTestId('hx-jouer').click();
    await sansDebordement(page);
  });
});
