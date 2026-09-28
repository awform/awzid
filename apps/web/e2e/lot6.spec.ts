import type { Page } from '@playwright/test';
import { expect, newAdult, test } from './fixtures';

/**
 * Lot 6 : tracé guidé des lettres, cartes de mots (et mini-jeu des petits), tableau de bord, page publique
 * du QR code (et ouverture directe de la leçon quand elle est sur l'appareil).
 */
test.use({ compte: null });

/** Trace un trait dans la zone (coordonnées du dessin, 320 × 320). */
async function stroke(page: Page, pts: Array<[number, number]>) {
  const c = page.getByTestId('trace');
  await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  const at = ([x, y]: [number, number]) =>
    [b.x + (x * b.width) / 320, b.y + (y * b.height) / 320] as const;
  await page.mouse.move(...at(pts[0]!));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 6 });
  await page.mouse.up();
}

test('tracé guidé : alif de haut en bas → bravo ; hors de la lettre → message doux', async ({
  page,
}) => {
  await newAdult(page, 'trace');
  await page.goto('/ecriture');
  await page.locator('[data-lettre="ا"]').click();
  const canvas = page.getByTestId('trace');
  await expect(canvas).not.toHaveAttribute('data-box', '');
  const [x0, y0, x1, y1] = (await canvas.getAttribute('data-box'))!.split(',').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const cx = (x0 + x1) / 2;
  const h = y1 - y0;
  // à l'envers (de bas en haut) : on repart du point vert
  await stroke(page, [
    [cx, y1 - h * 0.05],
    [cx, y0 + h * 0.05],
  ]);
  await page.getByTestId('verifier').click();
  await expect(page.getByTestId('trace-message')).toHaveText(
    'Recommence en partant du point vert.',
  );
  await page.getByTestId('effacer').click();
  await stroke(page, [
    [cx, y0 + h * 0.03],
    [cx, (y0 + y1) / 2],
    [cx, y1 - h * 0.03],
  ]);
  await page.getByTestId('verifier').click();
  await expect(page.getByTestId('trace-message')).toHaveText("Bravo ! C'est bien tracé.");
  await expect(page.getByTestId('reussis')).toContainText('1 tracé réussi');
  // étape suivante proposée automatiquement ; un gribouillis hors de la lettre
  await expect(page.locator('[data-etape="2"]')).toHaveClass(/primary/);
  await stroke(page, [
    [10, 10],
    [60, 40],
    [20, 90],
  ]);
  await page.getByTestId('verifier').click();
  await expect(page.getByTestId('trace-message')).toHaveText(
    'Reste bien sur la lettre, doucement.',
  );
  // le tableau de bord compte les tracés (aucune note)
  await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });
  await page.goto('/suivi');
  await expect(page.getByTestId('entrainement')).toContainText('Tracés réussis : 1 sur 3', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('activite')).toBeVisible();
});

test('cartes de mots : recto arabe, verso sens, « je savais » / « à revoir »', async ({ page }) => {
  await newAdult(page, 'cartes');
  await page.goto('/');
  await page.getByTestId('lien-revisions').click();
  const card = page.getByTestId('carte');
  await expect(card).toBeVisible();
  const before = await card.textContent();
  await expect(page.getByTestId('sens')).toHaveCount(0);
  await page.getByTestId('retourner').click();
  await expect(page.getByTestId('sens')).toBeVisible();
  await page.getByTestId('je-savais').click();
  await expect(card).not.toHaveText(before ?? '');
  await page.getByTestId('retourner').click();
  await page.getByTestId('a-revoir').click();
  // aucune translittération : seulement l'arabe et le sens français
  await expect(card.locator('[lang="ar"]').first()).toBeVisible();
});

test.describe('enfant E1', () => {
  test.use({ compte: 'parent' });
  test('mini-jeu « relier le mot et l’image » avec l’adulte', async ({ page }) => {
    await page.goto('/profils');
    await page.locator('[data-profile]').filter({ hasText: 'Yanis' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/revisions');
    const game = page.getByTestId('jeu');
    await expect(game).toBeVisible();
    const words = game.locator('[data-mot]');
    await expect(words.first()).toBeVisible();
    const n = await words.count();
    expect(n).toBeGreaterThan(1);
    const ar = (await words.first().getAttribute('data-mot'))!;
    await words.first().click();
    await game.locator(`[data-image="${ar}"]`).click();
    await expect(game.locator('[data-mot]')).toHaveCount(n - 1);
  });
});

test('QR code du livre : page publique légère, sans exercice ni corrigé', async ({
  page,
  request,
}) => {
  const r = await request.get('/l/en1-05');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/html');
  const html = await r.text();
  expect(Buffer.byteLength(html)).toBeLessThan(100_000);
  expect(html).not.toMatch(/<script/i);
  // ni exercice ni corrigé : aucun élément d'exercice, aucune clé de réponse
  expect(html).not.toMatch(/data-exercise|data-type=|"reponse"|"vrai"/);
  expect((await request.get('/l/en1-99')).status()).toBe(404);
  await page.goto('/l/en1-05');
  await expect(page.getByRole('link', { name: "Continuer dans l'application" })).toHaveAttribute(
    'href',
    '/lecons/en1.l05',
  );
});

test('QR code : leçon déjà sur l’appareil → ouverte directement dans l’application', async ({
  page,
}) => {
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const row = page.locator('tr[data-level="en1"]');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(row.getByTestId('etat')).toContainText("sur l'appareil");
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await page.goto('/l/en1-05');
  await expect(page).toHaveURL(/\/lecons\/en1\.l05$/);
});
