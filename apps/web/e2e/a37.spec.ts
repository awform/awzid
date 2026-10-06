import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Chantier A37 — « Vivre l'islam » (vrais livres de l'édition e2e, fiches d'ESSAI servies par l'API de test) :
 *  - navigation : « Vivre l'islam » à la place de « Prières » (ados, adultes), dans la barre de l'enfant ;
 *  - sous-onglets Bon comportement (en premier) · Prières · Adhkār ;
 *  - défi de la semaine ; rubriques par cercle et par lieu filtrées par le niveau ; rubrique lue dans sa leçon ;
 *  - fiche : étiquettes des statuts, « Que fais-tu si… ? » (ados, adultes), « Dans la vraie vie » (adultes) ;
 *  - espace Famille : « Transmettre les valeurs » ;
 *  - captures 375 px clair / sombre (enfant, ado, adulte) dans reports/a37/.
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const YEAR = new Date().getUTCFullYear();
const uniq = (s: string) => `${s}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sql = (q: string) =>
  execFileSync('psql', [process.env.TEST_DATABASE_URL!, '-Atqc', q], { encoding: 'utf8' });

/** Leçons d'un niveau « terminées » jusqu'à n (comme si l'élève les avait faites). */
function doneUntil(profileId: string, level: string, n: number) {
  sql(
    `INSERT INTO progress (profile_id, unit_id, status) SELECT '${profileId}', u.id, 'terminee' FROM unit u
     WHERE u.level_code = '${level}' AND u.n <= ${n} ON CONFLICT DO NOTHING`,
  );
}

async function adultAt(page: Page, label: string): Promise<string> {
  const { profileId } = await newAdult(page, label);
  const r = await page.request.post(`/api/v1/profiles/${profileId}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect(r.status(), await r.text()).toBe(201);
  return profileId;
}

async function parentWith(req: APIRequestContext, pseudonym: string, age: number, level: string) {
  const s = await req.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      birthYear: 1984,
      email: `${uniq('a37')}@e2e.test`,
      password: password(),
      country: 'FR',
      consents: ['cgu'],
    },
  });
  expect(s.status(), await s.text()).toBe(201);
  const p = await req.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym,
      birthYear: YEAR - 1 - age,
      levelCode: level,
      password: password(),
      consents: ['compte_suivi'],
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  return ((await p.json()) as { id: string }).id;
}

/** Aucune ligne ne mêle de l'arabe et du français : l'arabe des points est dans son propre bloc. */
async function arabicOnOwnLine(page: Page) {
  // chaque point : l'arabe (bloc) entièrement AU-DESSUS du français, jamais sur la même ligne
  const mixed = await page
    .locator('[data-testid="vi-entree"], [data-testid="vi-fiche"]')
    .evaluate((root) =>
      [...root.querySelectorAll('.pt')].flatMap((pt) => {
        const ar = pt.querySelector('[lang="ar"]');
        const fr = [...pt.querySelectorAll('span')].find(
          (s) =>
            !s.closest('[lang="ar"]') &&
            /[A-Za-zÀ-ÿ]{3,}/.test(s.textContent ?? '') &&
            !s.querySelector('[lang="ar"]'),
        );
        if (!ar || !fr) return [];
        return ar.getBoundingClientRect().bottom <= fr.getBoundingClientRect().top + 2
          ? []
          : [pt.textContent ?? ''];
      }),
    );
  expect(mixed).toEqual([]);
}
test('navigation : « Vivre l’islam » à la place de « Prières », sous-onglets bien visibles', async ({
  page,
}) => {
  await adultAt(page, 'a37-nav');
  await page.goto('/aujourdhui');
  const tabs = page.locator('nav.tabs a');
  await expect(tabs).toHaveCount(5);
  expect(await tabs.evaluateAll((a) => a.map((x) => x.getAttribute('data-tab')))).toEqual([
    'aujourdhui',
    'arabe',
    'coran',
    'vivre',
    'plus',
  ]);
  await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toContainText('Vivre l');
  await page.locator('nav.tabs a[data-tab="vivre"]').click();
  await expect(page).toHaveURL(/\/vivre$/);
  await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  const sub = page.locator('[data-vivre-tab]');
  expect(await sub.evaluateAll((a) => a.map((x) => x.getAttribute('data-vivre-tab')))).toEqual([
    'comportement',
    'prieres',
    'adhkar',
  ]);
  await expect(page.locator('[data-vivre-tab="comportement"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Prières : l'existant A12 (horaires, qibla, verset) sous « Vivre l'islam »
  await page.locator('[data-vivre-tab="prieres"]').click();
  await expect(page).toHaveURL(/\/quotidien$/);
  await expect(page.locator('[data-quotidien-tab="qibla"]')).toBeVisible();
  await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.locator('[data-vivre-tab="adhkar"]').click();
  await expect(page).toHaveURL(/\/quotidien\/adhkar$/);
  await expect(page.locator('[data-dhikr]').first()).toBeVisible();
  await page.locator('[data-vivre-tab="comportement"]').click();
  await expect(page.getByTestId('vi-defi')).toBeVisible();
});

test('adulte : défi, rubriques par cercle (niveau atteint seulement) et par lieu, rubrique et fiche', async ({
  page,
}) => {
  const pid = await adultAt(page, 'a37-adulte');
  doneUntil(pid, 'ad1', 6);
  const reached = (
    (await (await page.request.get(`/api/v1/profiles/${pid}/vivre`)).json()) as { units: string[] }
  ).units;
  expect(reached.length).toBeGreaterThan(0);
  expect(reached.every((u) => /^ad1\.l0[1-7]$/.test(u))).toBe(true);
  await page.goto('/vivre');
  // défi : celui d'une fiche (les fiches d'essai en ont un), le même au rechargement
  const defi = page.getByTestId('vi-defi');
  await expect(defi).toHaveAttribute('data-defi', /fiche|rubrique/);
  const first = await defi.textContent();
  await page.reload();
  await expect(defi).toHaveText(first!);
  // par cercle : tuiles avec le nombre de fiches ; aucune rubrique d'une leçon non atteinte
  const tiles = page.getByTestId('vi-tuiles');
  await expect(tiles).toHaveAttribute('data-par', 'cercle');
  await expect(tiles.locator('[data-groupe="soi"]')).toContainText(/fiche/);
  const groups = await tiles
    .locator('[data-groupe]')
    .evaluateAll((a) => a.map((x) => x.getAttribute('data-groupe')!));
  for (const g of groups) {
    await page.goto(`/vivre?c=${g}`);
    await expect(page.getByTestId('vi-groupe')).toHaveAttribute('data-groupe', g);
    const ids = await page
      .locator('[data-entree]')
      .evaluateAll((a) => a.map((x) => x.getAttribute('data-entree')!));
    for (const id of ids) expect(reached, id).toContain(id.split('.').slice(0, 2).join('.'));
  }
  // une rubrique du livre : texte de la leçon, arabe sur sa ligne, lien vers la leçon
  await page.goto('/vivre?c=allah_prophete');
  await page.locator('[data-entree]').first().click();
  const e = page.getByTestId('vi-entree');
  await expect(e).toBeVisible();
  await expect(e.locator('.pt').first()).toBeVisible();
  await expect(page.getByTestId('vi-voir-lecon')).toHaveAttribute('href', /\/lecons\/ad1\.l0\d$/);
  await arabicOnOwnLine(page);
  // par lieu : la chambre ; fiche d'essai avec ses étiquettes (mot écrit, couleur des jetons)
  await page.goto('/vivre');
  await page.locator('[data-par="lieu"]').click();
  await expect(tiles).toHaveAttribute('data-par', 'lieu');
  await tiles.locator('[data-groupe="chambre"]').click();
  await page.locator('[data-fiche="essai.chambre.01"]').click();
  const f = page.getByTestId('vi-fiche');
  await expect(f).toContainText('Fiche d’essai');
  for (const [s, mot] of [
    ['obligatoire', 'Obligatoire'],
    ['recommande', 'Recommandé'],
    ['permis', 'Permis'],
    ['deconseille', 'Déconseillé'],
  ])
    await expect(f.locator(`[data-statut="${s}"]`)).toHaveText(mot);
  await expect(f.locator('[data-etape="avant"]')).toBeVisible();
  await expect(page.getByTestId('vi-dire')).toContainText('Source d’essai');
  await expect(page.getByTestId('vi-vraie-vie')).toBeVisible();
  await expect(page.getByTestId('vi-situations')).toBeVisible();
  await expect(page.getByTestId('vi-fiche-defi')).toBeVisible();
  await arabicOnOwnLine(page);
  await page.goto('/vivre?f=essai.rue.01');
  await expect(f.locator('[data-statut="interdit"]')).toHaveText('Interdit');
  // ni compteur de bonnes actions ni classement
  await expect(page.locator('body')).not.toContainText(/ḥasanāt|hasanat|classement/i);
});

test('enfant : « Vivre l’islam » dans sa barre, grandes tuiles, fiche très courte', async ({
  page,
}) => {
  const id = await parentWith(page.request, 'Nour', 8, 'en1');
  doneUntil(id, 'en1', 5);
  await pickProfile(page, 'Nour');
  await page.goto('/aujourdhui');
  await expect(page.locator('nav.tabs a')).toHaveCount(5);
  await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toBeVisible();
  await page.locator('nav.tabs a[data-tab="vivre"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'jardin');
  const tiles = page.getByTestId('vi-tuiles');
  await expect(tiles.locator('[data-groupe]').first()).toBeVisible();
  // grandes tuiles illustrées, sans nombre ; aucun cercle d'adulte
  const box = await tiles.locator('.tile-ic').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(60);
  await expect(tiles.locator('small')).toHaveCount(0);
  for (const g of ['epoux', 'enfants', 'travail'])
    await expect(tiles.locator(`[data-groupe="${g}"]`)).toHaveCount(0);
  // fiche courte : ni « Que fais-tu si… ? » ni « Dans la vraie vie »
  await page.goto('/vivre?f=essai.chambre.01');
  const f = page.getByTestId('vi-fiche');
  await expect(f.locator('[data-etape="pendant"]')).toBeVisible();
  await expect(page.getByTestId('vi-dire')).toBeVisible();
  await expect(page.getByTestId('vi-situations')).toHaveCount(0);
  await expect(page.getByTestId('vi-vraie-vie')).toHaveCount(0);
  // la fiche réservée aux ados et adultes n'est pas dans ses rubriques
  await page.goto('/vivre?l=rue');
  await expect(page.locator('[data-fiche="essai.rue.01"]')).toHaveCount(0);
});

test('ado : « Que fais-tu si… ? », sans « Dans la vraie vie »', async ({ page }) => {
  const id = await parentWith(page.request, 'Ilyes', 14, 'ado1');
  doneUntil(id, 'ado1', 3);
  await pickProfile(page, 'Ilyes');
  await page.goto('/vivre?l=rue');
  await page.locator('[data-fiche="essai.rue.01"]').click();
  await expect(page.getByTestId('vi-situations')).toBeVisible();
  await page.getByTestId('vi-situations').locator('summary').first().click();
  await expect(page.getByTestId('vi-situations')).toContainText('Réponse d’essai 2.');
  await page.goto('/vivre?f=essai.chambre.01');
  await expect(page.getByTestId('vi-vraie-vie')).toHaveCount(0);
  // ado : pas de cercle « Époux » ni « Enfants »
  await page.goto('/vivre');
  await expect(page.locator('[data-groupe="epoux"], [data-groupe="enfants"]')).toHaveCount(0);
});

test('parent : « Transmettre les valeurs », défi de la semaine de chaque enfant', async ({
  page,
}) => {
  const id = await parentWith(page.request, 'Sami', 9, 'en1');
  doneUntil(id, 'en1', 4);
  await page.goto('/profils');
  await page.getByTestId('lien-transmettre').click();
  await expect(page).toHaveURL(/\/vivre\?parents/);
  const cards = page.getByTestId('vi-defi-enfant');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Défi de Sami');
  await page.goto('/vivre');
  await expect(page.getByTestId('vi-transmettre')).toBeVisible();
});

test('captures 375 px clair / sombre : enfant, ado, adulte', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'captures sur téléphone seulement');
  const dir = '../../reports/a37';
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const shoot = async (who: string, path: string, name: string) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      );
      await page.screenshot({ path: `${dir}/${who}-${name}-${scheme}.png`, fullPage: true });
    }
  };
  const pid = await adultAt(page, 'a37-captures');
  doneUntil(pid, 'ad1', 10);
  await shoot('adulte', '/vivre', 'accueil');
  await shoot('adulte', '/vivre?par=lieu', 'lieux');
  await shoot('adulte', '/vivre?f=essai.chambre.01', 'fiche');
  await shoot('adulte', '/vivre?c=allah_prophete', 'rubrique');
  const e = await page.locator('[data-entree]').first().getAttribute('data-entree');
  if (e) await shoot('adulte', `/vivre?e=${e}`, 'rubrique-livre');
  await shoot('adulte', '/quotidien', 'prieres');
  await page.context().clearCookies();
  await parentWith(page.request, 'Yasmine', 14, 'ado1');
  await pickProfile(page, 'Yasmine');
  await shoot('ado', '/vivre', 'accueil');
  await shoot('ado', '/vivre?f=essai.rue.01', 'fiche');
  await page.context().clearCookies();
  const kid = await parentWith(page.request, 'Safa', 8, 'en1');
  doneUntil(kid, 'en1', 8);
  await pickProfile(page, 'Safa');
  await shoot('enfant', '/vivre', 'accueil');
  await shoot('enfant', '/vivre?par=lieu', 'lieux');
  await shoot('enfant', '/vivre?f=essai.chambre.01', 'fiche');
});
