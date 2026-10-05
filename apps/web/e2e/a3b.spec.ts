import { createHash } from 'node:crypto';
import { audioKey } from '@awform/content/audio-cle';
import { expect, test } from './fixtures';

/**
 * Chantier A3 (suite) — lectures graduées : le bouton de la page joue le fichier de la page entière (clé du
 * moteur des livres), sans lecture automatique ; mention de la voix de synthèse. Fichiers réels du livret
 * ad1-01 importés depuis ~/lecons-audio (sinon : sauté).
 */
const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');

test.skip(!process.env.E2E_LECONS_AUDIO, 'audio des leçons absent (~/lecons-audio)');

test('A3 : lecture graduée ad1-01 — la page joue le bon fichier', async ({ page, request }) => {
  const b = (await (await request.get('/api/v1/booklets/ad1-01')).json()) as {
    booklet: { pages: Array<{ ar: string }> };
  };
  const want = sha1(audioKey(b.booklet.pages[0]!.ar.replace(/\|/g, ' ')));
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/lecons-audio/fichiers/')) asked.push(r.url());
  });
  await page.goto('/lectures/ad1-01');
  await expect(page.getByTestId('audio-credit')).toContainText('Voix de synthèse (provisoire)');
  await page.getByTestId('suivant').click();
  const btn = page.locator('section.page[data-page="1"]').getByTestId('ecouter');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-audio', want);
  expect(asked).toEqual([]);
  const res = page.waitForResponse((r) => r.url().includes(`/lecons-audio/fichiers/${want}.mp3`));
  await btn.click();
  expect([200, 206]).toContain((await res).status());
});
