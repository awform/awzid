import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import type { SourateTafsir } from '@awform/content/tafsir';
import { expect, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Sens et explication » (2/11/2026) — interrupteur `tafsir_sens` :
 *  - COUPÉ (défaut) : aucun accès dans le petit menu du verset, aucune donnée demandée, le serveur refuse ;
 *  - OUVERT : le petit menu d'un verset (Al-Ikhlāṣ 112:1) propose « Sens et explication » ; la feuille montre le sens, le MOT À MOT
 *    (l'arabe Tanzil du mot, puis son sens français) et le tafsīr abrégé du verset, tels que dans le fichier livré ; chargement d'UNE
 *    sourate à la demande (une seule requête), aucune translittération, texte français en `lang="fr"` ;
 *  - FILTRAGE PAR PUBLIC (D-TF-445) sur deux segments FICTIFS ajoutés à la sourate 112 (e2e/tafsir-essai.mjs) : un profil adulte voit
 *    le segment « niveau adulte » AVEC sa note de contexte, jamais le segment « mention publique interdite » ; un profil ENFANT ne
 *    voit ni l'un ni l'autre, et ni leur texte ni leur note n'arrive jusqu'à son navigateur ;
 *  - accessibilité AA de la feuille, cibles ≥ 44 px, aucune voix de synthèse.
 */
const H = { 'x-awform': '1' };
const FICHIER = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'content',
  'tafsir',
  '112.json',
);
const livre = JSON.parse(readFileSync(FICHIER, 'utf8')) as SourateTafsir;
const v1 = livre.versets[0]!;
const MDP = 'une longue phrase de passe 2026';

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-tf-${test.info().project.name}-${Date.now()}@e2e.test`;
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
const regler = async (adm: Page, etat: 'on' | 'off') =>
  expect(
    (
      await adm.request.put('/api/v1/admin/fonctions/tafsir_sens', { headers: H, data: { etat } })
    ).status(),
  ).toBe(200);

/** Lecteur sur la page d'Al-Ikhlāṣ ; touche le verset donné et attend le petit menu. */
async function ouvrirMenu(page: Page, verset = '112:1') {
  await page.goto('/coran/lecteur?page=604');
  const v = page.locator(`[data-aya="${verset}"]`).first();
  await expect(v).toBeVisible({ timeout: 20_000 });
  await v.click();
  const menu = page.getByTestId('menu-verset');
  await expect(menu).toBeVisible();
  return menu;
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

test.describe('interrupteur coupé', () => {
  test.use({ compte: 'adulte' });
  test('aucun accès dans le menu du verset, aucune donnée, le serveur refuse', async ({
    page,
    browser,
  }) => {
    const adm = await admin(browser);
    try {
      await regler(adm, 'off');
      const demandes: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/tafsir')) demandes.push(r.url());
      });
      const menu = await ouvrirMenu(page);
      await expect(menu.getByTestId('menu-signet')).toBeVisible();
      await expect(menu.getByTestId('menu-sens')).toHaveCount(0);
      const r = await page.request.get('/api/v1/tafsir/sourates/112');
      expect(r.status()).toBe(403);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('fonction_coupee');
      expect(demandes.filter((u) => !u.endsWith('/api/v1/tafsir/sourates/112'))).toEqual([]);
    } finally {
      await adm.context().close();
    }
  });
});

test.describe('interrupteur ouvert', () => {
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await regler(adm, 'on');
  });
  test.afterAll(async () => {
    if (adm) {
      await regler(adm, 'off');
      await adm.context().close();
    }
  });

  test.describe('profil ADULTE', () => {
    test.use({ compte: 'adulte' });
    test('Al-Ikhlāṣ 112:1 : le sens, le mot à mot et le tafsīr du fichier, une sourate chargée à la demande', async ({
      page,
    }) => {
      const demandes: string[] = [];
      const voix: string[] = [];
      page.on('request', (r) => {
        if (/\/tafsir/.test(r.url())) demandes.push(new URL(r.url()).pathname);
        if (/\/synthese|\/tts|\/lecons-audio/.test(r.url())) voix.push(r.url());
      });
      const menu = await ouvrirMenu(page);
      // rien n'est demandé avant le geste
      expect(demandes.filter((u) => u.startsWith('/api/v1/tafsir/sourates'))).toEqual([]);
      await menu.getByTestId('menu-sens').click();
      const feuille = page.getByTestId('sens-verset');
      await expect(feuille).toBeVisible();
      await expect(feuille).toContainText('Al-Ikhlāṣ');
      // le verset : texte Tanzil du fichier, octet pour octet
      await expect(feuille.getByTestId('sens-texte')).toHaveText(v1.ar);
      await expect(feuille.getByTestId('sens-texte')).toHaveAttribute('dir', 'rtl');
      // le sens français du fichier
      const sens = feuille.getByTestId('sens-sens');
      await expect(sens).toHaveText(v1.sens);
      await expect(sens).toHaveAttribute('lang', 'fr');
      // le mot à mot : autant de mots que dans le fichier, l'arabe de Tanzil puis le sens français
      const mots = feuille.getByTestId('sens-mot');
      await expect(mots).toHaveCount(v1.mots.length);
      for (const [i, m] of v1.mots.entries()) {
        await expect(mots.nth(i).locator('.mot-ar')).toHaveText(m[0]);
        await expect(mots.nth(i).locator('.mot-fr')).toHaveText(m[1]);
      }
      // le tafsīr abrégé : dans le fichier livré, les points de la sourate 112 n'ont pas de plage de versets (titres « Aṣ-Ṣamad »…) : ils
      // sont dans « À propos de la sourate », repliée ; le verset 1 n'a, avec les segments fictifs, que ceux que son public peut voir
      const generaux = livre.points.filter((p) => p.plage.length === 0);
      expect(generaux.length).toBeGreaterThan(0);
      await feuille.getByTestId('sens-sourate').locator('summary').click();
      await expect(
        feuille.getByTestId('sens-sourate').getByTestId('sens-point').first(),
      ).toContainText(generaux[0]!.titre.slice(0, 12));
      await expect(feuille.getByTestId('sens-sourate')).toContainText(
        livre.sens_general!.slice(0, 40),
      );
      // aucune translittération ni mention interne
      const texte = (await feuille.innerText()).toLowerCase();
      expect(texte).not.toMatch(/translit|corpus_coran|a_verifier|d-tf-/);
      // une sourate, une requête
      expect(demandes.filter((u) => u.startsWith('/api/v1/tafsir/sourates'))).toEqual([
        '/api/v1/tafsir/sourates/112',
      ]);
      expect(voix).toEqual([]);
      // fermeture puis réouverture : copie en mémoire, pas de nouvelle requête
      await page.keyboard.press('Escape');
      await expect(feuille).toBeHidden();
      await page.locator('[data-aya="112:1"]').first().click();
      await page.getByTestId('menu-sens').click();
      await expect(page.getByTestId('sens-sens')).toHaveText(v1.sens);
      expect(demandes.filter((u) => u.startsWith('/api/v1/tafsir/sourates')).length).toBe(1);
    });

    test('segment « niveau adulte » AVEC sa note de contexte ; jamais le segment réservé', async ({
      page,
    }) => {
      const reponse = page.waitForResponse((r) => r.url().endsWith('/api/v1/tafsir/sourates/112'));
      const menu = await ouvrirMenu(page);
      await menu.getByTestId('menu-sens').click();
      const feuille = page.getByTestId('sens-verset');
      await expect(feuille.getByTestId('sens-tafsir')).toBeVisible();
      await expect(feuille).toContainText('TEXTE-ADULTE-SEUL');
      await expect(feuille.getByTestId('sens-contexte')).toContainText('NOTE-DE-CONTEXTE-ADULTE');
      await expect(feuille).not.toContainText('TEXTE-RESERVE-CLIENT');
      expect(await (await reponse).text()).not.toContain('RESERVE-CLIENT');
    });

    test('accessibilité AA, cibles ≥ 44 px, en clair', async ({ page }) => {
      const menu = await ouvrirMenu(page);
      await menu.getByTestId('menu-sens').click();
      const feuille = page.getByTestId('sens-verset');
      await expect(feuille.getByTestId('sens-mot').first()).toBeVisible();
      await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
      await axe(page, '[data-testid="sens-verset"]');
      for (const sel of ['[data-testid="fermer-feuille"]', 'summary']) {
        const h = await feuille
          .locator(sel)
          .first()
          .evaluate((e) => Math.round(e.getBoundingClientRect().height));
        expect(h, sel).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test.describe('profil ENFANT (compte parent)', () => {
    test.use({ compte: null });
    test("l'enfant voit le sens et le mot à mot, mais ni le segment adulte, ni sa note, ni le segment réservé", async ({
      page,
    }) => {
      const r = await page.request.post('/api/v1/auth/signup', {
        headers: H,
        data: {
          kind: 'parent',
          intention: 'famille',
          email: `tf-parent-${Date.now()}@e2e.test`,
          password: MDP,
          country: 'FR',
          birthYear: 1985,
          consents: ['cgu', 'donnee_religieuse_art9'],
        },
      });
      expect(r.status(), await r.text()).toBe(201);
      const p = await page.request.post('/api/v1/profiles', {
        headers: H,
        data: {
          pseudonym: 'Amina',
          birthYear: new Date().getFullYear() - 9,
          levelCode: 'en1',
          password: MDP,
          consents: ['compte_suivi', 'donnee_religieuse_art9'],
        },
      });
      expect(p.status(), await p.text()).toBe(201);
      const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
        profiles: Array<{ id: string; isOwner?: boolean; kind: string }>;
      };
      const enfant = me.profiles.find((x) => x.kind === 'enfant')!;
      await page.goto('/profils');
      await page.locator(`button[data-profile="${enfant.id}"]`).click();
      await expect(page.getByTestId('eleve-actif')).toBeVisible();
      const reponse = page.waitForResponse((x) => x.url().endsWith('/api/v1/tafsir/sourates/112'));
      const menu = await ouvrirMenu(page);
      await menu.getByTestId('menu-sens').click();
      const feuille = page.getByTestId('sens-verset');
      await expect(feuille.getByTestId('sens-sens')).toHaveText(v1.sens);
      await expect(feuille.getByTestId('sens-mot')).toHaveCount(v1.mots.length);
      await feuille.getByTestId('sens-sourate').locator('summary').click();
      await expect(
        feuille.getByTestId('sens-sourate').getByTestId('sens-point').first(),
      ).toBeVisible();
      await expect(feuille).not.toContainText('TEXTE-ADULTE-SEUL');
      await expect(feuille).not.toContainText('NOTE-DE-CONTEXTE');
      await expect(feuille).not.toContainText('TEXTE-RESERVE-CLIENT');
      await expect(feuille.getByTestId('sens-contexte')).toHaveCount(0);
      // le navigateur de l'enfant n'a JAMAIS reçu ces textes
      const corps = await (await reponse).text();
      expect(corps).not.toMatch(/ADULTE-SEUL|NOTE-DE-CONTEXTE|RESERVE-CLIENT|"acces"/);
      // et la copie gardée sur l'appareil non plus
      const gardees = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const open = indexedDB.open('awform');
            open.onsuccess = () => {
              const db = open.result;
              const rq = db.transaction('kv').objectStore('kv').getAll();
              rq.onsuccess = () => resolve(JSON.stringify(rq.result));
              rq.onerror = () => resolve('');
            };
            open.onerror = () => resolve('');
          }),
      );
      expect(gardees).toContain(v1.sens.slice(0, 20));
      expect(gardees).not.toMatch(/ADULTE-SEUL|NOTE-DE-CONTEXTE|RESERVE-CLIENT/);
    });
  });

  test.describe('relais /api : en-tête x-profil (compte parent)', () => {
    test.use({ compte: null });
    // 3/11/2026 : le relais /api du serveur web (développement et essais ; Caddy en production) ne transmettait pas `x-profil` :
    // le serveur ne voyait pas le profil enfant. Preuve par une fonction qui DIFFÈRE pour un enfant : le Muṣḥaf exact, fermé aux
    // profils d'enfants tant que « qf_profils_enfants » vaut « off » (défaut), ouvert au compte du parent
    test('le profil enfant annoncé par x-profil est reconnu par le serveur', async ({ page }) => {
      const r = await page.request.post('/api/v1/auth/signup', {
        headers: H,
        data: {
          kind: 'parent',
          intention: 'famille',
          email: `tf-relais-${Date.now()}@e2e.test`,
          password: MDP,
          country: 'FR',
          birthYear: 1985,
          consents: ['cgu', 'donnee_religieuse_art9'],
        },
      });
      expect(r.status(), await r.text()).toBe(201);
      const p = await page.request.post('/api/v1/profiles', {
        headers: H,
        data: {
          pseudonym: 'Maryam',
          birthYear: new Date().getFullYear() - 9,
          levelCode: 'en1',
          password: MDP,
          consents: ['compte_suivi', 'donnee_religieuse_art9'],
        },
      });
      expect(p.status(), await p.text()).toBe(201);
      const { id } = (await p.json()) as { id: string };
      const page1 = '/api/v1/quran/mushaf-exact/pages/1';
      expect((await page.request.get(page1, { headers: H })).status()).not.toBe(403);
      const enfant = await page.request.get(page1, { headers: { ...H, 'x-profil': id } });
      expect(enfant.status()).toBe(403);
      expect(((await enfant.json()) as { error: { code: string } }).error.code).toBe(
        'fonction_coupee',
      );
      // et le tafsīr de l'enfant, demandé avec son profil : sans segment adulte ni réservé
      const tf = await page.request.get('/api/v1/tafsir/sourates/112', {
        headers: { ...H, 'x-profil': id },
      });
      expect(tf.status()).toBe(200);
      expect(await tf.text()).not.toMatch(/ADULTE-SEUL|NOTE-DE-CONTEXTE|RESERVE-CLIENT/);
    });
  });
});
