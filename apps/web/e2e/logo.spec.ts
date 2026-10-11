import { expect, test } from './fixtures';

/**
 * Logo Awzid : symbole + nom en texte dans l'en-tête et sur la page de connexion (avec le slogan, seulement
 * là) ; manifeste PWA avec icônes 192, 512 et « maskable » valides et chargeables.
 */

function dimensionsPng(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test.describe('visiteur', () => {
  test.use({ compte: null });

  test('connexion : symbole, nom Awzid en texte et slogan ; en-tête : symbole et nom, sans slogan', async ({
    page,
  }) => {
    await page.goto('/connexion');
    const hero = page.getByTestId('connexion-marque');
    await expect(hero.getByTestId('marque-symbole').locator('img').first()).toBeAttached();
    await expect(hero.locator('.word')).toHaveText('Awzid');
    await expect(hero.getByTestId('marque-slogan')).toHaveText('Grandir dans le savoir');
    // l'en-tête : symbole + nom écrit, jamais de slogan
    const entete = page.getByTestId('accueil');
    await expect(entete.getByTestId('marque-symbole')).toBeAttached();
    await expect(entete.locator('.word')).toHaveText('Awzid');
    await expect(entete.getByTestId('marque-slogan')).toHaveCount(0);
    expect(await page.getByTestId('marque-slogan').count()).toBe(1);
    // le symbole est bien le fichier de la marque, chargeable
    const src = await entete.locator('img').first().getAttribute('src');
    const r = await page.request.get(src!);
    expect(r.status()).toBe(200);
    expect(await r.text()).toContain('viewBox="76 36 168 216"');
  });
});

test('en-tête connecté : symbole et nom Awzid, sans slogan', async ({ page }) => {
  await page.goto('/aujourdhui');
  const entete = page.getByTestId('accueil');
  await expect(entete.getByTestId('marque-symbole')).toBeAttached();
  await expect(entete).toHaveAttribute('aria-label', 'Awzid');
  await expect(page.getByTestId('marque-slogan')).toHaveCount(0);
});

test('manifeste : couleurs de marque, icônes 192, 512 et maskable valides et chargeables', async ({
  page,
  request,
}) => {
  const m = (await (await request.get('/manifest.webmanifest')).json()) as {
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };
  expect(m.theme_color).toBe('#0B6E4F');
  expect(m.background_color).toBe('#FBF7EE');
  const attendues = [
    ['192x192', 'any', 192],
    ['512x512', 'any', 512],
    ['512x512', 'maskable', 512],
  ] as const;
  for (const [sizes, purpose, n] of attendues) {
    const ic = m.icons.find((i) => i.sizes === sizes && i.purpose === purpose);
    expect(ic, `${sizes} ${purpose}`).toBeTruthy();
    expect(ic!.type).toBe('image/png');
    const r = await request.get(ic!.src);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
    expect(dimensionsPng(await r.body())).toEqual({ w: n, h: n });
  }
  // favicon et apple-touch déclarés dans la page, chargeables
  await page.goto('/connexion');
  for (const [sel, n] of [
    ['link[rel="icon"][sizes="16x16"]', 16],
    ['link[rel="icon"][sizes="32x32"]', 32],
    ['link[rel="icon"][sizes="48x48"]', 48],
    ['link[rel="apple-touch-icon"]', 180],
  ] as const) {
    const href = await page.locator(sel).getAttribute('href');
    expect(href, sel).toBeTruthy();
    const r = await request.get(href!);
    expect(r.status(), sel).toBe(200);
    expect(dimensionsPng(await r.body()), sel).toEqual({ w: n, h: n });
  }
  expect(await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href')).toMatch(
    /\/favicon\.svg$/,
  );
});
