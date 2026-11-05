/**
 * Lectures (4/11/2026) — Mukhtaṣar Khalīl (`khalil`) et « Histoire, de la création à nos jours » (`histoires`) :
 *  - LE CHAPITRE DU JIHĀD N'EST NI ÉCRIT NI SERVI : aucun fichier, aucun titre du sommaire, aucune unité (texte arabe et français
 *    d'ouverture du chapitre absents de TOUS les fichiers et de TOUTES les réponses), numérotation continue sans trou ;
 *  - aucun identifiant de la source (KHL-…, MGH-…), aucune mention interne ⟦…⟧ ;
 *  - 401 sans connexion, 403 « fonction_coupee » hors canal bêta, adultes seulement pour Khalīl ;
 *  - histoires : 135 récits (S00 et S01C ajoutés le 05/11), profil enfant sans version adulte, versets recopiés tels quels.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setFlagState } from '@awform/db';
import { histoiresDir, khalilDir, recitPourEnfant } from '../src/lectures.js';
import { adult, child, parent, setup, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;
/** ouverture du chapitre du jihād dans la source (KHL-1793 à 1795), qui ne doit apparaître nulle part */
const JIHAD = [
  'الْجِهَادُ فِي أَهَمِّ جِهَةٍ كُلَّ سَنَةٍ',
  'وَلَوْ مَعَ وَالٍ جَائِرٍ',
  'Chapitre [du jihād]',
  'dans la direction la plus importante, chaque année',
];
const kFichiers = () => readdirSync(khalilDir()).filter((f) => f.endsWith('.json'));
const lireK = (nom: string) => readFileSync(join(khalilDir(), nom), 'utf8');

interface Unite {
  n: number;
  ar: string;
  fr: string;
}

describe('Khalīl : fichiers livrés', () => {
  it('aucun fichier, aucun chapitre, aucun texte du jihād ; aucun identifiant de la source ni mention interne', () => {
    const fichiers = kFichiers();
    expect(fichiers.some((f) => /jihad/i.test(f))).toBe(false);
    const idx = JSON.parse(lireK('index.json')) as { c: Array<{ k: string; t: string }> };
    expect(idx.c.some((c) => /jih[aā]d/i.test(c.k + c.t))).toBe(false);
    for (const f of fichiers) {
      const s = lireK(f);
      for (const j of JIHAD) expect(s.includes(j), `${f} : ${j}`).toBe(false);
      expect(s, f).not.toMatch(/\b(KHL|MGH)-\d/);
      expect(s, f).not.toContain('⟦');
      expect(s, f).not.toMatch(/R-KHL-/);
    }
  });
  it('8 956 unités, numérotation d’origine dans l’ordre du sommaire (seul trou : 1793 à 1983) ; arabe recopié tel quel', () => {
    const idx = JSON.parse(lireK('index.json')) as {
      total: number;
      c: Array<{ k: string; d: number; f: number }>;
    };
    expect(idx.total).toBe(8956);
    let attendu = 1;
    let nb = 0;
    for (const c of idx.c) {
      const ch = JSON.parse(lireK(`${c.k}.json`)) as { u: Unite[] };
      expect(ch.u[0]!.n).toBe(c.d);
      for (const u of ch.u) {
        if (attendu === 1793) attendu = 1984; // le chapitre exclu (KHL-1793 à 1983) : numéros absents, sans aucune mention
        expect(u.n).toBe(attendu++);
        nb++;
        expect(u.ar.length).toBeGreaterThan(0);
        expect(u.fr.length).toBeGreaterThan(0);
      }
      expect(ch.u[ch.u.length - 1]!.n).toBe(c.f);
    }
    expect(nb).toBe(idx.total);
    // le chapitre des vœux est suivi directement de la course (le jihād, entre les deux dans la source, n'existe pas ici)
    const k = idx.c.map((c) => c.k);
    expect(k[k.indexOf('nudhur') + 1]).toBe('musabaqa');
    expect(idx.c[k.indexOf('nudhur')]!.f).toBe(1792);
    expect(idx.c[k.indexOf('musabaqa')]!.d).toBe(1984);
    // première unité du chapitre de la rébellion : « بَابٌ », octets intacts (pas de normalisation)
    const b = JSON.parse(lireK('bughat.json')) as { u: Unite[] };
    expect(Buffer.from(b.u[0]!.ar, 'utf8').toString('hex')).toBe(
      Buffer.from('بَابٌ', 'utf8').toString('hex'),
    );
  });
  it('les chapitres de peines gardent la mention « relève du seul juge »', () => {
    const z = JSON.parse(lireK('zina.json')) as { ctx: string[] };
    expect(
      z.ctx.some((c) => c.includes('relèvent du seul juge') || c.includes('relève du seul juge')),
    ).toBe(true);
  });
});

describe('Histoires : fichiers livrés', () => {
  const idx = JSON.parse(readFileSync(join(histoiresDir(), 'index.json'), 'utf8')) as {
    livres: Array<{ id: string; r: Array<{ id: string; e: number; a: number }> }>;
  };
  it('135 récits en 5 livres ; la Sīra sans audio ; jamais de section « Sources » servie', () => {
    expect(idx.livres.map((l) => l.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
    expect(idx.livres.reduce((s, l) => s + l.r.length, 0)).toBe(135);
    expect(idx.livres[2]!.r.every((r) => !r.e && !r.a)).toBe(true);
    for (const f of readdirSync(histoiresDir())) {
      const s = readFileSync(join(histoiresDir(), f), 'utf8');
      expect(s, f).not.toContain('Sources et choix du référent');
      expect(s, f).not.toContain('<script');
    }
  });
  it('Nouh : verset 7:59 recopié tel quel, audio avec places de versets, 5 illustrations', () => {
    const r = JSON.parse(readFileSync(join(histoiresDir(), '03_nouh.json'), 'utf8')) as {
      adulte: Array<{ k: string; ar?: Array<{ t: string; ref: string }> }>;
      audio: { e: Array<{ f?: string; v?: string }>; a: Array<{ f?: string; v?: string }> };
      illus: unknown[];
    };
    const v = r.adulte.flatMap((b) => b.ar ?? []).find((x) => x.ref === '7:59')!;
    expect(v.t.startsWith('لَقَدْ أَرْسَلْنَا نُوحًا إِلَىٰ قَوْمِهِۦ')).toBe(true);
    expect(r.audio.a.some((x) => x.v && !x.f)).toBe(true);
    expect(r.illus.length).toBe(5);
    const e = recitPourEnfant(r as unknown as Record<string, unknown>);
    expect(e.adulte).toBeUndefined();
    expect((e.audio as { a?: unknown }).a).toBeUndefined();
    expect((e.illus as unknown[]).length).toBe(3);
  });
});

describe.skipIf(!URL)('routes Khalīl et Histoires (awform_test)', () => {
  let c: Ctx;
  let adulteH: H;
  let enfantH: H;
  let n = 0;
  beforeAll(async () => {
    c = await setup(URL!, []);
    const p = await parent(c, `lx-parent${++n}-${Date.now()}@e2e.test`);
    enfantH = { ...p.P, 'x-profil': await child(c, p.P, 'lx-enfant', 9) };
    const a = await adult(c, `lx-adulte${++n}-${Date.now()}@e2e.test`);
    adulteH = { ...a.A, 'x-profil': a.profileId };
  }, 60_000);
  afterAll(async () => {
    await setFlagState(c.h.db, 'khalil', 'beta', null);
    await setFlagState(c.h.db, 'histoires', 'beta', null);
    await c?.app.close();
    await c?.h.close();
  });
  const get = (url: string, h: H) => c.req('GET', url, h);

  it('401 sans connexion ; 403 « fonction_coupee » hors canal bêta (défaut « beta »)', async () => {
    expect((await get('/api/v1/khalil/index', {})).statusCode).toBe(401);
    expect((await get('/api/v1/histoires/index', {})).statusCode).toBe(401);
    const r = await get('/api/v1/khalil/index', adulteH);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatchObject({ code: 'fonction_coupee', fonction: 'khalil' });
    expect((await get('/api/v1/histoires/recits/03_nouh', adulteH)).statusCode).toBe(403);
    expect((await get('/api/v1/histoires/acces', adulteH)).statusCode).toBe(403);
  });
  it('Khalīl ouvert : aucune réponse ne contient le jihād ; chapitre « jihad » : 404 ; enfant : 403', async () => {
    await setFlagState(c.h.db, 'khalil', 'on', null);
    const i = await get('/api/v1/khalil/index', adulteH);
    expect(i.statusCode).toBe(200);
    const idx = i.json() as { c: Array<{ k: string }> };
    const corps = [i.body];
    for (const ch of idx.c) {
      const r = await get(`/api/v1/khalil/chapitres/${ch.k}`, adulteH);
      expect(r.statusCode).toBe(200);
      corps.push(r.body);
    }
    for (const s of corps) {
      for (const j of JIHAD) expect(s.includes(j)).toBe(false);
      expect(s).not.toMatch(/\b(KHL|MGH)-\d/);
    }
    expect((await get('/api/v1/khalil/chapitres/jihad', adulteH)).statusCode).toBe(404);
    expect((await get('/api/v1/khalil/chapitres/index', adulteH)).statusCode).toBe(404);
    expect((await get('/api/v1/khalil/chapitres/..%2Fx', adulteH)).statusCode).toBe(400);
    const e = await get('/api/v1/khalil/index', enfantH);
    expect(e.statusCode).toBe(403);
    expect(e.json().error.code).toBe('reserve_adultes');
  });
  it('Histoires ouvertes : adulte voit les deux versions ; enfant seulement la sienne', async () => {
    await setFlagState(c.h.db, 'histoires', 'on', null);
    expect((await get('/api/v1/histoires/acces', adulteH)).statusCode).toBe(204);
    const a = (await get('/api/v1/histoires/recits/03_nouh', adulteH)).json();
    expect(a.p).toBe('adulte');
    expect(a.adulte.length).toBeGreaterThan(10);
    const e = (await get('/api/v1/histoires/recits/03_nouh', enfantH)).json();
    expect(e.p).toBe('enfant');
    expect(e.adulte).toBeUndefined();
    expect(e.enfant.length).toBeGreaterThan(5);
    expect((await get('/api/v1/histoires/recits/H38_recensement', adulteH)).statusCode).toBe(404);
    expect((await get('/api/v1/histoires/recits/index', adulteH)).statusCode).toBe(404);
  });
});
