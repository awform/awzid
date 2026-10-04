import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, loginTeacher, PARENT_PIN, password, test } from './fixtures';

/**
 * Lot 26 — captures « avant / après » de la refonte graphique, pour chaque public (enfant, ado, adulte,
 * parent, enseignant), sur téléphone et sur ordinateur, plus le mode sombre, l'écran de 320 px et le
 * hors-ligne. Lancées seulement avec DESIGN_CAPTURES=<dossier> (ex. reports/design-v2/apres) :
 *   DESIGN_CAPTURES=$PWD/../../reports/design-v2/apres pnpm --filter @awform/web e2e design-v2
 * Chaque capture est indépendante : un écran absent (version « avant ») n'arrête pas les suivantes.
 */
const DIR = process.env.DESIGN_CAPTURES ?? '';
test.skip(!DIR, 'captures du lot 26 : DESIGN_CAPTURES non défini');

function shooter(page: Page, dev: string) {
  mkdirSync(DIR, { recursive: true });
  return async (name: string, url: string | null, full = false) => {
    try {
      if (url) await page.goto(url);
      await page.locator('main h1, h1').first().waitFor({ timeout: 10_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    } catch (e) {
      console.log(`capture ${name} impossible : ${(e as Error).message.split('\n')[0]}`);
    }
  };
}
const devOf = (n: string) => (n.startsWith('mobile') ? 'mobile' : 'bureau');

async function pickProfile(page: Page, name: string) {
  await page.goto('/profils');
  const pin = page.locator('#pin');
  const prof = page.locator('[data-profile]').filter({ hasText: name }).first();
  await expect(pin.or(prof).first()).toBeVisible();
  if (await pin.isVisible()) {
    // un enfant est actif : en sortir par « Changer d'élève » (en-tête), depuis une autre page
    await page.goto('/aide');
    await page
      .getByTestId('changer-eleve')
      .or(page.getByRole('button', { name: "Changer d'élève" }))
      .first()
      .click();
    await page.waitForURL(/\/profils/);
  }
  await prof.click();
  await page.waitForURL((u) => !u.pathname.startsWith('/profils'));
}

test.describe('visiteur', () => {
  test.use({ compte: null });
  test('captures — visiteur', async ({ page }, info) => {
    const shot = shooter(page, devOf(info.project.name));
    await shot('visiteur-01-accueil', '/');
    await shot('visiteur-02-connexion', '/connexion');
    await shot('visiteur-03-inscription', '/inscription');
  });
});

test('captures — adulte (Manuscrit moderne)', async ({ page }, info) => {
  const dev = devOf(info.project.name);
  const shot = shooter(page, dev);
  await shot('adulte-01-aujourdhui', '/aujourdhui');
  await shot('adulte-02-livres', '/');
  await shot('adulte-03-niveau', '/niveaux/ad1');
  await shot('adulte-04-lecon', '/lecons/ad1.l10');
  await shot('adulte-05-coran', '/coran');
  await shot('adulte-06-lecteur', '/coran/lecteur?s=1');
  await shot('adulte-07-hifz', '/hifz');
  await shot('adulte-08-revisions', '/revisions');
  await shot('adulte-09-sciences', '/sciences');
  await shot('adulte-10-compte', '/compte');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot('adulte-11-sombre-aujourdhui', '/aujourdhui');
  await shot('adulte-12-sombre-lecon', '/lecons/ad1.l10');
  await page.emulateMedia({ colorScheme: 'light' });
  if (dev === 'mobile') {
    await page.setViewportSize({ width: 320, height: 640 });
    await shot('adulte-13-320px-aujourdhui', '/aujourdhui');
    await shot('adulte-14-320px-lecon', '/lecons/ad1.l10');
  }
  await page.goto('/aujourdhui');
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await shot('adulte-15-hors-ligne', null);
  await page.context().setOffline(false);
});

test.describe('famille', () => {
  test.use({ compte: 'parent' });
  test('captures — parent (Clair), enfant (Jardin), ado (Nuit étoilée)', async ({ page }, info) => {
    const dev = devOf(info.project.name);
    const shot = shooter(page, dev);
    await shot('parent-01-qui-apprend', '/profils');
    await shot('parent-02-suivi', '/suivi');
    await shot('parent-03-messages', '/messages');
    await shot('parent-04-compte', '/compte');
    await shot('parent-05-hors-ligne', '/hors-ligne');
    // enfant
    await pickProfile(page, 'Amina');
    await shot('enfant-01-aujourdhui', '/aujourdhui');
    await shot('enfant-02-livres', '/');
    await shot('enfant-03-niveau', '/niveaux/en1');
    await shot('enfant-04-lecon', '/lecons/en1.l03');
    await page
      .locator('section.ex')
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await shot('enfant-05-exercice', null);
    await shot('enfant-06-coran', '/coran');
    await shot('enfant-07-ecriture', '/ecriture');
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot('enfant-08-sombre-aujourdhui', '/aujourdhui');
    await page.emulateMedia({ colorScheme: 'light' });
    // adolescent (créé une fois pour la capture)
    const me = await (await page.request.get('/api/v1/auth/me')).json();
    const has = (me.profiles as Array<{ pseudonym: string }>).some((p) => p.pseudonym === 'Sami');
    if (!has) {
      const r = await page.request.post('/api/v1/profiles', {
        headers: { 'x-awform': '1' },
        data: {
          pseudonym: 'Sami',
          avatar: 'lune',
          birthYear: new Date().getFullYear() - 16,
          levelCode: 'ado1',
          password: password(),
          consents: ['compte_suivi'],
        },
      });
      expect(r.status(), await r.text()).toBeLessThan(300);
    }
    await pickProfile(page, 'Sami');
    await shot('ado-01-aujourdhui', '/aujourdhui');
    await shot('ado-02-livres', '/');
    await shot('ado-03-niveau', '/niveaux/ado1');
    await shot('ado-04-lecon', '/lecons/ado1.l01');
    await shot('ado-05-coran', '/coran');
    await shot('ado-06-revisions', '/revisions');
  });
});

test.describe('enseignant', () => {
  test.use({ compte: null });
  test('captures — enseignant (Clair)', async ({ page }, info) => {
    const shot = shooter(page, devOf(info.project.name));
    await loginTeacher(page);
    await shot('enseignant-01-classes', '/enseignant');
    await shot('enseignant-02-ecole', '/enseignant/ecole');
    await shot('enseignant-03-questions', '/enseignant/questions');
  });
});
