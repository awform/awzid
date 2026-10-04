import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, PARENT_PIN, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot 27 — espace Coran : Lire, Écouter, Mémoriser, Mes récitateurs. Les récitateurs « Essai » n'ont que
 * des FICHIERS D'ESSAI NON CORANIQUES (bips générés par e2e/audio-essai.mjs) — jamais une récitation.
 */
const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

const audioState = (page: Page) =>
  page.locator('[data-testid="lecteur-audio"] audio').evaluate((a: HTMLAudioElement) => ({
    paused: a.paused,
    rate: a.playbackRate,
    pitch: a.preservesPitch,
    src: a.currentSrc,
  }));

test('écouter : riwāya affichée, pas de lecture automatique, répétition, vitesse sans changer la hauteur, surlignage Ḥafṣ', async ({
  page,
}) => {
  const audioRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/quran/audio/files/')) audioRequests.push(r.url());
  });
  await page.goto('/coran');
  await expect(page.getByTestId('ouvrir-ecouter')).toBeVisible();
  await page.getByTestId('ouvrir-ecouter').click();
  const pick = page.getByTestId('choix-recitateur');
  await expect(pick.locator('option[value="essai-hafs"]')).toHaveCount(1);
  await pick.selectOption('essai-hafs');
  await page.getByTestId('sourate').selectOption('112');
  await expect(page.locator('[data-verse="112:4"]')).toBeVisible();
  await expect(page.getByTestId('badge-riwaya').first()).toContainText('Ḥafṣ');
  await expect(page.getByTestId('credit')).toContainText('non coraniques');
  // adab : rien ne joue ni ne se télécharge avant le geste de l'utilisateur
  await page.waitForTimeout(500);
  expect((await audioState(page)).paused).toBe(true);
  expect(audioRequests).toEqual([]);

  await page.getByTestId('repeter-verset').fill('2');
  await page.getByTestId('vitesse').selectOption('1.5');
  await expect(page.getByTestId('position')).toContainText('8');
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  const st = await audioState(page);
  expect(st.paused).toBe(false);
  expect(st.rate).toBe(1.5);
  expect(st.pitch).toBe(true);
  await expect(page.locator('.aya.now[data-aya="1"]')).toBeVisible();
  // commandes du système (Media Session) renseignées
  const title = await page.evaluate(() => navigator.mediaSession?.metadata?.title ?? '');
  expect(title).toContain('verset 1');
  await page.getByTestId('arreter-audio').click();
  expect((await audioState(page)).paused).toBe(true);
  expect(await serious(page)).toEqual([]);
});

test('autre riwāya : badge visible, pas de surlignage, absente du mode Mémoriser', async ({
  page,
}) => {
  await page.goto('/coran/ecouter?r=essai-qalun');
  await expect(page.getByTestId('autre-riwaya')).toBeVisible();
  await expect(page.getByTestId('badge-riwaya').first()).toHaveAttribute('data-riwaya', 'qalun');
  await expect(page.getByTestId('badge-riwaya').first()).toContainText('autre riwāya');
  await expect(page.getByTestId('sans-surlignage')).toBeVisible();
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  await expect(page.locator('.aya.now')).toHaveCount(0);
  await page.getByTestId('arreter-audio').click();

  await page.goto('/coran/memoriser');
  const pick = page.getByTestId('choix-recitateur');
  await expect(pick.locator('option[value="essai-hafs"]')).toHaveCount(1);
  await expect(pick.locator('option[value="essai-qalun"]')).toHaveCount(0);
});

test('mémoriser : écouter-répéter-enchaîner et masquage progressif du texte', async ({ page }) => {
  await page.goto('/coran/memoriser');
  await page.getByTestId('sourate').selectOption('113');
  await expect(page.locator('[data-verse="113:5"]')).toBeVisible();
  await page.getByTestId('de').fill('1');
  await page.getByTestId('au').fill('2');
  await page.getByTestId('repeter-nouveau').fill('1');
  await page.getByTestId('enchainements').fill('1');
  // 1 ; 2 ; 1-2 → 4 écoutes
  await expect(page.getByTestId('position')).toContainText('4');
  await page.locator('[data-mask="3"]').check({ force: true });
  await expect(page.locator('[data-aya="1"] .w.voile').first()).toBeVisible();
  // le texte n'est jamais modifié : seul l'affichage est voilé
  const text = await page.locator('[data-verse="113:1"]').textContent();
  expect(text?.length).toBeGreaterThan(5);
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('etape')).toContainText('Nouveau verset');
  await page.getByTestId('arreter-audio').click();
  expect(await serious(page)).toEqual([]);
});

test('hors ligne : sourate gardée sur l’appareil, listée, puis supprimée', async ({ page }) => {
  await page.goto('/coran/ecouter?r=essai-hafs&s=114');
  await expect(page.getByTestId('wifi-seulement')).toBeChecked();
  await page.getByTestId('garder-sourate').click();
  await expect(page.getByTestId('sur-appareil')).toBeVisible();
  await page.goto('/coran/recitateurs');
  await expect(page.locator('[data-saved="essai-hafs:114"]')).toBeVisible();
  // l'écoute marche sans réseau à partir des fichiers gardés
  await page.goto('/coran/ecouter?r=essai-hafs&s=114');
  await expect(page.getByTestId('sur-appareil')).toBeVisible();
  await page.getByTestId('jouer').click();
  await expect.poll(async () => (await audioState(page)).src).toMatch(/^blob:/);
  await page.getByTestId('arreter-audio').click();
  await page.getByTestId('supprimer-sourate').click();
  await expect(page.getByTestId('garder-sourate')).toBeVisible();
});

test('mes récitateurs : choix gardé, crédits et licence ; lire : aller à une page du Muṣḥaf', async ({
  page,
}) => {
  await page.goto('/coran/recitateurs');
  const card = page.locator('[data-reciter="essai-qalun"]');
  await card.getByTestId('choisir').click();
  await expect(card.getByTestId('choisi')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-reciter="essai-qalun"]').getByTestId('choisi')).toBeVisible();
  await expect(card).toContainText('non coraniques');
  expect(await serious(page)).toEqual([]);
  await page.locator('[data-reciter="essai-hafs"]').getByTestId('choisir').click();

  await page.goto('/coran/lecteur');
  await page.getByTestId('aller-type').selectOption('page');
  await page.getByTestId('aller-n').fill('604');
  await page.getByTestId('aller-a').getByRole('button').click();
  await expect(page.locator('[data-verse="112:1"]')).toBeVisible();
  await expect(page.locator('[data-page="604"]')).toBeVisible();
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('le parent restreint la liste d’un enfant (code parent) ; l’enfant ne voit que ce récitateur', async ({
    page,
  }) => {
    await page.goto('/coran/recitateurs');
    const box = page.getByTestId('controle-parent');
    await box.locator('#enfant').selectOption({ label: 'Yanis' });
    await page.waitForLoadState('networkidle');
    // déjà restreinte lors d'un passage précédent : on part de la liste affichée
    const tous = box.getByTestId('tous-permis');
    if (await tous.isChecked()) await tous.uncheck();
    await box.locator('[data-permis="essai-hafs"]').check();
    await box.locator('[data-permis="essai-qalun"]').uncheck();
    await box.locator('#pin-coran').fill(PARENT_PIN);
    await box.getByTestId('enregistrer-permis').click();
    await expect(box.getByRole('status')).toContainText('enregistrée');
    await pickProfile(page, 'Yanis');
    await page.goto('/coran/ecouter');
    const pick = page.getByTestId('choix-recitateur');
    await expect(pick.locator('option')).toHaveCount(1);
    await expect(pick.locator('option[value="essai-hafs"]')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'jardin');
  });
});
