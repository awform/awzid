import type { Page } from '@playwright/test';
import { expect, loginTeacher, newAdult, test } from './fixtures';

/**
 * Complément A — en-têtes de sécurité et politique de sécurité du contenu (CSP) stricte : aucun script ni
 * <style> en ligne permis globalement, aucune ressource tierce ; aucun écran principal ne déclenche de
 * violation de la CSP (événement « securitypolicyviolation » relevé dans la page).
 */
test.use({ compte: null });

async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`,
      ),
    );
  });
  const refused: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) refused.push(m.text());
  });
  // relevé depuis le dernier appel (la liste de la page repart à zéro à chaque chargement)
  return async () => [
    ...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp?.splice(0))) ??
      []),
    ...refused.splice(0),
  ];
}

test('en-têtes : CSP stricte des pages, en-têtes de l’API', async ({ page }) => {
  const r = await page.request.get('/connexion');
  const csp = r.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self'( 'nonce-[^']+'| 'sha256-[^']+')+/);
  expect(csp).toMatch(/style-src 'self'(;|$| 'nonce-| 'sha256-)/);
  expect(csp).not.toMatch(/(script|style)-src [^;]*unsafe-inline/);
  expect(csp).toContain("style-src-attr 'unsafe-inline'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("media-src 'self' blob:");
  // l'API elle-même (en production, Caddy la sert directement sous /api ; ici le relais de développement
  // ne recopie que quelques en-têtes)
  const a = await page.request.get(
    `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}/api/v1/health`,
  );
  const h = a.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['cross-origin-resource-policy']).toBe('same-origin');
  expect(h['cache-control']).toBe('no-store');
  expect(h['x-powered-by']).toBeUndefined();
});

test('aucune violation de la CSP sur les écrans principaux', async ({ page }, info) => {
  test.setTimeout(120_000);
  const violations = await watchCsp(page);
  const seen: string[] = [];
  const visit = async (url: string) => {
    await page.goto(url);
    await page.locator('main h1').first().waitFor();
    seen.push(...(await violations()).map((v) => `${url} : ${v}`));
  };
  // témoin : un <style> injecté est bien refusé ET relevé (le détecteur fonctionne)
  await page.goto('/aide');
  await page.locator('main h1').first().waitFor();
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'body { outline: 1px solid red }';
    document.head.append(st);
  });
  const temoin: string[] = [];
  await expect
    .poll(async () => {
      temoin.push(...(await violations()));
      return temoin.join(' ');
    })
    .toContain('style-src');
  await page.waitForTimeout(200);
  await violations(); // messages tardifs du témoin écartés
  for (const u of ['/connexion', '/inscription', '/garanties', '/aide', '/lecons/en1.l01'])
    await visit(u);
  await newAdult(page, `csp-${info.project.name}`);
  for (const u of ['/aujourdhui', '/compte', '/messages', '/sourates', '/recital', '/activation'])
    await visit(u);
  // leçon ouverte par la navigation interne (hydratation, styles calculés)
  await page.goto('/niveaux/en1');
  await page.locator('main h1').first().waitFor();
  seen.push(...(await violations()));
  expect(seen).toEqual([]);
});

test('aucune violation de la CSP dans l’espace enseignant', async ({ page }) => {
  test.setTimeout(120_000);
  const violations = await watchCsp(page);
  await loginTeacher(page);
  const c = await page.request.post('/api/v1/teacher/classes', {
    headers: { 'x-awform': '1' },
    data: { name: `CSP ${Date.now()}` },
  });
  const id = (await c.json()).class.id as string;
  await page.goto(`/enseignant/classe/${id}`);
  await page.getByTestId('liste-eleves').waitFor();
  for (const tab of ['devoirs', 'tableau', 'ecoute', 'certificats', 'messages', 'recital'])
    await page.getByTestId(`onglet-${tab}`).click();
  await page.goto('/enseignant/ecole');
  await page.locator('main h1').first().waitFor();
  expect(await violations()).toEqual([]);
});
