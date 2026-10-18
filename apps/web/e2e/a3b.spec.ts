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
  // lot 7 : la page 1 d'ad1-01 (« اسْمِي عَبْدُ اللَّهِ… », écartée à tort au lot 5 par la garde coranique) a retrouvé son audio :
  // on teste la première page qui a un fichier dans le manifeste, et ce doit être la page 1
  const niv = (await (await request.get('/api/v1/lecons-audio/niveaux/lect-ad1-01')).json()) as {
    fichiers: string[];
  };
  const pages = b.booklet.pages.map((p) => sha1(audioKey(p.ar.replace(/\|/g, ' '))));
  const k = pages.findIndex((s) => niv.fichiers.includes(s));
  expect(k, 'la page 1 du livret a son fichier audio (rétabli au lot 7)').toBe(0);
  const want = pages[k]!;
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/lecons-audio/fichiers/')) asked.push(r.url());
  });
  await page.goto('/lectures/ad1-01');
  await expect(page.getByTestId('audio-credit')).not.toContainText(/synthèse|provisoire/i);
  for (let i = 0; i <= k; i++) await page.getByTestId('suivant').click();
  const btn = page.locator(`section.page[data-page="${k + 1}"]`).getByTestId('ecouter');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-audio', want);
  expect(asked).toEqual([]);
  const res = page.waitForResponse((r) => r.url().includes(`/lecons-audio/fichiers/${want}.mp3`));
  await btn.click();
  expect([200, 206]).toContain((await res).status());
});
