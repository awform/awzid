import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { loginTeacher } from './enseignant';

/**
 * Madjaliss, lot 5 (écart n° 3 du contrôle pré-bêta du 13/10/2026) : les contenus en PUBLICATION DIFFÉRÉE et les notes
 * de l'enseignant ne sont plus des fichiers statiques publics. Servis par `/mutun/[fichier]` seulement après
 * authentification, avec le droit adapté :
 *  - visiteur sans session : 401 ; invité de la bêta (compte ordinaire) : 403 — AUCUN octet du contenu, même par
 *    adresse directe ; l'interface d'un invité ne les demande jamais ;
 *  - compte de démonstration : séances différées d'Ibn ʿĀshir et Risāla (200), pas les notes de l'enseignant (403) ;
 *  - personnel : tout (200).
 */
test.use({ compte: null });

const H = { 'x-awform': '1' };
const racine = fileURLToPath(new URL('..', import.meta.url));
const gardes = join(racine, 'src', 'lib', 'server', 'mutun');
const FICHIERS = readdirSync(gardes).filter((f) => f.endsWith('.json'));
const NOTES = FICHIERS.filter((f) => f.endsWith('-enseignant.json'));
const DIFFERES = FICHIERS.filter((f) => !f.endsWith('-enseignant.json'));
const lire = (f: string) => readFileSync(join(gardes, f), 'utf8');
// contenus qui ne doivent JAMAIS atteindre un invité : séances de croyance d'Ibn ʿĀshir, phrases de la Risāla, consigne du référent
const SECRETS = [
  'IBA-S02',
  'IBA-S10',
  'RIS-0001',
  'RIS-S001',
  'consigne_differe',
  'croyance (IBA-S02',
];

/** Compte de démonstration (<rôle>-<tag>@demo.awform.test) : voit aussi les séances en publication différée. */
async function compteDemo(page: Page) {
  const email = `acc-demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}@demo.awform.test`;
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

test('le dossier gardé contient bien ce qu’on attend (13 notes, compléments d’Ibn ʿĀshir et de la Lāmiyya, 11 parties de la Risāla)', () => {
  expect(NOTES.length).toBeGreaterThanOrEqual(12);
  expect(DIFFERES).toContain('ibn-ashir-differe.json');
  // lot 6 : les trois vers non confirmés de la Lāmiyya sont dans un complément gardé
  expect(DIFFERES).toContain('lamiyya-differe.json');
  expect(DIFFERES.filter((f) => /^risala-p\d+\.json$/.test(f))).toHaveLength(11);
});

test('visiteur sans session : 401 sur TOUT fichier gardé, aucun octet du contenu', async ({
  request,
}) => {
  for (const f of FICHIERS) {
    const r = await request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(401);
    const t = await r.text();
    for (const s of SECRETS) expect(t.includes(s), `${f} : ${s}`).toBe(false);
    expect(t.length, f).toBeLessThan(200);
    expect(r.headers()['cache-control'], f).toContain('no-store');
  }
});

test('visiteur sans session : variantes d’adresse, casse, chemins — jamais le contenu', async ({
  request,
}) => {
  const essais = [
    '/mutun/ibn-ashir-differe.json?x=1',
    '/mutun/ibn-ashir-differe.json#a',
    '/mutun//ibn-ashir-differe.json',
    '/mutun/IBN-ASHIR-DIFFERE.JSON',
    '/mutun/ibn-ashir-differe.json/',
    '/mutun/%69bn-ashir-differe.json',
    '/mutun/..%2fmutun%2fibn-ashir-differe.json',
    '/mutun/risala-p1.json.map',
    '/mutun/risala-p1.json%00.json',
    '/static/mutun/ibn-ashir-differe.json',
    '/src/lib/server/mutun/ibn-ashir-differe.json',
    '/src/lib/server/mutun/risala-p1.json',
    '/mutun-differe/ibn-ashir.json',
    '/mutun/ibn-ashir-enseignant.json.gz',
    '/mutun/inconnu-differe.json',
  ];
  for (const u of essais) {
    const r = await request.get(u, { maxRedirects: 0 });
    const t = await r.text();
    expect(r.status(), u).not.toBe(200);
    for (const s of SECRETS) expect(t.includes(s), `${u} : ${s}`).toBe(false);
  }
});

test('fichiers publics : ni séance différée d’Ibn ʿĀshir, ni phrase de la Risāla, ni vers masqué de la Lāmiyya', async ({
  request,
}) => {
  const ia = await (await request.get('/mutun/ibn-ashir.json')).text();
  expect(ia).toContain('IBA-S11');
  expect(ia).toContain('IBA-S01');
  for (const n of ['02', '03', '04', '05', '06', '07', '08', '09', '10'])
    expect(ia.includes(`IBA-S${n}`), `IBA-S${n}`).toBe(false);
  const d = JSON.parse(lire('ibn-ashir-differe.json')) as { phrases: Array<{ id: string }> };
  for (const p of d.phrases) expect(ia.includes(`"${p.id}"`), p.id).toBe(false);

  const ri = await request.get('/mutun/risala.json');
  expect(ri.status()).toBe(200);
  const rj = (await ri.json()) as { phrases: unknown[]; seances: unknown[] };
  expect(rj.phrases).toEqual([]);
  expect(rj.seances).toHaveLength(265);
  // lot 6 : les 72 séances ouvertes (15/10) ont leurs phrases dans des parties publiques ; aucune séance différée n'y est
  expect((rj.seances as Array<{ differe?: true }>).filter((s) => !s.differe)).toHaveLength(72);

  const la = await (await request.get('/mutun/lamiyya.json')).text();
  const lm = JSON.parse(la) as { phrases: Array<{ id: string; masque?: true; h?: string[] }> };
  const src = JSON.parse(
    readFileSync(
      join(
        racine,
        '..',
        '..',
        'packages',
        'content',
        'madjaliss-source',
        'lamiyya',
        'texte_ar.json',
      ),
      'utf8',
    ),
  ) as { vers: Array<{ id: string; hemistiches: string[] }> };
  for (const id of ['LAM-0045', 'LAM-0068', 'LAM-0096']) {
    expect(lm.phrases.find((p) => p.id === id)).toEqual({ id, t: 'vers', masque: true });
    for (const h of src.vers.find((v) => v.id === id)!.hemistiches)
      expect(la.includes(h), id).toBe(false);
  }
});

test('invité de la bêta : 403 sur tout fichier gardé ; l’interface n’en demande aucun', async ({
  page,
}) => {
  await newAdult(page, 'acc-invite');
  for (const f of FICHIERS) {
    const r = await page.request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(403);
    const t = await r.text();
    for (const s of SECRETS) expect(t.includes(s), `${f} : ${s}`).toBe(false);
    expect(t.length, f).toBeLessThan(200);
  }
  const vus: string[] = [];
  page.on('request', (r) => vus.push(new URL(r.url()).pathname));
  for (const u of [
    '/madjaliss',
    '/madjaliss/ibn-ashir',
    '/madjaliss/ibn-ashir/2',
    '/madjaliss/ibn-ashir/11',
    '/madjaliss/risala',
    '/madjaliss/risala/1',
  ]) {
    await page.goto(u);
    await page.waitForLoadState('networkidle');
  }
  const gardesVus = vus.filter((p) => /^\/mutun\/.+(-differe|-p\d+|-enseignant)\.json$/.test(p));
  expect(gardesVus).toEqual([]);
  // l'invité voit pourtant les séances ouvertes d'Ibn ʿĀshir (49) : elles viennent du fichier public
  await page.goto('/madjaliss/ibn-ashir');
  await expect(page.locator('[data-testid="mj-sommaire"] li')).toHaveCount(49);
});

test('compte de démonstration : séances différées et Risāla (200), notes de l’enseignant (403)', async ({
  page,
}) => {
  await compteDemo(page);
  for (const f of DIFFERES) {
    const r = await page.request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(200);
    expect(r.headers()['content-type'], f).toContain('application/json');
    expect(r.headers()['cache-control'], f).toContain('no-store');
    expect(await r.text(), f).toBe(lire(f));
  }
  for (const f of NOTES) expect((await page.request.get(`/mutun/${f}`)).status(), f).toBe(403);
  // l'interface les demande et affiche les neuf séances de croyance
  const vus: string[] = [];
  page.on('request', (r) => vus.push(new URL(r.url()).pathname));
  await page.goto('/madjaliss/ibn-ashir');
  await expect(page.locator('li[data-seance="2"] [data-testid="mj-differe"]')).toBeVisible();
  expect(vus).toContain('/mutun/ibn-ashir-differe.json');
  await page.goto('/madjaliss/ibn-ashir/2');
  await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
});

test('personnel : tout (200), notes de l’enseignant comprises', async ({ page }) => {
  await loginTeacher(page);
  for (const f of FICHIERS) {
    const r = await page.request.get(`/mutun/${f}`);
    expect(r.status(), f).toBe(200);
    expect(await r.text(), f).toBe(lire(f));
  }
  const j = (await (await page.request.get('/mutun/risala-enseignant.json')).json()) as {
    differe: number[];
    consigne_differe: string;
  };
  expect(j.differe).toHaveLength(193);
  expect(j.consigne_differe).toContain('masquées aux invités de la bêta');
  const ia = (await (await page.request.get('/mutun/ibn-ashir-enseignant.json')).json()) as {
    publication: string;
  };
  expect(ia.publication).toMatch(/croyance \(IBA-S02 à S10\)/);
});

test('session terminée : le droit disparaît avec elle (déconnexion = 401)', async ({ page }) => {
  await compteDemo(page);
  expect((await page.request.get('/mutun/ibn-ashir-differe.json')).status()).toBe(200);
  const out = await page.request.post('/api/v1/auth/logout', { headers: H });
  expect(out.status()).toBeLessThan(300);
  expect((await page.request.get('/mutun/ibn-ashir-differe.json')).status()).toBe(401);
});
