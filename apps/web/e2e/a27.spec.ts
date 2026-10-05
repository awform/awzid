import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tanwinUndo } from '@awform/content/text';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Chantier A27 — parcours par niveau et par classe, dans le navigateur (vrais livres de l'édition e2e) :
 *  - accueil : « Ma prochaine activité » choisie selon le livre, puis Mon arabe, Mon Coran, Mes sciences… ;
 *  - l'élève ne voit QUE son niveau ; les onglets dépendent du niveau ; livre suivant en aperçu, autres fermés ;
 *  - test de positionnement (fixe le niveau) ; épreuve de passage (nouvel essai le lendemain) ;
 *  - « J'écris le Coran » visible seulement à partir de la leçon du premier verset (ad1 l19) ;
 *  - mots du Coran du niveau (si le fichier des livres est présent) ;
 *  - budget : les pages du personnel ne sont pas préchargées par le service worker ;
 *  - captures 375 px clair / sombre (enfant, ado, adulte) dans reports/a27/.
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const YEAR = new Date().getUTCFullYear();
const uniq = (s: string) => `${s}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
/** fichier des livres (mots du Coran) : importé dans la base de test s'il est là */
const MOTS = process.env.AWFORM_MOTS_CORAN ?? '/tmp/mots_coran_1000.json';

const sql = (q: string) =>
  execFileSync('psql', [process.env.TEST_DATABASE_URL!, '-Atqc', q], { encoding: 'utf8' });

async function adultAt(page: Page, label: string): Promise<string> {
  const { profileId } = await newAdult(page, label);
  const r = await page.request.post(`/api/v1/profiles/${profileId}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect(r.status(), await r.text()).toBe(201);
  return profileId;
}

/** Leçons d'ad1 « terminées » jusqu'à n (comme si l'élève les avait faites). */
function doneUntil(profileId: string, level: string, n: number) {
  sql(
    `INSERT INTO progress (profile_id, unit_id, status) SELECT '${profileId}', u.id, 'terminee' FROM unit u
     WHERE u.level_code = '${level}' AND u.n <= ${n} ON CONFLICT DO NOTHING`,
  );
}

async function parentWith(
  req: APIRequestContext,
  pseudonym: string,
  age: number,
  levelCode: string,
): Promise<string> {
  const email = `${uniq('a27')}@e2e.test`;
  const s = await req.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      birthYear: 1984,
      email,
      password: password(),
      country: 'FR',
      consents: ['cgu'],
    },
  });
  expect(s.status(), await s.text()).toBe(201);
  const p = await req.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym,
      birthYear: YEAR - 1 - age,
      levelCode,
      password: password(),
      consents: ['compte_suivi'],
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  return ((await p.json()) as { id: string }).id;
}

test('accueil : « Ma prochaine activité » selon le livre, puis mes espaces', async ({ page }) => {
  await adultAt(page, 'a27-accueil');
  await page.goto('/aujourdhui');
  const next = page.getByTestId('prochaine-activite');
  await expect(next).toHaveAttribute('data-activite', 'lecon');
  await expect(next).toHaveAttribute('data-cible', 'ad1.l01');
  const spaces = page.getByTestId('mes-espaces');
  for (const e of ['arabe', 'coran', 'sciences', 'quotidien'])
    await expect(spaces.locator(`[data-espace="${e}"]`)).toBeVisible();
  // pas de classe : pas de « Ma classe »
  await expect(spaces.locator('[data-espace="classe"]')).toHaveCount(0);
  // barre principale des adultes : cinq entrées au plus
  await expect(page.locator('nav.tabs a')).toHaveCount(5);
  await next.click();
  await expect(page).toHaveURL(/\/lecons\/ad1\.l01$/);
});

test('l’élève ne voit que son niveau : onglets du niveau, suivant en aperçu, autres livres fermés', async ({
  page,
}) => {
  await adultAt(page, 'a27-niveau');
  await page.goto('/');
  const lvl = page.getByTestId('mon-niveau');
  await expect(lvl).toHaveAttribute('data-niveau', 'ad1');
  const units = page.getByTestId('lecons-niveau').getByTestId('unit');
  await expect(units.first()).toBeVisible();
  for (const href of await units.evaluateAll((as) => as.map((a) => a.getAttribute('href'))))
    expect(href).toMatch(/^\/lecons\/ad1\.l\d\d$/);
  // onglets : leçons, lectures, écriture (aucune leçon faite : pas encore de « Pratique »)
  const tabs = page.getByTestId('onglets-niveau').locator('[data-onglet]');
  const names = await tabs.evaluateAll((b) => b.map((x) => x.getAttribute('data-onglet')));
  expect(names.slice(0, 3)).toEqual(['lecons', 'lectures', 'ecriture']);
  expect(names).not.toContain('pratique');
  // aperçu du suivant (titres seuls) et épreuve
  const ap = page.getByTestId('apercu-suivant');
  await expect(ap).toHaveAttribute('data-niveau', 'ad2');
  await expect(ap.getByTestId('passer-epreuve')).toBeVisible();
  // livre suivant : aperçu sans liens ; deux niveaux plus loin ou autre filière : fermé
  await page.goto('/niveaux/ad2');
  await expect(page.getByTestId('acces-apercu')).toBeVisible();
  await expect(page.getByTestId('unit-apercu').first()).toBeVisible();
  await expect(page.getByTestId('unit')).toHaveCount(0);
  await page.goto('/niveaux/ad3');
  await expect(page.getByTestId('acces-ferme')).toBeVisible();
  await expect(page.getByTestId('unit')).toHaveCount(0);
  await page.goto('/niveaux/en1');
  await expect(page.getByTestId('acces-ferme')).toBeVisible();
});

test('enfant : onglets Leçons, Lectures, Écriture seulement ; barre des enfants', async ({
  page,
}) => {
  await parentWith(page.request, 'Maryam', 8, 'en1');
  await pickProfile(page, 'Maryam');
  await page.goto('/');
  await expect(page.getByTestId('mon-niveau')).toHaveAttribute('data-niveau', 'en1');
  const names = await page
    .getByTestId('onglets-niveau')
    .locator('[data-onglet]')
    .evaluateAll((b) => b.map((x) => x.getAttribute('data-onglet')));
  expect(names).toEqual(['lecons', 'lectures', 'ecriture']);
  await expect(page.locator('nav.tabs a')).toHaveCount(5);
  await expect(page.locator('nav.tabs a[data-tab="ecriture"]')).toBeVisible();
});

test('test de positionnement : exercices des livres, niveau fixé (origine « positionnement »)', async ({
  page,
}) => {
  await newAdult(page, 'a27-pos');
  await page.goto('/');
  await expect(page.getByTestId('commencer')).toBeVisible();
  await page.getByTestId('lien-positionnement').click();
  await expect(page).toHaveURL(/\/positionnement\/arabe$/);
  await page.getByTestId('commencer-test').click();
  await expect(page.getByTestId('niveau-teste')).toHaveAttribute('data-niveau', 'ad1');
  await expect(page.locator('section.ex').first()).toBeVisible();
  // aucune réponse choisie : le premier niveau n'est pas réussi → c'est le niveau de départ
  await page.getByTestId('valider-test').click();
  await expect(page.getByTestId('resultat-test')).toBeVisible();
  await page.getByTestId('vers-niveau').click();
  await expect(page.getByTestId('mon-niveau')).toHaveAttribute('data-niveau', 'ad1');
  await expect(page.getByTestId('origine')).toBeVisible();
});

test('épreuve de passage : manquée, nouvel essai le lendemain', async ({ page }) => {
  await adultAt(page, 'a27-passage');
  await page.goto('/');
  await page.getByTestId('apercu-suivant').getByTestId('passer-epreuve').click();
  await expect(page).toHaveURL(/\/epreuve-passage\/arabe$/);
  await page.getByTestId('commencer-test').click();
  await expect(page.locator('section.ex').first()).toBeVisible();
  await page.getByTestId('valider-test').click();
  await expect(page.getByTestId('resultat-test')).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('epreuve-attendre')).toBeVisible();
  await expect(page.getByTestId('passer-epreuve')).toHaveCount(0);
});

test('« J’écris le Coran » n’apparaît qu’à partir de la leçon du premier verset (ad1 l19)', async ({
  page,
}) => {
  const pid = await adultAt(page, 'a27-coran');
  doneUntil(pid, 'ad1', 17);
  await page.goto('/?onglet=ecriture');
  await expect(page.getByTestId('mon-cahier')).toBeVisible();
  await expect(page.getByTestId('ecris-coran')).toHaveCount(0);
  // la fiche à imprimer d'une leçon
  await page.getByTestId('fiche').first().click();
  await expect(page.getByTestId('fiche-ecriture')).toBeVisible();
  // leçon 18 faite : la leçon 19 (premier verset recopié dans l'orthographe du Muṣḥaf) est atteinte
  doneUntil(pid, 'ad1', 18);
  await page.goto('/?onglet=ecriture');
  const coran = page.getByTestId('ecris-coran');
  await expect(coran).toBeVisible();
  await expect(coran.locator('[data-verset="1:2"]')).toBeVisible();
  // étape 1 : modèle Tanzil (octet pour octet), puis comparaison guidée mot par mot
  const tanzil = (
    (await (await page.request.get('/api/v1/quran/verses?s=1&from=2&to=2')).json()) as {
      verses: Array<{ text: string }>;
    }
  ).verses[0]!.text;
  await coran.locator('[data-verset="1:2"]').click();
  expect(tanwinUndo((await page.getByTestId('modele').textContent()) ?? '')).toBe(tanzil);
  await expect(page.locator('[data-etape="2"]')).toBeDisabled();
  await page.getByTestId('corriger').click();
  await expect(page.getByTestId('modele')).toHaveCount(0);
  const words = page.locator('[data-mot]');
  await expect(words).toHaveCount(tanzil.split(' ').length);
  await page.locator('[data-check="0:lettres"]').check();
  await page.getByTestId('terminer-etape').click();
  await expect(page.getByTestId('etape-faite')).toBeVisible();
  // étape 2 (dictée) ouverte après l'étape 1 de ce verset ; étape 3 : conditions affichées
  await expect(page.locator('[data-etape="2"]')).toBeEnabled();
  await expect(page.getByTestId('etape3-condition')).toBeVisible();
});

test('mots du Coran du niveau du livre (données des livres)', async ({ page }) => {
  test.skip(!existsSync(MOTS), 'fichier des mots du Coran des livres absent');
  execFileSync(
    process.execPath,
    ['../../packages/db/dist/cli/mots-coran.js', '--source', MOTS, '--test'],
    { stdio: 'ignore', env: process.env },
  );
  const pid = await adultAt(page, 'a27-mots');
  await page.goto('/?onglet=mots');
  await expect(page.getByTestId('couverture')).toContainText('%');
  const list = page.getByTestId('mots-du-coran').locator('[data-rang]');
  await expect(list.first()).toHaveAttribute('data-rang', '1');
  const api = (await (await page.request.get(`/api/v1/profiles/${pid}/mots-coran`)).json()) as {
    mots: Array<{ rang: number }>;
  };
  await expect(list).toHaveCount(api.mots.length);
  await page.getByTestId('jouer-mots').click();
  await page.locator('[data-sens]').first().click();
  await expect(page.getByTestId('jeu-mots').getByRole('status')).toBeVisible();
});

test('budget : les pages du personnel ne sont pas préchargées sur l’appareil de l’élève', async ({
  page,
}) => {
  const staff = (await (await page.request.get('/personnel.json')).json()) as {
    fichiers: string[];
  };
  expect(staff.fichiers.length).toBeGreaterThan(0);
  await page.goto('/');
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const out: string[] = [];
    for (const k of await caches.keys())
      if (k.startsWith('awform-shell'))
        for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached.some((p) => p.startsWith('/_app/immutable/'))).toBe(true);
  expect(cached.filter((p) => staff.fichiers.includes(p))).toEqual([]);
});

test('captures 375 px clair / sombre : enfant, ado, adulte', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'captures sur téléphone seulement');
  const dir = '../../reports/a27';
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const shoot = async (who: string, path: string) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // aucun défilement horizontal à 375 px
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      );
      await page.screenshot({
        path: `${dir}/${who}-${path === '/' ? 'arabe' : path.slice(1)}-${scheme}.png`,
        fullPage: true,
      });
    }
  };
  const pid = await adultAt(page, 'a27-captures');
  doneUntil(pid, 'ad1', 18);
  await shoot('adulte', '/aujourdhui');
  await shoot('adulte', '/');
  await page.goto('/?onglet=ecriture');
  await page.getByTestId('ecris-coran').locator('[data-verset="1:2"]').click();
  await page.getByTestId('corriger').click();
  await page.screenshot({ path: `${dir}/adulte-ecris-coran-light.png`, fullPage: true });
  await page.context().clearCookies();
  await parentWith(page.request, 'Yassine', 14, 'ado1');
  await pickProfile(page, 'Yassine');
  await shoot('ado', '/aujourdhui');
  await shoot('ado', '/');
  await page.context().clearCookies();
  await parentWith(page.request, 'Safiya', 8, 'en1');
  await pickProfile(page, 'Safiya');
  await shoot('enfant', '/aujourdhui');
  await shoot('enfant', '/');
});
