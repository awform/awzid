import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Bêta fermée, volet juridique et support (13/10/2026) :
 *  1. textes juridiques provisoires (mentions, CGU, confidentialité, cookies, conditions de la bêta, conditions des
 *     invités), champs du client marqués entre crochets, accessibles sans compte ;
 *  2. page publique d'information de la bêta (/beta) ;
 *  3. aide : 20 questions au moins, contact, documents ;
 *  4. parcours « Signaler une erreur dans un texte religieux » : catégorie déjà choisie, file de l'administrateur ;
 *  5. page publique des errata : correction datée, sourcée, sans auteur ni commentaire.
 */
const H = { 'x-awform': '1' };

/** Administrateur neuf (outil staff), second facteur configuré ; renvoie sa page (même procédé que beta-support). */
async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-bl-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
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

test.describe('textes juridiques de la bêta (sans compte)', () => {
  test.use({ compte: null });

  test('mentions légales : provisoires, champs du client entre crochets, crédits des sources', async ({
    page,
  }) => {
    await page.goto('/legal/mentions');
    await expect(page.getByTestId('legal-provisoire')).toContainText('PROVISOIRE');
    await expect(page.getByTestId('legal-provisoire')).toContainText('seconde lecture juridique');
    const doc = page.getByTestId('page-legale');
    await expect(doc).toContainText('[adresse électronique de contact : à créer par le client]');
    await expect(doc).toContainText('Google Cloud Platform');
    await expect(doc).toContainText('tanzil.net');
    await expect(doc).toContainText('Quran Foundation');
    await expect(doc).toContainText('SIL Open Font License');
    await expect(doc).not.toContainText('validation humaine');
  });

  test('confidentialité : mineurs, donnée religieuse, sous-traitants, durées, violation', async ({
    page,
  }) => {
    await page.goto('/legal/confidentialite');
    const doc = page.getByTestId('page-legale');
    for (const mot of [
      'article 9',
      'consentement explicite',
      'Gemini',
      'Vertex AI',
      'Quran Foundation',
      'Durées de conservation',
      '72 heures',
      '15 ans en France',
      '2008-12',
      'Sécurité et violation de données',
    ])
      await expect(doc).toContainText(mot);
    await expect(doc).not.toContainText('Anthropic');
  });

  test('conditions des invités, conditions de la bêta, cookies : accessibles et reliées entre elles', async ({
    page,
  }) => {
    await page.goto('/legal/invites');
    await expect(page.locator('h1')).toContainText('Conditions pour les invités de la bêta');
    await expect(page.getByTestId('page-legale')).toContainText('Votre invitation');
    // la navigation des pages légales liste aussi la page d'information de la bêta et les errata
    const nav = page.getByRole('navigation', { name: 'Informations légales' });
    await nav.getByRole('link', { name: 'Conditions de la bêta' }).click();
    await expect(page.locator('h1')).toContainText('Conditions de la bêta');
    await expect(page.getByTestId('page-legale')).toContainText('fermée');
    await nav.getByRole('link', { name: /Cookies/ }).click();
    await expect(page.getByTestId('page-legale')).toContainText('awform_session');
    await expect(page.getByTestId('page-legale')).toContainText('Aucun cookie tiers');
  });

  test('une page légale inconnue reste un message simple', async ({ page }) => {
    await page.goto('/legal/inconnue');
    await expect(page.getByText("Cette page n'existe pas.")).toBeVisible();
  });
});

test.describe('page d’information de la bêta et aide (sans compte)', () => {
  test.use({ compte: null });

  test('/beta : ce qu’est la bêta, ce qui est testé, limites, comment signaler — publique', async ({
    page,
  }) => {
    await page.goto('/beta');
    await expect(page.locator('h1')).toContainText("La bêta d'Awzid");
    const doc = page.getByTestId('page-legale');
    for (const h of [
      "Ce qu'est la bêta",
      'Ce que nous testons',
      'Limites connues',
      'Comment signaler',
    ])
      await expect(doc.getByRole('heading', { name: h })).toBeVisible();
    // ce n'est pas un texte juridique : pas de bandeau « provisoire » ; liens vers les documents
    await expect(page.getByTestId('legal-provisoire')).toHaveCount(0);
    const liens = page.getByTestId('beta-liens');
    await expect(liens.getByRole('link', { name: 'Errata' })).toBeVisible();
    await expect(
      liens.getByRole('link', { name: 'Conditions pour les invités de la bêta' }),
    ).toBeVisible();
    await expect(liens.getByRole('button', { name: 'Signaler un problème' })).toBeVisible();
    // pas de redirection vers la connexion
    await expect(page).toHaveURL(/\/beta$/);
  });

  test('aide : au moins 20 questions, mot de passe oublié expliqué, contact et documents', async ({
    page,
  }) => {
    await page.goto('/aide');
    await expect(page.getByTestId('faq').first()).toBeVisible();
    expect(await page.getByTestId('faq').count()).toBeGreaterThanOrEqual(20);
    const mdp = page.getByTestId('faq').filter({ hasText: "J'ai oublié mon mot de passe" });
    await mdp.locator('summary').click();
    await expect(mdp).toContainText('30 minutes');
    await expect(mdp).not.toContainText("disponible à l'ouverture publique");
    const docs = page.getByRole('heading', { name: 'Documents' }).locator('..');
    await expect(docs.getByRole('link', { name: "La bêta d'Awzid" })).toBeVisible();
    await expect(docs.getByRole('link', { name: 'Errata' })).toBeVisible();
    await expect(
      docs.getByRole('link', { name: 'Conditions pour les invités de la bêta' }),
    ).toBeVisible();
    await docs.getByTestId('aide-contact').click();
    await expect(page.locator('h1')).toContainText('Mentions légales');
  });
});

test.describe('« Signaler une erreur dans un texte religieux » et errata', () => {
  test('le formulaire s’ouvre sur « Un point religieux à vérifier » et arrive dans la file de l’administrateur', async ({
    page,
    browser,
  }) => {
    const run = `${test.info().project.name}-${Date.now()}`;
    await newAdult(page, 'bl-relig');
    await page.goto('/aide');
    await page.getByRole('button', { name: 'Signaler une erreur dans un texte religieux' }).click();
    const d = page.getByTestId('probleme-dialogue');
    await expect(d.locator('input[value="religieux"]')).toBeChecked();
    // formulaire sobre : la page et la version sont jointes, rien d'autre sur la personne
    await expect(d.getByTestId('probleme-joint')).toContainText('rien d');
    await expect(d.getByTestId('probleme-envoyer')).toBeDisabled();
    await d.locator('textarea').fill(`Le verset 2:255 me semble mal vocalisé (${run})`);
    await d.getByTestId('probleme-envoyer').click();
    await expect(d.getByTestId('probleme-merci')).toBeVisible();

    const adm = await admin(browser, 'relig');
    try {
      await adm.goto('/admin');
      const item = adm.getByTestId('probadm-signalement').filter({ hasText: run });
      await expect(item).toContainText('Un point religieux à vérifier');
      await expect(item).toContainText('Page : /aide');
      await expect(item).not.toContainText('@e2e.test');
    } finally {
      await adm.context().close();
    }
  });

  test('« Signaler un problème » reste distinct : catégorie non préchoisie', async ({ page }) => {
    await newAdult(page, 'bl-nonpre');
    await page.goto('/aide');
    await page.getByRole('button', { name: 'Signaler un problème' }).click();
    const d = page.getByTestId('probleme-dialogue');
    await expect(d.locator('input[value="religieux"]')).not.toBeChecked();
    await expect(d.getByTestId('probleme-envoyer')).toBeDisabled();
  });

  test('errata : correction datée, avec sa source et son édition, publique, sans auteur ni commentaire', async ({
    page,
    browser,
  }) => {
    const run = `${test.info().project.name}-${Date.now()}`;
    await newAdult(page, 'bl-errata');
    const ref = `2:255 (${run})`;
    const sig = await page.request.post('/api/v1/contenu/signalements', {
      headers: H,
      data: {
        targetKind: 'verset',
        unitId: 'en1.l03',
        reason: 'reference',
        ref,
        comment: `COMMENTAIRE-PRIVE-${run}`,
      },
    });
    expect(sig.status(), await sig.text()).toBe(201);
    const { id } = (await sig.json()) as { id: string };

    const adm = await admin(browser, 'errata');
    try {
      for (const body of [
        { status: 'en_examen' },
        {
          status: 'corrige',
          erratum: `Référence du verset rectifiée (${run}).`,
          fixedInEdition: `ed-${run}`,
        },
      ]) {
        const r = await adm.request.patch(`/api/v1/admin/signalements/${id}`, {
          headers: H,
          data: body,
        });
        expect(r.status(), await r.text()).toBe(200);
      }
    } finally {
      await adm.context().close();
    }

    // visiteur sans compte : la page est publique
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const anon = await ctx.newPage();
    try {
      await anon.goto('/errata');
      await expect(anon.locator('h1')).toContainText('Errata');
      await expect(anon.getByTestId('errata-comment')).toContainText('datée et cite sa source');
      const e = anon.getByTestId('erratum').filter({ hasText: run });
      await expect(e).toHaveCount(1);
      await expect(e).toContainText('Verset');
      await expect(e).toContainText(`Référence du verset rectifiée (${run}).`);
      await expect(e).toContainText(`Source : ${ref}`);
      await expect(e).toContainText(`Édition : ed-${run}`);
      // datée : un élément <time> avec une date ISO du jour
      await expect(e.locator('time')).toHaveAttribute(
        'datetime',
        new RegExp(`^${new Date().toISOString().slice(0, 4)}-`),
      );
      await expect(anon.getByTestId('errata')).not.toContainText('COMMENTAIRE-PRIVE');
      await expect(anon).toHaveURL(/\/errata$/);
      // l'API publique ne donne ni auteur ni commentaire
      const api = await anon.request.get('/api/v1/contenu/errata');
      const txt = await api.text();
      expect(api.status()).toBe(200);
      expect(txt).not.toContain('COMMENTAIRE-PRIVE');
      expect(txt).not.toMatch(/accountId|account_id|handledBy/);
      // le parcours de signalement est proposé depuis la page
      await expect(
        anon.getByRole('button', { name: 'Signaler une erreur dans un texte religieux' }),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
