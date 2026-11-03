/**
 * « Famille de mots » (interrupteur `racines_coran`) — routes `GET /api/v1/racines/index` et `/familles/:id` :
 *  - fichiers livrés : 283 familles, octets de l'arabe intacts (aucune normalisation), pas de translittération dans les textes de l'élève ;
 *  - 401 sans connexion, 403 « fonction_coupee » tant que l'interrupteur est coupé ;
 *  - adulte : l'index complet et la famille entière ; enfant : seulement les familles marquées enfant, 2 ou 3 mots, sans moule ; 404 sinon.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setFlagState } from '@awform/db';
import { pourEnfant, racinesDir, type FamilleRacine } from '../src/racines.js';
import { adult, child, parent, setup, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;
const lire = (nom: string) => JSON.parse(readFileSync(join(racinesDir(), `${nom}.json`), 'utf8'));

describe('fichiers livrés', () => {
  const fichiers = readdirSync(racinesDir()).filter((f) => /^\d{3}\.json$/.test(f));
  it('283 familles ; la première est ع ل م avec ses mots, l’arabe tel quel', () => {
    expect(fichiers.length).toBe(283);
    const f = lire('001') as FamilleRacine & { r: string };
    expect(f.r).toBe('ع ل م');
    expect(f.k).toEqual([70, 29, 112]);
    const m = f.mots.find((x) => x.n === 29) as unknown as {
      f: string;
      x: { t: string; r: string; i: number; l: number };
    };
    expect(m.f).toBe('عَلِمَ');
    expect(m.x.t.slice(m.x.i, m.x.i + m.x.l)).toBe('سَيَعْلَمُونَ');
    expect(m.x.r).toBe('78:4');
  });
  it('pour chaque mot, le mot se retrouve dans son verset ; niveau entre 1 et 12 ; pas de translittération pour l’élève', () => {
    const LATIN = /[ʿʾāīūḥṣḍṭẓġḵ]/i;
    for (const nom of fichiers) {
      const f = JSON.parse(readFileSync(join(racinesDir(), nom), 'utf8')) as FamilleRacine & {
        n: number;
        s: string;
      };
      expect(f.n).toBeGreaterThanOrEqual(1);
      expect(f.n).toBeLessThanOrEqual(12);
      expect(f.s).not.toMatch(LATIN);
      for (const m of f.mots as unknown as Array<{
        e: string;
        me: string;
        s: string;
        ln: string[];
        x: { t: string; i: number; l: number };
      }>) {
        expect(m.x.t.slice(m.x.i, m.x.i + m.x.l).length, nom).toBe(m.x.l);
        for (const txt of [m.e, m.s, ...m.ln]) expect(txt, `${nom} ${txt}`).not.toMatch(LATIN);
      }
    }
  });
  it('pourEnfant : 2 ou 3 mots, sans moule, ni lien vers la suite ; une famille sans mot enfant : null', () => {
    const f = lire('001') as FamilleRacine;
    const e = pourEnfant(f)!;
    expect(e.mots.map((m) => m.n).sort()).toEqual([112, 29, 70]);
    expect(e.mots.every((m) => m.m === '' && m.me === '')).toBe(true);
    expect(e.l).toBeUndefined();
    expect(pourEnfant({ ...f, k: undefined })).toBeNull();
  });
});

describe.skipIf(!URL)('routes des familles de mots (awform_test)', () => {
  let c: Ctx;
  let adulteH: H;
  let enfantH: H;
  let n = 0;
  beforeAll(async () => {
    c = await setup(URL!, []);
    const p = await parent(c, `rc-parent${++n}@e2e.test`);
    enfantH = { ...p.P, 'x-profil': await child(c, p.P, 'rc-enfant', 9) };
    const a = await adult(c, `rc-adulte${++n}@e2e.test`);
    adulteH = { ...a.A, 'x-profil': a.profileId };
  }, 60_000);
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });
  const get = (url: string, h: H) => c.req('GET', url, h);

  it('401 sans connexion ; 403 « fonction_coupee » par défaut', async () => {
    expect((await get('/api/v1/racines/index', {})).statusCode).toBe(401);
    const r = await get('/api/v1/racines/familles/1', adulteH);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatchObject({ code: 'fonction_coupee', fonction: 'racines_coran' });
  });
  it('adulte : index complet et famille entière ; paramètres refusés', async () => {
    await setFlagState(c.h.db, 'racines_coran', 'on', null);
    const i = (await get('/api/v1/racines/index', adulteH)).json();
    expect(i.p).toBe('adulte');
    expect(i.f.length).toBe(283);
    const f = (await get('/api/v1/racines/familles/1', adulteH)).json();
    expect(f.r).toBe('ع ل م');
    expect(f.mots.length).toBeGreaterThan(3);
    expect((await get('/api/v1/racines/familles/0', adulteH)).statusCode).toBe(400);
    expect((await get('/api/v1/racines/familles/998', adulteH)).statusCode).toBe(404);
  });
  it('enfant : seulement ses familles, 3 mots, sans moule ; une famille non marquée : 404', async () => {
    const i = (await get('/api/v1/racines/index', enfantH)).json();
    expect(i.p).toBe('enfant');
    expect(i.f.length).toBe(46);
    const f = (await get('/api/v1/racines/familles/1', enfantH)).json();
    expect(f.mots.length).toBe(3);
    expect(f.mots.every((m: { m: string }) => m.m === '')).toBe(true);
    const sans = (i.f as Array<{ i: number }>).map((x) => x.i);
    const autre = Array.from({ length: 283 }, (_, k) => k + 1).find((k) => !sans.includes(k))!;
    expect((await get(`/api/v1/racines/familles/${autre}`, enfantH)).statusCode).toBe(404);
  });
});
