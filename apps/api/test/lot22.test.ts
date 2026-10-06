/**
 * Lot 22 (V1-c) — carnet de pratique signé par le parent (code vérifié par le serveur) et suivi des sourates.
 * Contenu : copie du contenu synthétique avec un exercice `carnet` et une liste `sourates` (numéros seulement,
 * aucun texte religieux).
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookSuras, carnetShape, validWeek } from '../src/carnet.js';
import { mondayOf } from '../src/today.js';
import { SYNTH_DIR } from './content.js';
import {
  adult,
  child,
  PW,
  join,
  newClass,
  parent,
  setupEdition,
  teacher,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe('lot 22 — fonctions pures', () => {
  it('carnetShape : lignes du livre, 7 jours par défaut, formes tolérées', () => {
    expect(carnetShape({ lignes: [{ ar: 'أ', fr: 'a' }, 'b'] })).toEqual({
      jours: 7,
      lignes: [
        { ar: 'أ', fr: 'a' },
        { ar: '', fr: 'b' },
      ],
    });
    expect(carnetShape({ jours: 5, lignes: [] }).jours).toBe(5);
    expect(carnetShape({ jours: 12 }).jours).toBe(7);
    expect(carnetShape(null).lignes).toEqual([]);
  });
  it('bookSuras : numéros 1-114 seulement, sans doublon, objets tolérés', () => {
    expect(bookSuras({ sourates: [1, '112', { num: 113 }, { n: 114 }, 999, 0, 1, 'x'] })).toEqual([
      1, 112, 113, 114,
    ]);
    expect(bookSuras({})).toEqual([]);
  });
  it('validWeek : un lundi, pas dans le futur', () => {
    const now = Date.parse('2026-09-30T12:00:00Z'); // mercredi
    expect(validWeek('2026-09-28', now)).toBe(true);
    expect(validWeek('2026-09-29', now)).toBe(false); // mardi
    expect(validWeek('2026-10-05', now)).toBe(false); // semaine prochaine
    expect(validWeek('2026-02-30', now)).toBe(false);
  });
});

describe.skipIf(!URL_)('lot 22 — carnet de pratique et sourates', () => {
  let c: Ctx;
  let dir: string;
  const week = mondayOf(new Date().toISOString().slice(0, 10));

  beforeAll(async () => {
    dir = mkdtempSync(pjoin(tmpdir(), 'awform-lot22-'));
    cpSync(SYNTH_DIR, dir, { recursive: true, filter: (s) => !s.endsWith('/coran') });
    symlinkSync(realpathSync(pjoin(SYNTH_DIR, 'coran')), pjoin(dir, 'coran'));
    const book = pjoin(dir, 'data/en1/book.js');
    writeFileSync(
      book,
      readFileSync(book, 'utf8').replace(
        '"code": "en1",',
        '"code": "en1",\n "sourates": [1, 112, {"num": 113}],',
      ),
    );
    const l02 = pjoin(dir, 'data/en1/l02.js');
    const carnet = {
      type: 'carnet',
      consigne_fr: 'Je coche chaque jour.',
      jours: 7,
      lignes: [{ fr: 'Je range mes affaires.' }, { fr: 'J’aide à la maison.' }],
    };
    writeFileSync(
      l02,
      readFileSync(l02, 'utf8').replace(
        '"exercices": [',
        `"exercices": [\n${JSON.stringify(carnet)},`,
      ),
    );
    c = await setupEdition(URL_!, {}, dir);
  }, 60_000);
  afterAll(async () => {
    await c?.app.close();
    await c?.h.pool.end();
  });

  let P: Record<string, string>;
  let pin: Record<string, string>;
  let kid: string;
  let exo: string;

  it('le carnet reprend les lignes du livre ; l’enfant coche et décoche', async () => {
    ({ P, pin } = await parent(c, 'p22@test.fr'));
    kid = await child(c, P, 'Nour');
    const r = await c.req('GET', `/api/v1/profiles/${kid}/carnet?unit=en1.l02&week=${week}`, P);
    expect(r.statusCode).toBe(200);
    const [cn] = r.json().carnets;
    expect(cn.lignes.map((l: { fr: string }) => l.fr)).toEqual([
      'Je range mes affaires.',
      'J’aide à la maison.',
    ]);
    expect(cn.jours).toBe(7);
    exo = cn.id;
    const put = (b: object) =>
      c.req('PUT', `/api/v1/profiles/${kid}/carnet/${exo}`, P, { week, ...b });
    expect((await put({ line: 0, day: 0, checked: true })).json().cases).toEqual([[0, 0]]);
    await put({ line: 1, day: 3, checked: true });
    expect((await put({ line: 0, day: 0, checked: false })).json().cases).toEqual([[1, 3]]);
    // hors du livre : ligne inexistante ; semaine invalide ; autre famille
    expect((await put({ line: 5, day: 0, checked: true })).json().error.code).toBe(
      'case_hors_carnet',
    );
    const bad = await c.req('PUT', `/api/v1/profiles/${kid}/carnet/${exo}`, P, {
      week: '2026-09-29',
      line: 0,
      day: 0,
      checked: true,
    });
    expect(bad.json().error.code).toBe('semaine_invalide');
    const other = await parent(c, 'p22b@test.fr');
    const o = await c.req('PUT', `/api/v1/profiles/${kid}/carnet/${exo}`, other.P, {
      week,
      line: 0,
      day: 0,
      checked: true,
    });
    expect(o.statusCode).toBe(404);
    // un exercice qui n'est pas un carnet
    const notCarnet = await c.req('PUT', `/api/v1/profiles/${kid}/carnet/en1.l01.ex1`, P, {
      week,
      line: 0,
      day: 0,
      checked: true,
    });
    expect(notCarnet.statusCode).toBe(404);
  });

  it('signature : code parent vérifié par le serveur, puis semaine close', async () => {
    const sign = (h: Record<string, string>) =>
      c.req('POST', `/api/v1/profiles/${kid}/carnet/${exo}/signer`, h, { week });
    expect((await sign(P)).json().error.code).toBe('code_parent_incorrect');
    expect((await sign({ ...P, 'x-parent-pin': '0000' })).json().error.code).toBe(
      'code_parent_incorrect',
    );
    const ok = await sign(pin);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().signe).toBeTruthy();
    expect((await sign(pin)).json().error.code).toBe('deja_signe');
    const after = await c.req('PUT', `/api/v1/profiles/${kid}/carnet/${exo}`, P, {
      week,
      line: 0,
      day: 1,
      checked: true,
    });
    expect(after.json().error.code).toBe('semaine_signee');
    // journal d'audit, export RGPD
    const exp = (await c.req('GET', '/api/v1/account/export', P)).json();
    expect(exp.carnetDePratique.length).toBeGreaterThanOrEqual(2);
  });

  it('signature : parent sans code parent → à définir ; adulte → refusé', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1985,
        email: 'p22c@test.fr',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    );
    expect(su.statusCode).toBe(201);
    const Q = { cookie: String(su.headers['set-cookie']).split(';')[0]! };
    const k2 = await child(c, Q, 'Sami');
    const r0 = await c.req('POST', `/api/v1/profiles/${k2}/carnet/${exo}/signer`, Q, { week });
    expect(r0.json().error.code).toBe('code_parent_a_definir');
    const a = await adult(c, 'a22@test.fr');
    const r = await c.req('POST', `/api/v1/profiles/${a.profileId}/carnet/${exo}/signer`, a.A, {
      week,
    });
    expect(r.json().error.code).toBe('signature_parent_seulement');
  });

  it('suivi des sourates : liste du livre, étapes de la famille, validation par l’enseignant seulement', async () => {
    const list = await c.req('GET', `/api/v1/profiles/${kid}/sourates`, P);
    expect(list.json().sourates.map((s: { sura: number }) => s.sura)).toEqual([1, 112, 113]);
    const set = (sura: number, etape: string) =>
      c.req('PUT', `/api/v1/profiles/${kid}/sourates/${sura}`, P, { etape });
    expect((await set(112, 'repete')).statusCode).toBe(200);
    expect((await set(2, 'ecoute')).json().error.code).toBe('sourate_hors_livre');
    expect((await set(112, 'valide')).statusCode).toBe(400); // réservé à l'enseignant
    const T = await teacher(c, 't22@test.fr');
    const cls = await newClass(c, T, 'Classe 22');
    // élève hors de la classe : refus
    const out = await c.req(
      'POST',
      `/api/v1/ecole/classes/${cls.id}/eleves/${kid}/sourates/112/valider`,
      T,
    );
    expect(out.json().error.code).toBe('eleve_hors_classe');
    await join(c, P, kid, cls);
    const v = await c.req(
      'POST',
      `/api/v1/ecole/classes/${cls.id}/eleves/${kid}/sourates/112/valider`,
      T,
    );
    expect(v.statusCode).toBe(200);
    expect((await set(112, 'ecoute')).json().error.code).toBe('deja_validee');
    const view = await c.req('GET', `/api/v1/ecole/classes/${cls.id}/sourates`, T);
    const e = view.json().eleves[0];
    expect(e.suivi.find((s: { sura: number }) => s.sura === 112).etape).toBe('valide');
    // une famille ne voit pas la classe
    expect((await c.req('GET', `/api/v1/ecole/classes/${cls.id}/sourates`, P)).statusCode).toBe(
      403,
    );
  });
});
