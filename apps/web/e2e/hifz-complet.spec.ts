import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { tanwinUndo } from '@awform/content/text';
import type { Page } from '@playwright/test';
import { openSettings } from './coran';
import { expect, newAdult, test } from './fixtures';

/**
 * Hifẓ complet (12/10/2026) : répétition fine (silence pour répéter, vitesses, partie du verset désactivée sans
 * minutages par mot), test qui démarre au hasard (amorce Tanzil exacte, auto-évaluation, hors ligne), carte des
 * erreurs (serveur + appareil) et points faibles, fraîcheur et séance du jour, deux rakʿa, écran enfant ;
 * mutashābihāt : aucune alerte tant que la liste savante est vide. Récitateurs « Essai » : bips NON coraniques.
 */
test.use({ compte: null });

const iso = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const ilYa = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

/** Carnet ad1 commencé il y a 60 jours ; parts apprises (et révisions) aux jours donnés. */
async function carnet(
  page: Page,
  profileId: string,
  evs: Array<{ part: string; jours: number; kind?: 'appris' | 'revision'; q?: number }>,
) {
  const r = await page.request.put(`/api/v1/hifz/profiles/${profileId}/plan`, {
    headers: { 'x-awform': '1' },
    data: { mode: 'carnet', bookCode: 'ad1', startDate: ilYa(60) },
  });
  expect(r.ok(), await r.text()).toBe(true);
  const p = await page.request.post('/api/v1/attempts', {
    headers: { 'x-awform': '1' },
    data: {
      events: evs.map((e, i) => ({
        id: crypto.randomUUID(),
        profileId,
        unitId: 'hifz',
        eventType: 'hifz',
        response: {
          day: ilYa(e.jours),
          part: e.part,
          kind: e.kind ?? 'appris',
          source: 'auto',
          ...(e.q !== undefined ? { q: e.q } : {}),
        },
        deviceAt: new Date(Date.now() - 100_000 + i * 1000).toISOString(),
      })),
    },
  });
  expect((await p.json()).accepted).toHaveLength(evs.length);
}

async function tanzil(page: Page, s: number, a: number): Promise<string> {
  const r = await page.request.get(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`);
  return ((await r.json()) as { verses: Array<{ text: string }> }).verses[0]!.text;
}
/** Mots affichés d'un verset (mot par mot), remis dans la graphie Tanzil pour la comparaison octet par octet. */
async function motsAffiches(page: Page, ref: string): Promise<string> {
  const mots = await page.locator(`[data-mots="${ref}"] .mot`).allTextContents();
  return tanwinUndo(mots.join(' '));
}
async function marques(page: Page, profileId: string) {
  const r = await page.request.get(`/api/v1/hifz/profiles/${profileId}/marques`);
  return ((await r.json()) as { marques: Array<{ s: number; a: number; k: number; t: string }> })
    .marques;
}

test('répétition fine : silence pour répéter, vitesses 0,75× et 0,5×, partie du verset désactivée sans minutages', async ({
  page,
}) => {
  await newAdult(page, 'hz-repeter');
  await page.goto('/coran/lecteur?r=essai-hafs&s=112&a=1');
  await openSettings(page);
  const sec = page.getByTestId('reglages-ecoute');
  for (const v of ['0.5', '0.75'])
    await expect(sec.locator(`#cl-vitesse option[value="${v}"]`)).toHaveCount(1);
  await sec.getByTestId('repeter-verset').fill('2');
  await sec.getByTestId('silence').selectOption('1');
  // aucun récitateur n'a de minutage par mot : l'option est désactivée et le dit
  await expect(sec.getByTestId('partie-verset')).toHaveAttribute('disabled', '');
  await expect(sec.getByTestId('partie-indispo')).toBeVisible();
  await expect(sec.getByTestId('partie-indispo')).toContainText(/minutage|seul verset/);
  // réglage gardé sur l'appareil
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('awzid.mushaf.v1') ?? '{}').silence),
  ).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByTestId('jouer').click();
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  // après le verset : silence « à vous de répéter », puis la lecture reprend
  await expect(page.getByTestId('a-vous')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('a-vous')).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId('arreter-audio').click();
});

test('test au hasard : amorce Tanzil exacte, la suite, mots marqués, carte des erreurs et points faibles', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'hz-test');
  await carnet(page, profileId, [{ part: '112:1-4', jours: 3 }]);
  await page.goto('/hifz/test?verset=112:2');
  const test1 = page.getByTestId('test-hasard');
  await expect(test1).toHaveAttribute('data-verset', '112:2');
  // amorce : les premiers mots du verset, exacts (Tanzil octet par octet), le reste caché
  const v2 = await tanzil(page, 112, 2);
  const mots = v2.split(' ');
  const k = Math.max(1, Math.min(5, Math.ceil(mots.length / 3), mots.length - 1));
  await expect(page.locator('[data-mots="112:2"] .mot')).toHaveCount(k);
  expect(Buffer.from(await motsAffiches(page, '112:2'))).toEqual(
    Buffer.from(mots.slice(0, k).join(' ')),
  );
  await expect(page.getByTestId('suite-cachee')).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.getByTestId('voir-suite').click();
  // la suite : le verset entier et les deux suivants, exacts
  for (const a of [2, 3, 4])
    expect(Buffer.from(await motsAffiches(page, `112:${a}`))).toEqual(
      Buffer.from(await tanzil(page, 112, a)),
    );
  // aucune donnée de mutashābihāt : aucune alerte
  await expect(page.getByTestId('mutashabih')).toHaveCount(0);
  const mot = page.locator('[data-mots="112:3"] button.mot[data-k="1"]');
  await mot.click();
  await expect(mot).toHaveClass(/erreur/);
  await page.locator('button[data-eval="hesitant"]').click();
  await expect(page.getByTestId('test-note')).toBeVisible();
  await expect
    .poll(async () => (await marques(page, profileId)).map((m) => [m.s, m.a, m.k, m.t]), {
      timeout: 15_000,
    })
    .toEqual(
      expect.arrayContaining([
        [112, 3, 1, 'erreur'],
        [112, 2, -1, 'hesitation'],
      ]),
    );

  // mes points faibles : le mot marqué est surligné sur le texte ; le plus faible d'abord
  await page.goto('/hifz/points-faibles');
  const liste = page.getByTestId('points-faibles');
  await expect(liste.locator('li').first()).toHaveAttribute('data-point', '112:3');
  await expect(liste.locator('[data-point="112:3"] .mot.erreur[data-k="1"]')).toBeVisible();
  await expect(liste.locator('[data-point="112:2"]')).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.getByTestId('tester-plus-faible').click();
  await expect(page).toHaveURL(/\/hifz\/test\?verset=112:3$/);
  await page.getByTestId('voir-suite').click();
  await page.locator('button[data-eval="juste"]').click();
  await expect(page.getByTestId('test-note')).toBeVisible();
  // récité juste : le point faible est résolu
  await page.goto('/hifz/points-faibles');
  await expect(page.locator('[data-point="112:2"]')).toBeVisible();
  await expect(page.locator('[data-point="112:3"]')).toHaveCount(0);
});

test('test au hasard sans réseau : auto-évaluation, marques envoyées au retour du réseau', async ({
  page,
  context,
}) => {
  const { profileId } = await newAdult(page, 'hz-horsligne');
  await carnet(page, profileId, [{ part: '112:1-4', jours: 3 }]);
  await page.goto('/hifz/test');
  await expect(page.getByTestId('test-hasard')).toHaveAttribute('data-verset', /^112:[1-4]$/);
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.ready) && !!navigator.serviceWorker.controller,
  );
  // tout ce que la page a demandé (textes, versets, marques) est arrivé et gardé avant la coupure
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  const t = page.getByTestId('test-hasard');
  await expect(t).toHaveAttribute('data-verset', /^112:[1-4]$/, { timeout: 15_000 });
  const ref = (await t.getAttribute('data-verset'))!;
  // hors ligne, pas d'IA d'écoute : « Voir la suite » est l'action principale
  await expect(page.getByTestId('reciter-verifier')).toHaveCount(0);
  await expect(page.getByTestId('voir-suite')).toHaveClass(/primary/);
  await page.getByTestId('voir-suite').click();
  await page.locator('button[data-eval="oublie"]').click();
  await expect(page.getByTestId('test-note')).toBeVisible();
  await context.setOffline(false);
  // la file de l'appareil se vide au retour du réseau
  await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 30_000 });
  const [s, a] = ref.split(':').map(Number);
  await expect
    .poll(async () => (await marques(page, profileId)).map((m) => [m.s, m.a, m.k, m.t]), {
      timeout: 20_000,
    })
    .toEqual([[s, a, -1, 'oubli']]);
});

test('fraîcheur : frais, à revoir, urgent ; l’urgent d’abord dans la séance du jour', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'hz-fraicheur');
  await carnet(page, profileId, [
    { part: '1:1-7', jours: 45 },
    { part: '112:1-4', jours: 12 },
    { part: '113:1-5', jours: 3 },
    { part: '113:1-5', jours: 1, kind: 'revision', q: 3 },
  ]);
  await page.goto('/hifz/fraicheur');
  const l = page.getByTestId('fraicheur');
  await expect(l.locator('li[data-sourate]').first()).toHaveAttribute('data-sourate', '1');
  await expect(l.locator('[data-sourate="1"]')).toHaveAttribute('data-niveau', 'urgent');
  await expect(l.locator('[data-sourate="112"]')).toHaveAttribute('data-niveau', 'a_revoir');
  await expect(l.locator('[data-sourate="113"]')).toHaveAttribute('data-niveau', 'frais');
  // l'indicateur est écrit en toutes lettres, jamais la couleur seule
  await expect(l.locator('[data-sourate="1"] .pastille')).toContainText('urgent');
  await expect(page.getByTestId('urgents')).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.getByTestId('seance-du-jour').click();
  await expect(page).toHaveURL(/\/hifz$/);
  // « Urgent à revoir » AVANT le nouveau (préserver l'acquis) ; le bandeau y mène
  await expect(page.getByTestId('urgents-carnet')).toHaveAttribute('href', '#urgent');
  const urgent = page.getByTestId('piste-urgent');
  await expect(urgent.locator('[data-part="1:1-7"]')).toBeVisible();
  const avant = await page.evaluate(() => {
    const u = document.querySelector('[data-testid="piste-urgent"]');
    const n = document.querySelector('[data-testid="piste-nouveau"]');
    return !!u && !!n && !!(u.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(avant).toBe(true);
  // un passage urgent n'apparaît qu'une fois
  await expect(page.locator('[data-part="1:1-7"]')).toHaveCount(1);
  // outils : tuiles secondaires, icône et nom écrit
  for (const o of ['test', 'points-faibles', 'fraicheur', 'priere', 'enfant']) {
    const tuile = page.getByTestId(`outil-${o}`);
    await expect(tuile).toBeVisible();
    await expect(tuile.locator('svg')).toHaveCount(1);
    await expect(tuile).not.toHaveClass(/primary/);
  }
  // dans chaque piste, l'urgent d'abord : un passage urgent n'est jamais après un passage frais
  for (const piste of ['piste-recent', 'piste-ancien']) {
    const niveaux = await page
      .getByTestId(piste)
      .locator('article .pastille')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-niveau')));
    const rang = { urgent: 0, a_revoir: 1, frais: 2 } as Record<string, number>;
    expect(niveaux.map((n) => rang[n ?? 'frais'])).toEqual(
      [...niveaux.map((n) => rang[n ?? 'frais'])].sort((x, y) => x! - y!),
    );
  }
});

test('basmala d’en-tête sur SA ligne (jamais collée au verset 1), sauf al-Fātiḥa où elle est le verset 1', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'hz-basmala');
  await carnet(page, profileId, [
    { part: '1:1-7', jours: 3 },
    { part: '112:1-4', jours: 3 },
  ]);
  const tanzil1 = await tanzil(page, 112, 1);
  const { basmala } = (await (await page.request.get('/api/v1/quran/meta')).json()) as {
    basmala: string;
  };
  const nb = basmala.split(' ').length;
  for (const vu of [false, true]) {
    await page.goto('/hifz/test?verset=112:1');
    if (vu) await page.getByTestId('voir-suite').click();
    const v = page.locator('[data-mots="112:1"]');
    const ligne = v.getByTestId('basmala-ligne');
    await expect(ligne).toBeVisible();
    // sur sa propre ligne, centrée, sans numéro ; le verset 1 sur la ligne suivante
    await expect(ligne).toHaveCSS('text-align', 'center');
    await expect(ligne.locator('.n')).toHaveCount(0);
    await expect(ligne.locator('.mot')).toHaveCount(nb);
    const lb = (await ligne.boundingBox())!;
    const vb = (await v.locator('.ligne').boundingBox())!;
    expect(vb.y).toBeGreaterThanOrEqual(lb.y + lb.height - 1);
    // texte toujours exact (Tanzil octet par octet), basmala comprise
    if (vu) expect(Buffer.from(await motsAffiches(page, '112:1'))).toEqual(Buffer.from(tanzil1));
  }
  // al-Fātiḥa (Ḥafṣ) : la basmala EST le verset 1, jamais détachée
  await page.goto('/hifz/test?verset=1:1');
  await page.getByTestId('voir-suite').click();
  await expect(page.locator('[data-mots="1:1"]')).toBeVisible();
  await expect(page.getByTestId('basmala-ligne')).toHaveCount(0);
});

test('2 rakʿa : deux passages mémorisés, gardés, révisés juste avant la prière', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'hz-priere');
  await carnet(page, profileId, [
    { part: '112:1-4', jours: 5 },
    { part: '113:1-5', jours: 4 },
  ]);
  await page.goto('/hifz/priere');
  await expect(page.getByTestId('reviser-priere')).toBeDisabled();
  await page.getByTestId('priere-r1').selectOption('112:1-4');
  await page.getByTestId('priere-r2').selectOption('113:1-5');
  expect(await serious(page)).toEqual([]);
  // choix gardé sur l'appareil
  await page.reload();
  await expect(page.getByTestId('priere-r1')).toHaveValue('112:1-4');
  await expect(page.getByTestId('priere-r2')).toHaveValue('113:1-5');
  await page.getByTestId('reviser-priere').click();
  const rev = page.getByTestId('priere-revision');
  await expect(rev).toHaveAttribute('data-rakaa', '1');
  // texte voilé (récitation de mémoire), montré à la demande
  await expect(rev.locator('[data-mots]')).toHaveCount(4);
  await expect(rev.getByTestId('suite-cachee')).toHaveCount(4);
  await rev.getByTestId('priere-voir').click();
  await expect(rev.getByTestId('suite-cachee')).toHaveCount(0);
  // emplacement de la règle de la prière : VIDE (viendra de la Risāla, avec sa source)
  await expect(rev.getByTestId('priere-regle')).toBeEmpty();
  await rev.locator('button[data-eval="juste"]').click();
  await expect(rev).toHaveAttribute('data-rakaa', '2');
  await expect(rev.locator('[data-mots]')).toHaveCount(5);
  await expect(rev.getByTestId('suite-cachee')).toHaveCount(5);
  await rev.locator('button[data-eval="hesitant"]').click();
  await expect(page.getByTestId('priere-prete')).toBeVisible();
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`/api/v1/hifz/profiles/${profileId}`);
        return (
          (await r.json()) as { events: Array<{ part: string; kind: string; q: number }> }
        ).events
          .filter((e) => e.kind === 'revision')
          .map((e) => [e.part, e.q]);
      },
      { timeout: 15_000 },
    )
    .toEqual(
      expect.arrayContaining([
        ['112:1-4', 3],
        ['113:1-5', 2],
      ]),
    );
});

test('écran enfant : deux réglages seulement, le récitateur répète (jamais une voix de synthèse)', async ({
  page,
}) => {
  const { profileId } = await newAdult(page, 'hz-enfant');
  await carnet(page, profileId, [{ part: '112:1-4', jours: 5 }]);
  await page.goto('/hifz/enfant');
  await expect(page.getByTestId('enfant-reglages')).toBeVisible();
  await expect(page.locator('main select')).toHaveCount(2);
  await expect(page.locator('main input')).toHaveCount(0);
  const choix = page.getByTestId('enfant-passage');
  const ikhlas = choix.locator('option', { hasText: '112:1-4' });
  await choix.selectOption((await ikhlas.getAttribute('value'))!);
  await page.getByTestId('enfant-fois').selectOption('2');
  await expect(page.locator('[data-mots="112:1"]')).toBeVisible();
  // règle enfant : aucun lien juridique visible sur cet écran, quel que soit le profil
  await expect(page.getByTestId('pied')).toHaveCount(0);
  // le lecteur simple : « Écouter » écrit, icône À GAUCHE du mot, cible ≥ 56 px ; ni volume ni réglages
  const lecteur = page.getByTestId('enfant-lecteur');
  // attendre la fin du chargement des pistes (lecteur prêt, ou message « sans audio »)
  await page.waitForLoadState('networkidle');
  await expect(
    lecteur.getByTestId('jouer').or(lecteur.getByTestId('enfant-sans-audio')),
  ).toBeVisible({ timeout: 15_000 });
  if (await lecteur.getByTestId('jouer').count()) {
    const jouer = lecteur.getByTestId('jouer');
    await expect(jouer).toContainText('Écouter');
    const [icone, bouton] = await jouer.evaluate((b) =>
      [b.querySelector('svg')!, b].map((e) => e.getBoundingClientRect()),
    );
    // icône dans la moitié gauche, centrée verticalement (sur la même ligne que le mot)
    expect(icone!.right).toBeLessThanOrEqual(bouton!.left + bouton!.width / 2);
    expect(
      Math.abs(icone!.top + icone!.height / 2 - (bouton!.top + bouton!.height / 2)),
    ).toBeLessThan(6);
    expect((await jouer.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(lecteur.getByTestId('ouvrir-reglages')).toHaveCount(0);
    await expect(lecteur.getByTestId('position')).toContainText('8');
  } else await expect(lecteur.getByTestId('enfant-sans-audio')).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('captures 412×915, clair et sombre, des nouveaux écrans du hifẓ', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'captures : une seule fois');
  const DIR = process.env.HIFZ_CAPTURES_DIR ?? 'test-results/captures-hifz';
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { profileId } = await newAdult(page, 'hz-captures');
  await carnet(page, profileId, [
    { part: '1:1-7', jours: 45 },
    { part: '112:1-4', jours: 12 },
    { part: '113:1-5', jours: 3 },
  ]);
  // une erreur et une hésitation pour la carte des erreurs
  await page.goto('/hifz/test?verset=112:2');
  await page.getByTestId('voir-suite').click();
  await page.locator('[data-mots="112:3"] button.mot[data-k="1"]').click();
  await page.locator('button[data-eval="hesitant"]').click();
  await expect(page.getByTestId('test-note')).toBeVisible();
  const ecrans: Array<[string, string, (() => Promise<void>) | null]> = [
    ['carnet', '/hifz', null],
    ['test', '/hifz/test?verset=112:1', null],
    [
      'test-reponse',
      '/hifz/test?verset=112:1',
      async () => {
        await page.getByTestId('voir-suite').click();
      },
    ],
    ['points-faibles', '/hifz/points-faibles', null],
    ['fraicheur', '/hifz/fraicheur', null],
    ['priere', '/hifz/priere', null],
    ['enfant', '/hifz/enfant', null],
    [
      'lecteur-repetition',
      '/coran/lecteur?r=essai-hafs&s=112&a=1',
      async () => {
        await openSettings(page);
        await page.getByTestId('silence').scrollIntoViewIfNeeded();
      },
    ],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const [nom, url, faire] of ecrans) {
      await page.goto(url);
      await page.locator('main h1, main [data-testid]').first().waitFor();
      if (faire) await faire();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: join(DIR, `${nom}-${scheme === 'light' ? 'clair' : 'sombre'}.png`),
      });
    }
  }
});
