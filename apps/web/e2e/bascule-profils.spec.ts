import { expect, test } from './fixtures';

/**
 * V2-4 — bascule Moi / enfants en un toucher : feuille en bas de l'écran sur mobile, colonne à gauche sur ordinateur.
 * Règles inchangées : code parent pour revenir à l'espace parent s'il existe ; le profil « Moi » apprend en adulte.
 */
const H = { 'x-awform': '1' };
const MDP = 'une longue phrase de passe 2026';

test.use({ compte: null });

test('un parent « Moi et mes enfants » passe de Moi à un enfant et revient avec son code parent', async ({
  page,
}) => {
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      intention: 'famille',
      email: `bascule-${Date.now()}@exemple.org`,
      password: MDP,
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  const p = await page.request.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym: 'Amina',
      birthYear: new Date().getFullYear() - 9,
      password: MDP,
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  const pin = await page.request.post('/api/v1/account/pin', {
    headers: H,
    data: { pin: '4821', password: MDP },
  });
  expect(pin.status()).toBe(200);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string; isOwner?: boolean; kind: string; pseudonym: string }>;
  };
  const moi = me.profiles.find((x) => x.isOwner)!;
  const amina = me.profiles.find((x) => !x.isOwner)!;
  expect(moi.kind).toBe('adulte');

  // Moi est le profil actif (aucun code parent n'est demandé tant que aucun enfant n'est actif)
  await page.goto('/profils');
  await page.locator(`button[data-profile="${moi.id}"]`).click();
  const qui = page.getByTestId('eleve-actif');
  await expect(qui).toContainText(moi.pseudonym);
  await expect(page.locator('nav.tabs')).toHaveAttribute('data-public', 'adulte');

  // la feuille : en bas sur mobile, colonne à gauche sur ordinateur
  await qui.click();
  const feuille = page.getByTestId('bascule');
  await expect(feuille).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await feuille.boundingBox())!;
  if (vp.width < 900) {
    expect(Math.round(box.y + box.height)).toBe(vp.height);
    expect(Math.round(box.width)).toBe(vp.width);
  } else {
    expect(Math.round(box.x)).toBe(0);
    expect(box.width).toBeLessThan(400);
    expect(box.height).toBeGreaterThan(vp.height / 2);
  }
  await expect(page.getByTestId('bascule-moi')).toHaveAttribute('aria-current', 'true');
  // Échap ferme, et le focus revient au bouton
  await page.keyboard.press('Escape');
  await expect(feuille).toHaveCount(0);
  await expect(qui).toBeFocused();

  // un toucher sur l'enfant : pas de code parent (le profil actif est celui d'un adulte)
  await qui.click();
  await page.locator(`button[data-profile="${amina.id}"]`).click();
  await expect(feuille).toHaveCount(0);
  await expect(qui).toContainText('Amina');
  await expect(page.locator('nav.tabs')).toHaveAttribute('data-public', 'enfant');

  // retour à l'espace parent : le code parent est demandé
  await qui.click();
  await page.locator(`button[data-profile="${moi.id}"]`).click();
  await expect(page.getByTestId('bascule-pin')).toBeVisible();
  await page.getByTestId('bascule-pin').fill('0000');
  await page.getByTestId('bascule-valider').click();
  await expect(feuille.getByRole('alert')).toBeVisible();
  await expect(qui).toContainText('Amina');
  await page.getByTestId('bascule-pin').fill('4821');
  await page.getByTestId('bascule-valider').click();
  await expect(feuille).toHaveCount(0);
  await expect(qui).toContainText(moi.pseudonym);
  // « Moi » apprend en adulte
  await expect(page.locator('nav.tabs')).toHaveAttribute('data-public', 'adulte');
});

test('la feuille d’un parent sans profil « Moi » propose d’ouvrir « Mon espace d’apprentissage »', async ({
  page,
}) => {
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      intention: 'enfants',
      email: `bascule2-${Date.now()}@exemple.org`,
      password: MDP,
      country: 'FR',
      birthYear: 1985,
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(r.status()).toBe(201);
  for (const nom of ['Samir', 'Lina']) {
    const p = await page.request.post('/api/v1/profiles', {
      headers: H,
      data: {
        pseudonym: nom,
        birthYear: new Date().getFullYear() - 8,
        password: MDP,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      },
    });
    expect(p.status()).toBe(201);
  }
  await page.goto('/profils');
  await page.getByRole('button', { name: /Samir/ }).first().click();
  await page.getByTestId('eleve-actif').click();
  await expect(page.getByTestId('bascule-enfant')).toHaveCount(2);
  await expect(page.getByTestId('bascule-ajouter')).toBeVisible();
  await page.getByTestId('bascule-enfant').nth(1).click();
  await expect(page.getByTestId('bascule')).toHaveCount(0);
});
