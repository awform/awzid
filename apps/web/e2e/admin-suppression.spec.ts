import { execFileSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Administration — suppression d'un compte à la demande de la personne : double confirmation (adresse retapée + mot
 * de passe de l'administrateur), motif obligatoire ; l'adresse redevient libre tout de suite.
 */
const H = { 'x-awform': '1' };

async function admin(browser: Browser, label: string): Promise<{ page: Page; email: string }> {
  const email = `admin-su-${label}-${test.info().project.name}-${Date.now()}@e2e.test`;
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
  return { page: adm, email };
}

test('l’administrateur supprime un compte à la demande de la personne, l’adresse redevient libre', async ({
  browser,
  page,
}) => {
  const proj = test.info().project.name;
  const mail = `${proj[0]}suppr-${proj}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const corps = {
    kind: 'adulte',
    email: mail,
    password: password(),
    country: 'FR',
    consents: ['cgu', 'donnee_religieuse_art9'],
    birthYear: new Date().getFullYear() - 30,
    pseudonym: 'Moi',
  };
  expect(
    (await page.request.post('/api/v1/auth/signup', { headers: H, data: corps })).status(),
  ).toBe(201);
  expect(
    (await page.request.post('/api/v1/auth/signup', { headers: H, data: corps })).status(),
  ).toBe(409);

  const { page: adm, email: monMail } = await admin(browser, 'su');
  await adm.goto('/admin');
  const bloc = adm.getByTestId('suppression');
  await expect(bloc).toBeVisible();
  await expect(bloc).toContainText(/30 jours/);
  const msg = bloc.getByTestId('suppr-message');

  // champs manquants
  await bloc.getByTestId('suppr-bouton').click();
  await expect(msg).not.toBeEmpty();

  // adresse retapée incorrecte : rien n'est supprimé
  await bloc.getByTestId('suppr-id').fill(mail);
  await bloc.getByTestId('suppr-confirm').fill('autre@e2e.test');
  await bloc.getByTestId('suppr-motif').fill('demande de la personne par WhatsApp le 28/10');
  await bloc.getByTestId('suppr-mdp').fill(password());
  await bloc.getByTestId('suppr-bouton').click();
  await expect(msg).toContainText(/ne correspond pas/i);

  // mot de passe de l'administrateur incorrect
  await bloc.getByTestId('suppr-confirm').fill(mail);
  await bloc.getByTestId('suppr-mdp').fill('faux faux faux faux 99');
  await bloc.getByTestId('suppr-bouton').click();
  await expect(msg).toContainText(/mot de passe incorrect/i);

  // son propre compte : refusé
  await bloc.getByTestId('suppr-id').fill(monMail);
  await bloc.getByTestId('suppr-confirm').fill(monMail);
  await bloc.getByTestId('suppr-mdp').fill(password());
  await bloc.getByTestId('suppr-bouton').click();
  await expect(msg).toContainText(/propre compte/i);

  // suppression valide
  await bloc.getByTestId('suppr-id').fill(mail);
  await bloc.getByTestId('suppr-confirm').fill(mail);
  await bloc.getByTestId('suppr-mdp').fill(password());
  await bloc.getByTestId('suppr-bouton').click();
  await expect(msg).toContainText(/Compte supprimé/i);

  // accès coupé, adresse libre : une nouvelle inscription avec la même adresse réussit
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: H,
        data: { email: mail, password: password() },
      })
    ).status(),
  ).toBe(401);
  expect(
    (await page.request.post('/api/v1/auth/signup', { headers: H, data: corps })).status(),
  ).toBe(201);
});
