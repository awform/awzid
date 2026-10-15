import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';
import { expect, newAdult, test } from './fixtures';

/**
 * Lot 10 :
 *  - bouton « Voir / Cacher la traduction » (décision du client du 15/10/2026) dans les textes Madjaliss et les leçons
 *    des livres (en plus des lectures graduées) : français affiché par défaut, choix mémorisé par profil ; bilans et
 *    examens sans traduction (rien à montrer, pas de bouton) ; consignes et explications toujours en français ; le
 *    mode enseignant des Madjaliss montre tout ;
 *  - ar-Risāla du 15/10 : RIS-0183 (2:201) affiché depuis Tanzil octet par octet, jamais lu par une voix de synthèse.
 */
test.use({ compte: null });

const web = fileURLToPath(new URL('..', import.meta.url));
type Seance = { n: number; id: string; p: number; phrases: string[]; differe?: true };
const risala = JSON.parse(readFileSync(join(web, 'static', 'mutun', 'risala.json'), 'utf8')) as {
  seances: Seance[];
};
const tanzil = new Map(
  readFileSync(
    join(web, '..', '..', 'packages', 'content', 'madjaliss-source', 'coran', 'tanzil-uthmani.tsv'),
    'utf8',
  )
    .split('\n')
    .map((l) => /^(\d+:\d+)\t(.*)$/.exec(l.replace(/\r$/, '')))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1]!, m[2]!]),
);

type Lecon = {
  unit: {
    kind: string;
    lesson: {
      lecture?: {
        phrases?: Array<{ fr?: string }>;
        vedette?: { fr?: string };
        non_prepare?: boolean;
        sans_traduction?: boolean;
      };
      notion?: { texte_fr?: string };
    };
  };
};
/** Première leçon d'arabe (Adultes) dont le texte de lecture a une traduction, et premier bilan sans traduction. */
async function trouver(request: APIRequestContext) {
  let lecon: string | null = null;
  let bilan: string | null = null;
  for (let i = 1; i <= 40 && (!lecon || !bilan); i++) {
    const id = `ad1.l${String(i).padStart(2, '0')}`;
    const r = await request.get(`/api/v1/units/${id}`);
    if (!r.ok()) continue;
    const { unit } = (await r.json()) as Lecon;
    const R = unit.lesson.lecture;
    const avecFr = !!R && !R.non_prepare && (R.phrases ?? []).some((p) => !!p.fr);
    if (!lecon && unit.kind === 'lecon' && avecFr) lecon = id;
    if (!bilan && unit.kind !== 'lecon' && R && !R.non_prepare && (R.phrases ?? []).length)
      bilan = id;
  }
  return { lecon, bilan };
}

test('leçon des livres : traduction affichée par défaut, cachée au clic, choix gardé ; consignes en français', async ({
  page,
  request,
}) => {
  const { lecon } = await trouver(request);
  expect(lecon, 'une leçon d’Adultes avec une traduction du texte de lecture').toBeTruthy();
  const { profileId } = await newAdult(page, 'trad-lecon');
  expect(profileId).toBeTruthy();
  await page.goto(`/lecons/${lecon}`);
  const lire = page.locator('section[data-etape="lire"]');
  await expect(page.locator('article.lesson')).toBeVisible();
  // l'adulte voit toute la leçon d'un coup (ou y passe)
  if (await lire.isHidden()) await page.getByTestId('tout-voir').click();
  const bouton = lire.getByTestId('traduction');
  await expect(bouton).toHaveText('Cacher la traduction');
  const frs = lire.locator('.phrase .fr');
  await expect(frs.first()).toBeVisible();
  const n = await frs.count();
  expect(n).toBeGreaterThan(0);
  // l'arabe ne bouge pas
  const arabe = await lire.locator('.phrase [lang="ar"]').count();
  await bouton.click();
  await expect(bouton).toHaveText('Voir la traduction');
  await expect(frs).toHaveCount(0);
  expect(await lire.locator('.phrase [lang="ar"]').count()).toBe(arabe);
  // le titre de la section reste en français
  await expect(lire.locator('h2 span').first()).not.toBeEmpty();
  // le choix est gardé (même profil) : rechargé, la traduction reste cachée
  await page.reload();
  await expect(page.locator('article.lesson')).toBeVisible();
  if (await lire.isHidden()) await page.getByTestId('tout-voir').click();
  await expect(lire.getByTestId('traduction')).toHaveText('Voir la traduction');
  await expect(lire.locator('.phrase .fr')).toHaveCount(0);
  await lire.getByTestId('traduction').click();
  await expect(lire.locator('.phrase .fr')).toHaveCount(n);
});

test('bilan ou examen : jamais de traduction du texte, donc pas de bouton', async ({
  page,
  request,
}) => {
  const { bilan } = await trouver(request);
  test.skip(!bilan, 'aucun bilan à texte préparé dans les 40 premières unités');
  const api = (await (await request.get(`/api/v1/units/${bilan}`)).json()) as Lecon;
  const R = api.unit.lesson.lecture!;
  const sansTrad = api.unit.kind === 'examen' || R.sans_traduction;
  await page.goto(`/lecons/${bilan}`);
  await expect(page.locator('article.lesson')).toBeVisible();
  if (sansTrad) {
    for (const p of R.phrases ?? []) expect(p.fr).toBeUndefined();
    await expect(page.locator('section[data-etape="lire"] [data-testid="traduction"]')).toHaveCount(
      0,
    );
  }
});

test('Madjaliss : traduction affichée par défaut, bouton pour la cacher, choix gardé ; notes jamais cachées', async ({
  page,
}) => {
  await newAdult(page, 'trad-mj');
  await page.goto('/madjaliss/akhdari/1');
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  const texte = page.getByTestId('mj-texte');
  await expect(texte).toHaveAttribute('data-traduction', '1');
  const fr = texte.getByTestId('mj-fr');
  await expect(fr.first()).toBeVisible();
  const n = await fr.count();
  const notes = await texte.getByTestId('note-explication').count();
  const bouton = page.getByTestId('traduction');
  await expect(bouton).toHaveText('Cacher la traduction');
  await bouton.click();
  await expect(texte).toHaveAttribute('data-traduction', '0');
  await expect(fr).toHaveCount(0);
  await expect(texte.getByTestId('note-explication')).toHaveCount(notes);
  await expect(texte.locator('p.ar.matn').first()).toBeVisible();
  // gardé pour ce profil : une autre séance s'ouvre sans traduction
  await page.goto('/madjaliss/akhdari/2');
  await expect(page.getByTestId('mj-texte')).toHaveAttribute('data-traduction', '0');
  await page.getByTestId('traduction').click();
  await expect(page.getByTestId('mj-texte').getByTestId('mj-fr').first()).toBeVisible();
  await page.goto('/madjaliss/akhdari/1');
  await expect(page.getByTestId('mj-texte').getByTestId('mj-fr')).toHaveCount(n);
});

test('lecture graduée : même bouton, traduction affichée par défaut', async ({ page }) => {
  await newAdult(page, 'trad-lect');
  await page.goto('/lectures');
  await expect(page.locator('[data-testid="livrets"][data-ready="true"]')).toBeVisible();
  await page.locator('[data-livret] a').first().click();
  await expect(page.getByTestId('livret')).toBeVisible();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('texte-fr')).toBeVisible();
  await page.getByTestId('traduction').click();
  await expect(page.getByTestId('texte-fr')).toHaveCount(0);
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('texte-fr')).toHaveCount(0);
});

test('Risāla (15/10) : RIS-0183 = 2:201 depuis Tanzil octet par octet, sans audio ; 72 séances ouvertes', async ({
  page,
}) => {
  expect(risala.seances.filter((s) => !s.differe)).toHaveLength(72);
  const s = risala.seances.find((x) => x.phrases.includes('RIS-0183'))!;
  expect(s.differe).toBeUndefined();
  await newAdult(page, 'ris-183');
  await page.goto(`/madjaliss/risala/${s.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  const ph = page.locator('article[data-phrase="RIS-0183"]');
  const q = ph.locator('.quran-text[data-coran="2:201"]');
  await expect(q).toHaveCount(1);
  const vu = await q.textContent();
  expect(Buffer.from(vu ?? '', 'utf8').equals(Buffer.from(tanzil.get('2:201')!, 'utf8'))).toBe(
    true,
  );
  await expect(ph.getByTestId('mj-ecouter-lire')).toHaveCount(0);
  // le sens du verset vient de la traduction de référence, sous le verset
  await expect(ph.locator('[data-sens="2:201"]')).toBeVisible();
});
