import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * A26b, phase 1 — « Je parle » : scénario guidé SANS IA tiré du dialogue de la leçon (choix multiples), joué en
 * entier en en1 et en ad1, dont une fois SANS RÉSEAU ; aide douce (jamais de rouge), traduction sur demande,
 * décor sans personnage, mots proposés à « Mes mots ».
 * Captures 375 px (clair, sombre) si CONV_CAPTURES est défini.
 */
const CAPTURES = process.env.CONV_CAPTURES;

async function jouer(page: Page, opts: { erreurDAbord?: boolean } = {}) {
  let premiere = true;
  for (let n = 0; n < 20; n++) {
    const tour = page.getByTestId('jp-tour');
    if (!(await tour.isVisible())) break;
    if (premiere && opts.erreurDAbord) {
      const faux = page.locator('[data-testid="jp-choix"]:not([data-kind="bonne"])').first();
      await faux.click();
      const aide = page.getByTestId('jp-aide');
      await expect(aide).toBeVisible();
      // aide douce : jamais de rouge
      const couleurs = await aide.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.color, s.backgroundColor];
      });
      for (const c of couleurs) {
        const [r, g, b] = (c.match(/\d+/g) ?? []).map(Number) as [number, number, number];
        expect(r > 150 && g < 90 && b < 90, c).toBe(false);
      }
      // le choix essayé reste là (plus discret), la scène n'avance pas
      await expect(page.getByTestId('jp-tour')).toBeVisible();
    }
    premiere = false;
    const avant = await page.getByTestId('jp-moi').count();
    await page.locator('[data-testid="jp-choix"][data-kind="bonne"]').click();
    await expect(page.getByTestId('jp-moi')).toHaveCount(avant + 1);
  }
  await expect(page.getByTestId('jp-fin')).toBeVisible();
}

async function ouvrir(page: Page, unit: string) {
  await page.goto(`/lecons/${unit}`);
  const b = page.getByTestId('jp-ouvrir');
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await expect(page.getByTestId('je-parle')).toBeVisible();
}

test('en1 : scène complète du verger (en1.l05), traduction, aide douce, Mes mots, puis hors ligne', async ({
  page,
  context,
}) => {
  // niveau gardé sur l'appareil (leçons hors ligne), puis leçon ouverte une fois en ligne (scénario gardé)
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const row = page.locator('tr[data-level="en1"]');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(row.getByTestId('etat')).toContainText("sur l'appareil", { timeout: 30_000 });

  await ouvrir(page, 'en1.l05');
  const ecran = page.getByTestId('je-parle');
  // décor du livre, AUCUN personnage (aucun symbole de personnage dans la scène)
  const persos = await ecran
    .locator('svg use')
    .evaluateAll((us) =>
      us
        .map((u) => u.getAttribute('href') ?? '')
        .filter((h) => /i-(youssouf|maryam|papa|maman|fatou|grandpere)/.test(h)),
    );
  expect(persos).toEqual([]);
  // la scène commence par le partenaire, phrase arabe sur sa propre ligne
  await expect(page.getByTestId('jp-partenaire').first()).toBeVisible();
  await expect(
    page.getByTestId('jp-partenaire').first().locator('.ar-long, [dir="rtl"]').first(),
  ).toBeVisible();
  // traduction sur demande
  await expect(ecran.locator('.rep .sens')).toHaveCount(0);
  await page.getByTestId('jp-traduction').click();
  await expect(page.getByTestId('jp-traduction')).toHaveAttribute('aria-pressed', 'true');
  await expect(ecran.locator('.rep .sens').first()).toContainText('Regardez');

  if (CAPTURES) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: 'light' });
    await ecran.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1800); // fin de l'écriture animée
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-clair.png`, fullPage: false });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-sombre.png`, fullPage: false });
    await page.emulateMedia({ colorScheme: 'light' });
  }

  await jouer(page, { erreurDAbord: true });
  await expect(page.getByTestId('jp-fin')).toContainText('Bravo');
  await page.getByTestId('jp-garder-mots').click();
  await expect(page.getByTestId('jp-mots-msg')).toContainText('Mes mots');
  if (CAPTURES) {
    await page.getByTestId('jp-fin').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-fin-clair.png` });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${CAPTURES}/jeparle-375-fin-sombre.png` });
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // SANS RÉSEAU : coquille du service worker, leçon d'IndexedDB, scénario gardé sur l'appareil
  await context.setOffline(true);
  await page.goto('/lecons/en1.l05');
  await expect(page.locator('h1')).toBeVisible();
  await page.getByTestId('jp-ouvrir').click();
  await expect(page.getByTestId('je-parle')).toBeVisible();
  await jouer(page);
  await context.setOffline(false);
});

test('ad1 : scène complète « Premier jour à l’institut » (ad1.l01), rejouer, puis hors ligne', async ({
  page,
  context,
}) => {
  await ouvrir(page, 'ad1.l01');
  await expect(page.getByTestId('je-parle')).toContainText('Tu joues');
  // bonne réponse = réplique du livre, à sa place
  await jouer(page, { erreurDAbord: true });
  const s = (await (await page.request.get('/conversation/ad1/l01.json')).json()) as {
    tours: Array<{ t: string; choix?: Array<{ ar: string; kind: string }> }>;
  };
  const bonne = s.tours.find((x) => x.t === 'eleve')!.choix!.find((c) => c.kind === 'bonne')!.ar;
  await expect(page.getByTestId('jp-moi').first()).toContainText(bonne.replace(/[[\]]/g, ''));
  await page.getByTestId('jp-rejouer').click();
  await expect(page.getByTestId('jp-moi')).toHaveCount(0);
  await expect(page.getByTestId('jp-tour')).toBeVisible();
  // fermer rend la main au bouton
  await page.getByTestId('jp-fermer').click();
  await expect(page.getByTestId('jp-ouvrir')).toBeFocused();

  // sans réseau, page restée ouverte : écran et scénario viennent de l'appareil
  await context.setOffline(true);
  await page.getByTestId('jp-ouvrir').click();
  await expect(page.getByTestId('je-parle')).toBeVisible();
  await jouer(page);
  await context.setOffline(false);
});

test('un seul bouton « Je parle » par leçon ; jamais de scénario pour la religion', async ({
  page,
}) => {
  await page.goto('/lecons/en1.l05');
  await expect(page.getByTestId('jp-ouvrir')).toHaveCount(1);
  const r = await page.request.get('/conversation/re1/l01.json');
  expect(r.status()).toBe(404);
});
