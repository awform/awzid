import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Lot 9 : audio de synthèse des Madjaliss (décision du client des 13 et 14/10/2026 : voix de synthèse autorisée pour le
 * fiqh des cycles 1 et 2, jamais pour le Coran). Bouton « Écouter » SEULEMENT pour une phrase qui a un audio que le profil
 * peut entendre : jamais pour une phrase qui cite le Coran ou dont la lecture est incertaine, jamais une phrase « adulte »
 * pour un enfant ni un ado ; MP3 servi à un compte connecté (200, Range 206), 401 sans session ; lecture réelle d'un
 * MP3 ; fichiers de la séance ouverte gardés sur l'appareil (hors ligne).
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const YEAR = new Date().getUTCFullYear();
const AUDIO = process.env.E2E_MADJALISS_AUDIO === '1';

type Phrase = { id: string; audio?: string; adulte?: true; incertain?: true };
type Matn = { phrases: Phrase[]; seances: Array<{ n: number; phrases: string[]; adulte?: true }> };
const lire = (t: string) =>
  JSON.parse(
    readFileSync(
      join(fileURLToPath(new URL('..', import.meta.url)), 'static', 'mutun', `${t}.json`),
      'utf8',
    ),
  ) as Matn;
const akh = lire('akhdari');
const izz = lire('izziyya');
const deA = new Map(akh.phrases.map((p) => [p.id, p]));
const deI = new Map(izz.phrases.map((p) => [p.id, p]));
const manifeste = JSON.parse(
  readFileSync(
    join(
      fileURLToPath(new URL('..', import.meta.url)),
      'src',
      'lib',
      'server',
      'madjaliss-audio.json',
    ),
    'utf8',
  ),
) as { fichiers: Record<string, { o: number }> };

/** Compte parent avec un seul profil élève (enfant ou ado), choisi comme élève actif. */
async function eleve(page: Page, req: APIRequestContext, nom: string, age: number, level: string) {
  const email = `mja-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const s = await req.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      birthYear: 1984,
      email,
      password: password(),
      country: 'FR',
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(s.status(), await s.text()).toBe(201);
  const p = await req.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym: nom,
      birthYear: YEAR - 1 - age,
      levelCode: level,
      password: password(),
      consents: ['compte_suivi', 'donnee_religieuse_art9'],
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  await pickProfile(page, nom);
}

/** Lecture réelle : chaque appel à `play()` est noté (source, résultat). */
async function espionLecture(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __lectures: Array<{ src: string; ok: boolean | null; err?: string }>;
    };
    w.__lectures = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const e: { src: string; ok: boolean | null; err?: string } = { src: this.src, ok: null };
      w.__lectures.push(e);
      const r = play.call(this);
      void r.then(
        () => (e.ok = true),
        (x: Error) => ((e.ok = false), (e.err = `${x.name}: ${x.message}`)),
      );
      return r;
    };
  });
}

test('adulte : bouton « Écouter » seulement pour les phrases avec audio, MP3 servi (200, 206), 401 sans session, lecture et copie sur l’appareil', async ({
  page,
  baseURL,
}) => {
  await espionLecture(page);
  await newAdult(page, 'mja-adulte');
  // séance 1 : phrases avec audio, citation coranique et lectures incertaines sans audio
  const s1 = akh.seances[0]!;
  await page.goto(`/madjaliss/akhdari/${s1.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  let avec = 0;
  for (const id of s1.phrases) {
    const p = deA.get(id)!;
    const b = page.locator(`[data-phrase="${id}"] [data-testid="mj-ecouter-lire"]`);
    if (p.audio) {
      avec += 1;
      await expect(b, id).toHaveAttribute('data-audio', p.audio);
    } else await expect(b, id).toHaveCount(0);
  }
  expect(avec).toBeGreaterThan(0);
  // la phrase AKH-0001 (verset, garde coranique) et AKH-0002 (lecture à vérifier) : jamais de bouton
  for (const id of ['AKH-0001', 'AKH-0002'].filter((x) => s1.phrases.includes(x)))
    await expect(page.locator(`[data-phrase="${id}"] [data-testid="mj-ecouter-lire"]`)).toHaveCount(
      0,
    );
  await expect(page.getByTestId('mj-audio-mention')).toHaveText('Voix de synthèse (provisoire)');

  // fichier servi au compte connecté, avec Range ; 401 sans session ; 404 hors manifeste
  const chemin = deA.get(s1.phrases.find((id) => deA.get(id)!.audio)!)!.audio!;
  const r = await page.request.get(`/mutun/audio/${chemin}`);
  test.skip(
    !AUDIO && r.status() === 404,
    'audio Madjaliss absent sur cette machine (~/madjaliss-audio)',
  );
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('audio/mpeg');
  expect(r.headers()['cache-control']).toBe('private, max-age=604800');
  const corps = await r.body();
  expect(corps.length).toBe(manifeste.fichiers[chemin]!.o);
  expect(corps.subarray(0, 3).toString('latin1') === 'ID3' || corps[0] === 0xff).toBe(true);
  const part = await page.request.get(`/mutun/audio/${chemin}`, {
    headers: { range: 'bytes=0-99' },
  });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(100);
  const anonyme = await pwRequest.newContext({ baseURL });
  const a = await anonyme.get(`/mutun/audio/${chemin}`);
  expect(a.status()).toBe(401);
  expect(a.headers()['content-type']).not.toContain('audio');
  expect((await anonyme.get('/mutun/audio/akhdari/AKH-9999.mp3')).status()).toBe(404);
  await anonyme.dispose();

  // lecture réelle d'un MP3 au toucher
  await page.locator(`[data-audio="${chemin}"]`).first().click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __lectures: unknown[] }).__lectures))
    .toEqual([expect.objectContaining({ ok: true, src: expect.stringMatching(/^blob:/) })]);

  // séance ouverte : ses fichiers sont gardés sur l'appareil (IndexedDB « audio »)
  await expect
    .poll(() =>
      page.evaluate(
        (cle) =>
          new Promise<boolean>((ok) => {
            const o = indexedDB.open('awform');
            o.onsuccess = () => {
              const g = o.result.transaction('audio').objectStore('audio').get(cle);
              g.onsuccess = () =>
                ok((g.result as { blob?: unknown } | undefined)?.blob instanceof Blob);
              g.onerror = () => ok(false);
            };
            o.onerror = () => ok(false);
          }),
        `mj:${chemin}`,
      ),
    )
    .toBe(true);

  // Mémoriser : bouton seulement si la phrase en cours a un audio
  const toute = akh.seances.find((s) =>
    s.phrases.every((id) => deA.get(id)?.audio && !deA.get(id)?.adulte),
  );
  expect(toute).toBeTruthy();
  await page.goto(`/madjaliss/akhdari/${toute!.n}`);
  await page.getByTestId('mj-suivant').click();
  await page.getByTestId('mj-suivant').click();
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'memo');
  const id = await page.locator('[data-memo]').getAttribute('data-memo');
  await expect(page.getByTestId('mj-ecouter')).toHaveAttribute('data-audio', deA.get(id!)!.audio!);
  await page.getByTestId('mj-ecouter').click();
  // (nouvelle page : le relevé des lectures repart de zéro)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __lectures: unknown[] }).__lectures))
    .toEqual([expect.objectContaining({ ok: true, src: expect.stringMatching(/^blob:/) })]);
});

test('phrase « adulte » : audio pour l’adulte seulement, jamais pour un ado ni un enfant (ni bouton, ni téléchargement)', async ({
  page,
}) => {
  const adultes = izz.phrases.filter((p) => p.adulte && p.audio).map((p) => p.id);
  expect(adultes.sort()).toEqual(['IZZ-0082', 'IZZ-0394', 'IZZ-0395']);
  const seance = izz.seances.find((s) => s.phrases.includes('IZZ-0082'))!;
  const demandes: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/mutun/audio/')) demandes.push(new URL(r.url()).pathname);
  });

  await newAdult(page, 'mja-adulte2');
  await page.goto(`/madjaliss/izziyya/${seance.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  await expect(
    page.locator('[data-phrase="IZZ-0082"] [data-testid="mj-ecouter-lire"]'),
  ).toHaveAttribute('data-audio', deI.get('IZZ-0082')!.audio!);

  for (const [nom, age, niveau] of [
    ['Yassine', 14, 'ado1'],
    ['Maryam', 8, 'en1'],
  ] as const) {
    await page.context().clearCookies();
    demandes.length = 0;
    await eleve(page, page.request, nom, age, niveau);
    await page.goto(`/madjaliss/izziyya/${seance.n}`);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-phrase="IZZ-0082"]')).toHaveCount(0);
    await expect(page.locator('[data-audio$="IZZ-0082.mp3"]')).toHaveCount(0);
    expect(
      demandes.filter((d) => /IZZ-0(082|394|395)\.mp3$/.test(d)),
      nom,
    ).toEqual([]);
  }
});
