import { expect, test } from './fixtures';

/**
 * 19/10/2026 — incident de 61060e7 : nouveau code + ancien catalogue de textes gardé par le service worker =
 * clés brutes (⟦id.google⟧…). Ici, le cache du service worker reçoit un ANCIEN catalogue (sans les clés `id.*`) à
 * l'adresse fixe d'avant, comme sur le téléphone du client ; la page de connexion doit quand même s'afficher avec
 * ses textes (catalogue de SA version, demandé sous /i18n/<version>/), sans aucune clé brute.
 */
test.use({ compte: null });

test('un ancien catalogue en cache ne donne jamais de clé brute : le catalogue de la version est demandé et servi', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // empoisonne les caches de fichiers : anciens catalogues à l'adresse fixe, sans les clés de l'écran d'identité
  const gardes = await page.evaluate(async () => {
    const ancien = JSON.stringify({ 'app.nom': 'Awzid' });
    const noms = (await caches.keys()).filter((k) => k.startsWith('awform-shell-'));
    for (const n of noms) {
      const c = await caches.open(n);
      for (const f of ['fr-rares', 'fr-acces'])
        await c.put(
          `/i18n/${f}.json`,
          new Response(ancien, { headers: { 'content-type': 'application/json' } }),
        );
    }
    return noms.length;
  });
  expect(gardes).toBeGreaterThan(0);
  const catalogues: string[] = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/i18n/')) catalogues.push(p);
  });
  await page.goto('/connexion');
  await expect(page.getByTestId('entree-google')).toContainText('Continuer avec Google');
  await expect(page.getByTestId('entree-email-titre')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('⟦');
  expect(
    await page.evaluate(
      () => (window as unknown as { __awzidManques?: string[] }).__awzidManques ?? [],
    ),
  ).toEqual([]);
  // les catalogues sont demandés à l'adresse de la version, jamais à l'adresse fixe
  expect(catalogues.length).toBeGreaterThan(0);
  expect(catalogues.every((p) => /^\/i18n\/[^/]+\/[^/]+\.json$/.test(p))).toBe(true);
  expect(catalogues.some((p) => p.endsWith('/fr-rares.json'))).toBe(true);
});
