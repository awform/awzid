import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Madjaliss, lot 2 (13/10) : les sept textes (al-Akhḍarī, al-ʿAshmāwiyya, Tuḥfat al-Aṭfāl, Ibn ʿĀshir, al-ʿIzziyya,
 * al-Ājurrūmiyya, al-Jazariyya) dans la rubrique : sommaires, vers à deux hémistiches, mention de statut, niveaux
 * (aucun passage « adulte » pour un enfant ou un ado), passages « présentés par le maître », code visuel de la
 * grammaire, renvois, et AUCUN champ interne ni lettre de translittération latine dans l'arabe affiché à l'élève.
 */
test.use({ compte: null });

const STATUT_FR =
  "Tranché par le référent selon l'école mālikite (mashhūr), sources citées. En attente d'une seconde lecture savante.";
const H = { 'x-awform': '1' };
const YEAR = new Date().getUTCFullYear();
const TEXTES = [
  'akhdari',
  'ashmawiyya',
  'tuhfa',
  'ibn-ashir',
  'izziyya',
  'ajurrumiyya',
  'jazariyya',
] as const;

type Phrase = {
  id: string;
  t: string;
  ar?: string | Array<string | { q: string; ref: string }>;
  h?: [string, string];
  fr?: string;
  explication?: true;
  adulte?: true;
  notes?: unknown[];
  titre?: string;
};
type Seance = {
  n: number;
  id: string;
  phrases: string[];
  adulte?: true;
  pudeur?: true;
  facultatif?: true;
  renvois?: Array<{ texte: string; n: number }>;
};
type Matn = { phrases: Phrase[]; seances: Seance[] };
const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'static', 'mutun');
const donnees = Object.fromEntries(
  TEXTES.map((t) => [t, JSON.parse(readFileSync(join(dir, `${t}.json`), 'utf8')) as Matn]),
) as Record<(typeof TEXTES)[number], Matn>;
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const INTERNE =
  /translit|brouillon|a_verifier|collation|relecture_comite|decision_referent|voyelle_a_confirmer|VALIDATION_HUMAINE|validation humaine|comité|référent|seconde lecture/i;

const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);

/** Compte parent avec un seul profil élève (enfant ou ado), choisi comme élève actif. */
async function eleve(page: Page, req: APIRequestContext, nom: string, age: number, level: string) {
  const email = `mjt-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
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

/** L'arabe affiché ne porte aucune lettre latine ; aucun mot interne dans la page. */
async function proprete(page: Page) {
  const arabes = await page
    .locator('.ar, .matn, .cit, .hem, .inter, .titre-ar, .quran-text')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  for (const a of arabes) expect(/[A-Za-zʿʾḥṣḍṭẓāīūṯḏġš]/.test(a), a.slice(0, 60)).toBe(false);
  // (la mention de statut du client contient « référent » et « seconde lecture » : retirée avant le contrôle)
  const texte = ((await page.locator('main').innerText()) ?? '').replace(STATUT_FR, '');
  expect(INTERNE.test(texte), texte.match(INTERNE)?.[0]).toBe(false);
}

test('liste : les sept textes ouverts, rangés par cycle comme dans le plan directeur', async ({
  page,
}) => {
  await newAdult(page, 'mjt-liste');
  await page.goto('/madjaliss');
  await expect(page.getByTestId('madjaliss')).toHaveAttribute('data-pret', 'true');
  const ordre = async (c: number) =>
    page
      .locator(`section[data-cycle="${c}"] [data-texte]`)
      .evaluateAll((l) => l.map((x) => x.getAttribute('data-texte')));
  expect(await ordre(1)).toEqual(['akhdari', 'ashmawiyya', 'nawawi', 'tuhfa']);
  expect(await ordre(2)).toEqual(['ibn-ashir', 'izziyya', 'bayquniyya', 'ajurrumiyya']);
  expect(await ordre(3)).toEqual(['risala', 'lamiyya', 'jazariyya']);
  expect(await ordre(4)).toEqual(['khalil', 'alfiyya', 'waraqat']);
  for (const t of TEXTES) await expect(page.locator(`a[data-texte="${t}"]`)).toBeVisible();
  for (const t of ['lamiyya', 'risala', 'khalil', 'waraqat', 'bayquniyya', 'nawawi']) {
    await expect(page.locator(`[data-texte="${t}"]`)).toContainText('Bientôt');
    await expect(page.locator(`[data-texte="${t}"]`)).not.toHaveAttribute('href', /.*/);
  }
});

for (const t of TEXTES) {
  test(`${t} : sommaire, mention de statut, première séance (arabe sur sa ligne, rien d'interne)`, async ({
    page,
  }) => {
    await newAdult(page, `mjt-${t}`);
    const m = donnees[t];
    await page.goto(`/madjaliss/${t}`);
    await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(m.seances.length);
    await expect(page.getByTestId('mj-statut')).toHaveText(STATUT_FR);
    await expect(page.getByTestId('mj-relecture')).toBeVisible();
    // tous les textes : une seule mention de statut, jamais « validation humaine requise »
    expect((await page.locator('main').innerText()).toLowerCase()).not.toContain(
      'validation humaine',
    );
    await page.goto(`/madjaliss/${t}/1`);
    await expect(page.getByTestId('mj-statut')).toHaveText(STATUT_FR);
    const s1 = m.seances[0]!;
    const de = new Map(m.phrases.map((p) => [p.id, p]));
    await expect(page.locator('[data-phrase]')).toHaveCount(s1.phrases.length);
    for (const id of s1.phrases) {
      const p = de.get(id)!;
      const el = page.locator(`[data-phrase="${id}"]`);
      await expect(el).toHaveAttribute('data-statut', 'EN_ATTENTE_SECONDE_LECTURE');
      if (p.explication) continue;
      const matn = el.locator('p.matn');
      await expect(matn).toHaveCSS('display', 'block');
      if (p.h) {
        // un vers : chaque hémistiche sur sa propre ligne, dans l'ordre, octet par octet
        const hem = matn.locator('.hem');
        await expect(hem).toHaveCount(2);
        for (const k of [0, 1] as const) {
          await expect(hem.nth(k)).toHaveCSS('display', 'block');
          expect(octets(((await hem.nth(k).textContent()) ?? '').trim())).toBe(octets(p.h[k]));
        }
      } else if (typeof p.ar === 'string') {
        expect(octets(((await matn.textContent()) ?? '').trim())).toBe(octets(p.ar));
      }
    }
    await proprete(page);
    expect(await serious(page)).toEqual([]);
  });
}

test('vers : mémorisation sur deux lignes (second hémistiche à la ligne) et quiz', async ({
  page,
}) => {
  await newAdult(page, 'mjt-vers');
  await page.goto('/madjaliss/ibn-ashir/1');
  await page.getByTestId('mj-suivant').click();
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'mots');
  await page.getByTestId('mj-suivant').click();
  const memo = page.getByTestId('mj-memo');
  await expect(memo).toHaveAttribute('data-palier', '0');
  await expect(memo.locator('p.matn br')).toHaveCount(1);
  await page.getByTestId('mj-suivant').click();
  const nq = Number(
    /sur (\d)/.exec((await page.locator('.quiz .rang').textContent()) ?? '')?.[1] ?? '0',
  );
  expect(nq).toBeGreaterThanOrEqual(3);
  expect(nq).toBeLessThanOrEqual(5);
  await proprete(page);
});

test('niveaux : aucun passage « adulte » pour un enfant ni un ado ; l’adulte voit tout', async ({
  page,
}) => {
  // adulte : tout (séances adultes comprises), passages réservés avec la mention « bientôt »
  await newAdult(page, 'mjt-niveau-adulte');
  for (const t of ['izziyya', 'jazariyya', 'ibn-ashir', 'ashmawiyya'] as const) {
    await page.goto(`/madjaliss/${t}`);
    await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(
      donnees[t].seances.length,
    );
  }
  const iz = donnees.izziyya;
  const sensible = iz.seances.find((s) => s.id === 'IZZ-S19A')!;
  await page.goto(`/madjaliss/izziyya/${sensible.n}`);
  await expect(page.getByTestId('explication-bientot')).toHaveCount(sensible.phrases.length);
  await expect(page.locator('p.matn')).toHaveCount(0);
  await expect(page.locator('main')).toContainText(
    "Passage présenté avec son explication par l'enseignant — bientôt",
  );
  const arSensible = iz.phrases.find((p) => p.id === 'IZZ-0129');
  expect(arSensible?.ar).toBeUndefined();

  // ado : plus aucune séance « adulte » ; l'adresse directe d'une séance adulte ne montre rien
  await page.context().clearCookies();
  await eleve(page, page.request, 'Yassine', 14, 'ado1');
  for (const t of ['izziyya', 'jazariyya', 'ibn-ashir', 'ashmawiyya'] as const) {
    await page.goto(`/madjaliss/${t}`);
    await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(
      donnees[t].seances.filter((s) => !s.adulte).length,
    );
  }
  await page.goto(`/madjaliss/izziyya/${sensible.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveCount(0);
  await expect(page.locator('main')).toContainText("Ce texte n'est pas encore disponible.");
  const rasm = donnees.jazariyya.seances.find((s) => s.id === 'JAZ-S23')!;
  await page.goto(`/madjaliss/jazariyya/${rasm.n}`);
  await expect(page.getByTestId('mj-etape')).toHaveCount(0);
  // ado : les règles et lochies restent proposées (pudeur)
  const pudeur = iz.seances.filter((s) => s.pudeur && !s.adulte).length;
  expect(pudeur).toBeGreaterThan(0);

  // enfant : ni « adulte » ni règles et lochies
  await page.context().clearCookies();
  await eleve(page, page.request, 'Maryam', 8, 'en1');
  for (const t of ['izziyya', 'akhdari', 'ashmawiyya'] as const) {
    await page.goto(`/madjaliss/${t}`);
    await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(
      donnees[t].seances.filter((s) => !s.adulte && !s.pudeur).length,
    );
  }
});

test('Ājurrūmiyya : code visuel sans couleur (formes), listes et exemples chacun sur sa ligne', async ({
  page,
}) => {
  await newAdult(page, 'mjt-ajr');
  await page.goto('/madjaliss/ajurrumiyya');
  const code = page.getByTestId('mj-code-visuel');
  await expect(code).toBeVisible();
  await code.locator('summary').click();
  const etats = code.locator('li[data-style]');
  await expect(etats).toHaveCount(4);
  const styles = ['solid', 'double', 'wavy', 'dashed'];
  const noms = ['plein', 'double', 'ondule', 'tirete'];
  for (let k = 0; k < 4; k++) {
    const li = etats.nth(k);
    await expect(li).toHaveAttribute('data-style', noms[k]!);
    const ex = li.locator('.ex');
    await expect(ex).toHaveCSS('text-decoration-style', styles[k]!);
    // une seule teinte : le soulignement a la couleur de l'encre du texte
    const [soul, encre] = await ex.evaluate((e) => {
      const c = getComputedStyle(e);
      return [c.textDecorationColor, c.color];
    });
    expect(soul).toBe(encre);
  }
  await expect(code).not.toContainText(/tajw[iī]d|\b(?:rouge|vert|bleu)\b/i);
  // AJR-0004 : liste des signes du verbe, chaque ligne arabe SUR SA LIGNE, traduction dessous
  await page.goto('/madjaliss/ajurrumiyya/1');
  const liste = page.locator('[data-phrase="AJR-0004"] [data-testid="mj-liste"]');
  await expect(liste).toBeVisible();
  const lignes = liste.locator('li .ar');
  await expect(lignes).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(lignes.nth(i)).toHaveCSS('display', 'block');
  // explication d'al-Kafrāwī sous la phrase ; verset cité (Tanzil) sur sa ligne
  const n3 = donnees.ajurrumiyya.seances.find((s) => s.phrases.includes('AJR-0003'))!.n;
  await page.goto(`/madjaliss/ajurrumiyya/${n3}`);
  const note = page.locator('[data-phrase="AJR-0003"] [data-testid="note-explication"]').first();
  await expect(note).toBeVisible();
  await expect(note.locator('.coranique .quran-text').first()).toBeVisible();
  await proprete(page);
});

test('Jazariyya : ordre de publication, séances du rasm facultatives (adulte), intertitres arabes', async ({
  page,
}) => {
  await newAdult(page, 'mjt-jaz');
  await page.goto('/madjaliss/jazariyya');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(
    donnees.jazariyya.seances.length,
  );
  const ids = await page
    .locator('[data-testid="mj-sommaire"] li')
    .evaluateAll((l) => l.map((x) => x.getAttribute('data-seance')));
  expect(ids).toEqual(donnees.jazariyya.seances.map((s) => String(s.n)));
  const derniere = page.locator('[data-testid="mj-sommaire"] li').last();
  await expect(derniere).toContainText('facultative');
  await page.goto('/madjaliss/jazariyya/1');
  await expect(page.getByTestId('mj-intertitre').first()).toBeVisible();
  await expect(page.getByTestId('mj-intertitre').first()).toHaveAttribute('lang', 'ar');
});

test('renvoi vers un autre texte : al-ʿAshmāwiyya → al-Akhḍarī', async ({ page }) => {
  await newAdult(page, 'mjt-renvoi');
  const s = donnees.ashmawiyya.seances.find((x) => x.renvois?.length)!;
  const r = s.renvois![0]!;
  await page.goto(`/madjaliss/ashmawiyya/${s.n}`);
  const lien = page.locator(`[data-testid="mj-renvois"] a[data-renvoi="${r.texte}/${r.n}"]`);
  await expect(lien).toBeVisible();
  await lien.click();
  await expect(page).toHaveURL(new RegExp(`/madjaliss/${r.texte}/${r.n}$`));
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
});

test('versets cités : Tanzil entre ﴿﴾ avec le sens du verset (ʿAshmāwiyya 22:7, ʿIzziyya 23:5-6)', async ({
  page,
}) => {
  await newAdult(page, 'mjt-coran');
  const a = donnees.ashmawiyya;
  const n49 = a.seances.find((s) => s.phrases.includes('ASH-0049'))!.n;
  await page.goto(`/madjaliss/ashmawiyya/${n49}`);
  const q = (
    donnees.ashmawiyya.phrases.find((p) => p.id === 'ASH-0049')!.ar as Array<
      string | { q: string; ref: string }
    >
  ).find((x): x is { q: string; ref: string } => typeof x !== 'string')!;
  const coran = page.locator('[data-phrase="ASH-0049"] [data-coran="22:7"]');
  await expect(coran).toHaveClass(/quran-text/);
  expect(octets((await coran.textContent()) ?? '')).toBe(octets(q.q));
  await expect(page.locator('[data-phrase="ASH-0049"] [data-sens="22:7"]')).toBeVisible();
  await expect(page.locator('[data-phrase="ASH-0049"] .fr')).toContainText('[…]');
  const n371 = donnees.izziyya.seances.find((s) => s.phrases.includes('IZZ-0371'))!.n;
  await page.goto(`/madjaliss/izziyya/${n371}`);
  await expect(page.locator('[data-phrase="IZZ-0371"] [data-sens]')).toHaveCount(2);
  await expect(page.locator('[data-phrase="IZZ-0371"] [data-coran="23:5-6"]')).toBeVisible();
  // jamais de bouton « Écouter » (aucune voix de synthèse)
  await expect(page.getByTestId('mj-ecouter')).toHaveCount(0);
  await proprete(page);
});

test('captures 412×915 des nouveaux écrans (vers, code visuel, listes, passage réservé)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'captures : une seule fois');
  const DIR = process.env.MJ_CAPTURES_DIR ?? 'test-results/captures-madjaliss-2';
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await newAdult(page, 'mjt-captures');
  const sensible = donnees.izziyya.seances.find((s) => s.id === 'IZZ-S19A')!.n;
  const ecrans: Array<[string, string, (() => Promise<void>) | null]> = [
    ['vers-lire', '/madjaliss/ibn-ashir/2', null],
    ['vers-intertitre', '/madjaliss/ibn-ashir/3', null],
    [
      'vers-memoriser',
      '/madjaliss/ibn-ashir/1',
      async () => {
        await page.getByTestId('mj-suivant').click();
        await page.getByTestId('mj-suivant').click();
        await page.getByTestId('mj-masquer').click();
      },
    ],
    [
      'code-visuel',
      '/madjaliss/ajurrumiyya',
      async () => {
        await page.getByTestId('mj-code-visuel').locator('summary').click();
      },
    ],
    ['liste-exemples', '/madjaliss/ajurrumiyya/1', null],
    ['passage-reserve', `/madjaliss/izziyya/${sensible}`, null],
    [
      'coran-sens',
      `/madjaliss/izziyya/${donnees.izziyya.seances.find((s) => s.phrases.includes('IZZ-0371'))!.n}`,
      null,
    ],
    ['sommaire-jazariyya', '/madjaliss/jazariyya', null],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const [nom, url, faire] of ecrans) {
      await page.goto(url);
      await page.getByTestId('mj-relecture').waitFor();
      await page.locator('main h1, main h2').first().waitFor();
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

test('le mode enseignant porte ce qui est interne ; l’élève ne le voit pas', async ({ page }) => {
  await newAdult(page, 'mjt-interne');
  for (const [t, n] of [
    ['tuhfa', 3],
    ['jazariyya', 1],
    ['ibn-ashir', 5],
    ['izziyya', 12],
  ] as const) {
    await page.goto(`/madjaliss/${t}/${n}`);
    await expect(page.getByTestId('mj-mode-enseignant')).toHaveCount(0);
    await proprete(page);
  }
});
