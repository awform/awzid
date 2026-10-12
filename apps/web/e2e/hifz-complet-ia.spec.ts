import { expect, newAdult, test } from './fixtures';

/**
 * Hifẓ complet — test au hasard AVEC l'IA d'écoute (A5, interrupteur « ecoute_ia » ouvert pour les e2e) : micro
 * FACTICE de Chromium (bips, aucune voix), service d'écoute FACTICE (e2e/ecoute-essai.mjs) qui « entend »
 * Al-Ikhlāṣ sans son 3e mot. L'IA vérifie ; ses mots à revoir sont montrés sur la réponse ; l'élève s'évalue
 * toujours lui-même (seul le maître juge) et les bilans de l'IA restent sur l'appareil.
 */
test.use({
  compte: null,
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
  },
});

const ilYa = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

test('test au hasard : l’IA d’écoute vérifie, ses mots à revoir sont montrés, l’élève s’évalue', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'hz-ia');
  await page.request.put(`/api/v1/hifz/profiles/${profileId}/plan`, {
    headers: { 'x-awform': '1' },
    data: { mode: 'carnet', bookCode: 'ad1', startDate: ilYa(30) },
  });
  await page.request.post('/api/v1/attempts', {
    headers: { 'x-awform': '1' },
    data: {
      events: [
        {
          id: crypto.randomUUID(),
          profileId,
          unitId: 'hifz',
          eventType: 'hifz',
          response: { day: ilYa(5), part: '112:1-4', kind: 'appris', source: 'auto' },
          deviceAt: new Date().toISOString(),
        },
      ],
    },
  });
  const envois: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/ecoute/verifier')) envois.push(r.url());
  });
  await page.goto('/hifz/test?verset=112:1');
  await expect(page.getByTestId('test-hasard')).toHaveAttribute('data-verset', '112:1');
  // avec l'IA : « Réciter et vérifier » est l'action principale, « Voir la suite » ne l'est plus
  await expect(page.getByTestId('reciter-verifier')).toHaveClass(/primary/);
  await expect(page.getByTestId('voir-suite')).not.toHaveClass(/primary/);
  await page.getByTestId('reciter-verifier').click();
  await expect(page.getByTestId('panneau-ecoute')).toBeVisible();
  await page.getByTestId('ecoute-accepter').click();
  await page.getByTestId('ecoute-commencer').click();
  await expect(page.getByTestId('ecoute-en-cours')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByTestId('ecoute-terminer').click();
  await expect(page.getByTestId('ecoute-resultat')).toBeVisible();
  // la portion vérifiée est celle du test (le verset tiré et sa suite)
  expect(envois[0]).toMatch(/s=112&from=1&to=3/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panneau-ecoute')).toHaveCount(0);
  await page.getByTestId('voir-suite').click();
  // le mot oublié repéré par l'IA est surligné discrètement sur la réponse
  await expect(page.locator('[data-mots^="112:"] .mot.erreur').first()).toBeVisible();
  await page.locator('button[data-eval="hesitant"]').click();
  await expect(page.getByTestId('test-note')).toBeVisible();
});
