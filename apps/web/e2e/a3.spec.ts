import { createHash } from 'node:crypto';
import { audioKey } from '@awform/content/audio-cle';
import { expect, test } from './fixtures';

/**
 * Chantier A3 — audio des leçons (voix de synthèse provisoire des livres) : un exercice « écoute » d'en1 joue
 * le fichier du texte dit (clé du moteur des livres), sans lecture automatique ; aucun bouton sur un verset
 * (renvoi à la récitation du Complexe). Fichiers réels d'en1 importés depuis ~/lecons-audio (sinon : sauté).
 */
const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');

test.skip(!process.env.E2E_LECONS_AUDIO, 'audio des leçons absent (~/lecons-audio)');

test('A3 : exercice « écoute » d’en1 — le bouton joue le bon fichier', async ({
  page,
  request,
}) => {
  const api = (await (await request.get('/api/v1/units/en1.l01')).json()) as {
    unit: { lesson: { exercices: Array<{ type: string; items: Array<{ dit: string }> }> } };
  };
  const ex = api.unit.lesson.exercices.find((e) => e.type === 'ecoute')!;
  const want = sha1(audioKey(ex.items[0]!.dit));
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/lecons-audio/fichiers/')) asked.push(r.url());
  });
  await page.goto('/lecons/en1.l01');
  const item = page.locator('[data-type="ecoute"] li[data-item="0"]').first();
  const btn = item.getByTestId('ecouter');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-audio', want);
  // gros bouton (cible tactile d'au moins 48 px) ; aucune lecture automatique
  const box = await btn.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  expect(asked).toEqual([]);
  const res = page.waitForResponse((r) => r.url().includes(`/lecons-audio/fichiers/${want}.mp3`));
  await btn.click();
  expect([200, 206]).toContain((await res).status());
  await expect(item.getByTestId('ecouter-lent')).toBeVisible();
  await expect(page.getByTestId('audio-credit')).toContainText('Voix de synthèse (provisoire)');
  await expect(page.getByTestId('audio-credit')).toContainText('Google Cloud Text-to-Speech');
});

test('A3 : niveau téléchargé « avec l’audio » (taille affichée) — écoute sans réseau', async ({
  page,
  context,
}) => {
  await page.goto('/hors-ligne');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const opt = page.locator('tr[data-audio-level="en1"]');
  await expect(opt).toContainText('Mo');
  await expect(page.getByTestId('audio-wifi')).toBeChecked(); // Wi-Fi seulement par défaut
  await opt.getByTestId('avec-audio').check();
  await page.locator('tr[data-level="en1"]').getByRole('button', { name: 'Télécharger' }).click();
  await expect(opt.getByTestId('audio-inclus')).toBeVisible({ timeout: 60_000 });

  await context.setOffline(true);
  await page.goto('/niveaux/en1');
  await page.locator('a[href="/lecons/en1.l01"]').click();
  const btn = page.locator('[data-type="ecoute"] li[data-item="0"]').getByTestId('ecouter').first();
  await expect(btn).toBeVisible();
  await btn.click();
  // lu depuis l'appareil (IndexedDB), sans aucune requête réseau
  await expect(btn).toHaveClass(/playing/);
  await context.setOffline(false);
});

test('A3 : aucun bouton « écouter » sur un verset ; renvoi à la récitation du Complexe', async ({
  page,
}) => {
  await page.goto('/lecons/en1.l16');
  await expect(page.locator('.ayah').first()).toBeVisible();
  await expect(page.locator('section.quran [data-testid="ecouter"]')).toHaveCount(0);
  await expect(page.getByTestId('ecouter-recitation').first()).toHaveAttribute(
    'href',
    /^\/coran\/ecouter\?s=\d+&a=\d+$/,
  );
});
