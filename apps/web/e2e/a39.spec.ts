import { execFileSync } from 'node:child_process';
import type { APIRequestContext, Page } from '@playwright/test';
import { loginTeacher } from './enseignant';
import { expect, password, test } from './fixtures';
import { pickProfile } from './profil';

/**
 * Chantier A39 « MODE SEREIN » dans le navigateur (édition e2e) :
 *  - adulte : « Mode serein » choisi à l'inscription, visible dans le compte ; le niveau suivant s'ouvre quand
 *    les leçons sont faites (récapitulatif, sans épreuve) ; épreuve facultative, sans note chiffrée, et aucun
 *    certificat sans épreuve réussie ;
 *  - enfant : « vérification douce » par défaut (petit défi de révision) ; garde-fou : notions fragiles
 *    recommandées (« Revoir d'abord » / « Continuer quand même ») ; suivi discret du parent ; le parent choisit
 *    le mode dans « Famille » ;
 *  - enfant en classe : l'enseignant décide pour la classe (le choix du parent vaut hors classe).
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const YEAR = new Date().getUTCFullYear();
const uniq = (s: string) => `${s}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sql = (q: string) =>
  execFileSync('psql', [process.env.TEST_DATABASE_URL!, '-Atqc', q], { encoding: 'utf8' });

/** Toutes les leçons d'un niveau « terminées » (comme si l'élève les avait faites). */
const allDone = (profileId: string, level: string) =>
  sql(
    `INSERT INTO progress (profile_id, unit_id, status) SELECT '${profileId}', u.id, 'terminee' FROM unit u
     WHERE u.level_code = '${level}' AND u.kind <> 'examen' ON CONFLICT DO NOTHING`,
  );

/** Deux réponses fausses, jamais refaites justes, dans la première leçon notée du niveau. */
function twoMistakes(profileId: string, level: string): string {
  const unit = sql(
    `SELECT e.unit_id FROM exercise e JOIN unit u ON u.id = e.unit_id
     WHERE u.level_code = '${level}' AND u.kind = 'lecon' ORDER BY u.n, e.position LIMIT 1`,
  ).trim();
  sql(
    `INSERT INTO attempt (id, profile_id, edition_id, unit_id, exercise_id, item_index, event_type, correct, total, device_at)
     SELECT gen_random_uuid(), '${profileId}', (SELECT id FROM edition WHERE status = 'publiee' LIMIT 1),
            e.unit_id, e.id, i, 'reponse', 0, 1, now()
     FROM (SELECT id, unit_id FROM exercise WHERE unit_id = '${unit}' ORDER BY position LIMIT 1) e,
          generate_series(0, 1) i`,
  );
  return unit;
}

async function parentWith(req: APIRequestContext, pseudonym: string, age: number) {
  const s = await req.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      birthYear: 1984,
      email: `${uniq('a39')}@e2e.test`,
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
      levelCode: 'en1',
      password: password(),
      consents: ['compte_suivi'],
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  return ((await p.json()) as { id: string }).id;
}

async function signupSerein(page: Page): Promise<string> {
  await page.goto('/inscription');
  await page.getByTestId('type-adulte').check();
  await page.locator('#email').fill(`${uniq('a39-serein')}@e2e.test`);
  await page.locator('#password').fill(password());
  await page.locator('#birthYear').fill('1988');
  const choix = page.getByTestId('mode-inscription');
  await expect(choix).toContainText('Mode serein');
  await choix.locator('[data-mode-choix="serein"]').check();
  await page.getByTestId('consent-cgu').check();
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/inscription/);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  return me.profiles[0]!.id;
}

test('adulte en mode serein : niveau suivant après les leçons, sans épreuve ; épreuve facultative', async ({
  page,
}) => {
  const pid = await signupSerein(page);
  await page.goto('/compte');
  await expect(page.getByTestId('mode-profil')).toHaveAttribute('data-mode', 'serein');
  const c = await page.request.post(`/api/v1/profiles/${pid}/commencer/arabe`, {
    headers: H,
    data: {},
  });
  expect(c.status(), await c.text()).toBe(201);
  await page.goto('/');
  const ap = page.getByTestId('apercu-suivant');
  await expect(ap.getByTestId('epreuve-facultative')).toContainText('facultative');
  await expect(ap.getByTestId('passer-epreuve')).toHaveCount(0);
  // leçons pas encore faites : rien à ouvrir
  await expect(ap.getByTestId('ouvrir-suivant')).toHaveCount(0);
  allDone(pid, 'ad1');
  await page.reload();
  await expect(page.getByTestId('encouragement')).toBeVisible();
  await page.getByTestId('ouvrir-suivant').click();
  const recap = page.getByTestId('recapitulatif');
  await expect(recap).toBeVisible();
  await expect(recap).toHaveAttribute('data-fragiles', '0');
  await recap.getByTestId('continuer-quand-meme').click();
  await expect(page.getByTestId('mon-niveau')).toHaveAttribute('data-niveau', 'ad2');
  await expect(page.getByTestId('origine')).toContainText('mode serein');
  // aucune épreuve passée : aucun certificat possible pour ad1
  const s = (await (await page.request.get(`/api/v1/profiles/${pid}/espace/arabe`)).json()) as {
    epreuvesReussies: string[];
  };
  expect(s.epreuvesReussies).toEqual([]);
  // épreuve facultative : sans note chiffrée (étoiles), et pas de certificat sans réussite
  await page.goto('/epreuve-passage/arabe');
  await expect(page.getByTestId('test-intro')).toContainText('facultative');
  await page.getByTestId('commencer-test').click();
  await expect(page.locator('section.ex').first()).toBeVisible();
  await page.getByTestId('valider-test').click();
  const res = page.getByTestId('resultat-test');
  await expect(res).toBeVisible();
  await expect(res.getByTestId('etoiles')).toHaveAttribute('data-n', '1');
  await expect(res.getByTestId('certificat-possible')).toHaveCount(0);
});

test('enfant : défi doux par défaut, garde-fou de révision, suivi du parent, choix du parent', async ({
  page,
}) => {
  const kid = await parentWith(page.request, 'Lina', 8);
  allDone(kid, 'en1');
  const unit = twoMistakes(kid, 'en1');
  await pickProfile(page, 'Lina');
  await page.goto('/');
  const go = page.getByTestId('apercu-suivant').getByTestId('passer-epreuve');
  await expect(go).toContainText('Petit défi de révision');
  await go.click();
  const recap = page.getByTestId('recapitulatif');
  await expect(recap.getByTestId('notion-fragile').first()).toBeVisible();
  await expect(recap.getByTestId('revoir-dabord')).toHaveAttribute('href', `/lecons/${unit}`);
  await recap.getByTestId('continuer-quand-meme').click();
  await expect(page).toHaveURL(/\/epreuve-passage\/arabe$/);
  await expect(page.locator('h1')).toContainText('Petit défi de révision');
  // le parent voit discrètement les notions fragiles dans son suivi
  await page.goto('/suivi');
  await expect(page.getByTestId('notions-fragiles')).toBeVisible();
  // le parent choisit la façon d'avancer de son enfant
  await page.goto('/famille');
  const mode = page.getByTestId('fam-profil-Lina').getByTestId('mode-profil');
  await expect(mode).toHaveAttribute('data-mode', 'douce');
  await mode.locator('[data-mode-choix="serein"]').check();
  await mode.getByTestId('mode-enregistrer').click();
  await expect(mode.locator('[role="status"]')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('fam-profil-Lina').getByTestId('mode-profil')).toHaveAttribute(
    'data-mode',
    'serein',
  );
});

test('enfant en classe : l’enseignant décide pour la classe', async ({ page, browser }) => {
  const kid = await parentWith(page.request, 'Omar', 9);
  await page.request.put(`/api/v1/profiles/${kid}/mode-evaluation`, {
    headers: H,
    data: { mode: 'serein' },
  });
  const tp = await browser.newPage();
  await loginTeacher(tp);
  const c = await tp.request.post('/api/v1/teacher/classes', {
    headers: H,
    data: { name: uniq('Classe A39') },
  });
  expect(c.status(), await c.text()).toBeLessThan(300);
  const cls = ((await c.json()) as { class: { id: string; joinCode: string } }).class;
  const j = await page.request.post(`/api/v1/profiles/${kid}/classes`, {
    headers: H,
    data: { code: cls.joinCode, consent: true },
  });
  expect(j.status(), await j.text()).toBeLessThan(300);
  await tp.goto(`/enseignant/classe/${cls.id}`);
  const box = tp.getByTestId('mode-classe');
  await expect(box).toBeVisible();
  await box.getByTestId('mode-classe-choix').selectOption('verification');
  await box.getByTestId('mode-classe-enregistrer').click();
  await expect(box.locator('[role="status"]')).toBeVisible();
  await tp.close();
  // côté famille : décision de l'enseignant affichée, le choix du parent vaut hors classe
  await page.goto('/famille');
  const m = page.getByTestId('fam-profil-Omar').getByTestId('mode-profil');
  await expect(m).toHaveAttribute('data-mode', 'verification');
  await expect(m.getByTestId('mode-par-classe')).toBeVisible();
  await pickProfile(page, 'Omar');
  await page.goto('/');
  await expect(page.getByTestId('apercu-suivant').getByTestId('passer-epreuve')).toContainText(
    /Passer l.épreuve/,
  );
});
