import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { etapeIdentifiants, etapeProfil, ouvrirInscription } from './inscription';

/**
 * Refonte de l'inscription (16/10/2026) : deux colonnes sur ordinateur, une sur téléphone ; formulaire en trois
 * étapes avec avancement, validation de chaque étape (message sous le champ, résumé, focus), annonce du changement
 * d'étape, « Retour » sans rien perdre, accords obligatoires groupés avec liens, facultatifs repliés ; AA clair et
 * sombre ; 375 px sans défilement horizontal ; cibles ≥ 44 px. Captures des maquettes si MAQUETTES_DIR est défini.
 */
test.use({ compte: null });
let n = 0;
const adresse = (p: string) => `insc-${p}-${Date.now()}-${n++}@e2e.test`;

/** violations axe graves ou critiques (WCAG 2.1 A et AA) */
async function graves(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(' ')).join(' | ')}`);
}

/** pas de défilement horizontal ; boutons, champs et liens visibles de la carte ≥ 44 px de haut */
async function mesures(page: Page) {
  return page.evaluate(() => {
    const carte = document.querySelector('.carte')!;
    const petits = [
      ...carte.querySelectorAll(
        'button, input:not([type=checkbox]):not([type=radio]), select, a, summary',
      ),
    ]
      .filter((e) => (e as HTMLElement).checkVisibility() && !e.closest('[aria-hidden="true"]'))
      .filter((e) => e.getBoundingClientRect().height < 44)
      .map((e) => e.getAttribute('data-testid') || e.id || e.outerHTML.slice(0, 60));
    return {
      deborde: document.documentElement.scrollWidth > window.innerWidth,
      petits,
    };
  });
}

test('étape 1 : champs vides ou faux refusés à côté du champ, focus sur le premier, rien n’est envoyé', async ({
  page,
}) => {
  let envois = 0;
  await page.route('**/api/v1/auth/signup', (route) => {
    envois++;
    return route.continue();
  });
  await ouvrirInscription(page);
  await expect(page.getByTestId('etape-n')).toHaveText('Étape 1 sur 3');
  await expect(page.locator('li[aria-current="step"]')).toContainText('Identifiants');
  // un seul bouton principal, pas de « Retour » à la première étape
  await expect(page.getByTestId('etape-retour')).toHaveCount(0);
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('erreurs-etape')).toBeVisible();
  await expect(page.getByTestId('erreur-email')).toHaveText('Indiquez votre adresse e-mail.');
  await expect(page.getByTestId('mdp-erreur')).toHaveText('Choisissez un mot de passe.');
  await expect(page.locator('#email')).toBeFocused();
  await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#email')).toHaveAttribute('aria-describedby', /email-erreur/);
  // adresse incomplète ; mot de passe refusé par la règle (la même que celle du serveur)
  await page.locator('#email').fill('pas-une-adresse');
  await expect(page.getByTestId('erreur-email')).toHaveCount(0); // corrigé : le message s'efface
  await page.locator('#password').fill('Tamar7x');
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('erreur-email')).toContainText('ne semble pas complète');
  await expect(page.getByTestId('mdp-erreur')).toContainText('pas encore accepté');
  // confirmation absente
  await page.locator('#email').fill(adresse('e1'));
  await page.locator('#password').fill(password());
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('mdp-confirmer-erreur')).toContainText('Retapez le même');
  await expect(page.getByTestId('mdp-confirmer')).toBeFocused();
  await expect(page.getByTestId('etape-1')).toBeVisible();
  expect(envois).toBe(0);
});

test('changement d’étape annoncé, focus sur le titre, « Retour » ne perd rien, accords obligatoires et options', async ({
  page,
}) => {
  const email = adresse('retour');
  await ouvrirInscription(page);
  await etapeIdentifiants(page, email);
  await expect(page.getByTestId('annonce-etape')).toHaveText('Étape 2 sur 3 : Votre profil');
  await expect(page.locator('#etape-2-t')).toBeFocused();
  await expect(page.getByTestId('etape-n')).toHaveText('Étape 2 sur 3');
  // étape 2 : année obligatoire
  await page.getByTestId('type-adulte').check();
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('erreur-birthYear')).toContainText('4 chiffres');
  await expect(page.locator('#birthYear')).toBeFocused();
  await page.locator('#birthYear').fill('1990');
  await page.locator('#pseudonym').fill('Yaya');
  await page.locator('#country').selectOption('SN');
  // retour à l'étape 1 : adresse, mot de passe ET confirmation gardés
  await page.getByTestId('etape-retour').click();
  await expect(page.getByTestId('annonce-etape')).toHaveText('Étape 1 sur 3 : Vos identifiants');
  await expect(page.locator('#email')).toHaveValue(email);
  await expect(page.locator('#password')).toHaveValue(password());
  await expect(page.getByTestId('mdp-confirmer')).toHaveValue(password());
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('type-adulte')).toBeChecked();
  await expect(page.locator('#birthYear')).toHaveValue('1990');
  await expect(page.locator('#pseudonym')).toHaveValue('Yaya');
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('etape-3')).toBeVisible();
  await expect(page.locator('#etape-3-t')).toBeFocused();
  // étape 3 : rien coché d'avance ; « Créer mon compte » refusé tant que les accords obligatoires manquent
  for (const c of ['consent-cgu', 'consent-art9', 'consent-transfert'])
    await expect(page.getByTestId(c)).not.toBeChecked();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByTestId('erreurs-etape')).toContainText('3 points sont à corriger');
  await expect(page.getByTestId('erreur-cgu')).toBeVisible();
  await expect(page.getByTestId('consent-cgu')).toBeFocused();
  // textes complets dans un nouvel onglet (le formulaire reste rempli)
  await expect(page.getByTestId('lien-cgu')).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('lien-cgu')).toHaveAttribute('href', '/legal/cgu');
  await expect(page.getByTestId('lien-confidentialite')).toHaveAttribute(
    'href',
    '/legal/confidentialite',
  );
  // facultatif replié dans « Options »
  await expect(page.getByTestId('consent-rappels')).toBeHidden();
  await page.getByTestId('options-facultatives').locator('summary').click();
  await expect(page.getByTestId('consent-rappels')).toBeVisible();
  await expect(page.getByTestId('consent-rappels')).not.toBeChecked();
});

test('envoi : mêmes données qu’avant ; refus du serveur ramené à l’étape du champ', async ({
  page,
}) => {
  let corps: Record<string, unknown> | null = null;
  await page.route('**/api/v1/auth/signup', (route) => {
    corps = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 409, json: { error: { code: 'email_indisponible' } } });
  });
  const email = adresse('envoi');
  await ouvrirInscription(page);
  await etapeIdentifiants(page, email);
  await etapeProfil(page, { kind: 'adulte', annee: 1991, pseudonyme: 'Awa' });
  await page.getByTestId('consent-cgu').check();
  await page.getByTestId('consent-art9').check();
  await page.getByTestId('options-facultatives').locator('summary').click();
  await page.getByTestId('consent-rappels').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  // adresse refusée : retour à l'étape 1, message au « vous »
  await expect(page.getByTestId('etape-1')).toBeVisible();
  await expect(page.getByTestId('erreur')).toContainText(
    'Connectez-vous si vous avez déjà un compte',
  );
  expect(corps).toMatchObject({
    kind: 'adulte',
    email,
    password: password(),
    country: 'FR',
    birthYear: 1991,
    pseudonym: 'Awa',
    evalMode: 'serein',
    consents: ['cgu', 'donnee_religieuse_art9', 'rappels'],
  });
});

test('invitation reconnue (lien), mise en page : deux colonnes sur ordinateur, une sur téléphone ; AA clair et sombre', async ({
  page,
}, info) => {
  await page.route('**/api/v1/acces/invitation', (route) =>
    route.fulfill({ json: { valide: true, personnelle: false } }),
  );
  await page.goto('/inscription#code=AWZ-ABCDE-FGHJK');
  await expect(page.getByTestId('invitation-reconnue')).toContainText('Invitation reconnue');
  await expect(page.getByTestId('etape-1')).toBeVisible();
  const panneau = (await page.getByTestId('inscription-marque').boundingBox())!;
  const carte = (await page.locator('.carte').boundingBox())!;
  if (info.project.name.startsWith('desktop')) {
    expect(panneau.x + panneau.width).toBeLessThanOrEqual(carte.x);
    await expect(page.locator('.points li')).toHaveCount(3);
    await expect(page.locator('.points')).toBeVisible();
  } else {
    // téléphone : le panneau n'est plus qu'un en-tête au-dessus de la carte
    expect(panneau.y + panneau.height).toBeLessThanOrEqual(carte.y);
    expect(panneau.height).toBeLessThan(170);
    await expect(page.locator('.points')).toBeHidden();
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const e of [1, 2, 3]) {
      if (e === 2) await etapeIdentifiants(page, adresse(`aa-${scheme}`));
      if (e === 3) await etapeProfil(page, {});
      expect(await graves(page), `étape ${e} ${scheme}`).toEqual([]);
      const m = await mesures(page);
      expect(m.deborde, `étape ${e} : défilement horizontal`).toBe(false);
      expect(m.petits, `étape ${e} : cibles < 44 px`).toEqual([]);
    }
    // erreur affichée à l'étape 3 : toujours AA
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByTestId('erreurs-etape')).toBeVisible();
    expect(await graves(page), `erreur ${scheme}`).toEqual([]);
    await page.goto('/inscription');
    await expect(page.getByTestId('etape-1')).toBeVisible();
  }
  await page.emulateMedia({ colorScheme: 'light' });
});

test('375 px : aucune étape ne déborde', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ouvrirInscription(page);
  expect((await mesures(page)).deborde).toBe(false);
  await etapeIdentifiants(page, adresse('375'));
  await page.getByTestId('type-adulte').check();
  expect((await mesures(page)).deborde).toBe(false);
  await etapeProfil(page, { kind: 'adulte' });
  await page.getByTestId('options-facultatives').locator('summary').click();
  expect((await mesures(page)).deborde).toBe(false);
});

/** maquettes : ordinateur 1440×900 et téléphone 390×844, clair et sombre, 3 étapes + erreur de l'étape 1 */
async function maquettes(browser: Browser, base: string, dir: string) {
  const cas = [
    ['ordi', { width: 1440, height: 900 }, 1, false],
    ['mobile', { width: 390, height: 844 }, 2, true],
  ] as const;
  for (const [nom, viewport, dpr, mobile] of cas)
    for (const scheme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({
        baseURL: base,
        viewport,
        deviceScaleFactor: dpr,
        isMobile: mobile,
        hasTouch: mobile,
        colorScheme: scheme,
        locale: 'fr-FR',
      });
      const page = await ctx.newPage();
      await page.route('**/api/v1/acces/invitation', (route) =>
        route.fulfill({ json: { valide: true, personnelle: false } }),
      );
      const s = scheme === 'dark' ? '-sombre' : '';
      const shot = async (quoi: string) => {
        // aucun champ actif sur la capture (anneau de focus)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        await page.screenshot({
          path: join(dir, `inscription-${nom}-${quoi}${s}.png`),
          fullPage: true,
        });
      };
      await page.goto('/inscription#code=AWZ-ABCDE-FGHJK');
      await expect(page.getByTestId('invitation-reconnue')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await page.locator('#email').fill('pas-une-adresse');
      await page.locator('#password').fill('Tamar7x');
      await page.getByTestId('etape-suivante').click();
      await expect(page.getByTestId('erreurs-etape')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('1-erreur');
      await page.goto('/inscription#code=AWZ-ABCDE-FGHJK');
      await expect(page.locator('#password')).toBeVisible();
      await page.locator('#email').fill('fatou.diallo@exemple.fr');
      await page.locator('#password').fill('mon thé à la menthe');
      await page.locator('#password-confirmer').fill('mon thé à la menthe');
      await page.locator('#email').blur();
      await shot('1-identifiants');
      await page.getByTestId('etape-suivante').click();
      await page.locator('#birthYear').fill('1987');
      await page.locator('#birthYear').blur();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('2-profil');
      await page.getByTestId('etape-suivante').click();
      await page.getByTestId('consent-cgu').check();
      await page.getByTestId('consent-cgu').blur();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('3-accords');
      await ctx.close();
    }
}

test('maquettes (si MAQUETTES_DIR)', async ({ browser }, info) => {
  const dir = process.env.MAQUETTES_DIR;
  test.skip(!dir || !info.project.name.startsWith('desktop'), 'captures à la demande seulement');
  mkdirSync(dir!, { recursive: true });
  await maquettes(browser, String(info.project.use.baseURL), dir!);
});
