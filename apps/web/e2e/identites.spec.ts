import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { etapeAccords, etapeProfil } from './inscription';
import { totp } from './totp';

/**
 * Identités (18/10/2026), de bout en bout, en mode SIMULÉ (aucun appel à Meta ni à Google) :
 *  1. les trois façons d'entrer, dans l'ordre : Google, numéro WhatsApp, e-mail (inscription et connexion) ;
 *  2. inscription par numéro : vérification inversée (le simulateur joue le message WhatsApp envoyé depuis le numéro),
 *     codes de récupération montrés une fois, puis connexion par le numéro ;
 *  3. limite : un renvoi trop tôt est refusé avec un message clair ;
 *  4. mot de passe oublié avec un code de récupération (aucun envoi) ;
 *  5. « Continuer avec Google » contre le FAUX fournisseur OpenID local : inscription (mêmes étapes, mot de passe
 *     facultatif), puis connexion par Google ;
 *  6. validation manuelle par l'administrateur (numéro masqué sauf 4 chiffres, code attendu) ;
 *  7. inscription assistée : lien préparé par l'administrateur, la personne choisit un mot de passe.
 * Maquettes des écrans d'entrée (ordinateur et téléphone, clair et sombre) : SEULEMENT avec MAQUETTES_DIR.
 */
test.use({ compte: null, parEtapes: true });

const H = { 'x-awform': '1' };
const numero = () => `77${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-id-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
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

/** La personne envoie le message pré-rempli depuis SON WhatsApp (simulateur à la place du webhook de Meta). */
async function envoyerMessage(page: Page, national: string) {
  const texte = (await page.getByTestId('tel-message').textContent()) ?? '';
  expect(texte).toMatch(/AWZID [2-9A-HJKMNP-TV-Z]{6}/);
  const r = await page.request.post('/api/v1/tel/simulateur', {
    headers: H,
    data: { de: `221${national}`, texte },
  });
  expect((await r.json()).resultat).toBe('validee');
}

async function verifierNumero(page: Page, national: string) {
  await page.getByTestId('tel-pays').selectOption('SN');
  await page
    .getByTestId('tel-numero')
    .fill(national.replace(/(\d\d)(\d{3})(\d\d)(\d\d)/, '$1 $2 $3 $4'));
  await page.getByTestId('tel-verifier').click();
  await expect(page.getByTestId('tel-ouvrir-wa')).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/221700000000\?text=/,
  );
  await envoyerMessage(page, national);
  await expect(page.getByTestId('tel-verifie')).toBeVisible({ timeout: 10_000 });
}

test('les trois façons d’entrer, dans l’ordre : Google, WhatsApp, e-mail (boutons de 44 px au moins)', async ({
  page,
}) => {
  for (const url of ['/inscription', '/connexion']) {
    await page.goto(url);
    const choix = page.getByTestId('choix-entree');
    await expect(choix).toBeVisible();
    const g = page.getByTestId('entree-google');
    const w = page.getByTestId('entree-whatsapp');
    await expect(g).toContainText('Continuer avec Google');
    await expect(w).toContainText('Avec mon numéro WhatsApp');
    await expect(page.getByTestId('entree-email-titre')).toBeVisible();
    const [bg, bw, be] = await Promise.all([
      g.boundingBox(),
      w.boundingBox(),
      page.locator('#email').boundingBox(),
    ]);
    expect(bg!.y).toBeLessThan(bw!.y);
    expect(bw!.y).toBeLessThan(be!.y);
    expect(bg!.height).toBeGreaterThanOrEqual(44);
    expect(bw!.height).toBeGreaterThanOrEqual(44);
    // aucun script ni ressource de Google dans la page (simple lien vers notre API)
    expect(await g.getAttribute('href')).toMatch(/^\/api\/v1\/auth\/google\/start\?intent=/);
    const externes = await page.evaluate(() =>
      [...document.querySelectorAll('script[src],link[href],img[src]')]
        .map((e) => e.getAttribute('src') ?? e.getAttribute('href') ?? '')
        .filter((u) => /google|gstatic|facebook|whatsapp/.test(u)),
    );
    expect(externes).toEqual([]);
  }
});

test('inscription par numéro WhatsApp (mode simulé) : vérification inversée, codes de récupération, connexion par le numéro', async ({
  page,
}) => {
  const national = numero();
  await page.goto('/inscription');
  await page.getByTestId('entree-whatsapp').click();
  await verifierNumero(page, national);
  await page.locator('#password').fill(password());
  await page.locator('#password-confirmer').fill(password());
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('etape-2')).toBeVisible();
  await etapeProfil(page, { kind: 'parent', pays: 'SN' });
  await etapeAccords(page);
  // codes de récupération : 8, montrés une fois, il faut confirmer les avoir recopiés
  await expect(page.getByTestId('codes-secours')).toBeVisible();
  await expect(page.getByTestId('code-secours')).toHaveCount(8);
  const premier = (await page.getByTestId('code-secours').first().textContent())!.trim();
  await expect(page.getByTestId('codes-continuer')).toBeDisabled();
  await page.getByTestId('codes-recopies').check();
  await page.getByTestId('codes-continuer').click();
  await expect(page).toHaveURL(/\/profils/);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  expect(me.account.email).toBeNull();
  expect(me.account.telephone).toBe(`+221 ••••••• ${national.slice(-2)}`);
  // déconnexion puis connexion par le numéro (forme nationale)
  await page.request.post('/api/v1/auth/logout', { headers: H });
  await page.goto('/connexion');
  await page.getByTestId('entree-whatsapp').click();
  await page.locator('#email').fill(national);
  await page.locator('#password').fill(password());
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/profils/);
  // mot de passe oublié avec un code de récupération (aucun envoi)
  await page.request.post('/api/v1/auth/logout', { headers: H });
  await page.goto('/acces');
  await page.getByTestId('voie-code').click();
  await page.getByTestId('oubli-identifiant').fill(`+221${national}`);
  await page.getByTestId('oubli-code').fill(premier.toLowerCase());
  const nouveau = `${password()} neuf`;
  await page.locator('#password').fill(nouveau);
  await page.locator('#password-confirmer').fill(nouveau);
  await page.getByTestId('oubli-valider').click();
  await expect(page.getByTestId('oubli-ok')).toBeVisible();
  const lg = await page.request.post('/api/v1/auth/login', {
    headers: H,
    data: { email: `+221${national}`, password: nouveau },
  });
  expect(lg.status()).toBe(200);
});

test('limite : un renvoi trop tôt est refusé avec un message clair', async ({ page }) => {
  const national = numero();
  await page.goto('/inscription');
  await page.getByTestId('entree-whatsapp').click();
  await page.getByTestId('tel-pays').selectOption('SN');
  await page.getByTestId('tel-numero').fill(national);
  await page.getByTestId('tel-verifier').click();
  await expect(page.getByTestId('tel-message')).toBeVisible();
  await page.getByText('Je n’ai pas pu envoyer le message').click();
  await page.getByTestId('tel-recommencer').click();
  await page.getByTestId('tel-numero').fill(national);
  await page.getByTestId('tel-verifier').click();
  await expect(page.getByTestId('tel-erreur')).toContainText(/Patientez \d+ secondes/);
});

test('« Continuer avec Google » (faux fournisseur local) : inscription aux mêmes étapes, puis connexion', async ({
  page,
}) => {
  const ident = {
    sub: `e2e-${test.info().project.name}-${Date.now()}`,
    email: `google.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.test`,
    name: 'Famille Google',
  };
  await page.request.post(`${process.env.E2E_OIDC_URL}/essai/identite`, { data: ident });
  await page.goto('/inscription');
  await page.getByTestId('entree-google').click();
  await expect(page.getByTestId('google-identite')).toContainText(ident.email);
  // mot de passe facultatif : on continue sans
  await page.getByTestId('etape-suivante').click();
  await etapeProfil(page, { kind: 'adulte', annee: 1990 });
  await etapeAccords(page);
  await expect(page).not.toHaveURL(/inscription/);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  expect(me.account).toMatchObject({ google: true, motDePasse: false, emailVerified: true });
  // connexion suivante par Google
  await page.request.post('/api/v1/auth/logout', { headers: H });
  await page.request.post(`${process.env.E2E_OIDC_URL}/essai/identite`, { data: ident });
  await page.goto('/connexion');
  await page.getByTestId('entree-google').click();
  await expect(page).not.toHaveURL(/connexion/);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
});

test('validation manuelle par l’administrateur (bêta, sans Meta)', async ({ page, browser }) => {
  const national = numero();
  await page.goto('/inscription');
  await page.getByTestId('entree-whatsapp').click();
  await page.getByTestId('tel-pays').selectOption('SN');
  await page.getByTestId('tel-numero').fill(national);
  await page.getByTestId('tel-verifier').click();
  await expect(page.getByTestId('tel-statut')).toContainText('validation par l’équipe');
  const code = /AWZID ([2-9A-HJKMNP-TV-Z]{6})/.exec(
    (await page.getByTestId('tel-message').textContent()) ?? '',
  )![1]!;
  const adm = await admin(browser, 'manuel');
  // liste de l'administrateur par l'API (l'écran est couvert par les maquettes : le navigateur de la VM partagée plante
  // parfois sur la page d'administration dans un second contexte, sur main aussi)
  const liste = (await (await adm.request.get('/api/v1/admin/telephone/attente')).json()) as {
    numeros: Array<{ id: string; numero: string; code: string }>;
  };
  const ligne = liste.numeros.find((n) => n.code === code)!;
  expect(ligne.numero).toBe(`+221 ••••• ${national.slice(-4)}`);
  expect(
    (
      await adm.request.post(`/api/v1/admin/telephone/attente/${ligne.id}/valider`, {
        headers: H,
        data: {},
      })
    ).status(),
  ).toBe(200);
  await expect(page.getByTestId('tel-verifie')).toBeVisible({ timeout: 10_000 });
  await adm.context().close();
});

test('inscription assistée : lien préparé par l’administrateur, la personne choisit un mot de passe', async ({
  page,
  browser,
}) => {
  const national = numero();
  const adm = await admin(browser, 'assistee');
  const r = await adm.request.post('/api/v1/admin/invitations', {
    headers: H,
    data: { numero: national, pays: 'SN', assistee: 'parent' },
  });
  expect(r.status()).toBe(201);
  const inv = (await r.json()) as { lien: string; lienWhatsapp: string };
  expect(inv.lienWhatsapp).toMatch(/^https:\/\/wa\.me\/221\d{9}\?text=/);
  await adm.context().close();
  await page.goto(new URL(inv.lien).pathname + new URL(inv.lien).hash);
  await expect(page.getByTestId('assistee-numero')).toContainText(national.slice(-2));
  await page.locator('#password').fill(password());
  await page.locator('#password-confirmer').fill(password());
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('type-parent')).toBeDisabled();
  await page.locator('#birthYear').fill('1980');
  await page.getByTestId('etape-suivante').click();
  await etapeAccords(page);
  await expect(page.getByTestId('codes-secours')).toBeVisible();
});

test('maquettes des écrans d’entrée (ordinateur, téléphone ; clair, sombre)', async ({
  page,
  browser,
}, info) => {
  const DIR = process.env.MAQUETTES_DIR;
  test.skip(!DIR || info.project.name !== 'desktop-chromium', 'maquettes : à la demande seulement');
  test.setTimeout(400_000);
  mkdirSync(DIR!, { recursive: true });
  // inscription assistée (lien préparé) et liste de validation manuelle de l'administrateur
  const adm = await admin(browser, 'maquettes');
  const inv = (await (
    await adm.request.post('/api/v1/admin/invitations', {
      headers: H,
      data: { numero: numero(), pays: 'SN', assistee: 'parent' },
    })
  ).json()) as { lien: string };
  await adm.context().close();
  const tailles: Array<[string, number, number]> = [
    ['ordi', 1440, 900],
    ['tel', 390, 844],
  ];
  for (const [appareil, w, h] of tailles) {
    await page.setViewportSize({ width: w, height: h });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const mode = scheme === 'light' ? 'clair' : 'sombre';
      const shot = async (nom: string) => {
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: join(DIR!, `entree-${nom}-${appareil}-${mode}.png`),
          fullPage: true,
        });
      };
      await page.goto('/inscription');
      // une vérification en attente (validation manuelle) est reprise sur l'appareil : on repart de zéro
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.getByTestId('choix-entree').waitFor();
      await shot('inscription-choix');
      await page.getByTestId('entree-whatsapp').click();
      await page.getByTestId('tel-numero').fill(numero());
      await shot('inscription-numero');
      await page.getByTestId('tel-verifier').click();
      await page.getByTestId('tel-message').waitFor();
      await shot('inscription-message-whatsapp');
      await page.goto('/connexion');
      await page.getByTestId('choix-entree').waitFor();
      await shot('connexion');
      await page.goto('/acces');
      await page.getByTestId('voie-code').click();
      await shot('oubli-code-recuperation');
      await page.goto(new URL(inv.lien).pathname + new URL(inv.lien).hash);
      await page.getByTestId('assistee-numero').waitFor();
      await shot('inscription-assistee');
    }
  }
});

test('maquettes de la liste de validation de l’administrateur', async ({ browser }, info) => {
  const DIR = process.env.MAQUETTES_DIR;
  test.skip(!DIR || info.project.name !== 'desktop-chromium', 'maquettes : à la demande seulement');
  mkdirSync(DIR!, { recursive: true });
  const adm = await admin(browser, 'maquettes-adm');
  for (const [appareil, w, h] of [
    ['ordi', 1440, 900],
    ['tel', 390, 844],
  ] as const)
    for (const scheme of ['light', 'dark'] as const) {
      await adm.setViewportSize({ width: w, height: h });
      await adm.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await adm.goto('/admin');
      await adm.getByTestId('tel-attente').screenshot({
        path: join(
          DIR!,
          `admin-validation-numeros-${appareil}-${scheme === 'light' ? 'clair' : 'sombre'}.png`,
        ),
      });
    }
});
