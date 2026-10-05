import type { APIRequestContext, Page } from '@playwright/test';
import { loginTeacher } from './enseignant';
import { expect, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Lot F2 « école, rôles, niveaux » (revue d'architecture E1, E2, E3, E4, E8), dans le navigateur :
 *  - l'école inscrit un élève papier, le convertit en profil (consentement papier), remet un code au parent qui
 *    rattache l'enfant à son compte (« Famille et responsables ») ;
 *  - deux parents : invitation du second parent, acceptation ;
 *  - un même e-mail parent ET enseignant ; ce compte supprimé → sa classe reste à l'école, sans titulaire ;
 *  - émancipation : le jeune reprend son profil dans son propre compte ;
 *  - niveaux par matière, passage de fin d'année, archives, API « mon parcours ».
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const uniq = (s: string) => `${s}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const YEAR = new Date().getUTCFullYear();

async function signupParent(
  req: APIRequestContext,
  label: string,
  country = 'SN',
): Promise<string> {
  const email = `${uniq(label)}@e2e.test`;
  const r = await req.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'parent',
      birthYear: 1984,
      email,
      password: password(),
      country,
      consents: country === 'SN' ? ['cgu', 'transfert_hors_pays'] : ['cgu'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return email;
}
async function newChild(req: APIRequestContext, pseudonym: string, age = 9): Promise<string> {
  const r = await req.post('/api/v1/profiles', {
    headers: H,
    data: {
      pseudonym,
      birthYear: YEAR - age,
      levelCode: 'en1',
      password: password(),
      consents: ['compte_suivi'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}
async function teacherSchool(
  page: Page,
): Promise<{ schoolId: string; classId: string; name: string }> {
  await loginTeacher(page);
  const name = uniq('F2 classe');
  const c = await page.request.post('/api/v1/teacher/classes', { headers: H, data: { name } });
  expect(c.status(), await c.text()).toBe(201);
  const classId = ((await c.json()) as { class: { id: string } }).class.id;
  await page.request.patch(`/api/v1/ecole/classes/${classId}`, {
    headers: H,
    data: { levelCode: 'en1' },
  });
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    ecoles: Array<{ id: string; roles: string[] }>;
  };
  const s = me.ecoles.find((e) => e.roles.includes('direction'))!;
  return { schoolId: s.id, classId, name };
}

test('école : élève papier → profil (consentement papier) → code → le parent rattache l’enfant', async ({
  page,
  browser,
}) => {
  const { classId, name } = await teacherSchool(page);
  const pupil = uniq('Awa');
  const p = await page.request.post(`/api/v1/ecole/classes/${classId}/pupils`, {
    headers: H,
    data: { displayName: pupil },
  });
  expect(p.status()).toBe(201);
  await page.goto('/enseignant/etablissement');
  await expect(page.getByTestId('etab-detail')).toBeVisible();
  await page.getByTestId(`etab-classe-${name}`).getByRole('button').first().click();
  await page.getByTestId(`etab-profil-${pupil}`).click();
  const form = page.getByTestId('etab-conversion');
  await form.getByLabel('Année de naissance').fill(String(YEAR - 9));
  await form.getByLabel('Référence du formulaire (facultatif)').fill('FORM-E2E');
  await page.getByTestId('etab-convertir').click();
  await expect(page.getByTestId('etab-message')).toContainText(
    'l’école en est responsable'.replace('’', "'"),
  );
  await page.getByTestId(`etab-code-${pupil}`).click();
  const code = (await page.getByTestId('etab-code').locator('strong').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  // le parent (autre appareil) saisit le code dans « Famille et responsables »
  const ctx = await browser.newContext();
  const pp = await ctx.newPage();
  await signupParent(pp.request, 'parent-ecole');
  await pp.goto('/famille');
  await pp.getByLabel('Code', { exact: true }).fill(code);
  await pp.getByLabel('Mot de passe').first().fill(password());
  await pp.getByTestId('fam-rattacher').click();
  await expect(pp.getByTestId('fam-message')).toContainText('titulaire');
  await expect(pp.getByTestId(`fam-profil-${pupil}`)).toContainText('École');
  await ctx.close();
});

test('deux parents : invitation du second parent, acceptation, les deux voient l’enfant', async ({
  page,
  browser,
}) => {
  await signupParent(page.request, 'papa');
  const kid = uniq('Sara');
  await newChild(page.request, kid);
  await page.goto('/famille');
  await page.getByTestId(`fam-second-${kid}`).click();
  await page.getByTestId(`fam-profil-${kid}`).getByLabel('Mot de passe').fill(password());
  await page.getByTestId('fam-confirmer').click();
  const code = (await page.getByTestId('fam-code').locator('strong').innerText()).trim();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await signupParent(p2.request, 'maman');
  await p2.goto('/famille');
  await p2.getByLabel('Code', { exact: true }).fill(code);
  await p2.getByLabel('Mot de passe').first().fill(password());
  await p2.getByTestId('fam-rattacher').click();
  await expect(p2.getByTestId('fam-message')).toContainText('avec l');
  await expect(p2.getByTestId(`fam-profil-${kid}`)).toBeVisible();
  await p2.goto('/profils');
  await expect(p2.getByTestId('profils')).toContainText(kid);
  await ctx.close();
});

test('un même e-mail parent ET enseignant ; ce compte supprimé → la classe reste à l’école', async ({
  page,
  browser,
}) => {
  const { schoolId } = await teacherSchool(page);
  const ctx = await browser.newContext();
  const pp = await ctx.newPage();
  const email = await signupParent(pp.request, 'parent-prof');
  await newChild(pp.request, uniq('Ilyas'));
  const add = await page.request.post(`/api/v1/ecole/ecoles/${schoolId}/membres`, {
    headers: H,
    data: { email, role: 'enseignant' },
  });
  expect(add.status(), await add.text()).toBe(201);
  // second facteur configuré par ce parent, puis espace enseignant
  const s = (await (
    await pp.request.post('/api/v1/auth/totp/setup', { headers: H, data: {} })
  ).json()) as {
    secret: string;
  };
  const ok = await pp.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(s.secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  const name = uniq('Classe du parent');
  const c = await pp.request.post('/api/v1/teacher/classes', { headers: H, data: { name } });
  expect(c.status(), await c.text()).toBe(201);
  const classId = ((await c.json()) as { class: { id: string } }).class.id;
  await pp.goto('/enseignant');
  await expect(pp.getByTestId(`espace-ecole-${name}`)).toBeVisible();
  await pp.goto('/profils');
  await expect(pp.getByTestId('profils').locator('button')).toHaveCount(1);
  // suppression du compte : la classe reste à l'école, sans titulaire, visible de la direction
  const del = await pp.request.post('/api/v1/account/delete', {
    headers: H,
    data: { password: password() },
  });
  expect(del.status(), await del.text()).toBe(200);
  await ctx.close();
  const d = (await (await page.request.get(`/api/v1/ecole/ecoles/${schoolId}`)).json()) as {
    classes: Array<{ id: string; teacherAccountId: string | null }>;
  };
  expect(d.classes.find((x) => x.id === classId)).toMatchObject({ teacherAccountId: null });
});

test('émancipation : le jeune reprend son profil dans son propre compte', async ({
  page,
  browser,
}) => {
  // France : reprise possible dès 15 ans (âge du consentement numérique ; Sénégal : 18 ans)
  await signupParent(page.request, 'parent-ado', 'FR');
  const ado = uniq('Yanis');
  const id = await newChild(page.request, ado, 17);
  await page.goto('/famille');
  await page.getByTestId(`fam-emancipation-${ado}`).click();
  await page.getByTestId(`fam-profil-${ado}`).getByLabel('Mot de passe').fill(password());
  await page.getByTestId('fam-confirmer').click();
  const code = (await page.getByTestId('fam-code').locator('strong').innerText()).trim();

  const ctx = await browser.newContext();
  const y = await ctx.newPage();
  const su = await y.request.post('/api/v1/auth/signup', {
    headers: H,
    data: {
      kind: 'adulte',
      email: `${uniq('yanis')}@e2e.test`,
      password: password(),
      country: 'FR',
      consents: ['cgu'],
      birthYear: YEAR - 17,
      pseudonym: 'Moi',
    },
  });
  expect(su.status(), await su.text()).toBe(201);
  await y.goto('/famille');
  await y.getByLabel('Code', { exact: true }).fill(code);
  await y.getByTestId('fam-reprendre').click();
  await expect(y.getByTestId('fam-message')).toContainText('historique');
  const me = (await (await y.request.get('/api/v1/auth/me')).json()) as {
    profiles: Array<{ id: string }>;
  };
  expect(me.profiles.map((p) => p.id)).toEqual([id]);
  await ctx.close();
});

test('niveaux par matière, passage de fin d’année, archives des notes, « mon parcours »', async ({
  page,
}) => {
  const { schoolId, classId } = await teacherSchool(page);
  // une famille inscrit son enfant dans la classe (code de classe)
  const join = (await (await page.request.get('/api/v1/teacher/classes')).json()) as {
    classes: Array<{ id: string; joinCode: string }>;
  };
  const code = join.classes.find((x) => x.id === classId)!.joinCode;
  const famPage = await page.context().browser()!.newPage();
  await signupParent(famPage.request, 'parent-niveaux');
  await famPage.request.post('/api/v1/account/pin', {
    headers: H,
    data: { pin: '2468', password: password() },
  });
  const kid = await newChild(famPage.request, uniq('Bilal'));
  const j = await famPage.request.post(`/api/v1/profiles/${kid}/classes`, {
    headers: { ...H, 'x-parent-pin': '2468' },
    data: { code, consent: true },
  });
  expect(j.status(), await j.text()).toBe(201);
  // niveaux par matière
  const s = await famPage.request.put(`/api/v1/profiles/${kid}/niveaux`, {
    headers: H,
    data: { levelCode: 're1', source: 'positionnement', score: 0.7 },
  });
  expect(s.status(), await s.text()).toBe(200);
  const n = (await (await famPage.request.get(`/api/v1/profiles/${kid}/niveaux`)).json()) as {
    courants: Array<{ subject: string; levelCode: string }>;
  };
  expect(n.courants.map((x) => `${x.subject}:${x.levelCode}`).sort()).toEqual([
    'arabe:en1',
    'sciences:re1',
  ]);
  // mon parcours
  const parcours = (await (
    await famPage.request.get(`/api/v1/profiles/${kid}/parcours`)
  ).json()) as {
    matieres: Array<{
      matiere: string;
      courant: { code: string; prochaineLecon: { id: string } | null } | null;
      suivant: { code: string } | null;
    }>;
  };
  const arabe = parcours.matieres.find((m) => m.matiere === 'arabe')!;
  expect(arabe.courant?.code).toBe('en1');
  expect(arabe.courant?.prochaineLecon?.id).toMatch(/^en1\.l\d{2}$/);
  // élève papier avec une note, qui part : la note reste aux archives
  const pp = await page.request.post(`/api/v1/ecole/classes/${classId}/pupils`, {
    headers: H,
    data: { displayName: uniq('Khady') },
  });
  const pid = ((await pp.json()) as { pupil: { id: string } }).pupil.id;
  await page.request.put(`/api/v1/ecole/pupils/${pid}/resultats`, {
    headers: H,
    data: {
      levelCode: 'en1',
      day: `${YEAR}-06-01`,
      items: [{ item: 'examen', score: 14, max: 20 }],
    },
  });
  expect((await page.request.delete(`/api/v1/ecole/pupils/${pid}`, { headers: H })).status()).toBe(
    200,
  );
  const arch = (await (
    await page.request.get(`/api/v1/ecole/classes/${classId}/archives`)
  ).json()) as {
    eleves: Array<{ id: string; notes: unknown[] }>;
  };
  expect(arch.eleves.find((e) => e.id === pid)?.notes).toHaveLength(1);
  void schoolId;
  // passage de fin d'année dans une ÉCOLE PROPRE au test (la clôture archive toutes les classes de l'année)
  const sc = await page.request.post('/api/v1/ecole/ecoles', {
    headers: H,
    data: { name: uniq('École F2') },
  });
  expect(sc.status(), await sc.text()).toBe(201);
  const sid = ((await sc.json()) as { ecole: { id: string } }).ecole.id;
  const k = await page.request.post('/api/v1/teacher/classes', {
    headers: H,
    data: { name: uniq('Niveau 1'), schoolId: sid },
  });
  const kid2 = ((await k.json()) as { class: { id: string } }).class.id;
  await page.request.patch(`/api/v1/ecole/classes/${kid2}`, {
    headers: H,
    data: { levelCode: 'en1' },
  });
  const pa = await page.request.post(`/api/v1/ecole/classes/${kid2}/pupils`, {
    headers: H,
    data: { displayName: uniq('Fatou') },
  });
  const pupil2 = ((await pa.json()) as { pupil: { id: string } }).pupil.id;
  await page.request.post(`/api/v1/ecole/pupils/${pupil2}/profil`, {
    headers: H,
    data: { birthYear: YEAR - 8, consent: { date: `${YEAR - 1}-09-20`, signataire: 'parent' } },
  });
  const det = (await (await page.request.get(`/api/v1/ecole/ecoles/${sid}`)).json()) as {
    annees: Array<{ id: string; status: string }>;
  };
  const year = det.annees.find((a) => a.status === 'en_cours')!;
  const clo = await page.request.post(`/api/v1/ecole/annees/${year.id}/cloture`, {
    headers: H,
    data: { decisions: [{ pupilId: pupil2, outcome: 'admis' }] },
  });
  expect(clo.status(), await clo.text()).toBe(200);
  expect(await clo.json()).toMatchObject({ admis: 1, classes: 1 });
  const after = (await (await page.request.get(`/api/v1/ecole/ecoles/${sid}`)).json()) as {
    classes: Array<{ id: string; status: string }>;
    annees: Array<{ status: string }>;
  };
  expect(after.classes.find((x) => x.id === kid2)?.status).toBe('archivee');
  expect(after.annees.map((a) => a.status).sort()).toEqual(['cloturee', 'en_cours']);
  await famPage.close();
});
