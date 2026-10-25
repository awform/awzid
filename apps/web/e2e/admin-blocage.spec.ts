import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Administration — blocage d'un compte, un par un : saisie de l'adresse, boutons « Bloquer » / « Débloquer », message
 * affiché À CÔTÉ des boutons, liste des comptes bloqués ; le compte bloqué ne peut plus se connecter.
 */
const H = { 'x-awform': '1' };

async function admin(browser: Browser, label: string): Promise<Page> {
  const email = `admin-bl-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
  );
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adm = await ctx.newPage();
  expect(
    (
      await adm.request.post('/api/v1/auth/login', {
        headers: H,
        data: { email, password: password() },
      })
    ).status(),
  ).toBe(200);
  const { secret } = (await (
    await adm.request.post('/api/v1/auth/totp/setup', { headers: H, data: {} })
  ).json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}

test('l’administrateur bloque puis débloque un compte', async ({ browser, page }) => {
  const proj = test.info().project.name;
  const mail = `${proj[0]}bloque-${proj}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const login = () =>
    page.request.post('/api/v1/auth/login', {
      headers: H,
      data: { email: mail, password: password() },
    });
  expect(
    (
      await page.request.post('/api/v1/auth/signup', {
        headers: H,
        data: {
          kind: 'adulte',
          email: mail,
          password: password(),
          country: 'FR',
          consents: ['cgu', 'donnee_religieuse_art9'],
          birthYear: new Date().getFullYear() - 30,
          pseudonym: 'Moi',
        },
      })
    ).status(),
  ).toBe(201);

  const adm = await admin(browser, 'bl');
  await adm.goto('/admin');
  const bloc = adm.getByTestId('blocage');
  await expect(bloc).toBeVisible();
  // champ vide : message à côté des boutons
  await bloc.getByTestId('blocage-bloquer').click();
  await expect(bloc.getByTestId('blocage-message')).not.toBeEmpty();

  await bloc.getByTestId('blocage-id').fill(mail);
  await bloc.getByTestId('blocage-bloquer').click();
  // le message est dans la même rangée que les boutons
  const lignes = bloc.getByTestId('blocage-ligne').filter({ hasText: `${proj[0]}…` });
  const rangee = bloc.getByTestId('blocage-bloquer').locator('xpath=..');
  await expect(rangee.getByTestId('blocage-message')).toContainText(/bloqué/i);
  await expect(lignes).toHaveCount(1);
  expect((await login()).status()).toBe(403);

  await bloc.getByTestId('blocage-debloquer').click();
  await expect(rangee.getByTestId('blocage-message')).toContainText(/débloqué/i);
  await expect(lignes).toHaveCount(0);
  expect((await login()).status()).toBe(200);
});
