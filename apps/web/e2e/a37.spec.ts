import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Chantier A37 — « Vivre l'islam » (vrais livres de l'édition e2e, dont le livret « Bon comportement » des livres
 * — 120 fiches, index officiel — et 3 fiches d'ESSAI servies par l'API de test) :
 *  - navigation : « Vivre l'islam » à la place de « Prières » (ados, adultes), dans la barre de l'enfant, libellés
 *    jamais tronqués (5 langues, 375 et 320 px) ;
 *  - sous-onglets Bon comportement (en premier) · Prières · Adhkār ;
 *  - défi de la semaine ; rubriques par cercle et par lieu filtrées par le niveau ; rubrique lue dans sa leçon ;
 *  - fiche : texte de l'âge, étiquettes (« Recommandé · sunna », « À éviter — Interdit », « Conseil » neutre),
 *    ce qu'on dit avec sa source, verset en bloc sans voix de synthèse ;
 *  - espace Famille : « Transmettre les valeurs » (chapitre gp.c18 s'il est publié, défis des enfants) ;
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

/** Aucune ligne ne mêle arabe et français : l'arabe de chaque point est AU-DESSUS du français. */
async function arabicOnOwnLine(page: Page) {
  const mixed = await page
    .locator('[data-testid="vi-entree"], [data-testid="vi-fiche"]')
    .evaluate((root) =>
      [...root.querySelectorAll('.pt')].flatMap((pt) => {
        // phrase arabe (3 mots ou plus) : sur sa ligne ; un terme isolé (1-2 mots) peut rester dans le français
        const ar = [...pt.querySelectorAll('[lang="ar"]')].find(
          (x) => (x.textContent ?? '').trim().split(/\s+/).length >= 3,
        );
        const fr = [...pt.querySelectorAll('span, p')].find(
          (s) =>
            !s.closest('[lang="ar"]') &&
            !s.querySelector('[lang="ar"]') &&
            /[A-Za-zÀ-ÿ]{3,}/.test(s.textContent ?? ''),
        );
        if (!ar || !fr) return [];
        return ar.getBoundingClientRect().bottom <= fr.getBoundingClientRect().top + 2
          ? []
          : [pt.textContent ?? ''];
      }),
    );
  expect(mixed).toEqual([]);
}

/** Barre du bas : chaque libellé ENTIER (deux lignes au plus, aucun mot coupé) et icônes alignées. */
async function tabsReadable(page: Page, where: string) {
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/vivre');
    await expect(page.locator('nav.tabs a[data-tab="vivre"]')).toBeVisible();
    const r = await page.locator('nav.tabs').evaluate((nav) => {
      // texte réellement rendu (Range) : lignes distinctes et largeur, comparées à la case du libellé
      const labels = [...nav.querySelectorAll<HTMLElement>('.tl')].map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        const box = el.getBoundingClientRect();
        const tops = rects.map((r) => r.top).sort((x, y) => x - y);
        const lines = tops.filter((v, k) => k === 0 || v - tops[k - 1]! > 6).length;
        const shown = rects.every((r) => r.bottom <= box.bottom + 4 && r.top >= box.top - 4);
        const wide = Math.max(...rects.map((r) => r.width)) > box.width + 1;
        return { text: el.textContent?.trim() ?? '', cut: !shown || wide, lines };
      });
      const tops = [...nav.querySelectorAll('.ti')].map((i) =>
        Math.round(i.getBoundingClientRect().top),
      );
      return { labels, aligned: new Set(tops).size === 1 };
    });
    for (const l of r.labels) {
      expect(l.cut, `${where} ${width} px : « ${l.text} » tronqué`).toBe(false);
      expect(l.lines, `${where} ${width} px : « ${l.text} »`).toBeLessThanOrEqual(2);
    }
    expect(r.aligned, `${where} ${width} px : icônes alignées`).toBe(true);
  }
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

test('adulte : défi, rubriques de l’index par cercle (niveau atteint) et par lieu, rubrique et fiche', async ({
  page,
}) => {
  const pid = await adultAt(page, 'a37-adulte');
  doneUntil(pid, 'ad1', 6);
  const reached = (
    (await (await page.request.get(`/api/v1/profiles/${pid}/vivre`)).json()) as {
      units: string[];
    }
  ).units;
  expect(reached.length).toBeGreaterThan(0);
  expect(reached.every((u) => /^ad1\.l0[1-7]$/.test(u))).toBe(true);
  const cat = (await (await page.request.get('/api/v1/vivre')).json()) as {
    rangement: string;
    fiches: unknown[];
  };
  // index officiel des livres et 120 fiches du livret (plus les 3 fiches d'essai de l'API de test)
  expect(cat.rangement).toBe('index');
  expect(cat.fiches.length).toBeGreaterThanOrEqual(123);
  await page.goto('/vivre');
  const defi = page.getByTestId('vi-defi');
  await expect(defi).toHaveAttribute('data-defi', /fiche|rubrique/);
  const first = await defi.textContent();
  await page.reload();
  await expect(defi).toHaveText(first!);
  const tiles = page.getByTestId('vi-tuiles');
  await expect(tiles).toHaveAttribute('data-par', 'cercle');
  await expect(tiles.locator('[data-groupe="soi"]')).toContainText(/rubrique/);
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
  await expect(f.locator('[data-statut="obligatoire"]')).toHaveText('Obligatoire');
  await expect(f.locator('[data-statut="recommande"]').first()).toHaveText(
    /^Recommandé\s*· sunna$/,
  );
  await expect(f.locator('[data-statut="permis"]')).toHaveText('Permis');
  await expect(f.locator('[data-statut="deconseille"]')).toHaveText('À éviter — Déconseillé');
  await expect(f.locator('[data-statut="conseil"]')).toHaveText('Conseil');
  // adulte : point réservé aux adultes, vraie vie de son pays (FR : pas celle du Sénégal), religion ou coutume
  await expect(f.locator('[data-point="essai.F"]')).toBeVisible();
  await expect(page.getByTestId('vi-vraie-vie')).toContainText('Exemple d’essai dans la vraie vie');
  await expect(page.getByTestId('vi-vraie-vie')).not.toContainText('Sénégal');
  await expect(page.getByTestId('vi-religion-coutume')).toBeVisible();
  await expect(page.getByTestId('vi-fiche-defi')).toContainText('trois objets');
  await arabicOnOwnLine(page);
  await page.goto('/vivre?f=essai.rue.01');
  await expect(f.locator('[data-statut="interdit"]')).toHaveText('À éviter — Interdit');
  await expect(page.getByTestId('vi-attention')).toBeVisible();
  // vraie fiche des livres : invocation avec sa source (registre VERIFIE)
  await page.goto('/vivre?f=akh.f001');
  await expect(f).toContainText('Aller aux toilettes');
  await expect(page.getByTestId('vi-dire')).toContainText('Rapporté par al-Bukhārī (142)');
  await arabicOnOwnLine(page);
  // verset : bloc du Muṣḥaf, aucune voix de synthèse (seul le lien vers un récitant)
  await page.goto('/vivre?f=akh.f008');
  const v = f.locator('[data-dire="coran"]').first();
  await expect(v.getByTestId('verset-bloc')).toBeVisible();
  await expect(v.getByTestId('ecouter')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/ḥasanāt|hasanat|classement/i);
});

test('enfant : « Vivre l’islam » dans sa barre, grandes tuiles, fiche courte et texte de l’enfant', async ({
  page,
}) => {
  const id = await parentWith(page.request, 'Nour', 8, 'en1');
  doneUntil(id, 'en1', 5);
  await pickProfile(page, 'Nour');
  await page.goto('/aujourdhui');
  await expect(page.locator('nav.tabs a')).toHaveCount(5);
  await page.locator('nav.tabs a[data-tab="vivre"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'jardin');
  const tiles = page.getByTestId('vi-tuiles');
  await expect(tiles.locator('[data-groupe]').first()).toBeVisible();
  const box = await tiles.locator('.tile-ic').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(60);
  await expect(tiles.locator('small')).toHaveCount(0);
  for (const g of ['epoux', 'enfants', 'travail'])
    await expect(tiles.locator(`[data-groupe="${g}"]`)).toHaveCount(0);
  await page.goto('/vivre?f=essai.chambre.01');
  const f = page.getByTestId('vi-fiche');
  await expect(page.getByTestId('vi-situation')).toHaveText('Situation d’essai pour l’enfant.');
  await expect(f.locator('[data-point="essai.B"]')).toContainText('Point d’essai B (enfant).');
  await expect(f.locator('[data-point="essai.F"]')).toHaveCount(0);
  await expect(page.getByTestId('vi-dire')).toContainText('Texte d’essai (enfant).');
  await expect(page.getByTestId('vi-vraie-vie')).toHaveCount(0);
  await expect(page.getByTestId('vi-fiche-defi')).toContainText('ranger un jouet');
  await page.goto('/vivre?f=akh.f001');
  await expect(f).toContainText('Avant d’entrer, je dis la petite invocation.'.replace('’', "'"));
  await page.goto('/vivre?l=rue');
  await expect(page.locator('[data-fiche="essai.rue.01"]')).toHaveCount(0);
});

test('ado : texte de l’ado, pas de cercle d’adulte, sans « Religion ou coutume »', async ({
  page,
}) => {
  const id = await parentWith(page.request, 'Ilyes', 14, 'ado1');
  doneUntil(id, 'ado1', 3);
  await pickProfile(page, 'Ilyes');
  await page.goto('/vivre?l=rue');
  await page.locator('[data-fiche="essai.rue.01"]').click();
  await expect(page.getByTestId('vi-attention')).toBeVisible();
  await page.goto('/vivre?f=essai.chambre.01');
  await expect(page.locator('[data-point="essai.C"]')).toContainText('Point d’essai C (ado).');
  await expect(page.getByTestId('vi-religion-coutume')).toHaveCount(0);
  await page.goto('/vivre');
  await expect(page.locator('[data-groupe="epoux"], [data-groupe="enfants"]')).toHaveCount(0);
});

test('parent : « Transmettre les valeurs » (guide des parents s’il est publié), défis des enfants', async ({
  page,
}) => {
  // chapitre gp.c18 des livres : publié dans l'édition de test s'il est fourni (E2E_GP_C18 = JSON du chapitre)
  const c18 = process.env.E2E_GP_C18;
  if (c18 && existsSync(c18))
    sql(
      `INSERT INTO eval_doc (edition_id, key, content) SELECT id, 'gp.c18', $j$${readFileSync(c18, 'utf8')}$j$::jsonb
       FROM edition WHERE status = 'publiee' ON CONFLICT DO NOTHING`,
    );
  const guide = (await page.request.get('/api/v1/vivre/guide')).ok();
  const id = await parentWith(page.request, 'Sami', 9, 'en1');
  doneUntil(id, 'en1', 4);
  await page.goto('/profils');
  await page.getByTestId('lien-transmettre').click();
  await expect(page).toHaveURL(/\/vivre\?parents/);
  const cards = page.getByTestId('vi-defi-enfant');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Défi de Sami');
  if (guide) {
    const g = page.getByTestId('vi-guide');
    await expect(g).toContainText('Transmettre les valeurs');
    await g.locator('details.sec summary').first().click();
    await expect(g.getByTestId('verset-bloc').first()).toBeVisible();
    // bloc propre à la France montré à une famille de France
    await expect(g.locator('[data-genre]').first()).toBeVisible();
  }
  await page.goto('/vivre');
  await expect(page.getByTestId('vi-transmettre')).toBeVisible();
});

test('barre du bas : aucun libellé tronqué (5 langues, 375 et 320 px ; enfant et adulte)', async ({
  page,
}) => {
  await adultAt(page, 'a37-barre');
  await page.goto('/compte');
  await page.getByTestId('langues-preparation').check();
  for (const code of ['fr', 'en', 'es', 'de', 'ar']) {
    await page.goto('/compte');
    await Promise.all([page.waitForEvent('load'), page.locator(`[data-locale="${code}"]`).click()]);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await tabsReadable(page, `adulte ${code}`);
  }
  await page.goto('/compte');
  await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="fr"]').click()]);
  await page.context().clearCookies();
  const id = await parentWith(page.request, 'Inès', 8, 'en1');
  doneUntil(id, 'en1', 3);
  await pickProfile(page, 'Inès');
  await tabsReadable(page, 'enfant fr');
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
  await shoot('adulte', '/vivre?f=akh.f001', 'fiche-f001');
  await shoot('adulte', '/vivre?f=akh.f008', 'fiche-f008-verset');
  await shoot('adulte', '/vivre?c=allah_prophete', 'rubrique');
  const e = await page.locator('[data-entree]').first().getAttribute('data-entree');
  if (e) await shoot('adulte', `/vivre?e=${e}`, 'rubrique-livre');
  await page.context().clearCookies();
  await parentWith(page.request, 'Yasmine', 14, 'ado1');
  await pickProfile(page, 'Yasmine');
  await shoot('ado', '/vivre', 'accueil');
  await shoot('ado', '/vivre?f=akh.f001', 'fiche-f001');
  await page.context().clearCookies();
  const kid = await parentWith(page.request, 'Safa', 8, 'en1');
  doneUntil(kid, 'en1', 8);
  await shoot('parent', '/vivre?parents', 'transmettre');
  await pickProfile(page, 'Safa');
  await shoot('enfant', '/vivre', 'accueil');
  await shoot('enfant', '/vivre?par=lieu', 'lieux');
  await shoot('enfant', '/vivre?f=akh.f001', 'fiche-f001');
});
