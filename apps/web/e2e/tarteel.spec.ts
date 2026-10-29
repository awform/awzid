import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * « Égaler Tarteel » (branche tarteel-egal-wip, 29/10/2026), interrupteur `shazam_coran` en canal bêta :
 *  - fenêtre de détail d'un VERSET, au toucher : « Mots manqués » et « Mots ajoutés », mots en rouge (et soulignés), texte
 *    Tanzil exact, cibles de 44 px, accessibilité AA ;
 *  - « Écouter Ayyūb » : le verset entier, avec le petit lecteur commun (vitesse jusqu'à 1,75×) ;
 *  - « Réécouter ma récitation » : COMPTE ADULTE seulement, l'audio reste sur l'appareil en mémoire (aucune requête, aucune
 *    adresse d'objet, rien dans IndexedDB) ; jamais pour un enfant ;
 *  - justesse par page et progression par sourate, gardées sur l'appareil, synchronisées avec la khatma (lecture du jour).
 * Micro FACTICE de Chromium (bips), service d'écoute FACTICE (e2e/ecoute-essai.mjs : Al-Ikhlāṣ sans son 3e mot).
 */
test.use({
  compte: null,
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
  },
});

const H = { 'x-awform': '1' };

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-trt-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** WAV de silence (essai : aucune récitation) */
function silence(sec = 2, rate = 8000): Buffer {
  const n = sec * rate;
  const b = Buffer.alloc(44 + n, 128);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  return b;
}

async function axe(page: Page, selecteur: string, quoi: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => document.fonts.ready);
    const r = await new AxeBuilder({ page })
      .include(selecteur)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      r.violations.map(
        (v) => `${quoi} ${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** toutes les cibles tactiles visibles d'un bloc font 44 px au moins */
async function cibles44(page: Page, selecteur: string) {
  const petites = await page.locator(selecteur).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          t: (e.textContent ?? '').trim().slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((x) => x.h < 43.5 || x.w < 43.5),
  );
  expect(petites).toEqual([]);
}

test.describe('« canal bêta » : détail d’un verset, progression, vitesse', () => {
  test.describe.configure({ mode: 'serial' });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    for (const f of ['shazam_coran', 'khatma_wird']) {
      const r = await adm.request.put(`/api/v1/admin/fonctions/${f}`, {
        headers: H,
        data: { etat: 'beta' },
      });
      expect(r.status(), await r.text()).toBe(200);
    }
  });
  test.afterAll(async () => {
    if (adm) {
      await adm.request.put('/api/v1/admin/fonctions/khatma_wird', {
        headers: H,
        data: { etat: 'off' },
      });
      await adm.context().close();
    }
  });
  let erreurs: string[] = [];
  let profileId = '';
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const a = await newAdult(page, 'trt');
    profileId = a.profileId;
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email: a.email, beta: true },
    });
    expect(b.ok(), await b.text()).toBe(true);
    // accord « analyse vocale par IA » du titulaire (le parcours de l'accord est vérifié par shazam.spec.ts)
    const ac = await page.request.post(`/api/v1/profiles/${profileId}/ecoute/accord`, {
      headers: H,
      data: {},
    });
    expect(ac.ok(), await ac.text()).toBe(true);
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  /** une séance « Réciter et vérifier » (le service factice oublie le 3e mot) jusqu'au résultat */
  async function reciter(page: Page) {
    await page.goto('/coran/lecteur?s=112&a=1&memo=1');
    await page.getByTestId('reciter-verifier').click();
    await expect(page.getByTestId('ecoute-pret')).toBeVisible();
    await page.getByTestId('ecoute-commencer').click();
    await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
    await page.waitForTimeout(2500);
    await page.getByTestId('ecoute-terminer').click();
    await expect(page.getByTestId('ecoute-a-revoir')).toContainText(/mot à revoir/, {
      timeout: 20_000,
    });
  }

  test('un toucher sur un verset : mots manqués en rouge, mots ajoutés, texte Tanzil exact, cibles de 44 px, AA', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await reciter(page);
    await expect(page.getByTestId('fiche-aide')).toContainText('Touche un verset');
    // le numéro de chaque verset est un bouton de 44 px au moins, au nom accessible
    const details = page.getByTestId('ecoute-verset-detail');
    expect(await details.count()).toBeGreaterThanOrEqual(1);
    await expect(details.first()).toHaveAttribute('aria-label', /Voir le détail du verset 1/);
    await cibles44(page, '[data-testid="ecoute-verset-detail"]');
    const principal = await page
      .locator('[data-testid="ecoute-texte"] .verset')
      .first()
      .locator('.mot')
      .allTextContents();
    const oublie = await page.locator('[data-testid="ecoute-texte"] .mot.oublie').textContent();

    await details.first().click();
    const fiche = page.getByTestId('fiche-verset');
    await expect(fiche).toBeVisible();
    await expect(fiche.locator('h2')).toContainText('verset 1');
    const manques = fiche.getByTestId('fiche-manques');
    await expect(manques.locator('h3')).toHaveText('Mots manqués');
    // le texte est celui de Tanzil (le même que celui de l'écran), le mot manqué est en rouge ET souligné
    expect(await manques.locator('.mot').allTextContents()).toEqual(principal);
    await expect(manques.locator('.mot.faux')).toHaveCount(1);
    await expect(manques.locator('.mot.faux')).toHaveText(oublie!);
    const style = await manques.locator('.mot.faux').evaluate((e) => {
      const c = getComputedStyle(e);
      const autre = getComputedStyle(e.closest('section')!.querySelector('.mot:not(.faux)')!);
      return { couleur: c.color, ligne: c.textDecorationLine, autre: autre.color };
    });
    expect(style.ligne).toContain('underline');
    expect(style.couleur).not.toBe(style.autre);
    // rien d'ajouté dans ce verset : dit sans reproche
    const ajoutes = fiche.getByTestId('fiche-ajoutes');
    await expect(ajoutes.locator('h3')).toHaveText('Mots ajoutés');
    await expect(ajoutes.getByTestId('fiche-aucun-ajout')).toBeVisible();
    await expect(ajoutes.locator('.plus')).toHaveCount(0);
    // les deux boutons (adulte), jamais de jugement
    await expect(fiche.getByTestId('fiche-ecouter-ayyoub')).toHaveText('Écouter Ayyūb');
    await expect(fiche.getByTestId('fiche-reecouter')).toHaveText('Réécouter ma récitation');
    await expect(fiche.getByTestId('fiche-garantie')).toContainText('ni envoyé ni gardé');
    await expect(fiche).not.toContainText(/valid|\/20|excellent|parfait/i);
    await cibles44(page, '[data-testid="fiche-verset"] button');
    await axe(page, '[data-testid="fiche-verset"]', 'fiche');
    // Échap ferme la fenêtre, le panneau reste
    await page.keyboard.press('Escape');
    await expect(fiche).toBeHidden();
    await expect(page.getByTestId('panneau-ecoute')).toBeVisible();
    // un toucher sur le texte du verset ouvre aussi la fenêtre du verset touché
    await page
      .locator('[data-testid="ecoute-texte"] .verset')
      .nth(1)
      .locator('.mot')
      .first()
      .click();
    await expect(fiche.locator('h2')).toContainText('verset 2');
    await expect(fiche.getByTestId('fiche-aucun-manque')).toBeVisible();
  });

  test('« Réécouter ma récitation » : l’audio reste sur l’appareil, en mémoire (aucune requête, aucune adresse d’objet, rien de gardé)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __objets: number };
      w.__objets = 0;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (o: Blob | MediaSource) => {
        w.__objets++;
        return orig(o);
      };
    });
    await reciter(page);
    const avant = await page.evaluate(() => (window as unknown as { __objets: number }).__objets);
    const requetes: string[] = [];
    page.on('request', (r) => requetes.push(`${r.method()} ${new URL(r.url()).pathname}`));
    await page.getByTestId('ecoute-verset-detail').first().click();
    const bouton = page.getByTestId('fiche-reecouter');
    await expect(bouton).toBeVisible();
    requetes.length = 0;
    await bouton.click();
    // la lecture démarre (bouton enfoncé, « Arrêter »), puis s'arrête seule à la fin de l'extrait
    await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    await expect(bouton).toHaveText('Arrêter');
    await expect(bouton).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
    await expect(page.getByTestId('fiche-verset').getByRole('alert')).toHaveCount(0);
    // rien n'est parti, rien n'est gardé
    expect(requetes).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __objets: number }).__objets)).toBe(
      avant,
    );
    const gardes = await page.evaluate(
      () =>
        new Promise<number>((ok) => {
          const q = indexedDB.open('awform');
          q.onsuccess = () => {
            const db = q.result;
            if (!db.objectStoreNames.contains('recordings')) return ok(0);
            const c = db.transaction('recordings').objectStore('recordings').count();
            c.onsuccess = () => ok(c.result);
          };
          q.onerror = () => ok(-1);
        }),
    );
    expect(gardes).toBe(0);
    // rejouer, puis arrêter à la main
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'false');
  });

  test('un enfant n’a PAS la réécoute de sa récitation (ni son bouton, ni sa garantie) mais peut écouter Ayyūb', async ({
    page,
  }) => {
    // le serveur répond « enfant » pour ce profil (le serveur, lui, n'envoie les instants qu'à un adulte : testé côté API)
    await page.route('**/api/v1/profiles/*/ecoute', (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({
            json: {
              active: true,
              disponible: true,
              direct: true,
              accord: true,
              enfant: true,
              maxSecondes: 300,
              shazam: true,
            },
          })
        : r.continue(),
    );
    await reciter(page);
    await page.getByTestId('ecoute-verset-detail').first().click();
    const fiche = page.getByTestId('fiche-verset');
    await expect(fiche).toBeVisible();
    await expect(fiche.getByTestId('fiche-ecouter-ayyoub')).toBeVisible();
    await expect(fiche.getByTestId('fiche-reecouter')).toHaveCount(0);
    await expect(fiche.getByTestId('fiche-garantie')).toHaveCount(0);
  });

  test('« Écouter Ayyūb » : le verset entier avec le petit lecteur commun, vitesse jusqu’à 1,75×', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const demandes: string[] = [];
    await page.route(/\/api\/v1\/quran\/audio\/reciters\/([^/]+)\/packs\/(\d+)/, (r) => {
      demandes.push(r.request().url());
      return r.fulfill({
        json: {
          format: 1,
          reciter: 'ayyoub-hafs',
          riwaya: 'hafs',
          credit: 'Récitation de test',
          sura: 112,
          hash: 't112',
          surlignage: 'verset',
          wifiSeulement: false,
          bytes: 10,
          durationMs: 2000,
          files: [1, 2, 3, 4].map((aya) => ({
            aya,
            url: `/api/v1/quran/audio/file/ayyoub-hafs/112-${aya}.mp3`,
            bytes: 10,
            sha256: '',
            durationMs: 2000,
            format: 'mp3',
            surlignage: 'verset',
          })),
        },
      });
    });
    const fichiers: string[] = [];
    await page.route('**/api/v1/quran/audio/file/**', (r) => {
      fichiers.push(new URL(r.request().url()).pathname);
      return r.fulfill({ body: silence(20), contentType: 'audio/wav' });
    });
    await page.route('**/api/v1/lecons-audio/**', (r) => {
      fichiers.push(`SYNTHESE ${r.request().url()}`);
      return r.abort();
    });
    await reciter(page);
    await page.getByTestId('ecoute-verset-detail').first().click();
    const bouton = page.getByTestId('fiche-ecouter-ayyoub');
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    // le verset entier, par Ayyūb seulement (jamais une voix de synthèse)
    await expect.poll(() => fichiers).toEqual(['/api/v1/quran/audio/file/ayyoub-hafs/112-1.mp3']);
    expect(demandes.every((u) => u.includes('/reciters/ayyoub-hafs/'))).toBe(true);
    // le petit lecteur commun prend la main ; les fenêtres fermées, ses commandes sont atteignables
    await expect(page.getByTestId('lecteur')).toBeAttached();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('panneau-ecoute')).toBeHidden();
    await page.getByTestId('lecteur-regler').click();
    for (const v of ['0.75', '1', '1.25', '1.5', '1.75'])
      await expect(page.getByTestId(`lecteur-vitesse-${v}`)).toBeVisible();
    await cibles44(page, '[data-testid="lecteur"] button');
    await page.getByTestId('lecteur-vitesse-1.75').click();
    await expect(page.getByTestId('lecteur-vitesse-1.75')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('lecteur-vitesse-1.75')).toHaveAttribute('aria-label', /1[,.]75/);
    await axe(page, '[data-testid="lecteur"]', 'lecteur');
  });

  test('justesse par page et progression par sourate : gardées sur l’appareil, jamais envoyées, reprises par la khatma', async ({
    page,
  }) => {
    const meta = (await (await page.request.get('/api/v1/quran/meta')).json()) as {
      realPages?: boolean;
    };
    const requetes: string[] = [];
    page.on('request', (r) =>
      requetes.push(`${r.method()} ${r.url()} ${r.postData()?.slice(0, 40) ?? ''}`),
    );
    await reciter(page);
    const prog = page.getByTestId('ecoute-progres');
    await expect(prog).toBeVisible();
    await expect(prog).toContainText('Ton avancement');
    // 3 versets sur 4 récités sans écart (le 1er a un mot oublié)
    await expect(prog.getByTestId('progres-sourate')).toContainText(
      '3 sur 4 versets récités sans écart (75 %)',
    );
    await expect(prog.locator('progress[aria-label]').first()).toBeVisible();
    await expect(prog).toContainText('Gardé sur cet appareil seulement');
    await expect(prog).not.toContainText(/valid|\/20|excellent|parfait/i);
    if (meta.realPages) {
      await expect(prog.getByTestId('progres-page').first()).toContainText(
        /Page 604 : \d+ % de justesse/,
      );
    }
    await axe(page, '[data-testid="ecoute-progres"]', 'progrès');
    // gardé sur l'appareil : IndexedDB, des nombres par verset ; jamais envoyé au serveur
    const reg = await page.evaluate(
      (cle) =>
        new Promise<Record<string, unknown[]> | null>((ok) => {
          const q = indexedDB.open('awform');
          q.onsuccess = () => {
            const g = q.result.transaction('kv').objectStore('kv').get(cle);
            g.onsuccess = () => ok((g.result as Record<string, unknown[]>) ?? null);
          };
        }),
      `ecoute.progres:${profileId}`,
    );
    expect(Object.keys(reg ?? {})).toEqual(['112:1', '112:2', '112:3', '112:4']);
    expect(reg!['112:1']![3]).toBe(1); // verset entier, avec une erreur
    expect(reg!['112:1']![2]).toBe(1);
    expect(reg!['112:2']![2]).toBe(0);
    expect(requetes.filter((r) => /progres|justesse/i.test(r))).toEqual([]);
    expect(requetes.some((r) => r.includes('112:2'))).toBe(false);
  });

  test('khatma : la lecture du jour dit la justesse de ma récitation ; les pages récitées sans écart se proposent au plan', async ({
    page,
  }) => {
    const meta = (await (await page.request.get('/api/v1/quran/meta')).json()) as {
      realPages?: boolean;
    };
    test.skip(!meta.realPages, 'pages du Muṣḥaf indisponibles dans ce contenu');
    await reciter(page);
    // KHATMA : la lecture du jour est la page 604 (plan à 603 pages faites) : la justesse de ma récitation y est dite
    const jour = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const plan = await page.request.post(`/api/v1/profiles/${profileId}/khatma`, {
      headers: H,
      data: {
        kind: 'khatma',
        mode: 'duree',
        startDate: jour(-29),
        endDate: jour(1),
        seedDone: 603,
      },
    });
    expect(plan.status(), await plan.text()).toBe(201);
    await page.goto('/coran');
    await expect(page.getByTestId('khatma-justesse')).toContainText(/\d+ % de justesse \(1 page\)/);
    await expect(page.getByTestId('khatma-maj-recitation')).toHaveCount(0);
    // toute la page 604 récitée sans écart (les trois sourates) : on PROPOSE de mettre le plan à jour
    await page.evaluate(
      (cle) =>
        new Promise<void>((ok) => {
          const q = indexedDB.open('awform');
          q.onsuccess = () => {
            const tx = q.result.transaction('kv', 'readwrite');
            const reg: Record<string, unknown> = {};
            for (const [s, n] of [
              [112, 4],
              [113, 5],
              [114, 6],
            ] as const)
              for (let a = 1; a <= n; a++) reg[`${s}:${a}`] = [5, 5, 0, 1, '2026-10-29'];
            tx.objectStore('kv').put(reg, cle);
            tx.oncomplete = () => ok();
          };
        }),
      `ecoute.progres:${profileId}`,
    );
    await page.goto('/coran');
    const maj = page.getByTestId('khatma-maj-recitation');
    await expect(maj).toBeVisible();
    await expect(maj).toContainText("jusqu'à la page 604");
    await cibles44(page, '[data-testid="khatma-maj-recitation"]');
    const rep = page.waitForResponse((r) => r.url().includes('/progression'));
    await maj.click();
    const rr = await rep;
    expect(rr.status(), await rr.text()).toBe(200);
    await expect(maj).toHaveCount(0);
    await expect
      .poll(async () => {
        const api = (await (
          await page.request.get(`/api/v1/profiles/${profileId}/khatma`)
        ).json()) as {
          plans: Array<{ part: { done: number } }>;
        };
        return api.plans[0]!.part.done;
      })
      .toBe(604);
  });
});
