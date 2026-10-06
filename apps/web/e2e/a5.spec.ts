import type { Page } from '@playwright/test';
import { expect, newAdult, test } from './fixtures';

/**
 * A5 — « Réciter et vérifier » (interrupteur « ecoute_ia » ouvert pour les e2e). Micro FACTICE de Chromium
 * (bips, aucune voix) ; service d'écoute FACTICE (e2e/ecoute-essai.mjs) qui « entend » Al-Ikhlāṣ sans son
 * 3e mot. Vérifie : accord au premier usage, enregistrement puis vérification, mot oublié surligné avec
 * bienveillance, rappel « seul ton maître juge », jamais de note ; suivi en direct avec texte caché qui se
 * dévoile ; l'audio n'est envoyé qu'à la vérification et n'est jamais renvoyé.
 */
test.use({
  compte: null,
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
  },
});

async function ouvrir(page: Page) {
  await newAdult(page, 'a5');
  await page.goto('/coran/lecteur?s=112&a=1&memo=1');
  await expect(page.getByTestId('mode-memoriser')).toBeVisible();
  await page.getByTestId('reciter-verifier').click();
  await expect(page.getByTestId('panneau-ecoute')).toBeVisible();
  // premier usage : accord « analyse vocale par IA », jamais coché d'avance
  await expect(page.getByTestId('ecoute-accord')).toContainText('jamais gardée');
  await page.getByTestId('ecoute-accepter').click();
  await expect(page.getByTestId('ecoute-pret')).toBeVisible();
}

test('enregistrer puis vérifier : mot oublié surligné, le maître seul juge', async ({ page }) => {
  const envois: Array<{ url: string; type: string }> = [];
  page.on('request', (r) => {
    if (r.url().includes('/ecoute/verifier'))
      envois.push({ url: r.url(), type: r.headers()['content-type'] ?? '' });
  });
  await ouvrir(page);
  await page.getByTestId('ecoute-commencer').click();
  await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
  // aucun envoi pendant l'enregistrement
  await page.waitForTimeout(2500);
  expect(envois).toHaveLength(0);
  await page.getByTestId('ecoute-terminer').click();
  await expect(page.getByTestId('ecoute-resultat')).toBeVisible();
  expect(envois).toHaveLength(1);
  expect(envois[0]!.url).toMatch(/s=112&from=1&to=\d/);
  // l'enregistrement du micro (factice : bips) part tel quel, en audio
  expect(envois[0]!.type).toMatch(/^audio\//);
  await expect(page.getByTestId('ecoute-a-revoir')).toContainText('1 mot à revoir');
  const oublie = page.locator('[data-testid="ecoute-texte"] .mot.oublie');
  await expect(oublie).toHaveCount(1);
  await expect(page.getByTestId('ecoute-ecarts')).toContainText('Verset 1 : mot oublié');
  await expect(page.getByTestId('ecoute-maitre-juge')).toContainText(
    'Seul ton maître juge ta récitation',
  );
  // ni note, ni « valide », ni jugement de la qualité
  await expect(page.getByTestId('panneau-ecoute')).not.toContainText(
    /valid|\/20|excellent|parfait/i,
  );
  // « Envoyer au maître » proposé (par l'envoi existant, avec son propre accord)
  await expect(page.getByTestId('ecoute-envoyer-maitre')).toBeVisible();
  // réciter encore : retour au choix
  await page.getByTestId('ecoute-encore').click();
  await expect(page.getByTestId('ecoute-pret')).toBeVisible();
});

test('suivi en direct : texte caché qui se dévoile, puis le même bilan', async ({ page }) => {
  await ouvrir(page);
  await expect(page.getByTestId('ecoute-masque')).toBeChecked();
  await page.getByTestId('ecoute-direct').click();
  await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
  // le texte est caché, les mots reconnus apparaissent
  await expect(page.locator('[data-testid="ecoute-texte"].masque')).toBeVisible();
  await expect(page.locator('[data-testid="ecoute-texte"] .mot.ok').first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId('ecoute-terminer').click();
  await expect(page.getByTestId('ecoute-resultat')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ecoute-a-revoir')).toContainText('1 mot à revoir');
});
