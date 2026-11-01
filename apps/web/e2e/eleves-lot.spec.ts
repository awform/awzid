import { readFileSync } from 'node:fs';
import { expect, loginTeacher, password, test } from './fixtures';

/**
 * V2-5 — l'enseignant crée 3 élèves (saisie + collage depuis un tableur), obtient la fiche de la classe (PDF), envoie
 * l'identifiant par WhatsApp (jamais le mot de passe), puis un élève se connecte ; l'enseignant recrée un mot de passe.
 */
const H = { 'x-awform': '1' };

test.use({ compte: null });

test('création de 3 élèves, fiche PDF, lien WhatsApp sans mot de passe, connexion de l’élève', async ({
  page,
  browser,
}) => {
  await loginTeacher(page);
  const nom = `CE2 ${Date.now()}`;
  const c = await page.request.post('/api/v1/teacher/classes', { headers: H, data: { name: nom } });
  expect(c.status(), await c.text()).toBeLessThan(300);
  const classeId = ((await c.json()) as { class: { id: string } }).class.id;
  const annee = String(new Date().getFullYear() - 9);

  await page.goto(`/enseignant/classe/${classeId}`);
  await page.getByTestId('elv-ouvrir').click();
  await expect(page.getByTestId('eleves-lot')).toBeVisible();

  // un tableur dont on ne reconnaît pas la colonne du prénom : on demande laquelle prendre
  await page.getByTestId('elv-coller').click();
  await page.getByTestId('elv-collage').fill(`Name\tClass\tYear\nZaid\tCE2\t${annee}`);
  await page.getByTestId('elv-lire').click();
  await expect(page.getByTestId('elv-ambigu')).toBeVisible();
  await page.getByTestId('elv-colonne').selectOption('0');
  await page.getByTestId('elv-colonne-ok').click();
  await expect(page.getByTestId('elv-prenom-0')).toHaveValue('Zaid');

  // deux élèves saisis (le premier remplace Zaid), le troisième collé depuis un tableur
  await page.getByTestId('elv-prenom-0').fill('Moussa');
  await page.getByTestId('elv-annee-0').fill(annee);
  await page.getByTestId('elv-ajouter-ligne').click();
  await page.getByTestId('elv-prenom-1').fill('Awa');
  await page.getByTestId('elv-annee-1').fill(annee);
  await page.getByTestId('elv-coller').click();
  await page.getByTestId('elv-collage').fill(`Prénom\tAnnée\nIbrahima\t${annee}`);
  await page.getByTestId('elv-lire').click();
  await expect(page.getByTestId('elv-prenom-2')).toHaveValue('Ibrahima');

  // la case d'accord est obligatoire
  await page.getByTestId('elv-mdp').fill(password());
  await page.getByTestId('elv-creer').click();
  await expect(page.getByTestId('elv-erreur')).toBeVisible();
  await page.getByTestId('elv-accord').check();
  await page.getByTestId('elv-creer').click();

  const tableau = page.getByTestId('elv-comptes');
  await expect(tableau.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('elv-fiche-aide')).toBeVisible();
  const ligne = page.getByTestId('elv-ligne-Moussa');
  const identifiant = (await ligne.getByTestId('elv-id').innerText()).trim();
  const mdp = (await ligne.getByTestId('elv-mdp-eleve').innerText()).trim();
  expect(identifiant).toMatch(/^moussa-\d{3,4}$/);
  expect(mdp).toMatch(/^[a-z2-9]{8}$/);

  // fiche PDF : une étiquette par élève avec identifiant et mot de passe
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('elv-imprimer').click(),
  ]);
  const pdf = readFileSync((await telechargement.path())!).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toContain(`(${identifiant})`);
  expect(pdf).toContain(`(${mdp})`);

  // WhatsApp : l'identifiant, jamais le mot de passe
  const lien = (await ligne.getByTestId('elv-whatsapp').getAttribute('href'))!;
  expect(lien.startsWith('https://wa.me/?text=')).toBe(true);
  expect(decodeURIComponent(lien)).toContain(identifiant);
  expect(decodeURIComponent(lien)).not.toContain(mdp);

  // l'élève se connecte, dans un autre navigateur : session limitée à son profil
  const ctx = await browser.newContext();
  const eleve = await ctx.newPage();
  await eleve.goto('/connexion');
  await eleve.locator('#email').fill(identifiant);
  await eleve.locator('#password').fill(mdp);
  await eleve.getByRole('button', { name: /Se connecter|Connexion/ }).click();
  await expect(eleve.getByTestId('se-deconnecter')).toBeVisible();
  await expect(eleve.getByTestId('lien-compte')).toHaveCount(0);
  await eleve.goto(`/enseignant/classe/${classeId}`);
  await expect(eleve).toHaveURL(/\/aujourdhui/); // page fermée à l'élève
  await eleve.getByTestId('se-deconnecter').click();

  // « Terminé » : les mots de passe quittent l'écran ; l'enseignant en recrée un
  await page.getByTestId('elv-fermer').click();
  await page.getByTestId('elv-ouvrir').click();
  const encore = page.getByTestId('elv-ligne-Moussa');
  await expect(encore.getByTestId('elv-mdp-eleve')).not.toHaveText(mdp);
  await page.getByTestId('elv-mdp').fill(password());
  await encore.getByTestId('elv-nouveau').click();
  // le mot de passe de l'enseignant est effacé de l'écran dès que l'action est faite
  await expect(page.getByTestId('elv-mdp')).toHaveValue('');
  await expect(encore.getByTestId('elv-mdp-eleve')).toHaveText(/^[a-z2-9]{8}$/);
  const neuf = (await encore.getByTestId('elv-mdp-eleve').innerText()).trim();
  expect(neuf).not.toBe(mdp);

  const ancien = await ctx.request.post('/api/v1/auth/login', {
    headers: H,
    data: { email: identifiant, password: mdp },
  });
  expect(ancien.status()).toBe(401);
  const bon = await ctx.request.post('/api/v1/auth/login', {
    headers: H,
    data: { email: identifiant, password: neuf },
  });
  expect(bon.status()).toBe(200);
  await ctx.close();
});
