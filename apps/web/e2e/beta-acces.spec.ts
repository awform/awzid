import { execFileSync } from 'node:child_process';
import type { Browser, Page, Route } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Bêta fermée sur invitation (bout en bout) :
 *  1. code d'invitation : création dans l'espace administrateur, lien personnel (code dans le fragment, effacé de la
 *     barre d'adresse), usage unique (le même code ne sert pas deux fois) ;
 *  2. mode « invitation » (écran) : le formulaire n'apparaît qu'avec un code reconnu ; liste d'attente : demande,
 *     acceptation par l'administrateur, code reçu qui ouvre l'inscription ;
 *  3. mode fermé (écran) : page de maintenance, la connexion de l'administrateur reste ouverte ;
 *  4. bandeau « Version bêta » : discret, fermable, la fermeture est retenue, sans la formule « validation humaine » ;
 *  5. invisible : robots.txt strict, pas de sitemap, noindex (en-tête et balise), pas d'aperçu social ; page d'état ;
 *     en-têtes de sécurité.
 * Le réglage GLOBAL du site (fermé, invitation) n'est jamais changé ici : l'autre suite tourne en parallèle sur le
 * même serveur ; l'état d'accès est simulé côté navigateur (route), le serveur est testé par apps/api/test/beta-acces.
 */

const H = { 'x-awform': '1' };

async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-ba-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
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

const unique = (p: string) =>
  `${p}-${test.info().project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

const signup = (page: Page, email: string, invitation?: string) =>
  page.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'adulte',
      email,
      password: password(),
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
      birthYear: new Date().getFullYear() - 30,
      pseudonym: 'Invité',
      ...(invitation ? { invitation } : {}),
    },
  });

/** Simule l'état d'accès vu par le navigateur (le serveur, lui, reste « ouvert » pour les autres tests). */
async function statut(
  page: Page,
  s: Partial<{
    mode: string;
    inscription: string;
    site: string;
    bandeau: string;
    verification: string;
    antibot: string;
    admin: boolean;
  }>,
) {
  await page.route('**/api/v1/acces/statut', (route: Route) =>
    route.fulfill({
      json: {
        mode: 'ouvert',
        inscription: 'ouverte',
        site: 'ouvert',
        bandeau: 'on',
        verification: 'souple',
        antibot: 'off',
        admin: false,
        ...s,
      },
    }),
  );
}

test.describe('invitation', () => {
  test('création par l’administrateur, lien personnel, usage unique', async ({ browser }) => {
    const adm = await admin(browser, 'inv');
    await adm.goto('/admin');
    await expect(adm.getByTestId('admin-acces')).toBeVisible();
    await adm.getByTestId('inv-libelle').fill('Relecteur e2e');
    await adm.getByTestId('inv-creer').click();
    const code = (await adm.getByTestId('inv-code').innerText()).trim();
    const lien = (await adm.getByTestId('inv-lien').innerText()).trim();
    expect(code).toMatch(/^AWZ-[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/);
    expect(lien).toContain(`/inscription#code=${code}`);
    // la liste ne garde que la fin du code
    await expect(adm.getByTestId('inv-liste')).toContainText('Relecteur e2e');
    await expect(adm.getByTestId('inv-liste')).not.toContainText(code);

    // la personne invitée ouvre le lien : invitation reconnue, code retiré de la barre d'adresse
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const invite = await ctx.newPage();
    await invite.goto(new URL(lien).pathname + new URL(lien).hash);
    await expect(invite.getByTestId('invitation-reconnue')).toBeVisible();
    expect(await invite.evaluate(() => location.hash)).toBe('');
    // inscription avec le code (une fois), puis refus
    expect((await signup(invite, unique('ok'), code)).status()).toBe(201);
    const second = await signup(invite, unique('deux'), code);
    expect(second.status()).toBe(403);
    expect((await second.json()).error.code).toBe('invitation_epuisee');
    // un code inventé est refusé même quand l'inscription est ouverte à tous
    expect((await signup(invite, unique('faux'), 'AWZ-22222-33333')).status()).toBe(403);
    await ctx.close();
    // l'administrateur voit l'invitation épuisée
    await adm.reload();
    await expect(
      adm.getByTestId('inv-liste').locator('[data-etat="epuisee"]').first(),
    ).toBeVisible();
    await adm.context().close();
  });

  test('révocation : le code ne sert plus', async ({ browser }) => {
    const adm = await admin(browser, 'rev');
    const r = await adm.request.post('/api/v1/admin/invitations', { headers: H, data: { max: 3 } });
    const { id, code } = (await r.json()) as { id: string; code: string };
    expect(
      (
        await adm.request.post(`/api/v1/admin/invitations/${id}/revoquer`, { headers: H, data: {} })
      ).status(),
    ).toBe(200);
    const res = await signup(adm, unique('rev'), code);
    expect((await res.json()).error.code).toBe('invitation_revoquee');
    await adm.context().close();
  });
});

test.describe('mode « invitation » et liste d’attente (écran)', () => {
  test('sans code : pas de formulaire ; demande d’invitation ; acceptation ; le code ouvre l’inscription', async ({
    browser,
    page,
  }) => {
    await statut(page, { inscription: 'invitation' });
    await page.goto('/inscription');
    await expect(page.getByTestId('porte-invitation')).toBeVisible();
    await expect(page.getByTestId('type-parent')).toHaveCount(0);
    // mauvais code
    await page.getByTestId('code-invitation').fill('AWZ-22222-33333');
    await page.getByRole('button', { name: /Vérifier le code/ }).click();
    await expect(page.getByTestId('erreur-code')).toContainText(/n’existe pas/);
    await expect(page.getByTestId('type-parent')).toHaveCount(0);

    // demande d'invitation
    const mail = unique('attente');
    await page.getByRole('button', { name: /Demander une invitation/ }).click();
    await page.getByTestId('attente-email').fill(mail);
    await page.getByTestId('attente-consentement').check();
    await page.getByTestId('attente-envoyer').click();
    await expect(page.getByTestId('attente-ok')).toBeVisible();

    // l'administrateur accepte : un code personnel est créé
    const adm = await admin(browser, 'att');
    await adm.goto('/admin');
    const ligne = adm.getByTestId('attente-demande').filter({ hasText: mail });
    await expect(ligne).toBeVisible();
    await ligne.getByTestId('attente-accepter').click();
    const code = (await adm.getByTestId('inv-code').innerText()).trim();
    await expect(adm.getByTestId('attente-demande').filter({ hasText: mail })).toHaveCount(0);

    // le code ouvre l'inscription (invitation personnelle : mention de l'adresse)
    await page.getByTestId('code-invitation').fill(code.toLowerCase());
    await page.getByRole('button', { name: /Vérifier le code/ }).click();
    await expect(page.getByTestId('invitation-reconnue')).toContainText(/personnelle/);
    await expect(page.getByTestId('type-parent')).toBeVisible();
    // une autre adresse n'entre pas avec ce code, la bonne oui
    expect((await signup(page, unique('autre'), code)).status()).toBe(403);
    expect((await signup(page, mail, code)).status()).toBe(201);
    await adm.context().close();
  });
});

test.describe('mode fermé (écran)', () => {
  test('page de maintenance sobre ; la connexion reste ouverte ; l’administrateur passe', async ({
    page,
  }) => {
    await statut(page, { site: 'ferme' });
    await page.goto('/');
    await expect(page.getByTestId('maintenance')).toBeVisible();
    await expect(page.getByTestId('maintenance')).toContainText(/momentanément fermé/);
    await page.goto('/lecons/en1.l01');
    await expect(page.getByTestId('maintenance')).toBeVisible();
    // la connexion (pour l'administrateur) reste accessible
    await page.goto('/connexion');
    await expect(page.getByTestId('maintenance')).toHaveCount(0);
    // un administrateur connecté voit le site
    await page.unroute('**/api/v1/acces/statut');
    await statut(page, { site: 'ferme', admin: true });
    await page.goto('/');
    await expect(page.getByTestId('maintenance')).toHaveCount(0);
  });
});

test.describe('bandeau « Version bêta »', () => {
  test('discret, fermable, retenu sur l’appareil, sans « validation humaine »', async ({
    page,
  }) => {
    await statut(page, { bandeau: 'on' });
    await page.goto('/');
    const b = page.getByTestId('bandeau-beta');
    await expect(b).toBeVisible();
    await expect(b).toContainText('Version bêta');
    await expect(b).toContainText('école mālikite');
    await expect(b).toContainText('seconde lecture savante');
    expect((await b.innerText()).toLowerCase()).not.toContain('validation humaine');
    // discret : au plus 3 lignes de petit texte
    const box = (await b.boundingBox())!;
    expect(box.height).toBeLessThan(110);
    const x = page.getByTestId('bandeau-beta-fermer');
    const xb = (await x.boundingBox())!;
    expect(Math.min(xb.width, xb.height)).toBeGreaterThanOrEqual(44);
    await x.click();
    await expect(b).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('bandeau-beta')).toHaveCount(0);
  });
  test('masqué par l’administrateur : jamais affiché', async ({ page }) => {
    await statut(page, { bandeau: 'off' });
    await page.goto('/');
    await page.waitForTimeout(800);
    await expect(page.getByTestId('bandeau-beta')).toHaveCount(0);
  });
  test('l’arabe a son propre texte, de droite à gauche, sur sa propre ligne', async ({ page }) => {
    await statut(page, { bandeau: 'on' });
    await page.goto('/');
    await expect(page.getByTestId('bandeau-beta')).toBeVisible();
    const ar = await page.request.get('/i18n/ar.json');
    const t = ((await ar.json()) as Record<string, string>)['bandeau.texte']!;
    expect(t).toMatch(/^[؀-ۿ]/);
    expect(t).not.toMatch(/[A-Za-z]/);
  });
});

test.describe('invisible et en-têtes', () => {
  test('robots.txt strict, aucun sitemap, noindex en-tête et balise, aucun aperçu social', async ({
    page,
    request,
  }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');
    // (l'en-tête X-Robots-Tag des fichiers statiques est posé par Caddy : contrôlé par smoke.sh et entetes-check.sh)
    for (const s of ['/sitemap.xml', '/sitemap_index.xml'])
      expect((await request.get(s)).status()).toBe(404);
    const r = await request.get('/', { headers: { accept: 'text/html' } });
    expect(r.headers()['x-robots-tag']).toBe(
      'noindex, nofollow, noarchive, nosnippet, noimageindex',
    );
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex, nofollow/,
    );
    expect(await page.locator('meta[property^="og:"], meta[name^="twitter:"]').count()).toBe(0);
    expect(await page.locator('link[rel="sitemap"]').count()).toBe(0);
  });
  test('en-têtes de sécurité de l’application', async ({ request }) => {
    const r = await request.get('/', { headers: { accept: 'text/html' } });
    const h = r.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-powered-by']).toBeUndefined();
  });
  test('sonde /healthz et page d’état', async ({ page, request }) => {
    const hz = await request.get('/healthz');
    expect(hz.status()).toBe(200);
    expect(await hz.json()).toEqual({ status: 'ok' });
    await page.goto('/etat.html');
    await expect(page.locator('#etat')).toHaveAttribute('data-etat', 'ok');
    await expect(page.locator('#etat')).toContainText(/fonctionne normalement/);
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toMatch(/noindex/);
  });
});

test.describe('plafond, liste d’attente automatique, anti-robots, vérification de l’adresse (écran)', () => {
  test('plafond atteint : l’inscription libre devient une liste d’attente, un code reste valable', async ({
    page,
  }) => {
    await statut(page, { mode: 'ouvert', inscription: 'attente' });
    await page.goto('/inscription');
    await expect(page.getByTestId('porte-invitation')).toContainText(/complètes pour le moment/);
    // la demande d'invitation est déjà ouverte
    await expect(page.getByTestId('liste-attente')).toBeVisible();
    await expect(page.getByTestId('type-parent')).toHaveCount(0);
    // ouvert avec de la place : le formulaire libre
    await page.unroute('**/api/v1/acces/statut');
    await statut(page, { mode: 'ouvert', inscription: 'ouverte' });
    await page.goto('/inscription');
    await expect(page.getByTestId('type-parent')).toBeVisible();
    await expect(page.getByTestId('porte-invitation')).toHaveCount(0);
  });

  test('anti-robots : le jeton est demandé, le champ piège est invisible et part avec la demande', async ({
    page,
  }) => {
    await statut(page, { antibot: 'on' });
    let jetonDemande = 0;
    await page.route('**/api/v1/acces/jeton', (route) => {
      jetonDemande++;
      return route.fulfill({ json: { jeton: '1800000000000.abc' } });
    });
    let corps: Record<string, unknown> | null = null;
    await page.route('**/api/v1/auth/signup', (route) => {
      corps = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 400,
        json: { error: { code: 'antibot_echec', raison: 'piege' } },
      });
    });
    await page.goto('/inscription');
    await expect(page.getByTestId('type-parent')).toBeVisible();
    await expect.poll(() => jetonDemande).toBeGreaterThan(0);
    // le champ piège ne se voit pas et ne reçoit pas le focus au clavier
    const piege = page.getByTestId('piege');
    expect(await piege.evaluate((el) => (el as HTMLInputElement).tabIndex)).toBe(-1);
    await expect(piege.locator('xpath=..')).toHaveAttribute('aria-hidden', 'true');
    const box = await piege.boundingBox();
    expect(box === null || box.x < 0 || box.width <= 1).toBe(true);
    // un robot le remplit : la demande part avec le champ et le jeton, le serveur (simulé) la refuse
    await piege.fill('http://spam.example', { force: true });
    await page.locator('#email').fill(unique('bot'));
    await page.locator('#password').fill('une phrase de passe assez longue 2026');
    await page.locator('#birthYear').fill('1990');
    await page.getByTestId('consent-cgu').check();
    await page.getByTestId('consent-art9').check();
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByTestId('erreur')).toContainText(/anti-robot/);
    expect(corps).toMatchObject({ jeton: '1800000000000.abc', site_web: 'http://spam.example' });
  });

  test('adresse à vérifier : le compte est renvoyé vers la page de vérification, qui renvoie le lien', async ({
    page,
  }) => {
    const email = unique('verif');
    const r = await signup(page, email);
    expect(r.status()).toBe(201);
    // (réglage simulé côté navigateur : le serveur de test reste en vérification « souple » pour les autres suites)
    await statut(page, { verification: 'requise' });
    await page.goto('/');
    await expect(page).toHaveURL(/\/acces\/verification/);
    await expect(page.getByTestId('verification-adresse')).toBeVisible();
    await page.getByTestId('ver-renvoyer').click();
    await expect(page.getByTestId('ver-renvoye')).toBeVisible();
    await page.getByTestId('ver-fait').click();
    await expect(page.getByTestId('ver-encore')).toBeVisible();
    // le compte et l'aide restent accessibles
    await page.goto('/compte');
    await expect(page).toHaveURL(/\/compte/);
  });
});

test.describe('espace administrateur : trois modes, plafond, tableau de bord', () => {
  test('un seul choix commute le mode ; le plafond se règle ; le tableau montre comptes, coût et alertes', async ({
    browser,
  }) => {
    const adm = await admin(browser, 'modes');
    // état simulé : aucun réglage RÉEL du site n'est touché (les autres suites tournent en parallèle)
    let reglages = {
      mode: 'ouvert',
      inscription: 'ouverte',
      site: 'ouvert',
      bandeau: 'on',
      plafond: 50,
      verification: 'souple',
      antibot: 'off',
    };
    const envoyes: Array<Record<string, unknown>> = [];
    await adm.route('**/api/v1/admin/acces', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        envoyes.push(body);
        reglages = { ...reglages, ...body } as typeof reglages;
        if (body.mode) {
          reglages.mode = String(body.mode);
          reglages.site = body.mode === 'ferme' ? 'ferme' : 'ouvert';
          if (body.mode !== 'ferme')
            reglages.inscription = body.mode === 'invitation' ? 'invitation' : 'ouverte';
        }
        return route.fulfill({ json: { acces: reglages } });
      }
      return route.fulfill({
        json: { acces: reglages, invitations: [], attente: {}, courriel: 'journal' },
      });
    });
    await adm.route('**/api/v1/admin/tableau', (route) =>
      route.fulfill({
        json: {
          mode: reglages.mode,
          verification: reglages.verification,
          antibot: reglages.antibot,
          comptes: {
            total: 47,
            parents: 20,
            adultes: 27,
            dernieres24h: 3,
            septJours: 12,
            nonVerifies: 2,
            nonVerifiesEnRetard: 0,
            plafond: reglages.plafond,
            pourcentPlafond: Math.round((47 / reglages.plafond) * 100),
          },
          attente: { enAttente: 4, invitationsActives: 6 },
          couts: {
            tuteurUsd: 1.5,
            tuteurQuestions: 12,
            stockageOctets: 5242880,
            recitationsAujourdhui: 3,
            fixeJourEur: 1,
            estimeJourEur: 2.38,
            seuilAlerteEur: 3,
          },
          plafonds: [
            { cle: 'tuteur', valeur: '1 $ / mois' },
            { cle: 'ecoute', valeur: '60 / h' },
            { cle: 'voix', valeur: 'pré-généré' },
            { cle: 'stockage', valeur: '30 Mo' },
            { cle: 'avis', valeur: '5 / jour' },
          ],
          alertes:
            reglages.plafond <= 50
              ? [
                  { code: 'plafond_proche', niveau: 'attention' },
                  { code: 'attente', niveau: 'info' },
                ]
              : [],
        },
      }),
    );
    await adm.goto('/admin');
    const modes = adm.getByTestId('acces-modes');
    await expect(modes).toBeVisible();
    await expect(modes).toHaveAttribute('data-mode', 'ouvert');
    // tableau de bord
    await expect(adm.getByTestId('tab-comptes')).toContainText('47 sur 50');
    await expect(adm.getByTestId('tab-cout')).toContainText('2.38');
    await expect(
      adm.getByTestId('tab-alertes').locator('[data-code="plafond_proche"]'),
    ).toBeVisible();
    // « sur invitation » en un clic
    await adm.getByTestId('mode-invitation').check();
    await expect(modes).toHaveAttribute('data-mode', 'invitation');
    expect(envoyes.at(-1)).toEqual({ mode: 'invitation' });
    // « fermé » demande une confirmation, puis le retour arrière (ouvert) se fait en un clic
    adm.once('dialog', (d) => void d.accept());
    await adm.getByTestId('mode-ferme').check();
    await expect(modes).toHaveAttribute('data-mode', 'ferme');
    expect(envoyes.at(-1)).toEqual({ mode: 'ferme' });
    await adm.getByTestId('mode-ouvert').check();
    await expect(modes).toHaveAttribute('data-mode', 'ouvert');
    expect(envoyes.at(-1)).toEqual({ mode: 'ouvert' });
    // plafond d'inscriptions
    await adm.getByTestId('acces-plafond').fill('200');
    await adm.getByTestId('acces-plafond-ok').click();
    await expect.poll(() => envoyes.at(-1)).toEqual({ plafond: 200 });
    await expect(adm.getByTestId('tab-comptes')).toContainText('47 sur 200');
    // vérification de l'adresse et anti-robots
    await adm.getByTestId('acces-basculer-verification').click();
    await expect.poll(() => envoyes.at(-1)).toEqual({ verification: 'requise' });
    await adm.getByTestId('acces-basculer-antibot').click();
    await expect.poll(() => envoyes.at(-1)).toEqual({ antibot: 'on' });
    await adm.context().close();
  });

  test('le vrai serveur : tableau de bord réel et réglages lus', async ({ browser }) => {
    const adm = await admin(browser, 'tableau');
    const t = await adm.request.get('/api/v1/admin/tableau');
    expect(t.status()).toBe(200);
    const d = (await t.json()) as {
      comptes: { total: number; plafond: number };
      plafonds: unknown[];
      alertes: unknown[];
    };
    expect(d.comptes.total).toBeGreaterThan(0);
    expect(d.comptes.plafond).toBeGreaterThan(0);
    expect(d.plafonds).toHaveLength(5);
    const a = await adm.request.get('/api/v1/admin/acces');
    expect((await a.json()).acces.mode).toBe('ouvert');
    await adm.context().close();
  });
});
