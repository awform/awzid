import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page, Route } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { remplirInscription } from './inscription';
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
    await expect(page.getByTestId('inscription-form')).toHaveCount(0);
    // mauvais code
    await page.getByTestId('code-invitation').fill('AWZ-22222-33333');
    await page.getByRole('button', { name: /Vérifier le code/ }).click();
    await expect(page.getByTestId('erreur-code')).toContainText(/n’existe pas/);
    await expect(page.getByTestId('inscription-form')).toHaveCount(0);

    // demande d'invitation
    const mail = unique('attente');
    await page.getByRole('button', { name: /Demander une invitation/ }).click();
    await page.getByTestId('attente-email').fill(mail);
    await page.getByTestId('attente-consentement').check();
    await page.getByTestId('attente-envoyer').click();
    await expect(page.getByTestId('attente-ok')).toBeVisible();
    // double consentement : l'adresse n'est visible de l'administrateur qu'après le clic sur le lien de l'e-mail
    // (boîte de démonstration : aucun envoi réel)
    let jeton = '';
    await expect
      .poll(
        () => {
          const dir = process.env.E2E_MAIL_DIR!;
          for (const f of readdirSync(dir)
            .filter((x) => x.endsWith('.json'))
            .sort()
            .reverse()) {
            const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
            if (m.to === mail && m.kind === 'liste_attente') {
              jeton = /#t=([\w-]+)/.exec(m.text)![1]!;
              return true;
            }
          }
          return false;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    expect(
      (
        await page.request.post('/api/v1/acces/liste-attente/confirmer', {
          headers: H,
          data: { token: jeton },
        })
      ).status(),
    ).toBe(200);

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
    await expect(page.getByTestId('inscription-form')).toBeVisible();
    // une autre adresse n'entre pas avec ce code, la bonne oui
    expect((await signup(page, unique('autre'), code)).status()).toBe(403);
    expect((await signup(page, mail, code)).status()).toBe(201);
    await adm.context().close();
  });
});

test.describe('liste d’attente : effacement par l’administrateur (écran)', () => {
  test('bouton « Effacer la demande » : confirmation, la demande disparaît, une seconde fois introuvable', async ({
    browser,
    page,
  }) => {
    await statut(page, { inscription: 'invitation' });
    await page.goto('/inscription');
    const mail = unique('effacer');
    await page.getByRole('button', { name: /Demander une invitation/ }).click();
    await page.getByTestId('attente-email').fill(mail);
    await page.getByTestId('attente-consentement').check();
    await page.getByTestId('attente-envoyer').click();
    await expect(page.getByTestId('attente-ok')).toBeVisible();
    let jeton = '';
    await expect
      .poll(
        () => {
          const dir = process.env.E2E_MAIL_DIR!;
          for (const f of readdirSync(dir)
            .filter((x) => x.endsWith('.json'))
            .sort()
            .reverse()) {
            const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
            if (m.to === mail && m.kind === 'liste_attente') {
              jeton = /#t=([\w-]+)/.exec(m.text)![1]!;
              return true;
            }
          }
          return false;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    expect(
      (
        await page.request.post('/api/v1/acces/liste-attente/confirmer', {
          headers: H,
          data: { token: jeton },
        })
      ).status(),
    ).toBe(200);

    const adm = await admin(browser, 'eff');
    await adm.goto('/admin');
    const ligne = adm.getByTestId('attente-demande').filter({ hasText: mail });
    await expect(ligne).toBeVisible();
    // refus de la confirmation : la demande reste
    adm.once('dialog', (d) => d.dismiss());
    await ligne.getByTestId('attente-effacer').click();
    await expect(ligne).toBeVisible();
    // confirmation : la demande est effacée
    adm.once('dialog', (d) => d.accept());
    await ligne.getByTestId('attente-effacer').click();
    await expect(adm.getByTestId('attente-demande').filter({ hasText: mail })).toHaveCount(0);
    const liste = await adm.request.get('/api/v1/admin/liste-attente');
    expect(JSON.stringify(await liste.json())).not.toContain(mail);
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
    await expect(b).toContainText('en attente de relecture');
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
    await expect(page.getByTestId('inscription-form')).toHaveCount(0);
    // ouvert avec de la place : le formulaire libre
    await page.unroute('**/api/v1/acces/statut');
    await statut(page, { mode: 'ouvert', inscription: 'ouverte' });
    await page.goto('/inscription');
    await expect(page.getByTestId('inscription-form')).toBeVisible();
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
    await expect(page.getByTestId('inscription-form')).toBeVisible();
    await expect.poll(() => jetonDemande).toBeGreaterThan(0);
    // le champ piège ne se voit pas et ne reçoit pas le focus au clavier
    const piege = page.getByTestId('piege');
    expect(await piege.evaluate((el) => (el as HTMLInputElement).tabIndex)).toBe(-1);
    await expect(piege.locator('xpath=..')).toHaveAttribute('aria-hidden', 'true');
    const box = await piege.boundingBox();
    expect(box === null || box.x < 0 || box.width <= 1).toBe(true);
    // un robot le remplit : la demande part avec le champ et le jeton, le serveur (simulé) la refuse
    await piege.fill('http://spam.example', { force: true });
    await remplirInscription(page, {
      email: unique('bot'),
      motDePasse: 'une phrase de passe assez longue 2026',
      annee: 1990,
    });
    await expect(page.getByTestId('erreur')).toContainText(/anti-robot/);
    expect(corps).toMatchObject({ jeton: '1800000000000.abc', site_web: 'http://spam.example' });
  });

  test('provenance des affiches : ?src= retenu pour l’onglet et envoyé avec l’inscription, sans cookie', async ({
    page,
    context,
  }) => {
    let corps: Record<string, unknown> | null = null;
    await page.route('**/api/v1/auth/signup', (route) => {
      corps = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 429, json: { error: { code: 'trop_de_demandes' } } });
    });
    // arrivée par le code QR sur une autre page, puis l'inscription sans ?src= : la provenance suit dans l'onglet
    await page.goto('/connexion?src=affiche-e2e');
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('awzid_src')))
      .toBe('affiche-e2e');
    await page.goto('/inscription');
    await expect(page.getByTestId('inscription-form')).toBeVisible();
    await remplirInscription(page, {
      email: unique('src'),
      motDePasse: 'une phrase de passe assez longue 2026',
      annee: 1990,
    });
    await expect.poll(() => corps).not.toBeNull();
    expect(corps).toMatchObject({ src: 'affiche-e2e' });
    // valeur invalide : ignorée (la précédente, valide, reste celle de l'onglet)
    await page.goto('/inscription?src=Pas%20valide');
    expect(await page.evaluate(() => sessionStorage.getItem('awzid_src'))).toBe('affiche-e2e');
    expect((await context.cookies()).filter((c) => /src/i.test(c.name))).toEqual([]);
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
      qf_profils_enfants: 'off',
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
            fixeJourEur: 2,
            estimeJourEur: 3.38,
            seuilAlerteEur: 4,
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
          origines: [
            {
              source: 'affiche',
              demandes30j: 7,
              demandes: 31,
              inscriptions30j: 2,
              inscriptions: 9,
            },
            { source: null, demandes30j: 1, demandes: 4, inscriptions30j: 5, inscriptions: 38 },
          ],
        },
      }),
    );
    await adm.goto('/admin');
    const modes = adm.getByTestId('acces-modes');
    await expect(modes).toBeVisible();
    await expect(modes).toHaveAttribute('data-mode', 'ouvert');
    // tableau de bord
    await expect(adm.getByTestId('tab-comptes')).toContainText('47 sur 50');
    await expect(adm.getByTestId('tab-cout')).toContainText('3.38');
    await expect(
      adm.getByTestId('tab-alertes').locator('[data-code="plafond_proche"]'),
    ).toBeVisible();
    // « Origine des demandes » : nombres par provenance (30 jours, total), sans adresse
    const origines = adm.getByTestId('tab-origines');
    await expect(origines.locator('tr[data-source="affiche"] td')).toHaveText([
      '7',
      '31',
      '2',
      '9',
    ]);
    await expect(origines.locator('tr[data-source=""] th')).toContainText('Sans provenance');
    await expect(origines).not.toContainText('@');
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
    // Quran Foundation et profils d'enfants : désactivé par défaut, activable (après accord écrit de la Quran Foundation)
    await expect(adm.getByTestId('acces-qf-enfants')).toContainText('désactivée');
    await adm.getByTestId('acces-basculer-qf-enfants').click();
    await expect.poll(() => envoyes.at(-1)).toEqual({ qf_profils_enfants: 'on' });
    await expect(adm.getByTestId('acces-qf-enfants')).toContainText('activée');
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

test.describe('accueil de la bêta pour un visiteur (awzid.com)', () => {
  test.use({ compte: null });
  test('« sur invitation » : présentation courte, « Bêta sur invitation », code, liste d’attente ; l’application reste fermée', async ({
    page,
  }) => {
    await statut(page, { mode: 'invitation', inscription: 'invitation' });
    for (const chemin of ['/', '/lecons/en1.l01', '/coran/lecteur']) {
      await page.goto(chemin);
      await expect(page.getByTestId('accueil-visiteur')).toBeVisible();
      await expect(page.getByTestId('accueil-beta')).toHaveText('Bêta sur invitation');
    }
    await expect(page.getByTestId('accueil-visiteur')).toContainText(/arabe/);
    // aucune carte de livre n'est montrée au visiteur
    await expect(page.getByTestId('level')).toHaveCount(0);
    // « Demander une invitation » ouvre la liste d'attente
    await page.getByTestId('accueil-demander').click();
    await expect(page).toHaveURL(/\/inscription/);
    await expect(page.getByTestId('liste-attente')).toBeVisible();
    // « J'ai un code » mène à la saisie du code
    await page.goto('/');
    await page.getByTestId('accueil-code').click();
    await expect(page.getByTestId('code-invitation')).toBeVisible();
    // la connexion et les pages légales restent ouvertes
    await page.goto('/connexion');
    await expect(page.getByTestId('accueil-visiteur')).toHaveCount(0);
    await page.goto('/legal/cgu');
    await expect(page.getByTestId('accueil-visiteur')).toHaveCount(0);
    // noindex aussi sur cet écran
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('mode ouvert ou compte connecté : pas d’accueil de la bêta', async ({ page }) => {
    await statut(page, { mode: 'ouvert', inscription: 'ouverte' });
    await page.goto('/');
    await expect(page.getByTestId('accueil-visiteur')).toHaveCount(0);
    await page.unroute('**/api/v1/acces/statut');
    await statut(page, { mode: 'invitation', inscription: 'invitation' });
    const r = await signup(page, unique('conn'));
    expect(r.status()).toBe(201);
    await page.goto('/');
    await expect(page.getByTestId('accueil-visiteur')).toHaveCount(0);
  });
});

test.describe('Quran Foundation et profils d’enfants (serveur réel)', () => {
  test('un enfant n’a ni récitateurs en ligne ni Muṣḥaf exact par défaut ; ados et adultes les gardent', async ({
    page,
  }) => {
    const r = await signup(page, unique('qfp'));
    expect(r.status()).toBe(201);
    const moi = (await r.json()) as { profiles: Array<{ id: string }> };
    const adulte = (await (
      await page.request.get(`/api/v1/fonctions?profil=${moi.profiles[0]!.id}`)
    ).json()) as {
      fonctions: Record<string, boolean>;
    };
    expect([adulte.fonctions.recitateurs_en_ligne, adulte.fonctions.mushaf_exact]).toEqual([
      true,
      true,
    ]);
    // un parent crée un profil d'enfant
    const p = await page.request.post('/api/v1/auth/signup', {
      headers: H,
      data: {
        kind: 'parent',
        email: unique('qfpar'),
        password: password(),
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
        birthYear: new Date().getFullYear() - 38,
      },
    });
    expect(p.status()).toBe(201);
    const enfant = await page.request.post('/api/v1/profiles', {
      headers: H,
      data: {
        pseudonym: 'Petit',
        birthYear: new Date().getFullYear() - 8,
        levelCode: 'en1',
        password: password(),
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      },
    });
    expect(enfant.status(), await enfant.text()).toBe(201);
    const kid = ((await enfant.json()) as { id: string }).id;
    const f = (await (await page.request.get(`/api/v1/fonctions?profil=${kid}`)).json()) as {
      fonctions: Record<string, boolean>;
    };
    expect([f.fonctions.recitateurs_en_ligne, f.fonctions.mushaf_exact]).toEqual([false, false]);
    // le refus serveur (403 fonction_coupee) est vérifié par apps/api/test/beta-modes.test.ts
  });
});
