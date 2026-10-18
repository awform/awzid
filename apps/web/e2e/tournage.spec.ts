import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EMAILS, expect, password, test } from './fixtures';

/**
 * Défauts repérés au tournage du 18/10/2026 (BUGS_APPLI_18-10) :
 *  - 1 : les versets affichés dans « Adhkār » sont ceux de Tanzil, octet pour octet (Al-Ikhlāṣ 4 : « أَحَدٌۢ ») ;
 *  - 2 : aucune mention « voix de synthèse (provisoire) » ;
 *  - 5 : Risāla, séance 1 : le libellé « publication différée » ne dit plus « masquée » et le parcours aboutit ;
 *  - 8 : « Télécharger » liste les niveaux dans l'ordre naturel ;
 *  - 9 : aucune erreur 401 juste après la connexion.
 */
const TANZIL = join(
  process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content'),
  'coran',
  'tanzil-uthmani.tsv',
);
const H = { 'x-awform': '1' };
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');

function chargerTanzil(): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of readFileSync(TANZIL, 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('\t');
    if (i > 0) m.set(l.slice(0, i), l.slice(i + 1));
  }
  return m;
}

test('point 1 : Adhkār — chaque verset affiché est Tanzil octet pour octet, dont Al-Ikhlāṣ 4', async ({
  page,
}) => {
  test.skip(!existsSync(TANZIL), 'Tanzil absent de cette machine');
  const tanzil = chargerTanzil();
  const tout = [...tanzil.values()].join(' ');
  let ikhlas4 = 0;
  let versets = 0;
  for (const c of ['matin', 'soir', 'apres_priere', 'adhan', 'coucher']) {
    await page.goto(`/quotidien/adhkar?c=${c}`);
    await expect(page.getByTestId('qt-adhkar')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const vus = await page
      .locator('[data-verse]')
      .evaluateAll((els) =>
        els.map((e) => [e.getAttribute('data-verse') ?? '', e.textContent ?? ''] as const),
      );
    for (const [cle, texte] of vus) {
      const v = tanzil.get(cle)!;
      // la basmala d'en-tête est posée à part : le reste du verset est la fin exacte du verset Tanzil
      expect(v.endsWith(texte), `${c} ${cle}`).toBe(true);
      expect(octets(texte), `${c} ${cle}`).toBe(octets(v.slice(v.length - texte.length)));
      versets++;
      if (cle === '112:4') {
        ikhlas4++;
        expect(octets(texte)).toBe(octets(v));
        expect(texte.endsWith('أَحَدٌۢ')).toBe(true);
      }
    }
    // duas du Coran et autres textes coraniques de la page
    const textes = await page
      .locator('.quran-text')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    for (const x of textes) expect(tout.includes(x.trim()), `${c} : ${x.slice(0, 40)}`).toBe(true);
  }
  expect(versets).toBeGreaterThan(3);
  expect(ikhlas4).toBeGreaterThan(0);
});

test('point 2 : aucune mention « voix de synthèse (provisoire) » dans les écrans à audio', async ({
  page,
}) => {
  for (const url of ['/vivre/douas', '/quotidien/adhkar', '/lectures/ad1-01', '/madjaliss']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body'), url).not.toContainText(/voix de synth[èe]se/i);
    await expect(page.locator('[title]').filter({ hasText: /./ }), url).toHaveCount(
      await page.locator('[title]').filter({ hasText: /./ }).count(),
    );
    const titres = await page
      .locator('[title]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''));
    expect(
      titres.filter((x) => /synth[èe]se|provisoire/i.test(x)),
      url,
    ).toEqual([]);
  }
});

test.describe('connexion', () => {
  test.use({ compte: null });
  test('point 9 : aucune réponse 401 juste après la connexion', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 401) erreurs.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto('/connexion');
    await page.waitForLoadState('networkidle');
    // la page de connexion elle-même, avant tout envoi, ne demande rien qui exige une session
    expect(erreurs, 'avant la connexion').toEqual([]);
    await page.locator('#email').fill(EMAILS.adulte);
    await page.locator('#password').fill(password());
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState('networkidle');
    expect(erreurs, 'après la connexion').toEqual([]);
  });
});

test.describe('Risāla', () => {
  test.use({ compte: null });
  test('point 5 : séance 1 différée — libellé cohérent, « Commencer la séance 1 » aboutit', async ({
    page,
  }) => {
    const email = `tournage-demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}@demo.awform.test`;
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
    await page.goto('/madjaliss/risala');
    const ligne = page.locator('li[data-seance="1"] [data-testid="mj-differe"]');
    await expect(ligne).toBeVisible();
    await expect(ligne).toContainText('visible pendant la bêta');
    await expect(page.locator('main')).not.toContainText(/masqu/i);
    await page.getByRole('link', { name: /Commencer la séance 1/ }).click();
    await expect(page).toHaveURL(/\/madjaliss\/risala\/1$/);
    await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
    await expect(page.getByTestId('mj-differe')).toContainText('visible pendant la bêta');
  });
});

test('point 8 : « Télécharger » liste les niveaux dans l’ordre naturel', async ({ page }) => {
  await page.goto('/hors-ligne');
  await page.locator('tr[data-level]').first().waitFor();
  const niveaux = await page
    .locator('tr[data-level]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-level') ?? ''));
  const attendu = [...niveaux].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  expect(niveaux).toEqual(attendu);
});
