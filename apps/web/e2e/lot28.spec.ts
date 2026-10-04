import { tanwinUndo } from '@awform/content/text';
import { expect, test } from './fixtures';

/**
 * Lot 28 — 31 livres gelés publiés (en1-5, ad1-10, ado1-4, re1-5, ra1-4, qc1-3) : chaque niveau apparaît
 * dans son onglet, sans « aperçu » ; la leçon 1 de chaque livre s'ouvre dans le bon lecteur ; livrets
 * « Lecture du Coran » : espace Coran, lecteur dédié, exercices corrigés, texte du Muṣḥaf = Tanzil.
 */
const ARABE = [
  ...[1, 2, 3, 4, 5].map((n) => `en${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `ad${n}`),
  ...[1, 2, 3, 4].map((n) => `ado${n}`),
];
const RELIGION = [...[1, 2, 3, 4, 5].map((n) => `re${n}`), ...[1, 2, 3, 4].map((n) => `ra${n}`)];
const QC = ['qc1', 'qc2', 'qc3'];

test('les 31 livres gelés sont publiés, chacun dans son onglet, sans aperçu', async ({ page }) => {
  const r = await page.request.get('/api/v1/levels');
  const levels = ((await r.json()) as { levels: Array<{ code: string; apercu?: boolean }> }).levels;
  expect(levels.map((l) => l.code).sort()).toEqual([...ARABE, ...RELIGION, ...QC].sort());
  expect(levels.filter((l) => l.apercu)).toEqual([]);
  // carnets de hifẓ : seulement les carnets gelés E1-E5 et N1-N5
  const hb = (await (await page.request.get('/api/v1/hifz/books')).json()) as { books: string[] };
  expect([...hb.books].sort()).toEqual([...ARABE.slice(0, 5), ...ARABE.slice(5, 10)].sort());

  await page.goto('/');
  for (const c of ARABE) await expect(page.locator(`a[href="/niveaux/${c}"]`)).toBeVisible();
  for (const c of [...RELIGION, ...QC])
    await expect(page.locator(`a[href="/niveaux/${c}"]`)).toHaveCount(0);

  await page.goto('/sciences');
  for (const c of RELIGION)
    await expect(page.locator(`[data-testid="niveau-religion"][data-level="${c}"]`)).toBeVisible();

  await page.goto('/coran');
  for (const c of QC) {
    const a = page.locator(`[data-testid="niveau-qc"][data-level="${c}"]`);
    await expect(a).toBeVisible();
    await expect(a.getByTestId('apercu')).toHaveCount(0);
  }
});

test('la leçon 1 de chaque livre s’ouvre dans son lecteur', async ({ page }) => {
  test.setTimeout(240_000);
  for (const c of [...ARABE, ...RELIGION, ...QC]) {
    await page.goto(`/lecons/${c}.l01`);
    const reader = QC.includes(c)
      ? page.getByTestId('lecon-coran')
      : RELIGION.includes(c)
        ? page.getByTestId('lecon-religion')
        : page.locator(`article.lesson[data-unit="${c}.l01"]`);
    await expect(reader, c).toBeVisible();
  }
});

test('Lecture du Coran : lecteur, exercices corrigés, Muṣḥaf identique à Tanzil', async ({
  page,
}) => {
  await page.goto('/coran');
  await page.locator('[data-testid="niveau-qc"][data-level="qc1"]').click();
  await expect(page.locator('nav.tabs a[data-tab="coran"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goto('/lecons/qc1.l05');
  const lesson = page.getByTestId('lecon-coran');
  await expect(lesson).toBeVisible();
  await expect(lesson.getByTestId('qc-echelle')).toBeVisible();

  // « classer » : mauvaise colonne puis la bonne
  const classer = lesson.locator('[data-exercise="qc1.l05.ex3"]');
  const item = classer.getByTestId('qc-item').first();
  await item.getByTestId('qc-choix').nth(1).click();
  await expect(item.getByTestId('qc-verdict')).toContainText('essaie');
  await item.getByTestId('qc-choix').nth(0).click();
  await expect(item.getByTestId('qc-verdict')).toContainText('juste');

  // « paire » : la réponse du livret est félicitée
  const paire = lesson.locator('[data-exercise="qc1.l05.ex1"]').getByTestId('qc-item').first();
  await paire.getByTestId('qc-choix').nth(0).click();
  await expect(paire.getByTestId('qc-verdict')).toContainText('juste');

  // Muṣḥaf : texte affiché (crochets retirés, tanwins d'affichage inversés) = Tanzil 114:4
  const shown = await lesson.getByTestId('qc-mushaf').locator('.texte').first().textContent();
  const t = await page.request.get('/api/v1/quran/verses?s=114&from=4&to=4');
  const verse = ((await t.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
  expect(tanwinUndo(shown ?? '')).toBe(verse);

  // « repérer » (leçon 1) : les mots qui contiennent ب ou ت
  await page.goto('/lecons/qc1.l01');
  const rep = page.locator('[data-exercise="qc1.l01.ex3"]').getByTestId('qc-item').first();
  const mots = rep.getByTestId('qc-mot');
  await expect(mots).toHaveCount(7);
  for (const k of [1, 4, 5]) await mots.nth(k).click();
  await rep.getByTestId('qc-verifier').click();
  await expect(rep.getByTestId('qc-verdict')).toContainText('juste');
});

test('Lecture du Coran : examen sans corrigé, texte non préparé absent', async ({ page }) => {
  await page.goto('/lecons/qc1.l27');
  const lesson = page.getByTestId('lecon-coran');
  await expect(lesson).toBeVisible();
  await expect(lesson.getByTestId('qc-correction-adulte').first()).toBeVisible();
  await expect(lesson.getByTestId('qc-verdict')).toHaveCount(0);
  await expect(lesson.getByTestId('qc-non-prepare')).toHaveCount(1);
  const r = await page.request.get('/api/v1/units/qc1.l27');
  const body = JSON.stringify(await r.json());
  expect(body).not.toContain('guide_fr');
  expect(body).not.toContain('sens_fr');
});
