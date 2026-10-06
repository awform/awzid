import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

/**
 * Chantier A2 — récitateurs EN LIGNE (Quran Foundation). Dans les e2e, l'API de QF est SIMULÉE par l'API de
 * test (QF_ENV=essai) et le récitateur « Essai en ligne » renvoie les FICHIERS D'ESSAI NON CORANIQUES (bips)
 * d'« essai-hafs » : jamais une vraie récitation, jamais un appel réseau à QF.
 */

test('Mes récitateurs : récitateur « En ligne » avec crédit QF ; hors connexion « Disponible avec Internet »', async ({
  page,
  context,
}) => {
  await page.goto('/coran/recitateurs');
  const card = page.locator('[data-reciter="essai-qf"]');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('en-ligne')).toContainText('En ligne');
  await expect(card.getByTestId('en-ligne-aide')).toContainText('rien n');
  await expect(card.getByTestId('credit-recitateur')).toContainText('Quran Foundation');
  await expect(card.getByTestId('usage-note')).toContainText('en ligne seulement');
  // les récitateurs du Complexe ne portent pas l'étiquette
  await expect(page.locator('[data-reciter="essai-hafs"]').getByTestId('en-ligne')).toHaveCount(0);
  const serious = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => v.id)).toEqual([]);

  await context.setOffline(true);
  try {
    await expect(card.getByTestId('dispo-internet')).toContainText('Disponible avec Internet');
    await expect(card.getByTestId('choisir')).toBeDisabled();
    // les autres restent utilisables (fichiers gardés sur l'appareil)
    await expect(
      page.locator('[data-reciter="essai-qalun"]').getByTestId('dispo-internet'),
    ).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
  await expect(card.getByTestId('en-ligne-aide')).toBeVisible();
  await expect(card.getByTestId('choisir')).toBeEnabled();
});

test('Nos garanties : crédit de l’écoute en ligne (Quran Foundation)', async ({ page }) => {
  await page.goto('/garanties');
  await expect(page.getByTestId('credit-audio-en-ligne')).toContainText('Quran Foundation');
});

test('API : pistes du récitateur en ligne réservées aux comptes connectés, aucun paquet hors ligne', async ({
  page,
}) => {
  const r = await page.request.get('/api/v1/quran/audio/reciters/essai-qf/suras/1');
  expect(r.status()).toBe(200);
  const m = await r.json();
  expect(m.enLigne).toBe(true);
  expect(m.files.map((f: { aya: number }) => f.aya)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect((await page.request.get('/api/v1/quran/audio/reciters/essai-qf/packs')).status()).toBe(
    404,
  );
  await page.context().clearCookies();
  expect((await page.request.get('/api/v1/quran/audio/reciters/essai-qf/suras/1')).status()).toBe(
    401,
  );
});
