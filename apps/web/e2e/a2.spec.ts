import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { openSettings } from './coran';
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

/** Fichiers d'essai demandés au serveur (récitateur en ligne d'essai : bips d'« essai-hafs »). */
function watchAudio(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => {
    const m = /\/api\/v1\/quran\/audio\/file\/essai-hafs\/(\d{6})-/.exec(r.url());
    if (m) asked.push(m[1]!);
  });
  return asked;
}
async function tapAndPlay(page: Page, asked: string[], v: Locator, action: string) {
  await v.scrollIntoViewIfNeeded();
  await v.click();
  await expect(page.getByTestId('menu-verset')).toBeVisible();
  asked.length = 0;
  await page.getByTestId(action).click();
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
  return asked[0]!;
}

test('lecteur : récitateur en ligne — verset LU = verset CHOISI, surlignage, répétition', async ({
  page,
}) => {
  const asked = watchAudio(page);
  for (const [s, a] of [
    [1, 5],
    [1, 7],
    [112, 3],
  ] as const) {
    await page.goto(`/coran/lecteur?r=essai-qf&s=${s}&a=${a}&vue=versets`);
    await expect(page.getByTestId('barre-coran')).toBeVisible();
    await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
    const v = page.locator(`[data-testid="texte-coran"] [data-aya="${a}"]`);
    for (const action of ['menu-repeter', 'menu-ecouter']) {
      await page.evaluate(() => {
        const w = window as unknown as { __heard: string[] };
        w.__heard = [];
        new MutationObserver(() => {
          const el = document.querySelector('[data-testid="texte-coran"] .aya.now');
          if (el) w.__heard.push(el.getAttribute('data-aya') ?? '');
        }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
      });
      const key = await tapAndPlay(page, asked, v, action);
      const want = `${String(s).padStart(3, '0')}${String(a).padStart(3, '0')}`;
      expect(key, `${s}:${a} ${action}`).toBe(want);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __heard: string[] }).__heard[0]), {
          timeout: 15_000,
        })
        .toBe(String(a));
      const stop = page.getByTestId('arreter-audio');
      if (await stop.isEnabled().catch(() => false)) await stop.click();
    }
  }
});

test('Réglages : récitateur « en ligne » étiqueté, pas de « garder cette sourate », hors connexion désactivé', async ({
  page,
  context,
}) => {
  await page.goto('/coran/lecteur?r=essai-qf&s=1&vue=versets');
  await openSettings(page);
  await expect(page.getByTestId('recitateur-en-ligne')).toBeVisible();
  await expect(page.getByTestId('en-ligne-aide')).toBeVisible();
  await expect(page.getByTestId('garde-impossible-en-ligne')).toBeVisible();
  await expect(page.getByTestId('garder-sourate')).toHaveCount(0);
  await context.setOffline(true);
  try {
    await expect(page.getByTestId('dispo-internet')).toContainText('Disponible avec Internet');
    await expect(
      page.getByTestId('choix-recitateur').locator('option[value="essai-hafs"]'),
    ).toBeEnabled();
    await expect(
      page.getByTestId('choix-recitateur').locator('option[value="essai-qf"]'),
    ).toContainText('Disponible avec Internet');
  } finally {
    await context.setOffline(false);
  }
  // un récitateur du Complexe garde « garder cette sourate »
  await page.goto('/coran/lecteur?r=essai-hafs&s=1&vue=versets');
  await openSettings(page);
  await expect(page.getByTestId('garde-impossible-en-ligne')).toHaveCount(0);
});
