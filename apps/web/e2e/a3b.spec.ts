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
  // lot 5 : la garde coranique V2 de l'audio régénéré a retiré de l'index certaines pages (ex. la page 1 d'ad1-01,
  // « اسْمِي عَبْدُ اللَّهِ… ») : on teste la première page qui a un fichier dans le manifeste
  const niv = (await (await request.get('/api/v1/lecons-audio/niveaux/lect-ad1-01')).json()) as {
    fichiers: string[];
  };
  const pages = b.booklet.pages.map((p) => sha1(audioKey(p.ar.replace(/\|/g, ' '))));
  const k = pages.findIndex((s) => niv.fichiers.includes(s));
  expect(k, 'au moins une page du livret a un fichier audio').toBeGreaterThanOrEqual(0);
  const want = pages[k]!;
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/lecons-audio/fichiers/')) asked.push(r.url());
  });
  await page.goto('/lectures/ad1-01');
  await expect(page.getByTestId('audio-credit')).toContainText('Voix de synthèse (provisoire)');
  for (let i = 0; i <= k; i++) await page.getByTestId('suivant').click();
  const btn = page.locator(`section.page[data-page="${k + 1}"]`).getByTestId('ecouter');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-audio', want);
  expect(asked).toEqual([]);
  const res = page.waitForResponse((r) => r.url().includes(`/lecons-audio/fichiers/${want}.mp3`));
  await btn.click();
  expect([200, 206]).toContain((await res).status());
});
