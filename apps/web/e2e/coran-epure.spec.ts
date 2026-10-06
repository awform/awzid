import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  close,
  expectVerse,
  focusVerse,
  listen,
  openDisplay,
  openSelector,
  openSettings,
} from './coran';
import { expect, test } from './fixtures';

/**
 * CORAN ÉPURÉ (06/10/2026) — UN SEUL écran de lecture (`/coran/lecteur`) : le texte d'abord (page du Muṣḥaf ou
 * sourate en versets), puce / sélecteurs dorés qui ouvrent le sélecteur (Sourate, Page, Juzʾ, Ḥizb, recherche),
 * mini-barre de lecture après le premier « Écouter » (téléphone) ou dans la barre (grand écran), petit menu du
 * verset, feuilles « Réglages d'écoute » (préréglages) et « Affichage », mémoriser (masquer peu à peu), accueil
 * sobre, nom « Awzid », palette vert-blanc-or. Récitateurs « Essai » : FICHIERS D'ESSAI NON CORANIQUES (bips).
 * Captures avec CORAN_CAPTURES=<dossier> (ex. reports/coran-epure/apres).
 */
const CAP = process.env.CORAN_CAPTURES;
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
const mobile = (name: string) => name.startsWith('mobile');

async function shot(page: Page, name: string) {
  if (!CAP) return;
  mkdirSync(CAP, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAP, `${name}.png`) });
}

test('écran unique : le texte d’abord, aucune lecture automatique, mini-barre après « Écouter »', async ({
  page,
}, info) => {
  const audio: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/quran/audio/files/') || r.url().includes('/quran/audio/file/'))
      audio.push(r.url());
  });
  await page.goto('/coran/lecteur?page=604');
  await expectVerse(page, '112:1', page.locator('[data-page="604"]'));
  // palette « vert, blanc, or » posée sur l'espace Coran
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'verdure');
  // plus de formulaire avant le texte : aucun champ visible sur l'écran de lecture (seul le curseur du volume
  // fait partie de la barre compacte sur grand écran)
  await expect(
    page.locator('main input:visible:not([type="range"]), main select:visible'),
  ).toHaveCount(0);
  if (mobile(info.project.name)) {
    await expect(page.getByTestId('puce')).toContainText('Al-Ikhlāṣ');
    await expect(page.getByTestId('puce')).toContainText('page 604');
    await expect(page.getByTestId('mini-barre')).toBeHidden();
  } else {
    for (const id of ['barre-sourate', 'barre-verset', 'barre-page', 'barre-juz'])
      await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('barre-page')).toContainText('604');
    await expect(page.getByTestId('barre-juz')).toContainText('30');
    await expect(page.getByTestId('jouer')).toBeVisible();
  }
  await page.waitForTimeout(500);
  expect(audio).toEqual([]);
  expect((await audioState(page)).paused).toBe(true);

  await listen(page);
  await expect(page.getByTestId('mini-barre')).toBeVisible();
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  expect((await audioState(page)).paused).toBe(false);
  await expect(page.getByTestId('mini-recitateur')).toBeVisible();
  // surlignage du verset entendu (Ḥafṣ), commandes du système renseignées
  await expect(page.locator('[data-page="604"] .on[data-aya="112:1"]').first()).toBeVisible();
  const title = await page.evaluate(() => navigator.mediaSession?.metadata?.title ?? '');
  expect(title).toContain('verset 1');
  // la lecture enchaîne (bips de 0,6 s) sans être coupée par le surlignage (A1)
  await expect(page.getByTestId('position')).toContainText('Verset 2', { timeout: 5000 });
  await page.getByTestId('arreter-audio').click();
  expect((await audioState(page)).paused).toBe(true);
  // cibles ≥ 44 px dans la barre
  for (const id of [
    'jouer',
    'arreter-audio',
    'ouvrir-reglages',
    'ouvrir-reglages-lecteur',
    'mp-trad',
  ]) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.height, id).toBeGreaterThanOrEqual(44);
  }
  expect(await serious(page)).toEqual([]);
});

test('sélecteur : sourate (filtre par le nom), page, juzʾ, ḥizb, recherche', async ({ page }) => {
  await page.goto('/coran/lecteur?page=1');
  await expectVerse(page, '1:7');
  await openSelector(page);
  await page.getByTestId('sel-recherche').fill('ikhl');
  await expect(page.locator('[data-sourate="112"]')).toBeVisible();
  await expect(page.locator('[data-sourate="2"]')).toHaveCount(0);
  await page.locator('[data-sourate="112"]').click();
  await expect(page.locator('[data-page="604"]')).toBeVisible();
  await expect(page.getByTestId('selecteur')).toBeHidden();

  await openSelector(page, 'page');
  await page.getByTestId('sel-page').fill('50');
  await page.getByTestId('sel-page-aller').click();
  await expect(page.locator('[data-page="50"]')).toBeVisible();

  await openSelector(page, 'juz');
  await page.getByTestId('sel-juz-30').click();
  await expect(page.locator('[data-page="582"]')).toBeVisible();

  await openSelector(page, 'hizb');
  await page.getByTestId('sel-hizb-2').click();
  await expect(page.locator('[data-aya="2:75"]').first()).toBeVisible();

  await openSelector(page);
  await page.getByTestId('sel-recherche').fill('2:255');
  await page.getByTestId('sel-recherche').press('Enter');
  await expect(page.locator('[data-aya="2:255"]').first()).toHaveClass(/\bon\b/);
  // mots arabes dans les sourates déjà ouvertes (pages 604 et 1 vues plus haut)
  await page.goto('/coran/lecteur?page=604');
  await expectVerse(page, '113:1');
  await openSelector(page);
  await page.getByTestId('sel-recherche').fill('الفلق');
  await page.getByTestId('sel-recherche').press('Enter');
  await expect(page.getByTestId('sel-resultats')).toContainText('Al-Falaq');
  expect(await serious(page)).toEqual([]);
  await shot(page, `${test.info().project.name}-selecteur`);
  await close(page);
});

test('menu du verset : écouter d’ici, répéter, traduction, signet, partager', async ({
  page,
  request,
}) => {
  await page.goto('/coran/lecteur?page=604');
  await page.locator('[data-aya="112:2"]').first().click();
  const menu = page.getByTestId('menu-verset');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Al-Ikhlāṣ, verset 2');
  for (const id of [
    'menu-ecouter',
    'menu-repeter',
    'menu-traduction',
    'menu-signet',
    'menu-partager',
  ])
    await expect(menu.getByTestId(id)).toBeVisible();
  await expect(menu.getByTestId('menu-partager')).toHaveAttribute(
    'href',
    '/quotidien/verset?s=112&a=2',
  );
  // traduction du sens : texte de la source, tel quel
  await menu.getByTestId('menu-traduction').click();
  const src = (await (await request.get('/traductions/french_rashid/112.json')).json()) as {
    t: [number, string, string][];
  };
  await expect(menu.getByTestId('menu-traduction-texte')).toContainText(
    src.t.find((x) => x[0] === 2)![1].slice(0, 20),
  );
  // signet, gardé sur l'appareil et repris sur l'accueil
  await menu.getByTestId('menu-signet').click();
  await expect(menu).toBeHidden();
  await page.locator('[data-aya="112:2"]').first().click();
  await expect(menu.getByTestId('menu-signet')).toHaveAttribute('aria-pressed', 'true');
  // « Répéter ce verset » : le verset 2 seul, en boucle
  await menu.getByTestId('menu-repeter').click();
  await expect(page.getByTestId('position')).toContainText('Verset 2');
  await expect(page.getByTestId('position')).toContainText('sur 20');
  await page.getByTestId('arreter-audio').click();
  // « Écouter d'ici » : du verset 3 à la fin de la sourate
  await page.locator('[data-aya="112:3"]').first().click();
  await page.getByTestId('menu-ecouter').click();
  await expect(page.getByTestId('position')).toContainText('Verset 3');
  await page.getByTestId('arreter-audio').click();
  await page.goto('/coran');
  await expect(page.locator('[data-signet="112:2"]')).toBeVisible();
  await expect(page.getByTestId('reprendre')).toBeVisible();
  // clavier : un verset se choisit au clavier, Échap ferme le menu
  await page.goto('/coran/lecteur?page=604');
  await focusVerse(page, '112:4');
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await shot(page, `${test.info().project.name}-menu-verset`);
  await close(page);
  await expect(menu).toBeHidden();
});

test('réglages d’écoute : préréglages, réglages avancés (aucune perte), hors ligne', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?page=604');
  await expect(page.locator('[data-page="604"]')).toBeVisible();
  await openSettings(page);
  // panneau unique « Réglages » : écoute, récitateur, hors ligne… au même endroit
  const sheet = page.getByTestId('reglages');
  await expect(
    sheet.getByTestId('choix-recitateur').locator('option[value="essai-hafs"]'),
  ).toHaveCount(1);
  await sheet.getByTestId('choix-recitateur').selectOption('essai-hafs');
  await expect(sheet.getByTestId('credit')).toContainText('non coraniques');
  await expect(sheet.getByTestId('credit-ar')).toHaveAttribute('lang', 'ar');
  await expect(sheet.getByTestId('usage-note')).toContainText('ne pas vendre');
  await expect(sheet.getByTestId('plage-ecoute')).toContainText('versets 1 à 4');
  // préréglages simples
  await sheet.locator('[data-preset="verset3"]').check({ force: true });
  await expect(page.getByTestId('position')).toContainText('12');
  await sheet.locator('[data-preset="boucle"]').check({ force: true });
  await expect(page.getByTestId('position')).toContainText('80');
  await sheet.locator('[data-preset="simple"]').check({ force: true });
  // réglages avancés : plage, répétitions, vitesse, arrêt automatique
  await sheet.getByTestId('de').fill('2');
  await sheet.getByTestId('de').blur();
  await sheet.getByTestId('au').fill('3');
  await sheet.getByTestId('au').blur();
  await sheet.getByTestId('repeter-verset').fill('2');
  await sheet.getByTestId('repeter-plage').fill('2');
  await expect(page.getByTestId('position')).toContainText('8');
  await sheet.getByTestId('vitesse').selectOption('1.5');
  await expect(sheet.getByTestId('minuterie').locator('option')).toHaveCount(7);
  expect(await serious(page)).toEqual([]);
  await shot(page, `${test.info().project.name}-reglages`);
  // hors ligne : sourate gardée, listée, jouée depuis l'appareil, supprimée
  await expect(sheet.getByTestId('wifi-seulement')).toBeChecked();
  await sheet.getByTestId('garder-sourate').click();
  await expect(sheet.getByTestId('sur-appareil')).toBeVisible();
  await close(page);
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 2');
  const st = await audioState(page);
  expect(st.rate).toBe(1.5);
  expect(st.pitch).toBe(true);
  await expect.poll(async () => (await audioState(page)).src).toMatch(/^blob:/);
  await page.getByTestId('arreter-audio').click();
  await page.goto('/coran/recitateurs');
  await expect(page.locator('[data-saved="essai-hafs:112"]')).toBeVisible();
  await page.goto('/coran/lecteur?page=604');
  await openSettings(page);
  await page.getByTestId('supprimer-sourate').click();
  await expect(page.getByTestId('garder-sourate')).toBeVisible();
  // remise des réglages par défaut pour les autres tests
  await page.locator('[data-preset="simple"]').check({ force: true });
  await page.getByTestId('vitesse').selectOption('1');
});

test('mémoriser : même écran, masquer peu à peu, écouter-répéter-enchaîner, Ḥafṣ seulement', async ({
  page,
}) => {
  // ancienne adresse redirigée
  await page.goto('/coran/memoriser');
  await expect(page).toHaveURL(/\/coran\/lecteur/);
  await expect(page.getByTestId('mode-memoriser')).toBeVisible();
  await page.goto('/coran/lecteur?s=113&vue=versets');
  await expect(page.locator('[data-verse="113:5"]')).toBeVisible();
  await expect(page.locator('[data-testid="texte-coran"] .w.voile').first()).toBeVisible();
  // le texte n'est jamais modifié : seul l'affichage est voilé
  expect((await page.locator('[data-verse="113:1"]').textContent())!.length).toBeGreaterThan(5);
  // voir un verset depuis son menu
  await page.locator('[data-aya="1"]').click();
  await page.getByTestId('menu-voir').click();
  await expect(page.locator('[data-verse="113:1"] .w.voile')).toHaveCount(0);
  // récitateurs en Ḥafṣ seulement ; méthode « écouter, répéter, enchaîner »
  await openSettings(page);
  const sheet = page.getByTestId('reglages');
  await expect(
    sheet.getByTestId('choix-recitateur').locator('option[value="essai-qalun"]'),
  ).toHaveCount(0);
  await sheet.locator('[data-preset="memoriser"]').check({ force: true });
  await sheet.getByTestId('de').fill('1');
  await sheet.getByTestId('de').blur();
  await sheet.getByTestId('au').fill('2');
  await sheet.getByTestId('au').blur();
  await sheet.getByTestId('repeter-nouveau').fill('1');
  await sheet.getByTestId('enchainements').fill('1');
  // 1 ; 2 ; 1-2 → 4 écoutes
  await expect(page.getByTestId('position')).toContainText('4');
  await close(page);
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('etape')).toContainText('Nouveau verset');
  await page.getByTestId('arreter-audio').click();
  expect(await serious(page)).toEqual([]);
  await shot(page, `${test.info().project.name}-memoriser`);
  // niveau de masquage depuis « Affichage », puis sortie du mode
  await openDisplay(page);
  await page.locator('[data-mask="3"]').check({ force: true });
  await close(page);
  await page.getByTestId('quitter-memoriser').click();
  await expect(page.locator('[data-testid="texte-coran"] .w.voile')).toHaveCount(0);
  await openSettings(page);
  await page.locator('[data-preset="simple"]').check({ force: true });
  await close(page);
});

test('vue « versets » : traduction sous chaque verset, tajwid sans changer le texte, autre riwāya', async ({
  page,
  request,
}) => {
  await page.goto('/coran/lecteur?page=604');
  await openDisplay(page);
  await page.getByTestId('vue-versets').check({ force: true });
  await close(page);
  await expect(page.locator('[data-testid="texte-coran"] [data-verse="112:4"]')).toBeVisible();
  const before = await page
    .locator('[data-testid="texte-coran"] .quran-text')
    .evaluateAll((els) => els.map((e) => e.textContent));
  await page.getByTestId('mp-trad').click();
  const src = (await (await request.get('/traductions/french_rashid/112.json')).json()) as {
    t: [number, string, string][];
  };
  const tr = page.locator('[data-trad="112:1"]');
  await expect(tr).toContainText(src.t[0]![1]);
  // jamais de phrase arabe sur la ligne du français : la traduction est un paragraphe à part, en français
  await expect(tr).toHaveAttribute('lang', 'fr');
  await shot(page, `${test.info().project.name}-versets-traduction`);
  // tajwid (feuille « Affichage ») : couleurs, texte identique au caractère près
  await openDisplay(page);
  await page.getByTestId('tajwid').click();
  await expect(page.getByTestId('tajwid')).toHaveAttribute('aria-pressed', 'true');
  await close(page);
  await expect(page.locator('[data-testid="texte-coran"] .tj').first()).toBeVisible();
  expect(
    await page
      .locator('[data-testid="texte-coran"] .quran-text')
      .evaluateAll((els) => els.map((e) => e.textContent)),
  ).toEqual(before);
  await openDisplay(page);
  await page.getByTestId('tajwid').click();
  // autre riwāya : texte du Complexe, riwāya écrite en clair, ni traduction ni tajwid
  await page.locator('label:has([data-mushaf="qalun"])').click();
  await close(page);
  await expect(page.getByTestId('mp-riwaya-affichee')).toContainText('autre riwāya');
  await expect(page.getByTestId('mp-trad')).toHaveCount(0);
  await expect(page.locator('[data-trad]')).toHaveCount(0);
  await openDisplay(page);
  await page.locator('label:has([data-mushaf="hafs"])').click();
  await page.getByTestId('vue-page').check({ force: true });
  await page.getByTestId('mp-traduction').selectOption('');
  await close(page);
});

test('grand écran : traduction à gauche, page à droite, suivant la page et le verset', async ({
  page,
}, info) => {
  test.skip(mobile(info.project.name), 'grand écran seulement');
  await page.goto('/coran/lecteur?s=2&a=255');
  await page.getByTestId('mp-trad').click();
  const panel = page.getByTestId('mp-panneau-traduction');
  await expect(panel).toBeVisible();
  // une seule page à droite de la traduction
  await expect(page.getByTestId('mushaf-page')).toHaveCount(1);
  const [tp, pg] = await Promise.all([
    panel.boundingBox(),
    page.getByTestId('mushaf-page').boundingBox(),
  ]);
  expect(tp!.x).toBeLessThan(pg!.x);
  await expect(panel.locator('[data-trad="2:255"]')).toHaveClass(/\bon\b/);
  await expect(panel).toContainText('QuranEnc.com');
  await page.locator('[data-aya="2:256"]').first().click();
  await close(page);
  await expect(panel.locator('[data-trad="2:256"]')).toHaveClass(/\bon\b/);
  await shot(page, `${info.project.name}-traduction-a-gauche`);
  // la traduction suit la page affichée
  await page.getByTestId('mp-suiv').click();
  await expect(page.locator('[data-page="43"]')).toBeVisible();
  await expect(panel.locator('[data-trad="2:255"]')).toHaveCount(0);
  await expect(panel.locator('[data-trad]').first()).toBeVisible();
  await page.getByTestId('mp-trad').click();
  await expect(panel).toHaveCount(0);
  // sans traduction : double page « livre »
  await expect(page.getByTestId('mushaf-page')).toHaveCount(2);
});

test('téléphone : glisser pour tourner, traduction en feuille, 320 px sans défilement horizontal', async ({
  page,
}, info) => {
  test.skip(!mobile(info.project.name), 'téléphone seulement');
  await page.goto('/coran/lecteur?page=3');
  await expect(page.locator('[data-page="3"]')).toBeVisible();
  const swipe = (dx: number) =>
    page.getByTestId('mushaf-livre').evaluate((el, d) => {
      const r = el.getBoundingClientRect();
      const y = r.top + 100;
      const x0 = r.left + r.width / 2;
      const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x0)], changedTouches: [t(x0)] }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x0 + d)] }));
    }, dx);
  await swipe(120);
  await expect(page.locator('[data-page="4"]')).toBeVisible();
  await swipe(-120);
  await expect(page.locator('[data-page="3"]')).toBeVisible();
  await page.getByTestId('mp-trad').click();
  await expect(page.getByTestId('feuille-traduction')).toBeVisible();
  await expect(page.getByTestId('feuille-traduction').locator('[data-trad="2:6"]')).toBeVisible();
  await close(page);
  await page.setViewportSize({ width: 320, height: 700 });
  // sourate qui a des fichiers d'essai (bips) : 112
  await page.goto('/coran/lecteur?page=604');
  await listen(page);
  await page.getByTestId('arreter-audio').click();
  const over = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await over()).toBeLessThanOrEqual(0);
  await openSelector(page);
  expect(await over()).toBeLessThanOrEqual(0);
  await close(page);
});

test('accueil épuré : reprendre, liens discrets, explications derrière l’icône d’information', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?s=112&a=3');
  await expect(page.locator('[data-aya="112:3"]').first()).toBeVisible();
  await page.goto('/coran');
  await expect(page.getByTestId('reprendre')).toContainText('Al-Ikhlāṣ');
  await expect(page.getByTestId('reprendre')).toHaveAttribute('href', '/coran/lecteur?s=112&a=3');
  await expect(page.getByTestId('ouvrir-recitateurs')).toBeVisible();
  await expect(page.getByTestId('ouvrir-hifz')).toBeVisible();
  // « Avec respect » n'est plus sur l'accueil, mais derrière l'icône d'information
  await expect(page.locator('main')).not.toContainText('Avec respect');
  await page.getByTestId('infos-coran').click();
  await expect(page.getByTestId('feuille-infos-coran')).toContainText('Avec respect');
  await close(page);
  // anciennes adresses : redirigées, l'écoute est préparée mais jamais lancée
  await page.goto('/coran/ecouter?r=essai-hafs&s=112');
  await expect(page).toHaveURL(/\/coran\/lecteur/);
  await expect(page.getByTestId('mini-barre')).toBeVisible();
  expect((await audioState(page)).paused).toBe(true);
  await page.goto('/coran/mushaf?page=50');
  await expect(page.locator('[data-page="50"]')).toBeVisible();
  // contraste mesuré une fois l'entrée de la page finie (fondu de 0 à 1 : sinon couleurs à demi transparentes)
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  expect(await serious(page)).toEqual([]);
});

test('nom affiché « Awzid » partout (en-tête, titres, manifeste) ; identifiants techniques inchangés', async ({
  page,
  request,
}) => {
  const m = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string;
    short_name: string;
  };
  expect(m.short_name).toBe('Awzid');
  expect(m.name).toContain('Awzid');
  for (const url of ['/coran', '/coran/lecteur?page=1', '/aide', '/garanties', '/legal/mentions']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/Awzid/);
    expect(await page.locator('body').innerText()).not.toMatch(/AWFORM/);
  }
  await expect(page.getByTestId('accueil')).toContainText('Awzid');
});

// ------------------------------------------------------------------ captures APRÈS (sur demande)
test.describe('captures', () => {
  test.skip(!CAP, 'captures : CORAN_CAPTURES non défini');
  test('captures — 375 px et bureau, clair et sombre', async ({ page }, info) => {
    test.skip(mobile(info.project.name), 'une seule passe (tailles imposées)');
    test.setTimeout(300_000);
    mkdirSync(CAP!, { recursive: true });
    const save = (n: string) => page.screenshot({ path: join(CAP!, `${n}.png`), fullPage: true });
    for (const [dev, size] of [
      ['375', { width: 375, height: 812 }],
      ['bureau', { width: 1366, height: 900 }],
    ] as const) {
      await page.setViewportSize(size);
      for (const scheme of ['light', 'dark'] as const) {
        const sfx = `${dev}-${scheme === 'light' ? 'clair' : 'sombre'}`;
        await page.emulateMedia({ colorScheme: scheme });
        const go = async (name: string, url: string) => {
          await page.goto(url);
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(600);
          await save(`${sfx}-${name}`);
        };
        await go('accueil', '/coran');
        await go('lecture-page', '/coran/lecteur?page=604&vue=page');
        await listen(page);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(CAP!, `${sfx}-ecoute.png`) });
        await page.getByTestId('arreter-audio').click();
        await page.getByTestId('ouvrir-reglages').click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(CAP!, `${sfx}-reglages.png`) });
        await close(page);
        await page.locator('[data-aya="112:2"]').first().click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(CAP!, `${sfx}-menu-verset.png`) });
        await close(page);
        await openSelector(page);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(CAP!, `${sfx}-selecteur.png`) });
        await close(page);
        await go('lecture-versets', '/coran/lecteur?s=112&vue=versets');
        if (dev === 'bureau') {
          await go('traduction-a-gauche', '/coran/lecteur?page=604&vue=page');
          await page.getByTestId('mp-trad').click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: join(CAP!, `${sfx}-traduction-a-gauche.png`) });
          await page.getByTestId('mp-trad').click();
        }
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });
});
