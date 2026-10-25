import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { tanwinUndo } from '@awform/content/text';
import type { Browser, Page } from '@playwright/test';
import { expect, loginTeacher, newAdult, PARENT_PIN, password, test } from './fixtures';
import { pickProfile } from './profil';
import { totp } from './totp';

/**
 * Hifẓ en classe (25/10/2026) — interrupteur `hifz_classe` :
 *  - COUPÉ par défaut : rien dans l'espace enseignant, ni dans « Ma classe » ;
 *  - « canal bêta » : le maître récite en DIRECT avec un élève (texte Tanzil exact, mot par mot, quatre types d'erreur, enregistré au
 *    fil de l'eau) SANS JAMAIS ouvrir le micro ; il valide la portion avec une remarque ; les parents voient le suivi (jamais un audio) ;
 *  - mode ENREGISTREMENT : un adulte consentant s'enregistre (micro simulé, au toucher), l'envoi annonce la durée de conservation ; le maître
 *    écoute et annote ; l'élève peut supprimer ;
 *  - accessibilité AA en clair et en sombre, cibles de 44 px.
 */
const H = { 'x-awform': '1' };

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-hc-${test.info().project.name}-${Date.now()}@e2e.test`;
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
async function tanzil(page: Page, s: number, a: number): Promise<string> {
  const r = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
  return ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
}

/** micro et enregistreur SIMULÉS (aucun vrai micro) ; compte les ouvertures du micro */
const FAUX_MICRO = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__micro = 0;
  w.__enregistreurs = 0;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        (w.__micro as number)++;
        return { getTracks: () => [{ stop() {} }] };
      },
    },
  });
  class FauxEnregistreur {
    mimeType = 'audio/webm';
    stream = { getTracks: () => [{ stop() {} }] };
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor() {
      (w.__enregistreurs as number)++;
    }
    start() {}
    stop() {
      this.ondataavailable?.({
        data: new Blob(['voix-simulee-pas-une-vraie-voix'], { type: 'audio/webm' }),
      });
      this.onstop?.();
    }
  }
  w.MediaRecorder = FauxEnregistreur;
};

test.describe('hifẓ en classe', () => {
  test.describe.configure({ mode: 'serial' });
  let adm: Page;
  let cls: { id: string; joinCode: string };
  let enfant = '';
  const beta = async (email: string, actif = true) => {
    const b = await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: actif },
    });
    expect(b.ok(), await b.text()).toBe(true);
  };

  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    const r = await adm.request.put('/api/v1/admin/fonctions/hifz_classe', {
      headers: H,
      data: { etat: 'beta' },
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  test.afterAll(async () => {
    if (adm) {
      await adm.request.put('/api/v1/admin/fonctions/hifz_classe', {
        headers: H,
        data: { etat: 'off' },
      });
      await beta('maitre@e2e.test', false);
      await adm.context().close();
    }
  });
  let erreurs: string[] = [];
  test.beforeEach(({ page }) => {
    erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
  });
  test.afterEach(() => expect(erreurs).toEqual([]));

  test('coupée hors du canal bêta : rien dans l’espace enseignant', async ({ page }) => {
    await loginTeacher(page);
    const c = await page.request.post('/api/v1/teacher/classes', {
      headers: H,
      data: { name: `Cercle hifz ${Date.now()}` },
    });
    expect(c.status(), await c.text()).toBe(201);
    cls = ((await c.json()) as { class: { id: string; joinCode: string } }).class;
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/enseignant/classe/${cls.id}`);
    await page.getByTestId('onglet-ecoute').click();
    await expect(page.getByTestId('hifz-classe')).toHaveCount(0);
    const r = await page.request.get(`/api/v1/ecole/classes/${cls.id}/hifz/eleves`);
    expect(r.status()).toBe(403);
    expect((await r.json()).error.code).toBe('fonction_coupee');
  });

  test('mode direct : texte Tanzil mot par mot, quatre types d’erreur, aucun micro, validation ; les parents voient le suivi', async ({
    page,
    browser,
  }) => {
    await beta('maitre@e2e.test');
    // une famille inscrit son enfant dans la classe
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const fam = await ctx.newPage();
    const email = `hc-famille-${Date.now()}@e2e.test`;
    const su = await fam.request.post('/api/v1/auth/signup', {
      headers: H,
      data: {
        kind: 'parent',
        birthYear: 1985,
        email,
        password: password(),
        country: 'FR',
        locale: 'fr',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    });
    expect(su.status(), await su.text()).toBe(201);
    await fam.request.post('/api/v1/account/pin', {
      headers: H,
      data: { pin: PARENT_PIN, password: password() },
    });
    const r = await fam.request.post('/api/v1/profiles', {
      headers: H,
      data: {
        pseudonym: 'Ibrahim',
        birthYear: new Date().getFullYear() - 9,
        levelCode: 'en1',
        password: password(),
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      },
    });
    enfant = ((await r.json()) as { id: string }).id;
    const j = await fam.request.post(`/api/v1/profiles/${enfant}/classes`, {
      headers: { ...H, 'x-parent-pin': PARENT_PIN },
      data: { code: cls.joinCode, consent: true },
    });
    expect(j.status(), await j.text()).toBe(201);
    await beta(email);

    await loginTeacher(page);
    await page.addInitScript(FAUX_MICRO);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/enseignant/classe/${cls.id}`);
    await page.getByTestId('onglet-ecoute').click();
    const bloc = page.getByTestId('hifz-classe');
    await expect(bloc).toBeVisible();
    await expect(bloc).toContainText('Rien n’est enregistré');
    await bloc.getByTestId('hc-eleve').selectOption(enfant);
    await bloc.getByTestId('hc-sourate').selectOption('112');
    await bloc.getByTestId('hc-de').fill('1');
    await bloc.getByTestId('hc-a').fill('4');
    await bloc.getByTestId('hc-commencer').click();
    const seance = page.getByTestId('seance');
    await expect(seance).toHaveAttribute('data-mode', 'direct');
    await expect(page.getByTestId('mode-direct')).toBeVisible();
    // texte Tanzil exact, mot par mot (verset 2, sans basmala)
    const v2 = await tanzil(page, 112, 2);
    await expect(seance.locator('[data-verset="112:2"] button.mot').first()).toBeVisible();
    const mots = await seance.locator('[data-verset="112:2"] button.mot').allTextContents();
    expect(Buffer.from(tanwinUndo(mots.join(' ')))).toEqual(Buffer.from(v2));
    // quatre types d'erreur sur des mots ; un mot peut en porter plusieurs
    const mot = (a: number, k: number) =>
      seance.locator(`[data-verset="112:${a}"] button.mot[data-k="${k}"]`);
    await mot(2, 1).click();
    await page.getByTestId('type-oubli').click();
    await page.getByTestId('type-tajwid').click();
    await expect(mot(2, 1)).toHaveAttribute('data-marques', 'oubli,tajwid');
    await mot(3, 0).click();
    await page.getByTestId('type-changement').click();
    await mot(4, 1).click();
    await page.getByTestId('type-ajout').click();
    await expect(page.getByTestId('compte-oubli')).toHaveText('1');
    await expect(page.getByTestId('compte-ajout')).toHaveText('1');
    await expect(page.getByTestId('compte-changement')).toHaveText('1');
    await expect(page.getByTestId('compte-tajwid')).toHaveText('1');
    await expect(page.getByTestId('etat-sauvegarde')).toContainText('Enregistré');
    // accessibilité et cibles
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const ax = await new AxeBuilder({ page })
        .include('[data-testid="hifz-classe"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        ax.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    const petits = await page
      .locator('[data-testid="hifz-classe"] button.mot, [data-testid="panneau-mot"] button')
      .evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => Math.round(e.getBoundingClientRect().height))
          .filter((h) => h < 43.5),
      );
    expect(petits).toEqual([]);

    await page.getByTestId('remarque').fill('Très bien, revoir le verset 2.');
    await page.getByTestId('valider').click();
    await expect(page.getByTestId('seance-terminee')).toContainText('4 erreurs');
    // AUCUN micro ouvert, AUCUN enregistreur créé côté maître, aucun enregistrement serveur
    expect(await page.evaluate(() => (window as unknown as { __micro: number }).__micro)).toBe(0);
    expect(
      await page.evaluate(() => (window as unknown as { __enregistreurs: number }).__enregistreurs),
    ).toBe(0);
    await page.getByTestId('seance-fermer').click();
    await page.getByTestId('hc-onglet-seances').click();
    await expect(page.getByTestId('hc-seances')).toContainText('portion validée');

    // les parents voient le suivi de leur enfant (jamais un audio)
    await fam.setViewportSize({ width: 390, height: 844 });
    await fam.goto('/famille');
    const suivi = fam.getByTestId('fam-profil-Ibrahim').getByTestId('hc-suivi');
    await expect(suivi).toBeVisible();
    await expect(suivi).toContainText('portion validée');
    await expect(suivi).toContainText('1 oubli(s), 1 ajout(s), 1 changement(s), 1 tajwīd');
    await expect(suivi).toContainText('revoir le verset 2');
    await expect(suivi.locator('audio')).toHaveCount(0);
    // l'enfant n'a PAS le mode enregistrement (adultes seulement)
    await pickProfile(fam, 'Ibrahim');
    await fam.goto('/ma-classe');
    await expect(fam.getByTestId('hc-suivi')).toBeVisible();
    await expect(fam.getByTestId('hc-eleve')).toHaveCount(0);
    await ctx.close();
  });

  test('mode enregistrement : adulte consentant, micro au toucher, durée annoncée, annotation par le maître, suppression', async ({
    page,
    browser,
  }) => {
    // l'élève ADULTE s'inscrit dans la classe
    const { email, profileId } = await newAdult(page, 'hc-adulte');
    await beta(email);
    const j = await page.request.post(`/api/v1/profiles/${profileId}/classes`, {
      headers: H,
      data: { code: cls.joinCode, consent: true },
    });
    expect(j.status(), await j.text()).toBe(201);
    await page.addInitScript(FAUX_MICRO);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ma-classe');
    const carte = page.getByTestId('hc-eleve');
    await expect(carte).toBeVisible();
    // consentement d'abord ; le micro ne s'ouvre jamais avant le toucher
    await expect(carte).toContainText('supprimé automatiquement');
    await expect(carte).toContainText('jamais utilisé pour entraîner une IA');
    await carte.getByTestId('hc-accord').click();
    expect(await page.evaluate(() => (window as unknown as { __micro: number }).__micro)).toBe(0);
    await carte.getByTestId('hc-e-sourate').selectOption('112');
    await carte.getByTestId('hc-start').click();
    expect(await page.evaluate(() => (window as unknown as { __micro: number }).__micro)).toBe(1);
    await carte.getByTestId('hc-stop').click();
    await expect(carte.getByTestId('hc-apercu')).toBeVisible();
    await expect(carte).toContainText('14 jours au plus');
    await carte.getByTestId('hc-envoyer').click();
    await expect(carte.getByTestId('hc-envoye')).toContainText('14 jours');
    await expect(carte.getByTestId('hc-mes-enreg')).toContainText('effacé automatiquement le');

    // le maître l'écoute et l'annote
    const maitre = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const mp = await maitre.newPage();
    await loginTeacher(mp);
    await mp.setViewportSize({ width: 1024, height: 900 });
    await mp.goto(`/enseignant/classe/${cls.id}`);
    await mp.getByTestId('onglet-ecoute').click();
    await mp.getByTestId('hc-onglet-enregistrements').click();
    const liste = mp.getByTestId('hc-enregistrements');
    await expect(liste).toContainText('effacé automatiquement le');
    await liste.getByTestId('hc-annoter').first().click();
    await expect(mp.getByTestId('seance')).toHaveAttribute('data-mode', 'enregistrement');
    await expect(mp.getByTestId('audio-eleve')).toHaveAttribute(
      'src',
      /\/api\/v1\/ecole\/recitations\/[0-9a-f-]{36}\/audio$/,
    );
    await mp.locator('button.mot').nth(2).click();
    await mp.getByTestId('type-tajwid').click();
    await mp.getByTestId('a-reprendre').click();
    await expect(mp.getByTestId('seance-terminee')).toBeVisible();
    await maitre.close();

    // l'élève supprime son enregistrement quand il veut
    await page.reload();
    await page.getByTestId('hc-supprimer').first().click();
    await expect(page.getByTestId('hc-mes-enreg')).toHaveCount(0);
    // le suivi de l'élève adulte montre l'annotation (à reprendre)
    await expect(page.getByTestId('hc-suivi')).toContainText('à reprendre');
  });
});
