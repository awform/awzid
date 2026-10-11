import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, newAdult, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot D2 (« Design V3 + agencement ») : accueil Coran (en-tête étoilé, « Reprendre la lecture », Lire / Écouter /
 * Mémoriser, liste des 114 sourates avec recherche), récitateurs en deux groupes (crédits derrière ⓘ, liens
 * nommés), Vivre l'islam et Sciences (en-têtes calligraphiés, cartes par thème), « Plus » en familles, « Compte »
 * en sommaire (suppression isolée, en deux temps), connexion et inscription (bloc marque). Règles du lot D1
 * étendues à ces écrans : aucune icône d'action sans nom écrit, une action principale au plus, titres en Lexend,
 * cibles enfant de 56 px. Captures 375 px clair et sombre si CAPTURES_DIR est défini, avec un inventaire.
 */
test.use({ compte: null });
const DIR = process.env.CAPTURES_DIR;
const MOBILE = { width: 375, height: 812 };
const inventaire: Array<Record<string, unknown>> = [];

/** boutons et liens visibles qui n'ont AUCUN texte écrit (le logo de la marque, nommé, est la seule exception) */
const sansNom = (page: Page) =>
  page.evaluate(() => {
    const visible = (el: Element) => {
      // contenu d'un <details> fermé, élément caché par un parent : invisible
      if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
        return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return [...document.querySelectorAll('a[href], button, summary, [role=button]')]
      .filter(visible)
      .filter((e) => !(e as HTMLElement).innerText.trim())
      .filter((e) => e.getAttribute('data-testid') !== 'accueil')
      .map((e) => e.getAttribute('data-testid') ?? e.outerHTML.slice(0, 80));
  });

const mesure = (page: Page) =>
  page.evaluate(() => {
    const visible = (el: Element) => {
      // contenu d'un <details> fermé, élément caché par un parent : invisible
      if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
        return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const main = document.querySelector('main')!;
    const acts = [
      ...document.querySelectorAll(
        'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]',
      ),
    ].filter(visible);
    return {
      actions: acts.length,
      hauteur: Math.round(document.documentElement.scrollHeight),
      principales: [...main.querySelectorAll('.primary')].filter(visible).length,
      titres: [...main.querySelectorAll('h1, h2, h3')]
        .filter(visible)
        .map((h) => getComputedStyle(h).fontFamily.split(',')[0]!.replace(/['"]/g, '').trim()),
    };
  });

const graves = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${n.failureSummary ?? ''})`).join(' | ')}`,
    );

/** règles transversales (AGENCEMENT § 8) puis captures clair et sombre */
async function controle(page: Page, nom: string, opts: { full?: boolean } = {}) {
  const m = await mesure(page);
  const icones = await sansNom(page);
  inventaire.push({ ecran: nom, ...m, iconesSansNom: icones });
  expect(icones, `${nom} : icônes sans nom`).toEqual([]);
  expect(m.principales, `${nom} : une action principale au plus`).toBeLessThanOrEqual(1);
  expect(
    m.titres.every((f) => f === 'Lexend'),
    `${nom} : titres ${m.titres.join(',')}`,
  ).toBe(true);
  expect(await graves(page), nom).toEqual([]);
  if (!DIR) return;
  mkdirSync(DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: join(DIR, `${nom}-${scheme === 'light' ? 'clair' : 'sombre'}.png`),
      fullPage: opts.full ?? true,
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.afterAll(() => {
  if (DIR && inventaire.length)
    writeFileSync(join(DIR, 'inventaire-d2.json'), JSON.stringify(inventaire, null, 1));
});

test('Coran : en-tête, « Reprendre la lecture », trois accès, liste des sourates avec recherche', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await newAdult(page, 'd2-coran');
  await page.goto('/coran');
  await expect(page.getByTestId('entete-espace')).toContainText('الْقُرْآنُ');
  // sans lecture précédente : commencer par al-Fātiḥa (bouton doré)
  await expect(page.getByTestId('commencer-lecture')).toHaveAttribute('href', '/coran/lecteur?s=1');
  await expect(page.getByTestId('mode-ecouter')).toHaveAttribute('href', '/coran/lecteur?ecoute=1');
  await expect(page.getByTestId('mode-memoriser')).toHaveAttribute('href', '/coran/lecteur?memo=1');
  const rows = page.getByTestId('liste-sourates').locator('[data-sourate]');
  await expect(rows).toHaveCount(114);
  await expect(rows.nth(1)).toContainText('286 versets');
  await expect(rows.nth(1)).toContainText('médinoise');
  await expect(rows.nth(1)).toContainText('البقرة');
  await controle(page, 'coran-accueil-adulte', { full: false });
  await controle(page, 'coran-liste-adulte');
  // recherche : sans signes diacritiques, ou par numéro
  await page.getByTestId('chercher-sourate').fill('ikhlas');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('href', '/coran/lecteur?s=112');
  await page.getByTestId('chercher-sourate').fill('36');
  await expect(rows.first()).toHaveAttribute('href', '/coran/lecteur?s=36');
  await page.getByTestId('chercher-sourate').fill('zzz');
  await expect(rows).toHaveCount(0);
  // informations derrière un bouton nommé
  await page.getByTestId('infos-coran').click();
  await expect(page.getByTestId('feuille-infos-coran')).toContainText('Tanzil');
});

test('récitateurs : « Mes récitateurs » / « Ajouter un récitateur », crédits derrière ⓘ, liens nommés', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await newAdult(page, 'd2-recit');
  await page.goto('/coran/recitateurs');
  await page.locator('[data-reciter]').first().waitFor();
  await expect(page.locator('[data-groupe="ajouter"]')).toBeVisible();
  const card = page.locator('[data-reciter="essai-qalun"]');
  // crédits : fermés par défaut, ouverts d'un toucher (nom écrit) ; liens externes nommés
  await expect(card.getByTestId('credit-recitateur')).toBeHidden();
  await card.locator('summary').click();
  await expect(card.getByTestId('credit-recitateur')).toBeVisible();
  for (const a of await page.locator('[data-reciter] details a').all())
    expect(await a.textContent()).toMatch(/Site du Complexe du Roi Fahd|Quran Foundation/);
  await card.locator('summary').click();
  await card.getByTestId('choisir').click();
  await expect(page.locator('[data-groupe="miens"]')).toBeVisible();
  await expect(card.getByTestId('choisi')).toBeVisible();
  await controle(page, 'recitateurs-adulte');
});

test('Vivre l’islam et Sciences : en-têtes calligraphiés, cartes par thème', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await newAdult(page, 'd2-vivre');
  await page.goto('/vivre');
  await expect(page.getByTestId('entete-espace')).toContainText('حَيَاةُ الْمُسْلِمِ');
  await expect(page.getByTestId('vi-tuiles').locator('a').first()).toBeVisible();
  await controle(page, 'vivre-adulte');
  await page.goto('/sciences');
  await expect(page.getByTestId('entete-espace')).toContainText('الْعُلُومُ');
  await controle(page, 'sciences-adulte');
});

test('« Plus » rangé en familles, chaque entrée avec icône et nom', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await newAdult(page, 'd2-plus');
  await page.goto('/plus');
  const familles = page.locator('[data-famille]');
  await expect(familles).toHaveText([
    'Apprendre plus',
    'Pratiquer',
    'Ma classe et mon suivi',
    'Aide',
    'Compte',
  ]);
  for (const href of ['/lectures', '/sciences', '/ecriture', '/revisions', '/hors-ligne'])
    await expect(page.locator(`[data-plus="${href}"]`)).toBeVisible();
  await expect(page.getByTestId('probleme-ouvrir')).toBeVisible();
  await expect(page.getByTestId('avis-ouvrir')).toBeVisible();
  await expect(page.locator('[data-plus="/garanties"]')).toBeVisible();
  // pas d'entrée pour ce qui n'existe pas encore (Madjaliss, Poésie)
  await expect(page.getByTestId('plus')).not.toContainText(/Madjaliss|Poésie/);
  await controle(page, 'plus-adulte');
});

test('Compte : sommaire en rubriques ; suppression isolée, confirmée en deux temps', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await newAdult(page, 'd2-compte');
  await page.goto('/compte');
  const rubriques = page.getByTestId('compte-sommaire').locator('[data-rubrique]');
  await expect(rubriques).toHaveCount(5);
  await expect(rubriques.locator('.nom > span')).toHaveText([
    'Mon profil',
    'Connexion et sécurité',
    'Notifications',
    'Apprentissage',
    'Données et confidentialité',
  ]);
  // abonnement masqué tant qu'il n'est pas ouvert ; rien de destructeur sur le sommaire
  await expect(page.locator('[data-rubrique="abonnement"]')).toHaveCount(0);
  await expect(page.getByTestId('supprimer-compte')).toHaveCount(0);
  await controle(page, 'compte-sommaire-adulte');
  await rubriques.filter({ hasText: 'Données' }).click();
  await expect(page).toHaveURL(/\/compte\?r=donnees$/);
  await expect(page.getByTestId('consentements')).toBeVisible();
  // la zone de suppression est la dernière section ; premier temps : rien n'est supprimé
  await expect(page.locator('main section').last()).toHaveAttribute(
    'data-testid',
    'zone-suppression',
  );
  await expect(page.getByTestId('supprimer-compte')).toHaveCount(0);
  await controle(page, 'compte-donnees-adulte');
  await page.getByTestId('supprimer-etape1').click();
  await expect(page.locator('#delpw')).toBeVisible();
  await expect(page.getByTestId('supprimer-compte')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('supprimer-compte')).toHaveCount(0);
  await page.getByTestId('compte-retour').click();
  await expect(page.getByTestId('compte-sommaire')).toBeVisible();
});

test('connexion et inscription : bloc marque sobre, formulaire clair, accords jamais cochés', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await page.goto('/connexion');
  await expect(page.getByTestId('marque-slogan')).toBeVisible();
  await controle(page, 'connexion');
  await page.goto('/inscription');
  await expect(page.getByTestId('inscription-marque')).toBeVisible();
  await expect(page.getByTestId('consent-art9')).not.toBeChecked();
  await expect(page.getByTestId('consent-cgu')).not.toBeChecked();
  await controle(page, 'inscription');
});

test.describe('enfant', () => {
  test.use({ compte: 'parent' });
  test('enfant : Coran, Vivre l’islam, Plus — cibles de 56 px, pas de liens juridiques', async ({
    page,
  }, info) => {
    test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
    await page.setViewportSize(MOBILE);
    await pickProfile(page, 'Yanis');
    await page.goto('/plus');
    await expect(page.locator('[data-famille]').first()).toBeVisible();
    await expect(page.locator('[data-plus="/garanties"]')).toBeHidden();
    await expect(page.locator('[data-plus="/legal/mentions"]')).toBeHidden();
    for (const box of await page.locator('.nav-liste a:visible').all())
      expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await controle(page, 'plus-enfant');
    await page.goto('/coran');
    await expect(page.getByTestId('liste-sourates')).toBeVisible();
    expect(
      (await page.locator('[data-sourate]').first().boundingBox())!.height,
    ).toBeGreaterThanOrEqual(56);
    await controle(page, 'coran-accueil-enfant', { full: false });
    await page.goto('/vivre');
    await expect(page.getByTestId('vi-tuiles').locator('a').first()).toBeVisible();
    expect(
      (await page.getByTestId('vi-tuiles').locator('a').first().boundingBox())!.height,
    ).toBeGreaterThanOrEqual(56);
    await controle(page, 'vivre-enfant');
    await page.goto('/compte');
    await expect(page.getByTestId('changer-eleve')).toBeVisible();
    await controle(page, 'compte-sommaire-parent');
  });
});
