import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, newAdult, test } from './fixtures';

/**
 * Madjaliss (P3-1) : la rubrique dans « Plus », la liste des textes par cycle (cycle conseillé), le sommaire
 * d'al-Akhḍarī (44 séances), une séance COMPLÈTE par étapes (lire, mots, mémoriser, quiz, « Séance faite » envoyée
 * au serveur), les règles du référent (bandeau, rappel « pas une fatwa », AKH-0052 jamais sans explication, mots du
 * Coran de Tanzil entre ﴿﴾) et l'attestation d'étude ; captures 412×915 en clair et en sombre.
 */
test.use({ compte: null });

type Phrase = { id: string; ar?: string | Array<string | { q: string; ref: string }>; fr?: string };
type Matn = {
  phrases: Phrase[];
  seances: Array<{ n: number; phrases: string[]; mots: Array<{ ar: string; fr: string }> }>;
};
const matn = JSON.parse(
  readFileSync(
    join(fileURLToPath(new URL('..', import.meta.url)), 'static', 'mutun', 'akhdari.json'),
    'utf8',
  ),
) as Matn;
const de = new Map(matn.phrases.map((p) => [p.id, p]));
const BANDEAU = 'Traduction Awzid — en cours de relecture savante';
const FATWA = "Ce n'est pas une fatwa : pour un cas personnel, interroge un savant ou l'imam.";

const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

async function regles(page: Page) {
  await expect(page.getByTestId('mj-relecture')).toHaveText(BANDEAU);
  await expect(page.getByTestId('mj-fatwa')).toHaveText(FATWA);
}

test('Plus → Madjaliss : textes par cycle, cycle conseillé, « bientôt » sans lien', async ({
  page,
}) => {
  await newAdult(page, 'mj-liste');
  await page.goto('/plus');
  await page.locator('a[data-plus="/madjaliss"]').click();
  await expect(page).toHaveURL(/\/madjaliss$/);
  await expect(page.getByTestId('entete-espace')).toContainText('Madjaliss');
  await regles(page);
  const liste = page.getByTestId('madjaliss');
  await expect(liste).toHaveAttribute('data-pret', 'true');
  // adulte sans niveau d'arabe : cycle 1 conseillé, affiché en premier
  await expect(liste).toHaveAttribute('data-conseille', '1');
  await expect(page.locator('section.cycle').first()).toHaveAttribute('data-cycle', '1');
  await expect(
    page.locator('section[data-cycle="1"] [data-testid="cycle-conseille"]'),
  ).toBeVisible();
  await expect(page.locator('a[data-texte="akhdari"]')).toHaveAttribute(
    'href',
    '/madjaliss/akhdari',
  );
  for (const id of [
    'ashmawiyya',
    'ibn-ashir',
    'izziyya',
    'risala',
    'khalil',
    'tuhfa',
    'ajurrumiyya',
  ]) {
    const x = page.locator(`[data-texte="${id}"]`);
    await expect(x).toContainText('Bientôt');
    await expect(x).not.toHaveAttribute('href', /.*/);
  }
  expect(await serious(page)).toEqual([]);
});

test('séance complète : lire, mots difficiles, mémoriser, quiz, « Séance faite » (appareil et serveur)', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'mj-seance');
  await page.goto('/madjaliss/akhdari');
  await regles(page);
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(44);
  await expect(page.getByTestId('mj-progres')).toContainText('Aucune séance faite sur 44');
  await page.getByTestId('mj-reprendre').click();
  await expect(page).toHaveURL(/\/madjaliss\/akhdari\/1$/);
  await regles(page);

  // 1. Lire : chaque phrase arabe sur sa ligne, vocalisée, INTACTE (octet par octet), traduction dessous
  const s1 = matn.seances[0]!;
  const etape = page.getByTestId('mj-etape');
  await expect(etape).toHaveAttribute('data-etape', 'lire');
  await expect(page.locator('[data-phrase]')).toHaveCount(s1.phrases.length);
  for (const id of s1.phrases) {
    const p = de.get(id)!;
    const el = page.locator(`[data-phrase="${id}"]`);
    await expect(el).toHaveAttribute('data-statut', 'VALIDATION_HUMAINE_REQUISE');
    const ar = await el.locator('p.matn').evaluate((n) => n.textContent ?? '');
    expect(Buffer.from(ar.trim()).toString('hex')).toBe(
      Buffer.from(p.ar as string).toString('hex'),
    );
    await expect(el.locator('p.matn')).toHaveCSS('display', 'block');
    await expect(el.locator('.fr')).toHaveText(p.fr!);
  }
  expect(await serious(page)).toEqual([]);

  // 2. Mots difficiles
  await page.getByTestId('mj-suivant').click();
  await expect(etape).toHaveAttribute('data-etape', 'mots');
  await expect(page.locator('[data-testid="mj-mots"] li')).toHaveCount(s1.mots.length);

  // 3. Mémoriser : masquage progressif, mot caché révélé d'un toucher, auto-évaluation ; aucun bouton « Écouter »
  await page.getByTestId('mj-suivant').click();
  await expect(etape).toHaveAttribute('data-etape', 'memo');
  await expect(page.getByTestId('mj-ecouter')).toHaveCount(0);
  const memo = page.getByTestId('mj-memo');
  await page.getByTestId('mj-masquer').click();
  await expect(memo).toHaveAttribute('data-palier', '1');
  const cache = page.locator('button.mot.cache').first();
  await expect(cache).toHaveAttribute('aria-label', 'Mot caché : touche pour le voir');
  const avant = await page.locator('button.mot.cache').count();
  await cache.click();
  await expect(page.locator('button.mot.cache')).toHaveCount(avant - 1);
  for (let k = 0; k < s1.phrases.length; k++) {
    // jusqu'au dernier palier (tout masqué), puis « Juste » : la phrase suivante repart du palier 0
    for (let p = Number(await memo.getAttribute('data-palier')); p < 3; p++) {
      await page.getByTestId('mj-masquer').click();
      await expect(memo).toHaveAttribute('data-palier', String(p + 1));
    }
    await page.locator('button[data-eval="juste"]').click();
    await expect(memo).toHaveAttribute('data-palier', '0');
    if (await page.getByTestId('mj-memo-fini').isVisible()) break;
  }
  await expect(page.getByTestId('mj-memo-fini')).toBeVisible();

  // 4. Quiz : 3 à 5 questions générées depuis les données, réponse immédiate
  await page.getByTestId('mj-suivant').click();
  await expect(etape).toHaveAttribute('data-etape', 'quiz');
  const nq = Number(
    /sur (\d)/.exec((await page.locator('.quiz .rang').textContent()) ?? '')?.[1] ?? '0',
  );
  expect(nq).toBeGreaterThanOrEqual(3);
  expect(nq).toBeLessThanOrEqual(5);
  for (let i = 0; i < nq; i++) {
    await page.locator('button.option').first().click();
    await expect(page.getByTestId('mj-retour')).toBeVisible();
    await expect(page.locator('button.option.bonne')).toHaveCount(1);
    await page.getByTestId('mj-q-suivante').click();
  }
  await expect(page.getByTestId('mj-quiz-score')).toContainText(`sur ${nq}`);

  // 5. Fin : « Séance faite », gardée sur l'appareil et envoyée au serveur
  await page.getByTestId('mj-suivant').click();
  await expect(etape).toHaveAttribute('data-etape', 'fin');
  await page.getByTestId('mj-seance-faite').click();
  await expect(page.getByTestId('mj-faite')).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/v1/profiles/${profileId}/madjaliss`)).json()).faites,
      {
        timeout: 20_000,
      },
    )
    .toEqual(['akhdari:1']);
  await page.getByTestId('mj-suivante').click();
  await expect(page).toHaveURL(/\/madjaliss\/akhdari\/2$/);
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
  await page.goto('/madjaliss/akhdari');
  await expect(page.locator('[data-seance="1"]')).toHaveAttribute('data-faite', 'true');
  await expect(page.locator('[data-seance="2"]')).toHaveAttribute('data-en-cours', 'true');
  await expect(page.getByTestId('mj-progres')).toContainText('1 séance faite sur 44');
});

test('règles du référent : AKH-0052 jamais sans explication, mots du Coran de Tanzil entre ﴿﴾', async ({
  page,
}) => {
  await newAdult(page, 'mj-regles');
  await page.goto('/madjaliss/akhdari/13');
  await regles(page);
  const p52 = page.locator('[data-phrase="AKH-0052"]');
  await expect(p52.getByTestId('explication-bientot')).toHaveText(
    "Passage présenté avec son explication par l'enseignant — bientôt",
  );
  await expect(p52.locator('p.matn')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('كَافِرٌ');
  await expect(page.locator('main')).not.toContainText('mécréant');

  // AKH-0132 (séance 30) : 29:45, sous-chaîne exacte de Tanzil, police du Coran, entre ﴿﴾
  const seg = (de.get('AKH-0132')!.ar as Array<string | { q: string }>).find(
    (x): x is { q: string; ref: string } => typeof x !== 'string',
  )!;
  await page.goto('/madjaliss/akhdari/30');
  const coran = page.locator('[data-phrase="AKH-0132"] [data-coran="29:45"]');
  await expect(coran).toHaveClass(/quran-text/);
  expect(Buffer.from((await coran.textContent()) ?? '').toString('hex')).toBe(
    Buffer.from(seg.q).toString('hex'),
  );
  const tout = (await page.locator('[data-phrase="AKH-0132"] .coran').textContent()) ?? '';
  expect(tout.startsWith('﴿') && tout.endsWith('﴾')).toBe(true);

  // AKH-0015 (séance 5) : 9:62 depuis Tanzil, et le sens du verset de la traduction de référence
  await page.goto('/madjaliss/akhdari/5');
  await expect(page.locator('[data-phrase="AKH-0015"] [data-coran="9:62"]')).toBeVisible();
  // seule la portion citée en arabe ; dessous, « Sens du verset entier : » et la traduction, sur leur ligne
  const p15 = page.locator('[data-phrase="AKH-0015"] [data-coran]');
  await expect(p15).toHaveCount(1);
  await expect(page.locator('[data-sens="9:62"] .sens-titre')).toHaveText(
    'Sens du verset entier :',
  );
  await expect(page.locator('[data-sens="9:62"] .sens-texte')).toHaveCSS('display', 'block');
  await expect(page.locator('main')).not.toContainText('TANZIL');
});

test('attestation d’étude quand les 44 séances sont faites (sans le mot ijāza)', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'mj-attestation');
  const day = new Date().toISOString().slice(0, 10);
  const r = await page.request.post('/api/v1/attempts', {
    headers: { 'x-awform': '1' },
    data: {
      events: Array.from({ length: 44 }, (_, i) => ({
        id: crypto.randomUUID(),
        profileId,
        unitId: 'madjaliss',
        eventType: 'madjlis',
        response: { item: `akhdari:${i + 1}`, ok: true, day, details: { quiz: 3, sur: 3 } },
        deviceAt: new Date(Date.now() - 100_000 + i * 1000).toISOString(),
      })),
    },
  });
  expect((await r.json()).accepted).toHaveLength(44);
  await page.goto('/madjaliss/akhdari');
  const att = page.getByTestId('mj-attestation');
  await expect(att).toBeVisible();
  await expect(att).toContainText("Attestation d'étude");
  await expect(att).toContainText('Contenu en cours de relecture savante.');
  await expect(att).toContainText('44 séances');
  await expect(page.locator('main')).not.toContainText(/ij[aā]za/i);
  await expect(page.getByTestId('mj-reprendre')).toHaveCount(0);
  // pas de bouton « Imprimer » (l'impression marche mal sur mobile)
  await expect(att.locator('button')).toHaveCount(0);
});

test('captures 412×915, clair et sombre, des écrans Madjaliss', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'captures : une seule fois');
  const DIR = process.env.MJ_CAPTURES_DIR ?? 'test-results/captures-madjaliss';
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await newAdult(page, 'mj-captures');
  const ecrans: Array<[string, string, (() => Promise<void>) | null]> = [
    ['liste', '/madjaliss', null],
    ['sommaire', '/madjaliss/akhdari', null],
    ['seance-lire', '/madjaliss/akhdari/5', null],
    ['seance-explication', '/madjaliss/akhdari/13', null],
    [
      'seance-mots',
      '/madjaliss/akhdari/1',
      async () => {
        await page.getByTestId('mj-suivant').click();
      },
    ],
    [
      'seance-memoriser',
      '/madjaliss/akhdari/1',
      async () => {
        await page.getByTestId('mj-suivant').click();
        await page.getByTestId('mj-suivant').click();
        await page.getByTestId('mj-masquer').click();
        await page.getByTestId('mj-masquer').click();
      },
    ],
    [
      'seance-quiz',
      '/madjaliss/akhdari/1',
      async () => {
        for (let i = 0; i < 3; i++) await page.getByTestId('mj-suivant').click();
        await page.locator('button.option').first().click();
      },
    ],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const [nom, url, faire] of ecrans) {
      await page.goto(url);
      await page.getByTestId('mj-relecture').waitFor();
      await page.locator('main h1').first().waitFor();
      if (faire) await faire();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: join(DIR, `${nom}-${scheme === 'light' ? 'clair' : 'sombre'}.png`),
      });
    }
    expect(await serious(page), scheme).toEqual([]);
  }
});
