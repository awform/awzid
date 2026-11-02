/**
 * Tafsīr abrégé et mot à mot (interrupteur `tafsir_sens`) — route `GET /api/v1/tafsir/sourates/:n`, base de test :
 *  - 401 sans connexion, 403 « fonction_coupee » tant que l'interrupteur est coupé (état de base : coupé) ;
 *  - une sourate à la demande, paramètres refusés, 404 pour un fichier absent ; sans réponse mise en cache ;
 *  - FILTRAGE PAR PUBLIC côté serveur (D-TF-445, D-TF-498), sur des fichiers FICTIFS qui portent un segment « niveau adulte » (avec sa
 *    note de contexte) et un segment « mention publique interdite » : profil enfant ou ado, parent, enseignant, administrateur
 *    ordinaire → ni l'un ni l'autre, sans trace ; profil adulte → le segment adulte avec sa note ; compte « tout voir » du client →
 *    tout ; un en-tête `x-profil` d'un autre compte est ignoré ;
 *  - les fichiers livrés (par défaut) sont servis tels quels, parce qu'ils ne portent aucun segment réservé.
 * Les textes des fichiers fictifs sont marqués [TEST] : aucun contenu religieux.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t, setFlagState, setProfileLevel } from '@awform/db';
import { sourateJson, type SourateTafsir } from '@awform/content/tafsir';
import { COMPTE_TOUT_VOIR } from '../src/auth/tout-voir.js';
import { tafsirDir } from '../src/tafsir.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { adult, child, cookieOf, parent, PW, setup, teacher, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

/** sourate FICTIVE : un point ouvert, un point adulte (avec note), un point réservé, un point général */
const FICTIVE: SourateTafsir = {
  v: 1,
  s: 112,
  nom_ar: '[TEST]',
  nom_fr: '[TEST] sourate fictive',
  sens_general: '[TEST] résumé fictif',
  points: [
    {
      id: 0,
      titre: '[TEST] ouvert (v. 1)',
      texte: '[TEST] visible de tous',
      sources: ['[TEST] source'],
      plage: [[1, 1]],
    },
    {
      id: 1,
      titre: '[TEST] ADULTE-SEUL (v. 1-2)',
      texte: '[TEST] texte ADULTE-SEUL',
      sources: [],
      plage: [[1, 2]],
      acces: 'adulte',
      note_contexte: '[TEST] NOTE-DE-CONTEXTE-ADULTE',
    },
    {
      id: 2,
      titre: '[TEST] RESERVE-CLIENT (v. 2)',
      texte: '[TEST] texte RESERVE-CLIENT',
      sources: [],
      plage: [[2, 2]],
      acces: 'interdit',
    },
    { id: 3, titre: '[TEST] général', texte: '[TEST] texte général', sources: [], plage: [] },
  ],
  versets: [
    { a: 1, ar: 'اختبار', mots: [['اختبار', '[TEST] mot']], sens: '[TEST] sens 1', p: [0, 1] },
    { a: 2, ar: 'اختبار', mots: [['اختبار', '[TEST] mot']], sens: '[TEST] sens 2', p: [1, 2] },
  ],
};
const TRACES = /ADULTE-SEUL|RESERVE-CLIENT|NOTE-DE-CONTEXTE|"acces"|interdit/;

describe.skipIf(!URL)('route du tafsīr (awform_test)', () => {
  let c: Ctx;
  let dossier: string;
  let enfantH: H;
  let adoH: H;
  let parentH: H;
  let adulteH: H;
  let adulteProfil: string;
  let autreAdulteH: H;
  let toutVoirH: H;
  let adminH: H;
  let profEnfant: string;
  let profAdo: string;
  let n = 0;

  async function admin(email: string, avecTotp: boolean, id?: string) {
    await c.h.db.insert(t.account).values({
      ...(id ? { id } : {}),
      kind: 'admin',
      email,
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const H: H = {
      cookie: cookieOf(await c.req('POST', '/api/v1/auth/login', {}, { email, password: PW })),
    };
    if (avecTotp) {
      const s = (await c.req('POST', '/api/v1/auth/totp/setup', H, {})).json();
      await c.req('POST', '/api/v1/auth/totp/confirm', H, {
        code: totpAt(s.secret as string, Math.floor(Date.now() / 30_000)),
      });
    }
    return H;
  }

  beforeAll(async () => {
    dossier = mkdtempSync(join(tmpdir(), 'tafsir-test-'));
    writeFileSync(join(dossier, '112.json'), sourateJson(FICTIVE));
    c = await setup(URL!, [], { tafsirDir: dossier });
    const p = await parent(c, `tf-parent${++n}@e2e.test`);
    parentH = p.P;
    profEnfant = await child(c, p.P, 'tf-enfant', 9);
    profAdo = await child(c, p.P, 'tf-ado', 15);
    enfantH = { ...p.P, 'x-profil': profEnfant };
    adoH = { ...p.P, 'x-profil': profAdo };
    const a = await adult(c, `tf-adulte${++n}@e2e.test`);
    adulteH = { ...a.A, 'x-profil': a.profileId };
    adulteProfil = a.profileId;
    autreAdulteH = (await adult(c, `tf-adulte${++n}@e2e.test`)).A;
    toutVoirH = await admin('tf-client@e2e.test', true, COMPTE_TOUT_VOIR);
    adminH = await admin('tf-autre-admin@e2e.test', true);
  }, 60_000);
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const get = (url: string, h: H) => c.req('GET', url, h);
  const URL112 = '/api/v1/tafsir/sourates/112';
  const titres = async (h: H) =>
    ((await get(URL112, h)).json() as SourateTafsir).points.map((x) => x.id);

  it('401 sans connexion ; interrupteur COUPÉ par défaut : 403 « fonction_coupee » pour tous', async () => {
    expect((await get(URL112, {})).statusCode).toBe(401);
    for (const h of [enfantH, adulteH, parentH, toutVoirH]) {
      const r = await get(URL112, h);
      expect(r.statusCode).toBe(403);
      expect(r.json().error).toMatchObject({ code: 'fonction_coupee', fonction: 'tafsir_sens' });
      expect(r.body).not.toMatch(TRACES);
    }
  });

  it('ouvert : une sourate à la demande, JSON, jamais mise en cache ; paramètres refusés ; fichier absent : 404', async () => {
    await setFlagState(c.h.db, 'tafsir_sens', 'on', null);
    const r = await get(URL112, adulteH);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect((r.json() as SourateTafsir).s).toBe(112);
    for (const bad of ['0', '115', 'abc', '-1', '1.5'])
      expect((await get(`/api/v1/tafsir/sourates/${bad}`, adulteH)).statusCode, bad).toBe(400);
    expect((await get('/api/v1/tafsir/sourates/113', adulteH)).statusCode).toBe(404);
  });

  it('profil ENFANT et profil ADO : ni le segment adulte ni le réservé, aucune trace dans la réponse', async () => {
    for (const h of [enfantH, adoH]) {
      const r = await get(URL112, h);
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toMatch(TRACES);
      const x = r.json() as SourateTafsir;
      expect(x.points.map((p) => p.id)).toEqual([0, 3]);
      expect(x.versets.map((v) => v.p)).toEqual([[0], []]);
    }
  });

  it('parent sans profil, enseignant, administrateur ordinaire : traités comme un élève (rien d’adulte sans profil adulte)', async () => {
    const T = await teacher(c, `tf-ens${++n}@e2e.test`);
    for (const h of [parentH, T, adminH, autreAdulteH]) {
      const r = await get(URL112, h);
      expect(r.statusCode).toBe(200);
      expect(r.body, JSON.stringify(h)).not.toMatch(/RESERVE-CLIENT/);
    }
    // parent, enseignant, administrateur ordinaire : pas non plus le segment adulte
    for (const h of [parentH, T, adminH]) expect(await titres(h)).toEqual([0, 3]);
  });

  it('profil ADULTE (adulte autonome) : le segment adulte AVEC sa note de contexte, jamais le réservé', async () => {
    const r = await get(URL112, adulteH);
    const x = r.json() as SourateTafsir;
    expect(x.points.map((p) => p.id)).toEqual([0, 1, 3]);
    expect(x.points[1]).toMatchObject({
      acces: 'adulte',
      note_contexte: '[TEST] NOTE-DE-CONTEXTE-ADULTE',
    });
    expect(r.body).not.toMatch(/RESERVE-CLIENT/);
    // sans l'en-tête de profil, l'adulte autonome est reconnu par son propre profil
    expect(await titres(autreAdulteH)).toEqual([0, 1, 3]);
  });

  it('un en-tête `x-profil` qui n’est pas à la personne est ignoré : l’enfant ne se fait pas passer pour un adulte', async () => {
    const usurpe = { ...enfantH, 'x-profil': adulteProfil };
    expect(await titres(usurpe)).toEqual([0, 3]);
    expect(await titres({ ...adoH, 'x-profil': 'pas-un-uuid' })).toEqual([0, 3]);
    // une session de parent ne peut pas non plus se donner le profil de l'adulte
    expect(await titres({ ...parentH, 'x-profil': adulteProfil })).toEqual([0, 3]);
  });

  it('le compte « tout voir » du client (administrateur, second facteur validé) : tout, dont le segment réservé', async () => {
    const x = (await get(URL112, toutVoirH)).json() as SourateTafsir;
    expect(x.points.map((p) => p.id)).toEqual([0, 1, 2, 3]);
    expect(x.points[2]).toMatchObject({ acces: 'interdit' });
  });

  it('« tout voir » exige le second facteur validé : même compte, sans second facteur, il retombe à « élève »', async () => {
    // connexion fraîche du même compte : second facteur exigé et non validé -> session à moitié ouverte
    const demi: H = {
      cookie: cookieOf(
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'tf-client@e2e.test', password: PW },
        ),
      ),
    };
    const r = await get(URL112, demi);
    // soit refusé (second facteur requis), soit servi sans rien de réservé : jamais le segment réservé
    if (r.statusCode === 200) expect(r.body).not.toMatch(/RESERVE-CLIENT/);
    else expect([401, 403]).toContain(r.statusCode);
  });

  it('les fichiers livrés (sans dossier de remplacement) sont servis tels quels, 114 sourates', async () => {
    const reel = await setup(URL!, [], {});
    try {
      const { A, profileId } = await adult(reel, 'tf-reel@e2e.test');
      await setFlagState(reel.h.db, 'tafsir_sens', 'on', null);
      // CONSULTATION LIBRE : un élève de niveau 1 (portion N1 = juzʾ ʿAmma) ouvre aussi les sourates de N12 (2 et 3) et de tous les niveaux
      await reel.h.pool.query(
        "insert into level (code, track, rank, title_fr, subject_code) values ('ad1', 'adultes', 1, 'Adultes 1', 'arabe')",
      );
      await setProfileLevel(reel.h.db, profileId, 'ad1', 'choix');
      for (const s of [1, 2, 3, 42, 72, 112, 114]) {
        const r = await reel.req('GET', `/api/v1/tafsir/sourates/${s}`, {
          ...A,
          'x-profil': profileId,
        });
        expect(r.statusCode, `${s}`).toBe(200);
        expect(r.body).toBe(
          readFileSync(join(tafsirDir(), `${String(s).padStart(3, '0')}.json`), 'utf8'),
        );
      }
    } finally {
      await reel.app.close();
      await reel.h.close();
    }
  });
});
