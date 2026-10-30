import { expect, test } from './fixtures';

/**
 * V2-3 — accès d'un enfant : le parent donne un identifiant à un profil existant, l'enfant se connecte (session
 * limitée : aucun lien vers le compte, les profils ou les paiements ; « Se déconnecter » présent).
 */
const H = { 'x-awform': '1' };

test('profil existant : le parent crée l’accès, l’enfant entre, puis le parent débloque et change le mot de passe', async ({
  page,
  browser,
}) => {
  const email = `parent-acces-${Date.now()}@exemple.org`;
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      intention: 'enfants',
      email,
      password: 'une longue phrase de passe 2026',
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(r.status()).toBe(201);
  const p = await page.request.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym: 'Samir',
      birthYear: new Date().getFullYear() - 10,
      password: 'une longue phrase de passe 2026',
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    },
  });
  const id = (await p.json()).id as string;

  await page.goto('/profils');
  await page.getByTestId(`acces-${id}`).click();
  const login = `samir-${Date.now() % 1000}`;
  await page.getByTestId('acces-login').fill(login);
  await page.getByTestId('acces-mdp').fill('soleil-vert-42');
  await page.getByTestId('acces-declaration').check();
  await page.getByTestId('acces-creer').click();
  await expect(page.getByTestId('acces-identifiant')).toHaveText(login);

  // l'enfant, sur un autre appareil
  const ctx = await browser.newContext();
  const enfant = await ctx.newPage();
  await enfant.goto('/connexion');
  await enfant.locator('#email').fill(login);
  await enfant.locator('#password').fill('soleil-vert-42');
  await enfant.getByRole('button', { name: /Se connecter|Connexion/ }).click();
  await expect(enfant.getByTestId('se-deconnecter')).toBeVisible();
  await expect(enfant.getByTestId('lien-compte')).toHaveCount(0);
  await enfant.goto('/profils');
  await expect(enfant).toHaveURL(/\/aujourdhui/); // page fermée à l'enfant : retour à l'apprentissage
  await enfant.getByTestId('se-deconnecter').click();
  await expect(enfant).toHaveURL(/\/connexion/);
  await ctx.close();

  // le parent : nouveau mot de passe (deux touchers) et déblocage (un toucher)
  await page.getByTestId('acces-nouveau-mdp').click();
  await page.getByTestId('acces-mdp').fill('nuage-bleu-77');
  await page.getByTestId('acces-enregistrer').click();
  await expect(page.getByTestId('acces-message')).toBeVisible();
  await page.getByTestId('acces-debloquer').click();
  await expect(page.getByTestId('acces-message')).toBeVisible();
});
