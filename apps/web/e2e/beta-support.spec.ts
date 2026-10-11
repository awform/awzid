import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';
import { totp } from './totp';

/**
 * Bêta-support :
 *  1. « Mettre à jour » : une nouvelle version du service worker (simulée par un second enregistrement du même
 *     script sous une autre adresse, comme le fait un nouveau déploiement) prête → bandeau discret ; jamais pendant
 *     une leçon ou une écoute, jamais hors ligne, jamais en boucle ; « Mettre à jour » = la nouvelle version prend
 *     la main et la page est rechargée ;
 *  2. « Signaler un problème » : formulaire (catégorie, description, image facultative), page et version jointes,
 *     enfant sans texte libre, file de l'administrateur avec statut, limite anti-abus.
 */

const H = { 'x-awform': '1' };

/** Administrateur neuf (outil staff), second facteur configuré ; renvoie sa page. */
async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-bs-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
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

// ------------------------------------------------------------------ « Mettre à jour »

/** Page ouverte, service worker actif et aux commandes de la page. */
async function pageControlee(page: Page, chemin: string) {
  await page.goto(chemin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
/** Une « nouvelle version » : même script, autre adresse ; reste EN ATTENTE tant que l'ancienne tourne. */
async function nouvelleVersion(page: Page, v = 'v2') {
  await page.evaluate(
    (adresse) => navigator.serviceWorker.register(adresse, { scope: '/' }).then(() => undefined),
    `/service-worker.js?${v}`,
  );
  await expect
    .poll(() =>
      page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    )
    .toBe(true);
}
const bandeau = (page: Page) => page.getByTestId('maj-bandeau');
const controleur = (page: Page) =>
  page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');

test.describe('« Mettre à jour »', () => {
  test('aucune nouvelle version : aucun bandeau', async ({ page }) => {
    await pageControlee(page, '/plus');
    await page.waitForTimeout(1500);
    await expect(bandeau(page)).toHaveCount(0);
  });

  test('nouvelle version prête : bandeau nommé, « Mettre à jour » = nouvelle version aux commandes, rechargement, jamais en boucle', async ({
    page,
  }) => {
    await pageControlee(page, '/plus');
    expect(await controleur(page)).not.toContain('v2');
    await page.evaluate(() => ((window as unknown as { __avant: number }).__avant = 1));
    await nouvelleVersion(page);
    // la version n'est JAMAIS appliquée toute seule
    await expect(bandeau(page)).toBeVisible();
    await expect(bandeau(page)).toContainText('Une nouvelle version est prête');
    expect(await controleur(page)).not.toContain('v2');
    // le nom de l'action est écrit sur le bouton
    await page.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect
      .poll(
        () =>
          page
            .evaluate(() => (window as unknown as { __avant?: number }).__avant)
            .catch(() => 'navigation'),
        {
          timeout: 15_000,
        },
      )
      .toBeUndefined(); // page rechargée
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => controleur(page), { timeout: 15_000 }).toContain('v2');
    // pas de boucle : après le rechargement, le bandeau ne revient pas (garde de 2 minutes)
    await page.waitForTimeout(2500);
    await expect(bandeau(page)).toHaveCount(0);
  });

  test('« Plus tard » range le bandeau', async ({ page }) => {
    await pageControlee(page, '/plus');
    await nouvelleVersion(page);
    await expect(bandeau(page)).toBeVisible();
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await expect(bandeau(page)).toHaveCount(0);
  });

  test('jamais pendant une leçon : il attend la fin, puis apparaît', async ({ page }) => {
    await pageControlee(page, '/lecons/en1.l03');
    await expect(page.locator('h1')).toBeVisible();
    await nouvelleVersion(page);
    await page.waitForTimeout(1500);
    await expect(bandeau(page)).toHaveCount(0);
    // fin de la leçon : retour à un autre écran (sans recharger la page)
    await page.locator('a[href="/plus"]').first().click();
    await expect(page).toHaveURL(/\/plus$/);
    await expect(bandeau(page)).toBeVisible();
  });

  test('jamais pendant une écoute : il attend la pause', async ({ page }) => {
    await pageControlee(page, '/plus');
    // écoute silencieuse (WAV de 1 s en mémoire, en boucle, rattachée à la page)
    await page.evaluate(async () => {
      const n = 8000;
      const b = new Uint8Array(44 + n).fill(128);
      const dv = new DataView(b.buffer);
      const s = (o: number, t: string) => [...t].forEach((c, i) => b.set([c.charCodeAt(0)], o + i));
      s(0, 'RIFF');
      dv.setUint32(4, 36 + n, true);
      s(8, 'WAVEfmt ');
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 1, true);
      dv.setUint32(24, 8000, true);
      dv.setUint32(28, 8000, true);
      dv.setUint16(32, 1, true);
      dv.setUint16(34, 8, true);
      s(36, 'data');
      dv.setUint32(40, n, true);
      const a = document.createElement('audio');
      a.id = 'ecoute-test';
      a.muted = true;
      a.loop = true;
      a.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      document.body.append(a);
      await a.play();
    });
    await expect
      .poll(() =>
        page.evaluate(() => !document.querySelector<HTMLAudioElement>('#ecoute-test')!.paused),
      )
      .toBe(true);
    await nouvelleVersion(page);
    await page.waitForTimeout(1500);
    await expect(bandeau(page)).toHaveCount(0);
    await page.evaluate(() => document.querySelector<HTMLAudioElement>('#ecoute-test')!.pause());
    await expect(bandeau(page)).toBeVisible();
  });

  test('hors ligne : rien n’est proposé ; au retour du réseau, le bandeau revient', async ({
    page,
    context,
  }) => {
    await pageControlee(page, '/plus');
    await nouvelleVersion(page);
    await expect(bandeau(page)).toBeVisible();
    await context.setOffline(true);
    await expect(bandeau(page)).toHaveCount(0);
    await context.setOffline(false);
    await expect(bandeau(page)).toBeVisible();
  });
});

// ------------------------------------------------------------------ « Signaler un problème »

test.describe('« Signaler un problème »', () => {
  test('adulte : formulaire nommé dans « Plus » et « Aide », envoi avec image, file de l’administrateur (statuts), aucune donnée superflue', async ({
    page,
    browser,
  }) => {
    const run = `${test.info().project.name}-${Date.now()}`;
    await newAdult(page, 'bs-signal');
    await page.goto('/aide');
    await expect(page.getByRole('button', { name: 'Signaler un problème' })).toBeVisible();
    await page.goto('/plus');
    // le nom de l'action est écrit à côté de l'icône
    await page.getByRole('button', { name: 'Signaler un problème' }).click();
    const d = page.getByTestId('probleme-dialogue');
    await expect(d).toContainText('Un point religieux à vérifier');
    await expect(d.getByTestId('probleme-joint')).toContainText('version');
    await d.getByText('Un contenu à corriger').click();
    // description obligatoire pour un adulte
    await expect(d.getByTestId('probleme-envoyer')).toBeDisabled();
    await d.locator('textarea').fill(`Une faute dans la consigne (${run})`);
    await d.getByTestId('probleme-image').check();
    await expect(d.getByTestId('probleme-apercu')).toBeVisible({ timeout: 15_000 });
    await d.getByTestId('probleme-envoyer').click();
    await expect(d.getByTestId('probleme-merci')).toBeVisible();

    const adm = await admin(browser, 'signal');
    try {
      await adm.goto('/admin');
      const item = adm.getByTestId('probadm-signalement').filter({ hasText: run });
      await expect(item).toContainText('Un contenu à corriger');
      await expect(item).toContainText('Élève · Adulte');
      await expect(item).toContainText('Page : /plus');
      await expect(item).toContainText('Version :');
      await expect(item).not.toContainText('@e2e.test');
      await item.getByRole('button', { name: "Voir l'image de l'écran" }).click();
      await expect(item.locator('img')).toBeVisible();
      // statuts : nouveau → en cours → réglé
      await item.getByRole('button', { name: 'En cours' }).click();
      await expect(adm.getByTestId('probadm-signalement').filter({ hasText: run })).toHaveCount(0);
      await adm.getByTestId('probadm-filtre').selectOption('en_cours');
      const encours = adm.getByTestId('probadm-signalement').filter({ hasText: run });
      await expect(encours).toHaveCount(1);
      await encours.getByRole('button', { name: 'Réglé' }).click();
      await adm.getByTestId('probadm-filtre').selectOption('regle');
      await expect(adm.getByTestId('probadm-signalement').filter({ hasText: run })).toHaveCount(1);
    } finally {
      await adm.context().close();
    }
  });

  test('limite anti-abus : 5 signalements par jour, puis message clair', async ({ page }) => {
    await newAdult(page, 'bs-abus');
    for (let i = 0; i < 5; i++)
      expect(
        (
          await page.request.post('/api/v1/problemes', {
            headers: H,
            data: { categorie: 'autre', texte: `essai ${i}` },
          })
        ).status(),
      ).toBe(201);
    await page.goto('/plus');
    await page.getByRole('button', { name: 'Signaler un problème' }).click();
    const d = page.getByTestId('probleme-dialogue');
    await d.getByText('Autre chose').click();
    await d.locator('textarea').fill('encore un');
    await d.getByTestId('probleme-envoyer').click();
    await expect(d.getByRole('alert')).toContainText('plusieurs signalements');
  });

  test.describe('compte parent', () => {
    test.use({ compte: 'parent' });
    test('enfant : catégorie seulement (ni texte libre, ni image), envoyé', async ({ page }) => {
      await pickProfile(page, 'Yanis');
      await page.goto('/aide');
      await page.getByRole('button', { name: 'Signaler un problème' }).click();
      const d = page.getByTestId('probleme-dialogue');
      await expect(d).toContainText('Dis-nous ce qui ne va pas');
      await expect(d.locator('textarea')).toHaveCount(0);
      await expect(d.getByTestId('probleme-image')).toHaveCount(0);
      await d.getByText('Quelque chose ne marche pas').click();
      await d.getByTestId('probleme-envoyer').click();
      await expect(d.getByTestId('probleme-merci')).toBeVisible();
    });
  });
});
