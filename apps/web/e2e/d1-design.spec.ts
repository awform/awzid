import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot D1 (« Design V3 + agencement ») : accueil en un écran (séance du jour en héros), Arabe par unités
 * (« Reprendre », couvertures, états), leçon section par section (barre, « Suivant », sommaire, tout voir pour
 * l'adulte), fin de leçon « Grandir » (arbre), en-tête allégé ; règles transversales : aucune icône d'action
 * sans nom écrit, une seule action principale, titres en Lexend, cibles enfant de 56 px ; parcours débutant
 * (connexion → leçon 1 en 2 touchers au plus). Captures 375 px clair et sombre si CAPTURES_DIR est défini,
 * avec un inventaire (actions visibles, hauteur, icônes sans nom).
 */
test.use({ compte: null, parEtapes: true });
const DIR = process.env.CAPTURES_DIR;
const MOBILE = { width: 375, height: 812 };
const H = { 'x-awform': '1' };
const inventaire: Array<Record<string, unknown>> = [];

/** boutons et liens visibles qui n'ont AUCUN texte écrit (le logo de la marque, nommé, est la seule exception) */
const sansNom = (page: Page) =>
  page.evaluate(() => {
    const vis = (el: Element) => {
      // contenu d'un <details> fermé, élément caché par un parent : invisible
      if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
        return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return [...document.querySelectorAll('a[href], button, summary, [role=button]')]
      .filter(vis)
      .filter((e) => !(e as HTMLElement).innerText.trim())
      .filter((e) => e.getAttribute('data-testid') !== 'accueil')
      .map((e) => e.getAttribute('data-testid') ?? e.outerHTML.slice(0, 80));
  });

const mesure = (page: Page) =>
  page.evaluate(() => {
    const vis = (el: Element) => {
      // contenu d'un <details> fermé, élément caché par un parent : invisible
      if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
        return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const acts = [
      ...document.querySelectorAll(
        'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]',
      ),
    ].filter(vis);
    const main = document.querySelector('main')!;
    return {
      actions: acts.length,
      liste: acts.map(
        (a) =>
          (a as HTMLElement).innerText.trim().slice(0, 24) ||
          a.getAttribute('data-testid') ||
          a.tagName,
      ),
      hauteur: Math.round(document.documentElement.scrollHeight),
      hauteurContenu: Math.round(main.getBoundingClientRect().height),
      principales: [...main.querySelectorAll('.primary')].filter(vis).length,
      titres: [...document.querySelectorAll('h1, h2, h3')]
        .filter(vis)
        .map((h) => getComputedStyle(h).fontFamily.split(',')[0]!.replace(/['"]/g, '').trim()),
    };
  });

async function shots(page: Page, nom: string, opts: { full?: boolean } = {}) {
  const m = await mesure(page);
  const icones = await sansNom(page);
  inventaire.push({ ecran: nom, ...m, iconesSansNom: icones });
  if (!DIR) return;
  mkdirSync(DIR, { recursive: true });
  // images chargées à l'approche de l'écran (couvertures) : parcourir la page avant la capture pleine page
  if (opts.full !== false) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: join(DIR, `${nom}-v3-${scheme === 'light' ? 'clair' : 'sombre'}.png`),
      fullPage: opts.full ?? true,
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function adulteAd1(page: Page, label: string) {
  const { profileId, email } = await newAdult(page, label);
  const r = await page.request.post(`/api/v1/profiles/${profileId}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect(r.status(), await r.text()).toBe(201);
  return { profileId, email };
}

const graves = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${n.failureSummary ?? ''})`).join(' | ')}`,
    );

test.afterAll(() => {
  if (DIR && inventaire.length)
    writeFileSync(join(DIR, 'inventaire-d1.json'), JSON.stringify(inventaire, null, 1));
});

test('parcours débutant : connexion → début de la leçon 1 en 2 touchers au plus', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'parcours au téléphone');
  await page.setViewportSize(MOBILE);
  const { email } = await adulteAd1(page, 'd1-debutant');
  await page.context().clearCookies();
  await page.goto('/connexion');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password());
  let touchers = 0;
  // toucher 1 : « Se connecter »
  await page.locator('form button[type=submit]').first().click();
  touchers++;
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion'));
  // toucher 2 : l'action principale de l'écran d'arrivée (accueil : « Commencer ma séance »)
  const go = page.getByTestId('commencer-seance').or(page.getByTestId('continuer')).first();
  await go.click();
  touchers++;
  await expect(page).toHaveURL(/\/lecons\/ad1\.l01$/);
  await expect(page.getByTestId('etape-courante')).toHaveAttribute('data-etape', 'decouvrir');
  expect(touchers).toBeLessThanOrEqual(2);
});

test('accueil adulte : un seul écran, une action principale, aucune icône sans nom, titres en Lexend', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await adulteAd1(page, 'd1-accueil');
  await page.goto('/aujourdhui');
  await expect(page.getByTestId('commencer-seance')).toBeVisible();
  // ni cartes d'espaces, ni avis, ni liens juridiques, ni jalons sur l'accueil
  await expect(page.getByTestId('mes-espaces')).toHaveCount(0);
  await expect(page.getByTestId('pied')).toHaveCount(0);
  await expect(page.getByTestId('jalons')).toHaveCount(0);
  // « Bienvenue » : fermable, et plus montré ensuite
  await page.getByTestId('bienvenue-fermer').click();
  await expect(page.getByTestId('bienvenue')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('commencer-seance')).toBeVisible();
  await expect(page.getByTestId('bienvenue')).toHaveCount(0);
  const m = await mesure(page);
  expect(m.hauteurContenu, 'accueil sous 1 000 px').toBeLessThan(1000);
  expect(m.principales, 'une seule action principale').toBe(1);
  expect(
    m.titres.every((f) => f === 'Lexend'),
    m.titres.join(','),
  ).toBe(true);
  expect(await sansNom(page)).toEqual([]);
  expect(await graves(page)).toEqual([]);
  // « Ma semaine » ouvre « Mon suivi » (semaine, arbre, jalons, rapport)
  await shots(page, 'accueil-adulte');
  await page.getByTestId('ma-semaine').click();
  await expect(page).toHaveURL(/\/suivi$/);
  await expect(page.getByTestId('jalons')).toBeVisible();
  await expect(page.getByTestId('mon-arbre')).toBeVisible();
});

test('Arabe adulte : « Reprendre », unités (seule la courante dépliée), états, aucune icône sans nom', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await adulteAd1(page, 'd1-arabe');
  await page.goto('/');
  const rep = page.getByTestId('mon-niveau');
  await expect(rep.getByTestId('continuer')).toBeVisible();
  await expect(rep.locator('.rp-ar .ar')).toHaveCSS('font-family', /Amiri/);
  // marques [..] du livre rendues (lettres mises en valeur), jamais affichées en crochets
  await expect(page.locator('main')).not.toContainText('[');
  // une seule action principale (le bouton doré « Continuer » n'est pas un .primary)
  const unites = page.getByTestId('unite');
  expect(await unites.count()).toBeGreaterThan(1);
  await expect(unites.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(unites.nth(1)).toHaveAttribute('aria-expanded', 'false');
  // états : la leçon 1 est « en cours » (cercle), le bilan a son étoile
  await expect(page.locator('[data-etat="en-cours"]').first()).toBeVisible();
  await expect(page.locator('li.bilan[data-etat="bilan"]').first()).toBeVisible();
  // une unité se déplie d'un toucher
  await unites.nth(1).click();
  await expect(unites.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await unites.nth(1).click();
  // couverture : un objet ou un décor du livre (jamais un personnage), chargé à la demande
  await expect(unites.first().locator('.objet svg')).toBeVisible();
  // jamais un personnage, un animal ou le muṣḥaf : on fait défiler pour charger toutes les couvertures
  for (const u of await unites.all()) await u.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const objets = await page
    .locator('[data-objet]')
    .evaluateAll((e) => e.map((x) => x.getAttribute('data-objet') ?? ''));
  for (const o of objets.filter(Boolean))
    expect(o).not.toMatch(
      /mushaf|rehal|kaaba|quran|surah|ayah|maman|papa|maryam|youssouf|mouth|eye|hand|sheep|camel|bird|sparrow|cat|dog|crow|gazelle|ostrich|x_/,
    );
  expect(await sansNom(page)).toEqual([]);
  expect(await graves(page)).toEqual([]);
  await shots(page, 'arabe-adulte');
});

test('leçon section par section : barre, Suivant, sommaire, tout voir, fin « Grandir »', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
  await page.setViewportSize(MOBILE);
  await adulteAd1(page, 'd1-lecon');
  await page.goto('/lecons/ad1.l01');
  const cur = page.getByTestId('etape-courante');
  await expect(cur).toHaveAttribute('data-etape', 'decouvrir');
  // une section par écran : les autres sont cachées, mais restent dans la page (aucun contenu retiré)
  const toutes = await page
    .locator('[data-etape]')
    .evaluateAll((els) =>
      els.filter((e) => e.classList.contains('etape')).map((e) => e.getAttribute('data-etape')),
    );
  expect(toutes[0]).toBe('decouvrir');
  expect(toutes).toContain('bilan');
  await expect(page.locator('.etape[data-etape="bilan"]')).toBeHidden();
  const m = await mesure(page);
  expect(
    m.actions,
    `premier écran de leçon : moins de 30 actions : ${m.liste.join(' / ')}`,
  ).toBeLessThan(30);
  expect(await sansNom(page)).toEqual([]);
  expect(await graves(page)).toEqual([]);
  expect(m.principales, 'une seule action principale').toBe(1);
  await shots(page, 'lecon-ecran1', { full: false });
  // Suivant
  await page.getByTestId('etape-suivante').click();
  await expect(cur).not.toHaveAttribute('data-etape', 'decouvrir');
  await expect(page.locator('.etape[data-etape="decouvrir"]')).toBeHidden();
  // sommaire : aller directement au bilan
  await page.getByTestId('sommaire').click();
  await expect(page.getByTestId('sommaire-liste')).toBeVisible();
  expect(await sansNom(page)).toEqual([]);
  await shots(page, 'lecon-sommaire', { full: false });
  await page.getByTestId('sommaire-liste').locator('[data-aller="bilan"]').click();
  await expect(cur).toHaveAttribute('data-etape', 'bilan');
  // adulte : tout voir d'un coup (choix gardé), puis retour section par section
  await page.getByTestId('sommaire').click();
  await page.getByTestId('tout-voir').click();
  await expect(page.locator('.etape[data-etape="decouvrir"]')).toBeVisible();
  await expect(page.locator('.etape[data-etape="bilan"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.etape[data-etape="decouvrir"]')).toBeVisible();
  await expect(page.locator('.etape[data-etape="bilan"]')).toBeVisible();
  await page.getByTestId('sommaire').click();
  await page.getByTestId('tout-voir').click();
  await expect(page.locator('.etape[data-etape="bilan"]')).toBeHidden();
  // dernière étape → « Terminer la leçon » → la feuille pousse, l'arbre de l'élève
  await page.getByTestId('sommaire').click();
  const derniere = page.getByTestId('sommaire-liste').locator('[data-aller]').last();
  await derniere.click();
  await page.getByTestId('terminer-lecon').click();
  const fin = page.getByTestId('fin-lecon');
  await expect(fin).toBeVisible();
  await expect(fin.getByTestId('arbre')).toBeVisible();
  // l'arbre compte la leçon qu'on vient de finir (affichage optimiste, puis serveur)
  await expect
    .poll(async () => Number(await fin.getByTestId('arbre').getAttribute('data-feuilles')))
    .toBeGreaterThanOrEqual(1);
  // la carte de fin n'est pas sous la barre collante
  await page.waitForTimeout(300);
  const barre = (await page.getByTestId('etapes').boundingBox())!;
  const titre = (await fin.locator('h2').boundingBox())!;
  expect(titre.y).toBeGreaterThanOrEqual(barre.y + barre.height - 1);
  expect((await mesure(page)).principales).toBe(1);
  await expect(fin).not.toContainText(/points?\b|classement/i);
  expect(await sansNom(page)).toEqual([]);
  await shots(page, 'lecon-fin', { full: false });
});

test('mouvement réduit : la feuille ne s’anime pas', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'une fois suffit');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await adulteAd1(page, 'd1-mouvement');
  await page.goto('/lecons/ad1.l01');
  await page.getByTestId('sommaire').click();
  await page.getByTestId('sommaire-liste').locator('[data-aller]').last().click();
  await page.getByTestId('terminer-lecon').click();
  const name = await page
    .getByTestId('fin-lecon')
    .locator('span.pousse')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('none');
});

test('arbre « Grandir » : né du symbole, il grandit par paliers (1, 5, 20 feuilles)', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('desktop'), 'captures à 375 px');
  await page.setViewportSize(MOBILE);
  const ids: string[] = [];
  for (const [faites, palier] of [
    [0, '0'],
    [4, '1'],
    [19, '2'],
  ] as const) {
    const { profileId } = await adulteAd1(page, `d1-arbre-${faites}`);
    // dernier compte connu sur l'appareil (affichage optimiste) : ${faites} feuilles, puis on finit une leçon
    // (l'appareil peut garder l'élève actif précédent : le compte connu est posé pour chacun)
    ids.push(profileId);
    await page.addInitScript(
      ([keys, v]) => {
        for (const k of keys) localStorage.setItem(k, v);
      },
      [ids.map((id) => `awzid.arbre.${id}`), String(faites)] as const,
    );
    await page.goto('/lecons/ad1.l20');
    await page.getByTestId('sommaire').click();
    await page.getByTestId('sommaire-liste').locator('[data-aller]').last().click();
    await page.getByTestId('terminer-lecon').click();
    const arbre = page.getByTestId('fin-lecon').getByTestId('arbre');
    await expect(arbre).toHaveAttribute('data-feuilles', String(faites + 1));
    await expect(arbre).toHaveAttribute('data-palier', palier);
    if (DIR)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.waitForTimeout(300);
        await page.getByTestId('fin-lecon').screenshot({
          path: join(
            DIR,
            `lecon-fin-v3-${faites + 1}-${scheme === 'light' ? 'clair' : 'sombre'}.png`,
          ),
        });
      }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  }
});

test.describe('enfant', () => {
  test.use({ compte: 'parent' });
  test('accueil et Arabe enfant : texte réécrit, cibles de 56 px, aucune icône sans nom', async ({
    page,
  }, info) => {
    test.skip(info.project.name.startsWith('desktop'), 'mesures à 375 px');
    await page.setViewportSize(MOBILE);
    await pickProfile(page, 'Yanis');
    await page.goto('/aujourdhui');
    await expect(page.getByTestId('seance')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('jardin');
    await expect(page.getByTestId('pied')).toHaveCount(0);
    // en-tête : prénom entier, plus de bouton « changer d'élève » (il est en tête de « Compte »)
    await expect(page.getByTestId('eleve-actif')).toHaveText('Yanis');
    await expect(page.locator('header.top [data-testid="changer-eleve"]')).toHaveCount(0);
    const go = page.getByTestId('commencer-seance');
    if (await go.count()) expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    expect(await sansNom(page)).toEqual([]);
    expect(await graves(page)).toEqual([]);
    expect((await mesure(page)).principales, 'une seule action principale').toBe(1);
    await shots(page, 'accueil-enfant');
    await page.goto('/');
    await expect(page.getByTestId('unite').first()).toBeVisible();
    expect((await page.getByTestId('unite').first().boundingBox())!.height).toBeGreaterThanOrEqual(
      56,
    );
    expect(await sansNom(page)).toEqual([]);
    expect(await graves(page)).toEqual([]);
    await shots(page, 'arabe-enfant');
    await page.goto('/compte');
    await expect(page.getByTestId('changer-eleve')).toBeVisible();
  });
});
