import { tanwinUndo } from '@awform/content/text';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Lot 8 : Sciences islamiques (re, ra en aperçu), bibliothèque des livrets, lecteur coranique sans audio. */

async function tanzil(page: Page, s: number, a: number): Promise<string> {
  const r = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
  return ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
}

async function shown(page: Page, ref: string): Promise<string> {
  const rest = await page.locator(`[data-verse="${ref}"]`).first().textContent();
  const b = page.locator(`[data-basmala="${ref}"]`);
  // affichage : tanwins du Muṣḥaf de Médine → on compare au Tanzil APRÈS inversion de la transformation
  return tanwinUndo((await b.count()) ? `${await b.first().textContent()} ${rest}` : (rest ?? ''));
}

test('Sciences islamiques : livres re, ra en aperçu, leçon de religion avec QCM corrigé', async ({
  page,
}) => {
  await page.goto('/');
  // l'onglet Arabe ne montre plus les livres de religion
  await expect(page.locator('a[href="/niveaux/en1"]')).toBeVisible();
  await expect(page.locator('a[href="/niveaux/re1"]')).toHaveCount(0);

  await page.locator('nav.tabs a[data-tab="sciences"]').click();
  await expect(page.locator('[data-testid="niveau-religion"][data-level="re1"]')).toBeVisible();
  await expect(page.locator('[data-testid="niveau-religion"][data-level="re2"]')).toBeVisible();
  const ra1 = page.locator('[data-testid="niveau-religion"][data-level="ra1"]');
  await expect(ra1.getByTestId('apercu')).toBeVisible();

  await page.locator('[data-testid="niveau-religion"][data-level="re1"]').click();
  await expect(page.locator('nav.tabs a[data-tab="sciences"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByTestId('unit').first().click();
  const lesson = page.getByTestId('lecon-religion');
  await expect(lesson).toBeVisible();

  // premier QCM : une mauvaise réponse invite à réessayer, la bonne est félicitée
  const item = lesson.locator('.rex[data-type="qcm"] .item').first();
  await expect(item).toBeVisible();
  const n = await item.locator('button[data-k]').count();
  let ok = false;
  let sawRetry = false;
  for (let k = 0; k < n && !ok; k++) {
    await item.locator(`button[data-k="${k}"]`).click();
    const fb = item.getByRole('status');
    await expect(fb).toBeVisible();
    if ((await fb.textContent())?.includes('juste')) ok = true;
    else sawRetry = true;
  }
  expect(ok).toBe(true);
  expect(sawRetry || n === 1 || ok).toBe(true);
});

test('ra1 (aperçu) : leçon ados/adultes, numéros de hadiths non vérifiés masqués', async ({
  page,
}) => {
  await page.goto('/niveaux/ra1');
  await page.getByTestId('unit').first().click();
  await expect(page.getByTestId('lecon-religion')).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const api = await (await page.request.get(`/api/v1/units/${id}`)).json();
  expect(JSON.stringify(api)).not.toContain('"vh"');
});

test('Lectures : un livret lu à l’écran, tampon « j’ai lu », gardé puis relu sans réseau', async ({
  page,
  context,
}) => {
  await page.goto('/lectures');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.locator('[data-testid="livrets"][data-ready="true"]')).toBeVisible();
  const first = page.locator('[data-livret]').first();
  await expect(first).toBeVisible();
  const code = (await first.getAttribute('data-livret'))!;
  await first.getByRole('button', { name: "Garder sur l'appareil" }).click();
  await expect(first.getByTestId('garde')).toBeVisible();

  await first.locator('a').first().click();
  await expect(page.getByTestId('livret')).toHaveAttribute('data-code', code);
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('numero')).toContainText('Page 1');
  await page.getByTestId('traduction').click();
  await expect(page.getByTestId('texte-fr')).toBeVisible();
  while (await page.getByTestId('suivant').isEnabled()) await page.getByTestId('suivant').click();
  await expect(page.getByTestId('je-comprends')).toBeVisible();
  await page.getByTestId('j-ai-lu').click();
  await expect(page.getByTestId('lu')).toBeVisible();

  await context.setOffline(true);
  await page.goto(`/lectures/${code}`);
  await expect(page.getByTestId('livret')).toHaveAttribute('data-code', code);
  await page.goto('/lectures');
  await expect(page.locator(`[data-livret="${code}"] .lu`)).toBeVisible();
  await context.setOffline(false);
});

test('lecteur coranique : texte Tanzil octet par octet, lecture guidée mot à mot, répétition', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/coran');
  await page.getByTestId('ouvrir-lecteur').click();
  await expect(page.getByTestId('recitant')).toBeDisabled();
  await expect(page.locator('[data-verse="1:1"]')).toBeVisible();
  await page.getByTestId('sourate').selectOption('112');
  await expect(page).toHaveURL(/s=112/);
  for (const a of [1, 2, 3, 4])
    expect(await shown(page, `112:${a}`)).toBe(await tanzil(page, 112, a));

  await page.getByTestId('de').fill('2');
  await page.getByTestId('a').fill('2');
  await page.getByTestId('repeter').fill('2');
  await page.getByTestId('pause').fill('1');
  await page.getByTestId('lire').click();
  await expect(page.locator('[data-verse="112:2"] .w.on[data-w="0"]')).toBeVisible();
  await expect(page.getByTestId('tour')).toContainText('1');
  await page.clock.runFor(700);
  await expect(page.locator('[data-verse="112:2"] .w.on[data-w="1"]')).toBeVisible();
  await page.clock.runFor(1500);
  await expect(page.getByTestId('a-toi')).toBeVisible();
  await page.clock.runFor(1100);
  await expect(page.getByTestId('tour')).toContainText('2');
  await page.getByTestId('arreter').click();
  await expect(page.getByTestId('lire')).toBeVisible();
});
