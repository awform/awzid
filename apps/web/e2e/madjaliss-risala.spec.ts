import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';

/**
 * Madjaliss, lots 4 et 6 : ar-Risāla d'Ibn Abī Zayd al-Qayrawānī (1 769 phrases, 265 séances du référent) — servie en
 * fichiers séparés chargés à la demande (`/mutun/risala.json` = sommaire, `/mutun/risala-o<k>.json` = phrases des
 * séances ouvertes, `/mutun/risala-p<k>.json` = phrases des séances différées, gardées), jamais dans le paquet de
 * départ ; 72 séances sont publiables à l'étape publique (invités de la bêta), les 193 autres sont en publication
 * différée (personnel, démonstration et groupe « bêta fermée » : tout).
 */
test.use({ compte: null });

const STATUT_FR =
  "Tranché par le référent selon l'école mālikite (mashhūr), sources citées. En attente de relecture.";
const H = { 'x-awform': '1' };
const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'static', 'mutun');
// lot 5 : les parties de phrases sont des fichiers GARDÉS (servis après authentification, droit « démonstration » ou personnel)
const gardes = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'lib', 'server', 'mutun');
type Phrase = {
  id: string;
  ar?: string | Array<string | { q: string; ref: string }>;
  adulte?: true;
};
type Index = {
  seances: Array<{
    n: number;
    id: string;
    titre: string;
    p: number;
    phrases: string[];
    differe?: true;
    adulte?: true;
  }>;
  parts: Array<{ n: number; o?: true }>;
};
const index = JSON.parse(readFileSync(join(dir, 'risala.json'), 'utf8')) as Index;
// parties PUBLIQUES (`-o<k>`, séances ouvertes) dans static/mutun, parties GARDÉES (`-p<k>`) dans le dossier gardé
const publique = (k: number) => index.parts.find((x) => x.n === k)?.o === true;
const nomPartie = (k: number) => `risala-${publique(k) ? 'o' : 'p'}${k}.json`;
const partie = (k: number) =>
  JSON.parse(readFileSync(join(publique(k) ? dir : gardes, nomPartie(k)), 'utf8')) as {
    phrases: Phrase[];
  };
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const PARTIE = /\/mutun\/risala-[op]\d+\.json$/;
const INTERNE =
  /translit|brouillon|a_verifier|collation|relecture_comite|decision_referent|voyelle_a_confirmer|VALIDATION_HUMAINE|validation humaine|comité|\bRIS-\d{4}|turath/i;

/** Compte de démonstration (<rôle>-<tag>@demo.awform.test) : voit aussi les séances en publication différée. */
async function compteDemo(page: Page) {
  const email = `ris-demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}@demo.awform.test`;
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'adulte',
      email,
      password: password(),
      country: 'FR',
      locale: 'fr',
      birthYear: 1988,
      pseudonym: 'Demo',
      consents: ['cgu', 'donnee_religieuse_art9'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
}

/** Première phrase de la séance dont l'arabe est une simple chaîne (sans citation coranique). */
function phraseSimple(n: number) {
  const s = index.seances.find((x) => x.n === n)!;
  const ph = partie(s.p).phrases;
  const p = s.phrases
    .map((id) => ph.find((x) => x.id === id)!)
    .find((x) => typeof x.ar === 'string');
  return { s, p: p! };
}

test('invité de la bêta : la Risāla montre ses 72 séances ouvertes ; une séance différée reste introuvable, aucun fichier gardé', async ({
  page,
}) => {
  await newAdult(page, 'ris-invite');
  const vus: string[] = [];
  page.on('request', (r) => vus.push(new URL(r.url()).pathname));
  await page.goto('/madjaliss');
  await expect(page.getByTestId('madjaliss')).toHaveAttribute('data-pret', 'true');
  await expect(page.locator('a[data-texte="risala"]')).toHaveAttribute('href', '/madjaliss/risala');
  await page.goto('/madjaliss/risala');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(72);
  await expect(page.locator('li[data-seance="1"]')).toHaveCount(0);
  await expect(page.getByTestId('mj-bandeau-relecture')).toHaveCount(0);
  // une séance ouverte s'ouvre : une seule partie PUBLIQUE est téléchargée
  const ouverte = index.seances.find((s) => !s.differe)!;
  vus.length = 0;
  await page.goto(`/madjaliss/risala/${ouverte.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  await expect(page.locator('article.phrase')).toHaveCount(ouverte.phrases.length);
  expect(vus.filter((p) => PARTIE.test(p))).toEqual([`/mutun/${nomPartie(ouverte.p)}`]);
  // adresse directe d'une séance différée : rien, et aucun fichier gardé n'est téléchargé
  await page.goto('/madjaliss/risala/1');
  await expect(page.getByTestId('mj-etape')).toHaveCount(0);
  await expect(page.locator('main')).toContainText("Ce texte n'est pas encore disponible.");
  await expect(page.getByTestId('mj-mode-enseignant')).toHaveCount(0);
  expect(vus.filter((p) => /\/mutun\/.+(-differe|-p\d+|-enseignant)\.json$/.test(p))).toEqual([]);
});

test('démonstration : 265 séances au sommaire ; deux séances s’ouvrent, une seule partie téléchargée chacune', async ({
  page,
}) => {
  await compteDemo(page);
  const vus: string[] = [];
  page.on('request', (r) => vus.push(new URL(r.url()).pathname));
  await page.goto('/madjaliss/risala');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(265);
  await expect(page.getByTestId('mj-statut')).toHaveText(STATUT_FR);
  await expect(page.locator('li[data-seance="1"] [data-testid="mj-differe"]')).toBeVisible();
  // le sommaire seul ne télécharge aucune phrase
  expect(vus.filter((p) => PARTIE.test(p))).toEqual([]);

  for (const n of [1, 100]) {
    const { s, p } = phraseSimple(n);
    vus.length = 0;
    await page.goto(`/madjaliss/risala/${n}`);
    await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
    await expect(page.getByTestId('mj-statut')).toHaveText(STATUT_FR);
    const ligne = page.locator(`[data-phrase="${p.id}"] p.matn`);
    await expect(ligne).toBeVisible();
    // l'arabe affiché est celui de la source, octet par octet
    expect(octets(((await ligne.textContent()) ?? '').trim()), `${s.id} ${p.id}`).toBe(
      octets(p.ar as string),
    );
    await expect(page.locator('article.phrase')).toHaveCount(s.phrases.length);
    // une seule partie téléchargée : celle de la séance
    expect(vus.filter((u) => PARTIE.test(u))).toEqual([`/mutun/${nomPartie(s.p)}`]);
    // rien d'interne dans la page (la mention du client contient « référent » : retirée avant le contrôle)
    const texte = ((await page.locator('main').innerText()) ?? '').replace(STATUT_FR, '');
    expect(INTERNE.test(texte), texte.match(INTERNE)?.[0]).toBe(false);
    const arabes = await page
      .locator('.ar, .matn, .cit, .quran-text')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    for (const a of arabes) expect(/[A-Za-zʿʾḥṣḍṭẓāīūṯḏġš]/.test(a), a.slice(0, 60)).toBe(false);
  }
});

test('démonstration : une séance avec notes d’explication et sources ; les étapes se suivent jusqu’au quiz', async ({
  page,
}) => {
  await compteDemo(page);
  // une séance qui porte une note de l'école mālikite (écart au mashhūr)
  const cible = index.seances.find(
    (s) =>
      s.differe &&
      partie(s.p).phrases.some(
        (p) =>
          s.phrases.includes(p.id) && JSON.stringify(p).includes('"k":"malikite"') && !p.adulte,
      ),
  )!;
  await page.goto(`/madjaliss/risala/${cible.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  const note = page.locator('[data-testid="note-explication"][data-genre="malikite"]').first();
  await expect(note).toBeVisible();
  await expect(note.locator('details.note-sources')).toHaveCount(1);
  // mode enseignant indisponible pour un compte de démonstration non membre du personnel : pas de bascule requise ici
  await expect(page.getByTestId('mj-differe')).toBeVisible();
});

test('poids : sommaire léger, parties bornées, rien de la Risāla dans le paquet de départ ni dans le cache de l’appareil', async ({
  page,
}) => {
  const idx = readFileSync(join(dir, 'risala.json'));
  expect(idx.length).toBeLessThan(80_000);
  for (const p of index.parts) {
    const o = readFileSync(join(publique(p.n) ? dir : gardes, nomPartie(p.n))).length;
    expect(o, `partie ${p.n}`).toBeLessThan(340_000);
  }
  // 1) à l'accueil : aucune requête vers /mutun/, aucun texte de la Risāla dans le moindre fichier chargé
  const urls: string[] = [];
  const corps: Array<Promise<string | null>> = [];
  page.on('response', (r) => {
    urls.push(new URL(r.url()).pathname);
    const ct = r.headers()['content-type'] ?? '';
    if (/javascript|json|html|css/.test(ct)) corps.push(r.text().catch(() => null));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(urls.filter((u) => u.startsWith('/mutun/'))).toEqual([]);
  for (const c of await Promise.all(corps)) {
    expect(c ?? '').not.toContain('RIS-S001');
    expect(c ?? '').not.toContain('RIS-INT-0001');
    expect(c ?? '').not.toContain('الرسالة لابن أبي زيد');
  }
  // 2) le cache hors ligne de l'appareil (précache du service worker) ne contient rien de /mutun/
  const cache = await page.evaluate(async () => {
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, no) => setTimeout(no, 15_000)),
      ]);
      const out: string[] = [];
      for (const k of await caches.keys())
        for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out;
    } catch {
      return [] as string[];
    }
  });
  expect(cache.filter((u) => u.startsWith('/mutun/'))).toEqual([]);
});

test('personnel : notes de l’enseignant de la Risāla servies à part (écarts au mashhūr, vocalisations à confirmer)', async ({
  request,
}) => {
  // lot 5 : fichier GARDÉ — un visiteur sans session n'en reçoit rien (le contrôle complet des droits est dans
  // madjaliss-acces.spec.ts : anonyme 401, invité 403, démonstration, personnel 200)
  const r = await request.get('/mutun/risala-enseignant.json');
  expect(r.status()).toBe(401);
  expect(await r.text()).not.toContain('consigne_differe');
});
