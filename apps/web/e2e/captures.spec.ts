import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { solveExercise, unitData } from './solve';

/**
 * Captures d'écran des écrans réalisés (mobile et bureau), pour la présentation au client.
 * Dossier : CAPTURES_DIR (par défaut test-results/captures).
 */
const DIR = process.env.CAPTURES_DIR ?? 'test-results/captures';

test('captures d’écran', async ({ page }, info) => {
  const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
  mkdirSync(DIR, { recursive: true });
  const shot = async (name: string, full = false) => {
    await page.locator('main h1').first().waitFor(); // rendu sur l'appareil : attendre les données
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
  };

  await page.goto('/');
  await shot('01-accueil');
  await page.goto('/niveaux/en1');
  await shot('02-liste-en1');

  await page.goto('/lecons/en1.l01');
  await shot('03-en1-l01-ouverture');
  await page.locator('.letters').scrollIntoViewIfNeeded();
  await shot('04-en1-l01-lettres');
  await page.locator('.words').scrollIntoViewIfNeeded();
  await shot('05-en1-l01-mots');

  // exercices : on en résout quelques-uns pour montrer le retour immédiat
  const { unit } = await unitData(page, 'en1.l03');
  await page.goto('/lecons/en1.l03');
  await solveExercise(page, unit.exercises[0]!.id, unit.lesson.exercices[0]!);
  await page
    .locator(`section.ex[data-exercise="${unit.exercises[0]!.id}"]`)
    .scrollIntoViewIfNeeded();
  await shot('06-exercice-premiere-lettre');
  const relier = unit.lesson.exercices.findIndex((e) => e.type === 'relier');
  if (relier >= 0) {
    const sec = page.locator(`section.ex[data-exercise="${unit.exercises[relier]!.id}"]`);
    await sec.scrollIntoViewIfNeeded();
    await sec.locator('button[data-side="a"][data-k="0"]').click();
    await sec.locator('button[data-side="b"][data-k="0"]').click();
    await shot('07-exercice-relier');
  }
  await page.goto('/lecons/en1.l15');
  const ordre = page.locator('section.ex[data-type="ordre"]').first();
  await ordre.scrollIntoViewIfNeeded();
  await shot('08-exercice-ordre');

  await page.goto('/lecons/en1.l04');
  await page.locator('section.ex[data-type="chasse"]').first().scrollIntoViewIfNeeded();
  await shot('09-exercice-chasse');

  await page.goto('/lecons/ad1.l10');
  await page.locator('.dlg').first().scrollIntoViewIfNeeded();
  await shot('10-ad1-dialogue');
  await page.locator('.quran').scrollIntoViewIfNeeded();
  await shot('11-ad1-coran');

  await page.goto('/lecons/ad1.l05');
  await page.getByTestId('non-prepare').first().scrollIntoViewIfNeeded();
  await shot('12-bilan-texte-non-prepare');

  await page.goto('/lecons/en1.l02');
  await page.locator('.recap').scrollIntoViewIfNeeded();
  await shot('13-mon-bilan-etoiles');

  await page.goto('/lecons/en1.l01');
  await shot('14-lecon-entiere', true);
});

test.describe('compte parent', () => {
  test.use({ compte: 'parent' });

  test('captures d’écran — lot 3 (hors ligne, onglets, mode école)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string) => {
      await page.locator('main h1').first().waitFor(); // rendu sur l'appareil : attendre les données
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`) });
    };
    await page.goto('/hors-ligne');
    await page.locator('tr[data-level="en1"]').getByRole('button', { name: 'Télécharger' }).click();
    await page
      .locator('tr[data-level="en1"] [data-testid="etat"]')
      .filter({ hasText: "sur l'appareil" })
      .waitFor();
    await shot('15-telechargements');
    await page.goto('/coran');
    await shot('16-onglet-coran');
    await page.goto('/ecole');
    await page.getByTestId('activer-ecole').click();
    await page.getByText("Réglages de l'adulte").click();
    const first = page.locator('[data-setup]').first();
    await first.click();
    for (const s of ['etoile', 'lune', 'soleil', 'goutte'])
      await page.locator(`[data-setsym="${s}"]`).click();
    await page.getByTestId('enregistrer-code').click();
    await page.getByText("Réglages de l'adulte").click();
    await shot('17-mode-ecole-grille');
    await page.locator('[data-profile]').first().click();
    await page.locator('[data-sym="etoile"]').click();
    await shot('18-mode-ecole-code-image');
  });

  test('captures d’écran — lot 4 (comptes, profils, consentements, langue)', async ({
    page,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await page.goto('/profils');
    await page.locator('[data-profile]').first().waitFor();
    await shot('19-qui-apprend');
    await page.getByTestId('ajouter-enfant').click();
    await shot('20-ajout-enfant-consentement', true);
    await page.goto('/compte');
    await page.getByTestId('consentements').locator('li').first().waitFor();
    await shot('21-mon-compte', true);
    await page.goto('/connexion');
    await shot('22-connexion');
    await page.goto('/inscription');
    await page.locator('#country').selectOption('SN');
    await shot('23-inscription-senegal', true);
    await page.goto('/compte');
    await page.getByTestId('langues-preparation').check();
    await page.locator('button[data-locale="en"]').click();
    await expect(page.locator('main h1')).toHaveText('My account');
    await page.goto('/');
    await expect(page.locator('main h1')).toHaveText('My Arabic books');
    await shot('24-interface-en-anglais');
  });
});
