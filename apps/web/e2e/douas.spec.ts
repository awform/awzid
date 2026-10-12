import { mkdirSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Douas (phase 1) — onglet « Douas » de « Vivre l'islam » (données `/douas/douas.json`, à la demande) :
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
  douas: Record<string, { ar?: string; coran?: Array<{ s: number; a: number }> }>;
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
  // 13 rubriques du dossier + les favoris
  const chips = page.getByTestId('douas-rubriques').locator('button');
  await expect(chips).toHaveCount(14);
  // rubrique « Repas » : douas du dossier, dans l'ordre, texte arabe exact, moment, traduction en préparation
  await page.locator('[data-rubrique="repas"]').click();
  await expect(page.locator('[data-rubrique="repas"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('douas-titre-rubrique')).toHaveText('Repas');
  const repas = d.rubriques.find((r) => r.id === 'repas')!.douas;
  await expect.poll(() => ids(page)).toEqual(repas);
  for (const id of repas) {
    const card = liste(page).locator(`[data-doua="${id}"]`);
    expect(await card.locator('[data-douas-ar]').textContent()).toBe(d.douas[id]!.ar);
    await expect(card.getByTestId('douas-traduction-prep')).toHaveText('Traduction en préparation');
    await expect(card.locator('.moment')).not.toBeEmpty();
  }
  // aucune voix : ni bouton d'écoute, ni élément audio
  await expect(page.locator('audio, [data-testid="ecouter"]')).toHaveCount(0);
  // douas du Coran : texte entre ﴿ ﴾, verset par verset (Tanzil)
  await page.locator('[data-rubrique="coran"]').click();
  const musa = liste(page).locator('[data-doua="DOU-COR-06"] [data-douas-coran]');
  await expect(musa).toContainText('﴿');
  await expect(musa.locator('[data-verset]')).toHaveCount(4);
  // aucune doua écartée ou en attente, dans aucune rubrique
  const seen: string[] = [];
  for (const r of d.rubriques) {
    await page.locator(`[data-rubrique="${r.id}"]`).click();
    await expect.poll(() => ids(page)).toEqual(r.douas);
    await expect(page.locator('[data-doua="DOU-ANG-08"], [data-doua^="ECA-"]')).toHaveCount(0);
    seen.push(...r.douas);
  }
  expect(seen.sort()).toEqual(Object.keys(d.douas).sort());
  expect(seen).not.toContain('DOU-ANG-08');
  expect(seen.filter((x) => x.startsWith('ECA-'))).toEqual([]);
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
  await expect(detail).toContainText('Muwaṭṭaʾ');
  await expect(detail).toContainText('Référence');
  await expect(detail).toContainText('Degré');
  await btn.click();
  await expect(card.getByTestId('douas-source-detail')).toHaveCount(0);
  await page.goto('/vivre/douas?r=ablutions_mosquee');
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
  await page.context().clearCookies();
  await parentWithChild(page.request, 'Sami');
  await pickProfile(page, 'Sami');
  await shoot('enfant', '/vivre/douas');
});
