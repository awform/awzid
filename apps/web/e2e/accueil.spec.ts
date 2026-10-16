import AxeBuilder from '@axe-core/playwright';
import type { Page, Request, Route } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { expect, test } from './fixtures';

/**
 * Page d'accueil publique (liste d'attente de la bêta fermée), servie par le serveur web à l'adresse /bienvenue (et sur « / »
 * pour un visiteur sans session quand le site est « sur invitation » : réglage testé à part, src/lib/accueil.test.ts, car
 * le mode d'accès du serveur de test est partagé avec les autres suites et n'est jamais changé ici).
 * Vérifie : affichage, poids et ressources, absence de suivi, soumission réelle au mécanisme existant de l'API, protections
 * anti-robots et erreurs, accessibilité de base (axe, clavier), mode sombre, langues.
 */
test.use({ compte: null });

const URL_PAGE = '/bienvenue';
const unique = () =>
  `accueil-${test.info().project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

async function ouvrir(page: Page, chemin = URL_PAGE) {
  await page.goto(chemin);
  await page.locator('h1').waitFor();
}

test.describe('affichage', () => {
  test('message principal, bêta fermée, un seul bouton, RGPD, pied de page', async ({ page }) => {
    const r = await page.goto(URL_PAGE);
    expect(r?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('h1')).toHaveText(
      'Apprendre l’arabe, le Coran et les bases de la religion, pas à pas, en famille',
    );
    await expect(page.getByText('Bêta fermée sur invitation').first()).toBeVisible();
    // en-tête : « Se connecter » ; héros : un appel principal vers le formulaire, un lien secondaire
    await expect(
      page.locator('header').getByRole('link', { name: 'Se connecter' }),
    ).toHaveAttribute('href', '/connexion');
    await expect(page.locator('a.btn')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Demander une invitation' })).toHaveAttribute(
      'href',
      '#inviter',
    );
    await expect(page.getByRole('link', { name: 'J’ai déjà une invitation' })).toHaveAttribute(
      'href',
      '/inscription',
    );
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Demander une invitation' })).toBeVisible();
    for (const mot of ['Finalité', 'Base légale', 'Durée', 'Destinataires', 'Vos droits'])
      await expect(page.getByText(mot).first()).toBeAttached();
    await expect(
      page.getByText('Texte provisoire, en attente d’une relecture juridique.'),
    ).toBeAttached();
    const pied = page.locator('footer');
    await expect(pied.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute(
      'href',
      '/legal/mentions',
    );
    await expect(pied.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
      'href',
      '/legal/confidentialite',
    );
    await expect(pied.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      'mailto:contact@awzid.com',
    );
    // trois univers, quatre publics, trois étapes, trois engagements ; un seul h1, sections titrées
    const section = (nom: string) => page.getByRole('region', { name: nom });
    await expect(section('Trois univers pour grandir').locator('h3')).toHaveText([
      'Arabe',
      'Coran',
      'Vivre l’islam',
    ]);
    await expect(section('Pour qui ?').locator('h3')).toHaveText([
      'Parents et enfants',
      'Adolescents',
      'Adultes',
      'Écoles et mosquées',
    ]);
    await expect(section('Comment ça marche').locator('li')).toHaveCount(3);
    await expect(section('Un cadre de confiance').locator('h3')).toHaveCount(3);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('« Demander une invitation » mène au formulaire de liste d’attente', async ({ page }) => {
    await ouvrir(page);
    await page.getByRole('link', { name: 'Demander une invitation' }).click();
    await expect(page).toHaveURL(/#inviter$/);
    await expect(page.getByLabel('Votre adresse e-mail')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Demander une invitation' })).toBeInViewport();
  });

  test('aucun suivi : ni cookie, ni ressource tierce, ni stockage ; non indexable par défaut', async ({
    page,
    context,
  }) => {
    const demandes: string[] = [];
    page.on('request', (rq: Request) => demandes.push(rq.url()));
    const erreurs: string[] = [];
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    const r = await page.goto(URL_PAGE);
    await page.locator('h1').waitFor();
    await page.waitForLoadState('networkidle');
    const base = new globalThis.URL(page.url()).origin;
    for (const u of demandes) expect(u.startsWith(base), u).toBe(true);
    const chemins = demandes.map((u) => new globalThis.URL(u).pathname);
    expect(chemins).toContain('/accueil.js');
    expect(chemins).toContain('/api/v1/acces/jeton');
    // l'application (JavaScript de l'élève) n'est PAS chargée : ni _app/, ni catalogue, ni service worker
    expect(chemins.filter((p) => p.startsWith('/_app/') || p.startsWith('/i18n/'))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    // la page n'écrit rien (la seule clé présente est posée par le banc d'essai lui-même)
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) => k !== 'awzid.lecon.tout').length +
          sessionStorage.length,
      ),
    ).toBe(0);
    expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
    expect(r?.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    expect(r?.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(erreurs).toEqual([]);
  });

  test('poids : la page et ses ressources restent très en dessous de 150 Ko (compressées)', async ({
    page,
  }) => {
    const tailles: Array<{ url: string; octets: number }> = [];
    page.on('response', async (res) => {
      try {
        const corps = await res.body();
        const gz = brotliCompressSync(corps).length;
        tailles.push({ url: new globalThis.URL(res.url()).pathname, octets: gz });
      } catch {
        /* redirection ou réponse sans corps */
      }
    });
    await page.goto(URL_PAGE);
    await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    const total = tailles.reduce((s, t) => s + t.octets, 0);
    console.log(
      `[accueil] poids (Brotli) : ${(total / 1024).toFixed(1)} Ko — ${tailles.map((t) => `${t.url} ${(t.octets / 1024).toFixed(1)}`).join(', ')}`,
    );
    expect(total).toBeLessThan(150 * 1024);
    // en pratique : bien moins (un document, un script, deux polices de la charte, un jeton) : < 60 Ko
    expect(total).toBeLessThan(60 * 1024);
  });

  test('« / » reste l’application pour un visiteur tant que le site n’est pas « sur invitation »', async ({
    request,
  }) => {
    const r = await request.get('/', { headers: { accept: 'text/html' } });
    expect(r.status()).toBe(200);
    expect(await r.text()).not.toContain('id="attente"');
  });

  test('sans JavaScript : un message le dit, et le formulaire ne part nulle part (retour à la page)', async ({
    request,
    baseURL,
  }) => {
    const html = await (await request.get(URL_PAGE)).text();
    expect(html).toMatch(
      /<noscript><p class="sans-js">Cette page a besoin de JavaScript[^<]*contact@awzid\.com/,
    );
    const r = await request.post(URL_PAGE, {
      form: { email: 'ne-doit-pas-etre-garde@e2e.test' },
      headers: { origin: baseURL! },
      maxRedirects: 0,
    });
    // 303 vers la page ; 403 si le serveur de test ne connaît pas son adresse publique (ORIGIN) : dans les deux cas
    // l'adresse saisie n'est ni lue ni gardée
    expect([303, 403]).toContain(r.status());
    if (r.status() === 303) expect(r.headers()['location']).toBe('/bienvenue');
  });
});

test.describe('formulaire (mécanisme existant de la liste d’attente)', () => {
  test('envoi réel : jeton signé, consentement, langue, champ piège vide ; confirmation affichée', async ({
    page,
  }) => {
    await ouvrir(page);
    const email = unique();
    await page.getByLabel('Votre adresse e-mail').fill(email);
    await page.getByRole('checkbox').check();
    const req = page.waitForRequest((r) => r.url().includes('/api/v1/acces/liste-attente'));
    const rep = page.waitForResponse((r) => r.url().includes('/api/v1/acces/liste-attente'));
    await page.getByRole('button', { name: 'Demander une invitation' }).click();
    const corps = (await req).postDataJSON() as Record<string, unknown>;
    expect(corps).toMatchObject({ email, langue: 'fr', consentement: true, site_web: '' });
    expect(String(corps.jeton)).toMatch(/^\d{10,16}\..+/);
    expect((await rep).status()).toBe(202);
    const etat = page.locator('#etat');
    await expect(etat).toContainText('e-mail de confirmation');
    await expect(etat).toBeFocused();
    await expect(page.getByRole('button')).toBeHidden();
  });

  test('sans le consentement ou avec une adresse invalide : rien n’est envoyé', async ({
    page,
  }) => {
    await ouvrir(page);
    let envoyes = 0;
    page.on('request', (r) => r.url().includes('liste-attente') && envoyes++);
    await page.getByRole('button', { name: 'Demander une invitation' }).click();
    await page.getByLabel('Votre adresse e-mail').fill('pas-une-adresse');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Demander une invitation' }).click();
    expect(
      await page
        .getByLabel('Votre adresse e-mail')
        .evaluate((e: HTMLInputElement) => e.validity.valid),
    ).toBe(false);
    await page.waitForTimeout(500);
    expect(envoyes).toBe(0);
  });

  test('anti-robots : un champ piège rempli est transmis (le serveur le refuse), message clair, nouveau jeton', async ({
    page,
  }) => {
    await ouvrir(page);
    await page.route('**/api/v1/acces/liste-attente', (route: Route) =>
      route.fulfill({
        status: 400,
        json: { error: { code: 'antibot_echec', raison: 'piege' } },
      }),
    );
    await page.getByLabel('Votre adresse e-mail').fill(unique());
    await page.getByRole('checkbox').check();
    await page
      .locator('input[name=site_web]')
      .evaluate((e: HTMLInputElement) => (e.value = 'http://spam.example'));
    const req = page.waitForRequest((r) => r.url().includes('/api/v1/acces/liste-attente'));
    const jetons = page.waitForRequest((r) => r.url().includes('/api/v1/acces/jeton'));
    await page.getByRole('button', { name: 'Demander une invitation' }).click();
    expect(((await req).postDataJSON() as { site_web: string }).site_web).toBe(
      'http://spam.example',
    );
    await expect(page.locator('#etat')).toContainText('La vérification automatique n’a pas abouti');
    await jetons;
    await expect(page.getByRole('button', { name: 'Demander une invitation' })).toBeEnabled();
  });

  test('trop de demandes, service fermé, réseau coupé : messages clairs, le bouton revient', async ({
    page,
  }) => {
    await ouvrir(page);
    await page.getByLabel('Votre adresse e-mail').fill(unique());
    await page.getByRole('checkbox').check();
    const cas: Array<[number, string, string]> = [
      [429, 'trop_de_demandes', 'Trop de demandes pour le moment'],
      [503, 'acces_ferme', 'Le service est momentanément fermé'],
    ];
    for (const [status, code, texte] of cas) {
      await page.route('**/api/v1/acces/liste-attente', (route: Route) =>
        route.fulfill({ status, json: { error: { code } } }),
      );
      await page.getByRole('button', { name: 'Demander une invitation' }).click();
      await expect(page.locator('#etat')).toContainText(texte, { timeout: 15_000 });
      await expect(page.locator('#etat')).toHaveClass(/erreur/);
      await expect(page.getByRole('button', { name: 'Demander une invitation' })).toBeEnabled();
      await page.unroute('**/api/v1/acces/liste-attente');
    }
    await page.route('**/api/v1/acces/liste-attente', (route: Route) => route.abort());
    await page.getByRole('button', { name: 'Demander une invitation' }).click();
    await expect(page.locator('#etat')).toContainText('Pas de connexion', { timeout: 15_000 });
  });
});

test.describe('langues, thème, accessibilité', () => {
  test('anglais par ?lang=en puis par la langue du navigateur ; français par défaut', async ({
    page,
    browser,
    baseURL,
  }) => {
    await ouvrir(page, `${URL_PAGE}?lang=en`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveText(
      'Learn Arabic, the Quran and the basics of the religion, step by step, as a family',
    );
    await expect(page.getByRole('button', { name: 'Request an invitation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Français' })).toHaveAttribute('hreflang', 'fr');
    const ctx = await browser.newContext({ baseURL, locale: 'en-GB' });
    const p = await ctx.newPage();
    await p.goto(URL_PAGE);
    await expect(p.locator('html')).toHaveAttribute('lang', 'en');
    await ctx.close();
    const ctxDe = await browser.newContext({ baseURL, locale: 'de-DE' });
    const d = await ctxDe.newPage();
    await d.goto(URL_PAGE);
    await expect(d.locator('html')).toHaveAttribute('lang', 'fr');
    await ctxDe.close();
  });

  test('thèmes clair et sombre de la charte (selon le système), sans bascule de mise en page', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await ouvrir(page);
    const fond = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await fond()).toBe('rgb(251, 247, 238)'); // ivoire #FBF7EE
    const bouton = () =>
      page.getByRole('button').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bouton()).toBe('rgb(11, 110, 79)'); // émeraude #0B6E4F
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await fond()).toBe('rgb(13, 26, 21)'); // #0D1A15
    expect(await bouton()).toBe('rgb(31, 156, 115)'); // #1F9C73
    // pas de défilement horizontal à 375 px
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  for (const scheme of ['light', 'dark'] as const)
    test(`accessibilité (axe, WCAG 2.1 A et AA) en mode ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await ouvrir(page);
      await page.evaluate(() => document.fonts.ready);
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          cibles: v.nodes.map((n) => n.target.join(' ')),
        })),
      ).toEqual([]);
    });

  test('clavier : lien d’évitement, langue, « Se connecter », appel principal vers le formulaire, champ, case et bouton ; focus visible', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'parcours clavier : bureau');
    await ouvrir(page);
    const focus = () =>
      page.evaluate(() => {
        const e = document.activeElement as HTMLElement;
        return `${e.tagName.toLowerCase()}:${e.getAttribute('href') ?? e.getAttribute('id') ?? e.getAttribute('name') ?? ''}`;
      });
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('a:#contenu');
    await page.keyboard.press('Tab'); // logo
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('a:?lang=en'); // seule l'autre langue est proposée
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('a:/connexion');
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('a:#inviter');
    // l'appel principal, activé au clavier, amène au formulaire
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('a:/inscription'); // « Créer votre compte » (code déjà reçu)
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('input:email');
    const contour = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle,
    );
    expect(contour).not.toBe('none');
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('input:consent');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    expect(await focus()).toBe('button:');
  });

  test('lien d’évitement visible au focus ; cibles tactiles d’au moins 44 px', async ({ page }) => {
    await ouvrir(page);
    await page.keyboard.press('Tab');
    const boite = await page.getByRole('link', { name: 'Aller au contenu' }).boundingBox();
    expect(boite?.x).toBeGreaterThanOrEqual(0);
    for (const sel of [
      'button',
      'input[type=email]',
      'nav.langues a',
      'a.connexion',
      'a.btn',
      'a.secondaire',
      'footer a',
    ]) {
      const b = await page.locator(sel).first().boundingBox();
      expect(b?.height, sel).toBeGreaterThanOrEqual(44);
    }
  });
});

/** dernier e-mail de ce type reçu à cette adresse dans la boîte de démonstration (AWFORM_MAIL=journal : aucun envoi réel) */
async function dernierMail(to: string, kind: string): Promise<{ subject: string; text: string }> {
  const dir = process.env.E2E_MAIL_DIR!;
  let trouve: { subject: string; text: string } | null = null;
  await expect
    .poll(
      () => {
        let fichiers: string[];
        try {
          fichiers = readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .sort();
        } catch {
          return false;
        }
        for (const f of fichiers.reverse()) {
          const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
          if (m.to === to && m.kind === kind) {
            trouve = m;
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return trouve!;
}

test.describe('double consentement (e-mail de confirmation, désinscription)', () => {
  test('inscription, e-mail (vouvoiement, lien de désinscription), confirmation puis désinscription par les liens', async ({
    page,
  }) => {
    await ouvrir(page);
    const email = unique();
    await page.getByLabel('Votre adresse e-mail').fill(email);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Demander une invitation' }).click();
    await expect(page.locator('#etat')).toContainText(
      'Votre place n’est enregistrée qu’après ce clic',
      {
        timeout: 15_000,
      },
    );
    const m = await dernierMail(email, 'liste_attente');
    expect(m.subject).toBe('Confirmez votre inscription à la liste d’attente d’Awzid');
    expect(m.text).toContain('Vous avez demandé');
    expect(m.text).toContain('Pour vous désinscrire');
    const confirmer = /https?:\/\/\S+\/bienvenue\/confirmer\?lang=fr#t=[\w-]+/.exec(m.text)![0];
    const desinscrire = /https?:\/\/\S+\/bienvenue\/desinscription\?lang=fr#t=[\w-]+/.exec(
      m.text,
    )![0];
    // page du lien : un clic explicite est nécessaire (un robot de messagerie qui ouvre le lien ne confirme rien)
    await page.goto(confirmer);
    await expect(page.getByRole('heading', { name: 'Confirmer votre inscription' })).toBeVisible();
    expect((await page.request.get(confirmer)).headers()['x-robots-tag']).toContain('noindex');
    await page.getByRole('button', { name: 'Confirmer mon inscription' }).click();
    await expect(page.locator('#etat')).toContainText('votre inscription est confirmée');
    expect(page.url()).not.toContain('#t=');
    // le même lien une seconde fois : « déjà confirmée »
    await page.goto('about:blank');
    await page.goto(confirmer);
    await page.getByRole('button', { name: 'Confirmer mon inscription' }).click();
    await expect(page.locator('#etat')).toContainText('déjà confirmée');
    // désinscription : l'adresse est effacée ; le lien ne sert plus
    await page.goto(desinscrire);
    await expect(
      page.getByRole('heading', { name: 'Se désinscrire de la liste d’attente' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Me désinscrire et effacer mon adresse' }).click();
    await expect(page.locator('#etat')).toContainText('votre adresse a été effacée');
    await page.goto('about:blank');
    await page.goto(desinscrire);
    await page.getByRole('button', { name: 'Me désinscrire et effacer mon adresse' }).click();
    await expect(page.locator('#etat')).toContainText('plus valable');
  });

  test('lien sans jeton ou inventé : message clair, rien ne se passe ; accessibilité de la page', async ({
    page,
  }) => {
    await page.goto('/bienvenue/confirmer?lang=fr');
    await expect(page.locator('#etat')).toContainText('plus valable');
    await page.goto('/bienvenue/confirmer?lang=en#t=' + 'a'.repeat(43));
    await page.getByRole('button', { name: 'Confirm my sign-up' }).click();
    await expect(page.locator('#etat')).toContainText('no longer valid');
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  test('le bloc « Ce que nous faisons de votre adresse » est un accordéon fermé, ouvrable au clavier', async ({
    page,
    isMobile,
  }) => {
    await ouvrir(page);
    const d = page.locator('details.rgpd');
    await expect(d).not.toHaveAttribute('open', '');
    await expect(page.getByText('Finalité')).toBeHidden();
    await d.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(d).toHaveAttribute('open', '');
    await expect(page.getByText('Finalité')).toBeVisible();
    await expect(page.getByText('Texte provisoire, en attente')).toBeVisible();
    void isMobile;
  });
});
