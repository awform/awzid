import { mkdirSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Douas (phases 1 à 3) — onglet « Douas » de « Vivre l'islam » (données `/douas/douas.json`, à la demande) :
 *  - phase 2 : groupes, fiche « Comment invoquer », renvois, sens en français, voix de synthèse provisoire pour
 *    les hadiths seulement (jamais un verset), voyage complet ;
 *  - l'onglet, à côté de Bon comportement, Prières et Adhkār ; bandeau « Sources vérifiées » ;
 *  - une rubrique : l'arabe EXACT des données (le test unitaire le compare au dossier et à Tanzil), le moment,
 *    « Traduction en préparation » ; aucune doua écartée ni en attente ; aucun bouton d'écoute ;
 *  - la source derrière « Source » (parole de Compagnon d'après le Muwaṭṭaʾ pour le tonnerre) ;
 *  - les favoris, gardés sur l'appareil (après rechargement) ;
 *  - le profil enfant : la liste courte seulement, sans rubriques ;
 *  - captures 412 × 915, clair et sombre, dans reports/douas/.
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const YEAR = new Date().getUTCFullYear();
type Data = {
  rubriques: Array<{ id: string; douas: string[] }>;
  enfant: string[];
  douas: Record<
    string,
    {
      ar?: string;
      coran?: Array<{ s: number; a: number }>;
      traduction?: string;
      audio?: string | null;
    }
  >;
};

async function data(req: APIRequestContext): Promise<Data> {
  const r = await req.get('/douas/douas.json');
  expect(r.status()).toBe(200);
  return (await r.json()) as Data;
}

async function parentWithChild(req: APIRequestContext, pseudonym: string) {
  const s = await req.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      birthYear: 1984,
      email: `douas-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`,
      password: password(),
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(s.status(), await s.text()).toBe(201);
  const p = await req.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym,
      birthYear: YEAR - 1 - 8,
      levelCode: 'en1',
      password: password(),
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    },
  });
  expect(p.status(), await p.text()).toBe(201);
}

const liste = (page: Page) => page.getByTestId('douas-liste');
const ids = (page: Page) =>
  liste(page)
    .locator('[data-doua]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-doua')));

test('onglet Douas : à côté des autres, bandeau, rubriques, une rubrique exacte', async ({
  page,
}) => {
  await newAdult(page, 'douas-onglet');
  const d = await data(page.request);
  await page.goto('/vivre');
  const tabs = page.locator('[data-vivre-tab]');
  await expect(tabs).toHaveCount(4);
  await expect(page.locator('[data-vivre-tab="douas"]')).toHaveText('Douas');
  await page.locator('[data-vivre-tab="douas"]').click();
  await page.waitForURL(/\/vivre\/douas$/);
  await expect(page.locator('[data-vivre-tab="douas"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('douas-bandeau')).toHaveText(
    'Sources vérifiées — en cours de relecture savante',
  );
  // 23 rubriques (phase 3), les fiches « Comment invoquer » et « L'aumône », les favoris ; groupes du référent
  const chips = page.getByTestId('douas-rubriques').locator('button');
  await expect(chips).toHaveCount(d.rubriques.length + 3);
  expect(d.rubriques.length).toBe(23);
  await expect(page.getByTestId('douas-rubriques').locator('[data-groupe]')).toHaveText([
    'Au quotidien',
    'Moments de la vie',
    "Le temps de l'année",
    'Les besoins',
    'Le Coran',
  ]);
  // fiches : « Comment invoquer » en tête, « L'aumône » en fin de rangée
  await expect(chips.nth(1)).toHaveAttribute('data-rubrique', 'invoquer');
  await expect(chips.last()).toHaveAttribute('data-rubrique', 'sadaqa');
  // rubrique « Repas » : douas du dossier, dans l'ordre, texte arabe exact, moment, sens en français
  await page.locator('[data-rubrique="repas"]').click();
  await expect(page.locator('[data-rubrique="repas"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('douas-titre-rubrique')).toHaveText('Repas');
  await expect(page.getByTestId('douas-groupe')).toHaveText('Au quotidien');
  const repas = d.rubriques.find((r) => r.id === 'repas')!.douas;
  await expect.poll(() => ids(page)).toEqual(repas);
  for (const id of repas) {
    const card = liste(page).locator(`[data-doua="${id}"]`);
    expect(await card.locator('[data-douas-ar]').textContent()).toBe(d.douas[id]!.ar);
    await expect(card.locator('.sens')).toHaveText(d.douas[id]!.traduction!);
    await expect(card.getByTestId('douas-traduction-prep')).toHaveCount(0);
    // titre = le moment seul, sans citation traduite
    await expect(card.locator('h3')).not.toContainText('«');
    // voix de synthèse provisoire (hadith) : bouton et mention, seulement si le fichier existe
    const n = d.douas[id]!.audio ? 1 : 0;
    await expect(card.getByTestId('douas-ecouter')).toHaveCount(n);
    await expect(card.getByTestId('douas-voix-provisoire')).toHaveCount(n);
  }
  await expect(liste(page).getByTestId('douas-ecouter').first()).toBeVisible();
  await expect(liste(page).getByTestId('douas-voix-provisoire').first()).toHaveText(
    'Voix de synthèse provisoire',
  );
  const mp3 = await liste(page).getByTestId('douas-ecouter').first().getAttribute('data-audio');
  const r = await page.request.get(mp3!);
  expect(r.status()).toBe(200);
  expect((await r.body()).length).toBeGreaterThan(1000);
  // douas du Coran : texte entre ﴿ ﴾, verset par verset (Tanzil), JAMAIS de voix de synthèse
  await page.locator('[data-rubrique="coran"]').click();
  const musa = liste(page).locator('[data-doua="DOU-COR-06"] [data-douas-coran]');
  await expect(musa).toContainText('﴿');
  await expect(musa.locator('[data-verset]')).toHaveCount(4);
  await expect(
    page.locator('audio, [data-testid="douas-ecouter"], [data-testid="ecouter"]'),
  ).toHaveCount(0);
  // aucune doua écartée ou en attente, dans aucune rubrique
  const seen: string[] = [];
  for (const r of d.rubriques) {
    await page.locator(`[data-rubrique="${r.id}"]`).click();
    await expect.poll(() => ids(page)).toEqual(r.douas);
    await expect(page.locator('[data-doua^="ECA-"], [data-doua^="EC2-"]')).toHaveCount(0);
    // aucun verset lu par la voix de synthèse
    for (const id of r.douas)
      if (d.douas[id]!.coran)
        await expect(
          liste(page).locator(`[data-doua="${id}"]`).getByTestId('douas-ecouter'),
        ).toHaveCount(0);
    seen.push(...r.douas);
  }
  expect(seen.sort()).toEqual(Object.keys(d.douas).sort());
  expect(seen.filter((x) => x.startsWith('ECA-') || x.startsWith('EC2-'))).toEqual([]);
});

test('phase 2 : fiche « Comment invoquer », renvois « Voir aussi », voyage complet', async ({
  page,
}) => {
  await newAdult(page, 'douas-phase2');
  await page.goto('/vivre/douas?r=invoquer');
  await expect(page.getByTestId('douas-titre-rubrique')).toHaveText('Comment invoquer');
  const fiche = page.getByTestId('douas-fiche');
  await expect(fiche).toContainText('Les moments propices');
  await expect(fiche).toContainText('dernier tiers de la nuit');
  await expect(fiche.getByRole('link', { name: 'at-Tirmidhī 3477' })).toHaveAttribute(
    'href',
    'https://sunnah.com/tirmidhi:3477',
  );
  await expect(page.getByTestId('douas-liste')).toHaveCount(0);
  // renvoi vers une doua d'une autre rubrique : on y va, sans copie du texte
  await page.goto('/vivre/douas?r=dette');
  await expect(page.getByTestId('douas-groupe')).toHaveText('Les besoins');
  await page.getByTestId('douas-voir-aussi').locator('[data-renvoi="DOU-ANG-05"]').click();
  await expect(page.locator('[data-rubrique="epreuve"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(liste(page).locator('[data-doua="DOU-ANG-05"]')).toBeVisible();
  // renvoi vers les adhkār du matin (« بسم الله الذي لا يضر… », trois fois)
  const adhkar = page.getByTestId('douas-voir-aussi').locator('[data-renvoi-adhkar]');
  await expect(adhkar).toHaveAttribute('href', '/quotidien/adhkar?c=matin');
  await adhkar.click();
  await page.waitForURL(/\/quotidien\/adhkar\?c=matin$/);
  await expect(page.locator('[data-categorie="matin"]')).toHaveAttribute('aria-selected', 'true');
  // voyage : adieux, départ, monture (véhicules), ville, retour, verset 11:41 sans voix
  await page.goto('/vivre/douas?r=voyage');
  await expect.poll(async () => (await ids(page)).length).toBe(10);
  const v01 = liste(page).locator('[data-doua="DOU-VOY-01"]');
  await v01.getByRole('button', { name: 'Source' }).click();
  await expect(v01.getByTestId('douas-source-detail')).toContainText('voiture, avion, bateau');
  const ville = liste(page).locator('[data-doua="DOU-VOY-08"]');
  await ville.getByRole('button', { name: 'Source' }).click();
  await expect(ville.getByTestId('douas-source-detail')).toContainText('bon');
  await expect(
    ville.getByTestId('douas-source-detail').getByRole('link', { name: 'Voir sur dorar.net' }),
  ).toHaveAttribute('href', /^https:\/\/dorar\.net\/h\//);
  await expect(
    liste(page).locator('[data-doua="DOU-VOY-10"]').getByTestId('douas-ecouter'),
  ).toHaveCount(0);
});

test('phase 3 : naissance, décès, Ramadan, fêtes et ʿArafa, fiche « L’aumône », langue de l’invocation', async ({
  page,
}) => {
  await newAdult(page, 'douas-phase3');
  // naissance : aucune formule fixe du Prophète ; « À savoir » sourcé ; l'adhān avec son degré, non présenté comme sunna
  await page.goto('/vivre/douas?r=naissance');
  await expect(page.getByTestId('douas-titre-rubrique')).toHaveText('Naissance');
  await expect(page.getByTestId('douas-groupe')).toHaveText('Moments de la vie');
  await expect(page.getByTestId('douas-liste')).toHaveCount(0);
  await expect(page.getByTestId('etat-vide')).toHaveCount(0);
  const savoir = page.getByTestId('douas-a-savoir');
  await expect(savoir).toContainText('taḥnīk');
  await expect(savoir.getByRole('link', { name: 'al-Bukhārī 5467' })).toHaveAttribute(
    'href',
    'https://sunnah.com/bukhari:5467',
  );
  const non = page.getByTestId('douas-non-ajoute');
  await expect(non.locator('h3')).toHaveText("Ce que nous n'ajoutons pas");
  await expect(non).toContainText('pas comme une sunna établie');
  await expect(non.getByRole('link', { name: 'at-Tirmidhī 1514' })).toBeVisible();
  // décès : condoléances, Abū Salama (deux lignes), prière funéraire ; voix provisoire (hadiths)
  await page.goto('/vivre/douas?r=deces');
  await expect.poll(() => ids(page)).toEqual(['DOU-DEC-01', 'DOU-DEC-02', 'DOU-DEC-03']);
  await expect(liste(page).locator('[data-doua="DOU-DEC-02"] [data-douas-ar]')).toHaveCount(2);
  await expect(
    page.getByTestId('douas-voir-aussi').locator('[data-renvoi="DOU-ANG-04"]'),
  ).toBeVisible();
  // Ramadan : rupture du jeûne (Abū Dāwūd 2357), « trente douas » non ajoutées, nuit du Destin par renvoi
  await page.goto('/vivre/douas?r=ramadan');
  await expect(page.getByTestId('douas-groupe')).toHaveText("Le temps de l'année");
  await expect.poll(() => ids(page)).toEqual(['DOU-RAM-01']);
  await expect(page.getByTestId('douas-non-ajoute')).toContainText('trente douas');
  await page.getByTestId('douas-voir-aussi').locator('[data-renvoi="DOU-PAR-05"]').click();
  await expect(page.locator('[data-rubrique="repentir"]')).toHaveAttribute('aria-pressed', 'true');
  // fêtes : vœux des Compagnons présentés comme tels ; ʿArafa traité honnêtement
  await page.goto('/vivre/douas?r=fetes');
  const eid = liste(page).locator('[data-doua="DOU-EID-01"]');
  await expect(eid.getByTestId('douas-compagnon')).toHaveText("Parole d'un Compagnon");
  await eid.getByRole('button', { name: 'Source' }).click();
  await expect(eid.getByTestId('douas-source-detail')).toContainText(
    "Ce n'est pas une parole du Prophète",
  );
  await expect(page.getByTestId('douas-non-ajoute')).toContainText('mursal');
  // fiche « L'aumône » : hadiths sourcés, renvoi vers la zakāt (Ibn ʿĀshir, fiqh mālikite)
  await page.locator('[data-rubrique="sadaqa"]').click();
  await expect(page.getByTestId('douas-titre-rubrique')).toHaveText("L'aumône (ṣadaqa)");
  const fiche = page.getByTestId('douas-fiche');
  await expect(fiche.getByRole('link', { name: 'Muslim 2588' })).toHaveAttribute(
    'href',
    'https://sunnah.com/muslim:2588',
  );
  await expect(fiche.locator('[data-renvoi-lecon]').first()).toHaveAttribute(
    'href',
    '/madjaliss/ibn-ashir/36',
  );
  // « Comment invoquer » : langue de l'invocation dans la prière, tranchée sur l'ouvrage (page lue)
  await page.locator('[data-rubrique="invoquer"]').click();
  await expect(page.getByTestId('douas-fiche')).toContainText('makrūh');
  await expect(page.getByTestId('douas-fiche')).not.toContainText('en cours de vérification');
});

test('source derrière « Source », ajout facultatif, tonnerre : parole d’un Compagnon', async ({
  page,
}) => {
  await newAdult(page, 'douas-source');
  await page.goto('/vivre/douas?r=pluie');
  const card = liste(page).locator('[data-doua="DOU-PLU-05"]');
  await expect(card.getByTestId('douas-compagnon')).toHaveText("Parole d'un Compagnon");
  const btn = card.getByRole('button', { name: 'Source' });
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(card.getByTestId('douas-source-detail')).toHaveCount(0);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const detail = card.getByTestId('douas-source-detail');
  // parole de Compagnon : qui l'a dite, qui la rapporte, et le lien ; aucun degré avant vérification
  await expect(detail).toContainText(
    "Parole du Compagnon ʿAbd Allāh ibn az-Zubayr, rapportée par l'imam Mālik dans le Muwaṭṭaʾ",
  );
  await expect(detail).not.toContainText('Degré');
  // aucun texte technique : pas d'URL brute, un lien « Voir sur sunnah.com »
  await expect(detail).not.toContainText('http');
  await expect(detail).not.toContainText(/confirmer|recherche web/);
  await expect(detail.getByRole('link', { name: 'Voir sur sunnah.com' })).toHaveAttribute(
    'href',
    /^https:\/\/sunnah\.com\//,
  );
  // verset cité par le Compagnon : formulation gardée, signalée
  await expect(card.getByTestId('douas-coran-cite')).toHaveText('Contient un passage du Coran');
  await expect(card.locator('h3')).toHaveText('En entendant le tonnerre');
  await btn.click();
  await expect(card.getByTestId('douas-source-detail')).toHaveCount(0);
  await page.goto('/vivre/douas?r=ablutions_mosquee');
  // mosquée : deux formules sur deux lignes, chacune précédée de son moment, dans la même carte
  const mos = liste(page).locator('[data-doua="DOU-MOS-01"]');
  await expect(mos.locator('[data-douas-ar]')).toHaveCount(2);
  await expect(mos.locator('.ligne-moment')).toHaveText(['En entrant', 'En sortant']);
  // un autre hadith : recueil, degré, savant
  await liste(page)
    .locator('[data-doua="DOU-ABL-02"]')
    .getByRole('button', { name: 'Source' })
    .click();
  const abl = liste(page).locator('[data-doua="DOU-ABL-02"]').getByTestId('douas-source-detail');
  await expect(abl).toContainText('Recueil');
  await expect(abl).toContainText('authentique');
  await expect(abl).toContainText('al-Albānī');
  await expect
    .poll(async () => (await ids(page)).slice(0, 2))
    .toEqual(['DOU-ABL-01', 'DOU-ABL-02']);
  await expect(
    liste(page).locator('[data-doua="DOU-ABL-02"]').getByText('Ajout facultatif'),
  ).toBeVisible();
});

test('favoris : ajoutés, listés, gardés sur l’appareil, retirés', async ({ page }) => {
  await newAdult(page, 'douas-favoris');
  await page.goto('/vivre/douas?r=voyage');
  await expect(page.locator('[data-rubrique="favoris"]')).toHaveText('Favoris (0)');
  const card = liste(page).locator('[data-doua="DOU-VOY-03"]');
  await card.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await expect(card.getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-rubrique="favoris"]')).toHaveText('Favoris (1)');
  await page.reload();
  await page.locator('[data-rubrique="favoris"]').click();
  await expect.poll(() => ids(page)).toEqual(['DOU-VOY-03']);
  await liste(page).getByRole('button', { name: 'Retirer des favoris' }).click();
  await expect(page.getByTestId('etat-vide')).toContainText('Aucune doua en favori');
});

test('profil enfant : seulement la liste courte du quotidien, sans rubriques', async ({ page }) => {
  await parentWithChild(page.request, 'Maryam');
  const d = await data(page.request);
  await pickProfile(page, 'Maryam');
  await page.goto('/vivre/douas');
  await expect(page.locator('html')).toHaveAttribute('data-public', 'enfant');
  await expect(liste(page)).toHaveAttribute('data-enfant', '1');
  await expect(page.getByTestId('douas-rubriques')).toHaveCount(0);
  await expect.poll(() => ids(page)).toEqual(d.enfant);
  expect(d.enfant.length).toBeGreaterThanOrEqual(10);
  expect(d.enfant.length).toBeLessThanOrEqual(12);
  await expect(page.getByTestId('douas-bandeau')).toBeVisible();
});

test('captures 412 × 915 clair / sombre (adulte et enfant)', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'captures sur téléphone seulement');
  const dir = '../../reports/douas';
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 412, height: 915 });
  const shoot = async (name: string, path: string, open?: string) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await expect(liste(page)).toBeVisible();
      if (open)
        await liste(page)
          .locator(`[data-doua="${open}"]`)
          .getByRole('button', { name: 'Source' })
          .click();
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        412,
      );
      await page.screenshot({ path: `${dir}/${name}-${scheme}.png` });
    }
  };
  await newAdult(page, 'douas-captures');
  await shoot('adulte-maison-sommeil', '/vivre/douas');
  await shoot('adulte-pluie-source', '/vivre/douas?r=pluie', 'DOU-PLU-05');
  await shoot('adulte-coran', '/vivre/douas?r=coran');
  // phase 3 : « À savoir » avant la doua, « Ce que nous n'ajoutons pas » après
  await shoot('adulte-ramadan', '/vivre/douas?r=ramadan');
  await page.context().clearCookies();
  await parentWithChild(page.request, 'Sami');
  await pickProfile(page, 'Sami');
  await shoot('enfant', '/vivre/douas');
});
