import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';
import { totp } from './totp';

/**
 * Lot F5 « performance + penser large » dans le navigateur :
 *  - un interrupteur coupe une fonction pour un rôle et un âge (écran de l'administrateur), sans redéploiement ;
 *  - canal bêta : une fonction en essai n'est montrée qu'aux comptes marqués ;
 *  - « Donner mon avis » : envoi avec image de l'écran, file de l'administrateur ;
 *  - tableau d'usage anonymisé (seuil 10) ;
 *  - hors ligne de l'élève complet ; pages rares et du personnel jamais préchargées.
 */

/** Administrateur neuf (outil staff), second facteur configuré ; renvoie sa page. */
async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-f5-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
  );
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adm = await ctx.newPage();
  const h = { 'x-awform': '1' };
  expect(
    (
      await adm.request.post('/api/v1/auth/login', {
        headers: h,
        data: { email, password: password() },
      })
    ).status(),
  ).toBe(200);
  const { secret } = (await (
    await adm.request.post('/api/v1/auth/totp/setup', { headers: h, data: {} })
  ).json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: h,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}
const H = { 'x-awform': '1' };
/** retire toutes les exceptions d'une fonction et remet son état de base (aucune trace pour les autres tests) */
async function remettre(adm: Page, cle: string) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string }> }>;
  };
  for (const r of d.fonctions.find((f) => f.cle === cle)?.regles ?? [])
    await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
  await adm.request.put(`/api/v1/admin/fonctions/${cle}`, { headers: H, data: { etat: 'on' } });
}
/** copie des décisions gardée sur l'appareil effacée (sinon elle vaut 5 minutes) */
const oublier = (p: Page) =>
  p.evaluate(() => {
    localStorage.removeItem('awzid.fonctions');
  });

test.describe('compte parent', () => {
  test.use({ compte: 'parent' });

  test('interrupteur : « Vivre l’islam » coupé pour les enfants (écran admin), refusé par le serveur, ouvert ailleurs', async ({
    page,
    browser,
  }) => {
    const adm = await admin(browser, 'fn');
    try {
      await adm.goto('/admin');
      const row = adm.getByTestId('admin-fonctions').locator('tr[data-fonction="vivre_islam"]');
      await row.getByTestId('fn-regle-ouvrir').click();
      await row.getByTestId('fn-effet').selectOption('off');
      await row.getByTestId('fn-role').selectOption('eleve');
      await row.getByTestId('fn-age').selectOption('enfant');
      await row.getByTestId('fn-regle-ajouter').click();
      await expect(row).toContainText('couper · Rôle : Élève · Âge : Enfant');

      // l'enfant : onglet sans contenu, et le serveur refuse ses données
      await pickProfile(page, 'Amina');
      await oublier(page);
      await page.goto('/vivre');
      await expect(
        page.getByText("Cette fonction n'est pas disponible pour le moment."),
      ).toBeVisible();
      await expect(page.getByTestId('vi-defi')).toHaveCount(0);
      const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
        profiles: Array<{ id: string; pseudonym: string }>;
      };
      const amina = me.profiles.find((p) => p.pseudonym === 'Amina')!;
      const r = await page.request.get(`/api/v1/profiles/${amina.id}/vivre`);
      expect(r.status()).toBe(403);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('fonction_coupee');
      const f = (await (await page.request.get(`/api/v1/fonctions?profil=${amina.id}`)).json()) as {
        fonctions: Record<string, boolean>;
      };
      expect(f.fonctions).toMatchObject({ vivre_islam: false, tuteur: true });

      // un adulte (autre rôle, autre âge) garde la fonction
      const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      const ad = await ctx.newPage();
      await newAdult(ad, 'f5-fn');
      await ad.goto('/vivre');
      await expect(ad.getByTestId('vi-defi')).toBeVisible();
      await ctx.close();

      // retrait de l'exception : de nouveau ouverte pour l'enfant
      await row.getByRole('button', { name: 'Retirer' }).click();
      await expect(row).not.toContainText('couper ·');
      await oublier(page);
      await page.goto('/vivre');
      await expect(page.getByTestId('vi-defi')).toBeVisible();
    } finally {
      await remettre(adm, 'vivre_islam');
      await adm.context().close();
    }
  });

  test('avis d’un enfant : catégorie seulement (aucun texte libre), envoyé', async ({ page }) => {
    await pickProfile(page, 'Yanis');
    await page.goto('/aujourdhui');
    await page.getByTestId('avis-ouvrir').click();
    const d = page.getByTestId('avis-dialogue');
    await expect(d).toContainText('Dis-nous ce que tu penses');
    await expect(d.locator('textarea')).toHaveCount(0);
    await d.getByText("J'aime").click();
    await d.getByTestId('avis-envoyer').click();
    await expect(d.getByTestId('avis-merci')).toBeVisible();
  });
});

test('canal bêta : fonction en essai montrée seulement aux comptes marqués', async ({
  page,
  browser,
}) => {
  const adm = await admin(browser, 'beta');
  try {
    const { email } = await newAdult(page, 'f5-beta');
    expect(
      (
        await adm.request.put('/api/v1/admin/fonctions/avis', {
          headers: H,
          data: { etat: 'beta' },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/plus');
    await oublier(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('avis-ouvrir')).toHaveCount(0);
    // l'administrateur ajoute ce compte au canal bêta (écran)
    await adm.goto('/admin');
    await adm.getByTestId('beta-email').fill(email);
    await adm.getByTestId('beta-ajouter').click();
    await expect(adm.getByTestId('admin-fonctions')).toContainText('Enregistré.');
    await oublier(page);
    await page.reload();
    await expect(page.getByTestId('avis-ouvrir')).toBeVisible();
    const f = (await (await page.request.get('/api/v1/fonctions')).json()) as { canal: string };
    expect(f.canal).toBe('beta');
    await adm.request.put('/api/v1/admin/beta', {
      headers: H,
      data: { type: 'compte', email, beta: false },
    });
  } finally {
    await remettre(adm, 'avis');
    await adm.context().close();
  }
});

test('« Donner mon avis » avec image de l’écran → file de l’administrateur ; usage anonymisé', async ({
  page,
  browser,
}) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  await newAdult(page, 'f5-avis');
  await page.goto('/plus');
  await page.getByTestId('avis-ouvrir').click();
  const d = page.getByTestId('avis-dialogue');
  await d.getByText('Une idée').click();
  await d.locator('textarea').fill(`Un mode nuit plus doux (${run})`);
  await d.getByTestId('avis-image').check();
  await expect(d.getByTestId('avis-apercu')).toBeVisible({ timeout: 15_000 });
  await d.getByTestId('avis-envoyer').click();
  await expect(d.getByTestId('avis-merci')).toBeVisible();

  // usage : une clé envoyée pour ce compte (une fois par jour)
  expect(
    (
      await page.request.post('/api/v1/usage', { headers: H, data: { cles: ['coran', 'hifz'] } })
    ).status(),
  ).toBe(204);

  const adm = await admin(browser, 'avis');
  try {
    await adm.goto('/admin');
    const item = adm.getByTestId('avisadm-avis').filter({ hasText: run });
    await expect(item).toContainText('Une idée');
    await expect(item).toContainText('Élève · Adulte');
    await expect(item).not.toContainText('@e2e.test');
    await item.getByRole('button', { name: "Voir l'image de l'écran" }).click();
    await expect(item.locator('img')).toBeVisible();
    await item.getByRole('button', { name: 'Traité' }).click();
    await expect(adm.getByTestId('avisadm-avis').filter({ hasText: run })).toHaveCount(0);

    // tableau d'usage : aucun chiffre sous 10 personnes, ni identifiant ni adresse
    const u = adm.getByTestId('admin-usage');
    await expect(u.locator('tr[data-cle="coran"]')).toContainText('moins de 10');
    await expect(u).not.toContainText('@');
    expect(await u.innerText()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    await expect(u.getByTestId('usage-jamais')).toContainText('certificats');
  } finally {
    await adm.context().close();
  }
});

test('hors ligne de l’élève complet ; pages rares et du personnel jamais préchargées', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const g = (await (await page.request.get('/groupes.json')).json()) as Record<string, string[]>;
  expect(g.personnel!.length).toBeGreaterThan(0);
  expect(g.rares!.length).toBeGreaterThan(0);
  expect(g.enLigne!.length).toBeGreaterThan(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mon arabe' })).toBeVisible();
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const out: string[] = [];
    for (const k of await caches.keys())
      if (k.startsWith('awform-shell'))
        for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  const exclus = [...g.personnel!, ...g.rares!, ...g.enLigne!];
  expect(cached.filter((p) => exclus.includes(p))).toEqual([]);
  expect(cached).toContain('/i18n/fr-quotidien.json');
  expect(cached).not.toContain('/i18n/fr-rares.json');

  // sans réseau : chaque espace de l'élève s'ouvre (aucune page d'erreur)
  await context.setOffline(true);
  const PAGES = [
    '/aujourdhui',
    '/coran',
    '/coran/lecteur',
    '/coran/ecouter',
    '/hifz',
    '/sciences',
    '/ecriture',
    '/lectures',
    '/revisions',
    '/quotidien',
    '/quotidien/adhkar',
    '/quotidien/qibla',
    '/quotidien/verset',
    '/vivre',
    '/plus',
    '/compte',
    '/hors-ligne',
    '/aide',
    '/sourates',
  ];
  for (const p of PAGES) {
    await page.goto(p);
    await expect(page.locator('h1').first(), p).toBeVisible();
    await expect(page.getByTestId('page-erreur'), p).toHaveCount(0);
  }
  // page rare, jamais ouverte en ligne : message clair (Internet nécessaire)
  await page.goto('/offres');
  await expect(page.getByTestId('page-en-ligne')).toBeVisible();
  await context.setOffline(false);
});
