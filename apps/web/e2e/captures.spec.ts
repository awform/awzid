import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, loginTeacher, newAdult, PARENT_PIN, test } from './fixtures';
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
    await page.locator('#apin').fill(PARENT_PIN);
    await page.getByTestId('ecole-pin').getByRole('button').click();
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

test.describe('lot 5', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 5 (hifẓ, enseignant)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures');
    await page.goto('/hifz');
    await page.getByTestId('mode-rythme').check();
    await shot('25-hifz-choix-rythme', true);
    await page.getByTestId('mode-carnet').check();
    await page.getByTestId('commencer-plan').click();
    await page.getByTestId('plan-resume').waitFor();
    await shot('26-hifz-carnet-semaine', true);
    await page.getByTestId('masquer').check();
    await page.getByTestId('piste-nouveau').scrollIntoViewIfNeeded();
    await shot('27-hifz-reciter-de-memoire');
    await loginTeacher(page);
    await page.goto('/enseignant');
    await page.locator('#cname').fill(`Hifẓ — groupe ${dev}`);
    await page.getByRole('button', { name: 'Créer la classe' }).click();
    await page.getByTestId('ens-message').waitFor();
    await shot('28-espace-enseignant', true);
  });
});

test.describe('lot 6', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 6 (tracé, cartes, tableau de bord, QR)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures6');
    await page.goto('/ecriture?lettre=%D8%A8');
    await page.locator('[data-etape="2"]').click();
    await page.getByTestId('trace').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('trace')).not.toHaveAttribute('data-box', '');
    await shot('29-trace-lettre');
    await page.goto('/revisions');
    await page.getByTestId('retourner').click();
    await shot('30-carte-mot');
    // un peu d'activité pour le tableau de bord
    await page.getByTestId('je-savais').click();
    for (let k = 0; k < 3; k++) {
      await page.getByTestId('retourner').click();
      await page.getByTestId(k % 2 ? 'a-revoir' : 'je-savais').click();
    }
    await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });
    await page.goto('/suivi');
    await page.getByTestId('activite').waitFor();
    await shot('31-tableau-de-bord', true);
    await page.goto('/l/en1-05');
    await shot('32-page-qr', true);
  });
});

test.describe('lot 8', () => {
  test('captures d’écran — lot 8 (sciences islamiques, bibliothèque, lecteur coranique)', async ({
    page,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await page.goto('/sciences');
    await page.locator('[data-testid="niveau-religion"]').first().waitFor();
    await shot('33-sciences-islamiques');
    await page.goto('/lecons/re1.l03');
    await page.getByTestId('lecon-religion').waitFor();
    await shot('34-lecon-religion-enfants');
    await page.goto('/lecons/ra1.l01');
    await page.getByTestId('lecon-religion').waitFor();
    await page.locator('.rub').first().scrollIntoViewIfNeeded();
    await shot('35-lecon-religion-adultes');
    await page.goto('/lectures');
    await page.locator('[data-testid="livrets"][data-ready="true"]').waitFor();
    await shot('36-bibliotheque');
    const code = await page.locator('[data-livret]').first().getAttribute('data-livret');
    await page.goto(`/lectures/${code}`);
    await page.getByTestId('suivant').click();
    await page.getByTestId('traduction').click();
    await shot('37-livret-page');
    await page.clock.install();
    await page.goto('/coran/lecteur?s=112');
    await page.locator('[data-verse="112:1"]').waitFor();
    await page.getByTestId('lire').click();
    await page.locator('.w.on').waitFor();
    await shot('38-lecteur-coranique');
  });
});
