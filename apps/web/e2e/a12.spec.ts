import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Chantier A12 — espace « Au quotidien » : horaires calculés sur l'appareil, qibla, adhkār des livres, verset en
 * image ; hors ligne ; AUCUNE requête réseau ne contient la position de l'appareil.
 */

/** Toutes les requêtes de la page (adresse et corps), pour chercher une fuite de position. */
function recordRequests(page: Page): string[] {
  const seen: string[] = [];
  const add = (r: Request) => seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`);
  page.on('request', add);
  return seen;
}

test('A12 : horaires (Paris, choix de la méthode), réglages, qibla, adhkār, verset en image', async ({
  page,
  request,
}) => {
  await page.goto('/quotidien');
  await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByTestId('qt-ville').selectOption('paris');
  await page.getByTestId('qt-ville-ok').click();
  // France : l'utilisateur choisit sa méthode (UOIF, Grande Mosquée de Paris, Ligue islamique mondiale)
  const choose = page.getByTestId('qt-choisir-methode');
  await expect(choose.locator('[data-methode]')).toHaveCount(3);
  await choose.locator('[data-methode="uoif"]').click();
  const list = page.getByTestId('qt-horaires');
  await expect(list.locator('li')).toHaveCount(6);
  await expect(page.getByTestId('qt-prochaine')).toBeVisible();
  await expect(page.getByTestId('qt-mention')).toHaveText(
    'Horaires calculés ; suivez votre mosquée locale.',
  );
  await expect(page.getByTestId('qt-hijri')).toBeVisible();
  // ajustement manuel du ʿishāʾ : +1 min affiché, et l'heure avance d'une minute
  const isha = list.locator('li[data-priere="isha"] .pt');
  const before = (await isha.textContent())!.trim();
  await page.getByTestId('qt-reglages').locator('summary').click();
  await page
    .locator('[data-ajuste="isha"]')
    .getByRole('button', { name: /minute de plus/ })
    .click();
  await expect(list.locator('li[data-priere="isha"] .adj')).toContainText('+1');
  const [h, m] = before.split(':').map(Number);
  const plus1 = new Date(2000, 0, 1, h, m! + 1);
  await expect(isha).toHaveText(
    `${String(plus1.getHours()).padStart(2, '0')}:${String(plus1.getMinutes()).padStart(2, '0')}`,
  );
  // réglages gardés sur l'appareil
  await page.reload();
  await expect(list.locator('li[data-priere="isha"] .adj')).toContainText('+1');

  // qibla depuis Paris : ≈ 119° (référence : api.aladhan.com/v1/qibla)
  await page.locator('[data-quotidien-tab="qibla"]').click();
  await expect(page.getByTestId('qt-qibla-angle')).toContainText('119°');
  await expect(page.getByTestId('qt-qibla-aimants')).toBeVisible();
  await expect(page.getByTestId('qt-carte')).toBeVisible();

  // adhkār : textes des livres, source affichée, compteur
  await page.locator('[data-vivre-tab="adhkar"]').click();
  await page.locator('[data-categorie="apres_priere"]').click();
  const tasbih = page.locator('[data-dhikr="tasbih-33"]');
  await expect(tasbih).toBeVisible();
  await expect(tasbih.locator('.ref')).toContainText('Muslim');
  const counter = tasbih.getByTestId('qt-compteur').locator('button.tap');
  for (let i = 0; i < 3; i++) await counter.click();
  await expect(counter).toHaveAccessibleName(/3 sur 33/);
  // récitation du coucher : āyat al-kursī, texte Tanzil (aucun bouton de voix de synthèse)
  await page.locator('[data-categorie="coucher"]').click();
  const kursi = page.locator('[data-dhikr="ayat-al-kursi"]');
  await expect(kursi.locator('.quran-text').first()).toBeVisible();
  const v = (await (await request.get('/api/v1/quran/verses?s=2&from=255&to=255')).json()) as {
    verses: Array<{ text: string }>;
  };
  await expect(kursi.locator('.quran-text').first()).toContainText(v.verses[0]!.text.slice(0, 20));
  await expect(page.locator('[data-dhikr] [data-testid="ecouter"]')).toHaveCount(0);

  // verset en image : texte Tanzil tel quel, image dessinée
  await page.goto('/quotidien/verset?s=2&a=255');
  await expect(page.getByTestId('qt-verset-texte')).toHaveText(v.verses[0]!.text);
  await expect
    .poll(async () =>
      page.getByTestId('qt-canvas').evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(c.width / 2 - 200, 300, 400, 200).data;
        const set = new Set<number>();
        for (let i = 0; i < d.length; i += 16) set.add(d[i]! * 65536 + d[i + 1]! * 256 + d[i + 2]!);
        return set.size;
      }),
    )
    .toBeGreaterThan(2);
  await expect(page.getByTestId('qt-partager')).toBeEnabled();
});

test('A12 : hors ligne — les horaires et la qibla se calculent sans réseau', async ({
  page,
  context,
}) => {
  await page.goto('/quotidien');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByTestId('qt-ville').selectOption('dakar');
  await page.getByTestId('qt-ville-ok').click();
  // Sénégal : Ligue islamique mondiale par défaut, pas de choix imposé
  await expect(page.getByTestId('qt-horaires').locator('li')).toHaveCount(6);
  await page.locator('[data-vivre-tab="adhkar"]').click();
  await expect(page.locator('[data-dhikr]').first()).toBeVisible();

  await context.setOffline(true);
  await page.goto('/quotidien');
  await expect(page.getByTestId('qt-horaires').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('qt-hero')).toContainText('Dakar');
  await page.goto('/quotidien/qibla');
  await expect(page.getByTestId('qt-qibla-angle')).toContainText('74°');
  // adhkār : copie gardée sur l'appareil
  await page.goto('/quotidien/adhkar');
  await expect(page.locator('[data-dhikr]').first()).toBeVisible();
  await context.setOffline(false);
});

test('A12 : 320 px sans défilement horizontal ; captures (clair et sombre)', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'captures sur téléphone seulement');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/quotidien');
  await page.getByTestId('qt-ville').selectOption('paris');
  await page.getByTestId('qt-ville-ok').click();
  await page.getByTestId('qt-choisir-methode').locator('[data-methode="uoif"]').click();
  await expect(page.getByTestId('qt-horaires').locator('li')).toHaveCount(6);
  for (const mode of ['clair', 'sombre'] as const) {
    if (mode === 'sombre') await page.emulateMedia({ colorScheme: 'dark' });
    for (const [name, url] of [
      ['horaires', '/quotidien'],
      ['qibla', '/quotidien/qibla'],
      ['adhkar', '/quotidien/adhkar'],
      ['verset', '/quotidien/verset?s=112&a=1'],
    ] as const) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(sw, `${url} : défilement horizontal`).toBeLessThanOrEqual(cw);
      await page.screenshot({
        path: `../../reports/a12/${name}-320-${mode}.png`,
        fullPage: true,
      });
    }
  }
});

test.describe('position de l’appareil', () => {
  test.use({
    geolocation: { latitude: 45.512345, longitude: -73.567891 },
    permissions: ['geolocation'],
  });

  test('A12 : géolocalisation sur accord ; la position ne quitte jamais l’appareil', async ({
    page,
  }) => {
    const seen = recordRequests(page);
    await page.goto('/quotidien');
    // aucun appel à la position avant l'accord explicite
    await page.getByTestId('qt-geo').click();
    await expect(page.getByTestId('qt-geo-accord')).toContainText('jamais envoyée');
    await page.getByTestId('qt-geo-ok').click();
    await expect(page.getByTestId('qt-hero')).toContainText('Position de cet appareil');
    await expect(page.getByTestId('qt-horaires').locator('li')).toHaveCount(6);
    // gardée sur l'appareil, arrondie (≈ 100 m)
    const stored = await page.evaluate(() => localStorage.getItem('awzid.quotidien.v1'));
    expect(stored).toContain('45.512');
    expect(stored).not.toContain('45.512345');
    // parcours complet de l'espace
    await page.locator('[data-quotidien-tab="qibla"]').click();
    await expect(page.getByTestId('qt-qibla-angle')).toBeVisible();
    await page.locator('[data-vivre-tab="adhkar"]').click();
    await expect(page.locator('[data-dhikr]').first()).toBeVisible();
    // A37 : retour aux horaires par le sous-onglet « Prières » de « Vivre l'islam »
    await page.locator('[data-vivre-tab="prieres"]').click();
    await expect(page.getByTestId('qt-horaires')).toBeVisible();
    // aucune requête (adresse ou corps) ne contient les coordonnées, même arrondies
    expect(seen.length).toBeGreaterThan(0);
    for (const needle of ['45.51', '45,51', '73.56', '73,56', '-73.5'])
      expect(
        seen.filter((s) => s.includes(needle)),
        needle,
      ).toEqual([]);
  });
});
