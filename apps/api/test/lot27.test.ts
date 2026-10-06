/**
 * Lot 27 — API de l'audio du Coran, avec un MUṢḤAF D'ESSAI NON CORANIQUE (bips WAV générés, jamais une
 * récitation) : « ayyoub-hafs » (Ḥafṣ, sourates 1 et 112-114) et « huthify-qalun » (Qālūn, numérotation
 * d'essai différente). Liste, pistes, fichiers (Range, ETag, cache), paquets par sourate, profil (liste
 * autorisée du parent et de l'enseignant, préférence, conseil débutant), règle de riwāya, retrait immédiat,
 * préchargement du relais.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMPLEXE_CATALOGUE,
  createRelay,
  importReciterAudio,
  schema as t,
  upsertReciter,
  writeTestMushaf,
} from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import {
  adult,
  child,
  cookieOf,
  join as joinClass,
  newClass,
  parent,
  PW,
  setup,
  teacher,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const cat = (id: string) => COMPLEXE_CATALOGUE.find((x) => x.id === id)!;

describe.skipIf(!URL_)('lot 27 : audio du Coran (API)', () => {
  let c: Ctx;
  let store: string;
  let src: string;
  let P: Record<string, string>;
  let pin: Record<string, string>;
  let kid: string;
  let ADM: Record<string, string>;
  let relToken = '';

  beforeAll(async () => {
    store = mkdtempSync(join(tmpdir(), 'awzid-store-'));
    src = mkdtempSync(join(tmpdir(), 'awzid-src-'));
    c = await setup(URL_!, [], { audioDir: store });
    for (const id of ['ayyoub-hafs', 'huthify-qalun', 'muaiqly-hafs'])
      await upsertReciter(c.h.db, cat(id));
    writeTestMushaf(join(src, 'a'), [1, 112, 113, 114]);
    const a = await importReciterAudio(c.h.db, {
      reciterId: 'ayyoub-hafs',
      dir: join(src, 'a'),
      pattern: 'SSSVVV.wav',
      suras: [1, 112, 113, 114],
      storageDir: store,
      activate: true,
      partialOk: true,
    });
    expect(a.status).toBe('active');
    // Qālūn : compte officiel connu (sourate 1 : 7 versets, 112 : 4) → 11 versets
    writeTestMushaf(join(src, 'q'), [1, 112], { ms: 350 });
    const q = await importReciterAudio(c.h.db, {
      reciterId: 'huthify-qalun',
      dir: join(src, 'q'),
      pattern: 'SSSVVV.wav',
      suras: [1, 112],
      declaredVerses: 11,
      storageDir: store,
      activate: true,
      partialOk: true,
    });
    expect(q.status).toBe('active');
    ({ P, pin } = await parent(c, 'parent27@exemple.org'));
    kid = await child(c, P, 'Enfant27');
    // administrateur avec second facteur
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin27@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    ADM = {
      cookie: cookieOf(
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'admin27@exemple.org', password: PW },
        ),
      ),
    };
    const s = (await c.req('POST', '/api/v1/auth/totp/setup', ADM, {})).json();
    await c.req('POST', '/api/v1/auth/totp/confirm', ADM, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
    rmSync(store, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  });

  it('liste publique : récitateurs ACTIFS seulement, riwāya, crédit, licence, conseil débutant en tête', async () => {
    const r = await c.req('GET', '/api/v1/quran/audio/reciters');
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=300');
    const b = r.json();
    expect(b.conseilDebutant).toBe('ayyoub-hafs');
    expect(b.reciters.map((x: { id: string }) => x.id)).toEqual(['ayyoub-hafs', 'huthify-qalun']);
    const [ay, qa] = b.reciters;
    expect(ay).toMatchObject({
      riwaya: 'hafs',
      conseilDebutant: true,
      verses: 22,
      surlignage: 'verset',
    });
    expect(ay.credit).toContain('Complexe du Roi Fahd');
    expect(ay.license).toMatchObject({ archivedOn: '2026-10-04' });
    // A1 : crédit en arabe et condition d'usage (ne pas vendre l'audio)
    expect(ay.creditAr).toContain('محمد أيوب');
    expect(ay.usageNote).toContain('ne pas vendre');
    expect(qa).toMatchObject({ riwaya: 'qalun', surlignage: 'sans_surlignage', verses: 11 });
  });

  it('pistes d’une sourate : fichiers, tailles, empreintes ; autre riwāya marquée « sans_surlignage »', async () => {
    const b = (await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/suras/112')).json();
    expect(b.files.map((f: { aya: number }) => f.aya)).toEqual([1, 2, 3, 4]);
    expect(b.files[0].url).toMatch(
      /^\/api\/v1\/quran\/audio\/file\/ayyoub-hafs\/112001-[0-9a-f]{16}\.wav$/,
    );
    expect(b.surlignage).toBe('verset');
    const q = (await c.req('GET', '/api/v1/quran/audio/reciters/huthify-qalun/suras/1')).json();
    expect(q.files).toHaveLength(7);
    expect(q.files.every((f: { surlignage: string }) => f.surlignage === 'sans_surlignage')).toBe(
      true,
    );
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/suras/2')).statusCode,
    ).toBe(404);
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/muaiqly-hafs/suras/1')).statusCode,
    ).toBe(404);
  });

  it('fichier : 200 complet, Range 206 (début, suffixe), 416, ETag et 304, cache public', async () => {
    const b = (await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/suras/112')).json();
    const f = b.files[0];
    const disk = readFileSync(join(store, f.url.replace('/api/v1/quran/audio/file/', '')));
    const full = await c.req('GET', f.url);
    expect(full.statusCode).toBe(200);
    expect(full.rawPayload.equals(disk)).toBe(true);
    expect(full.headers['content-type']).toBe('audio/wav');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['cache-control']).toBe('public, max-age=86400');
    expect(full.headers.etag).toBe(`"${f.sha256}"`);
    const part = await c.req('GET', f.url, { range: 'bytes=0-99' });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 0-99/${disk.length}`);
    expect(part.rawPayload.equals(disk.subarray(0, 100))).toBe(true);
    const tail = await c.req('GET', f.url, { range: 'bytes=-10' });
    expect(tail.rawPayload.equals(disk.subarray(disk.length - 10))).toBe(true);
    const bad = await c.req('GET', f.url, { range: `bytes=${disk.length + 5}-` });
    expect(bad.statusCode).toBe(416);
    expect(bad.headers['content-range']).toBe(`bytes */${disk.length}`);
    expect((await c.req('GET', f.url, { 'if-none-match': `"${f.sha256}"` })).statusCode).toBe(304);
    const other = f.url.replace(/-[0-9a-f]{16}\./, '-0000000000000000.');
    expect((await c.req('GET', other)).statusCode).toBe(404);
    expect(
      (await c.req('GET', '/api/v1/quran/audio/file/ayyoub-hafs/..%2F..%2Fetc')).statusCode,
    ).toBe(400);
  });

  it('paquets hors ligne PAR SOURATE : manifeste, tailles, empreinte stable, Wi-Fi seulement', async () => {
    const l = (await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/packs')).json();
    expect(l.wifiSeulement).toBe(true);
    expect(l.suras.map((s: { sura: number }) => s.sura)).toEqual([1, 112, 113, 114]);
    const s113 = l.suras.find((s: { sura: number }) => s.sura === 113);
    const m = (await c.req('GET', s113.url)).json();
    expect(m.files).toHaveLength(5);
    expect(m.bytes).toBe(m.files.reduce((n: number, f: { bytes: number }) => n + f.bytes, 0));
    expect(m.bytes).toBe(s113.bytes);
    expect(m.hash).toBe(s113.hash);
    expect(l.totalBytes).toBe(l.suras.reduce((n: number, s: { bytes: number }) => n + s.bytes, 0));
    expect((await c.req('GET', s113.url)).json().hash).toBe(m.hash);
  });

  it('profil : mode mémoriser = Ḥafṣ seulement ; préférence ; conseil débutant par défaut', async () => {
    const ec = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(ec.reciters.map((x: { id: string }) => x.id)).toEqual(['ayyoub-hafs', 'huthify-qalun']);
    expect(ec.preference).toEqual({ choisi: null, effectif: 'ayyoub-hafs' });
    const me = (
      await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters?mode=memoriser`, P)
    ).json();
    expect(me.reciters.map((x: { id: string }) => x.id)).toEqual(['ayyoub-hafs']);
    expect(me.riwayaCarnet).toBe('hafs');
    const put = await c.req('PUT', `/api/v1/profiles/${kid}/quran/reciter`, P, {
      reciterId: 'huthify-qalun',
    });
    expect(put.statusCode).toBe(200);
    expect(
      (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json().preference,
    ).toEqual({
      choisi: 'huthify-qalun',
      effectif: 'huthify-qalun',
    });
    // en mode mémoriser, le choix Qālūn n'est pas proposé : retour au conseil (Ḥafṣ)
    expect(
      (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters?mode=memoriser`, P)).json()
        .preference.effectif,
    ).toBe('ayyoub-hafs');
    const memo = await c.req(
      'GET',
      `/api/v1/profiles/${kid}/quran/suras/1/tracks?recitateur=huthify-qalun&mode=memoriser`,
      P,
    );
    expect(memo.statusCode).toBe(409);
    expect(memo.json().error.code).toBe('riwaya_differente_du_carnet');
    const ok = await c.req(
      'GET',
      `/api/v1/profiles/${kid}/quran/suras/1/tracks?recitateur=ayyoub-hafs&mode=memoriser`,
      P,
    );
    expect(ok.json().files).toHaveLength(7);
    // pas de préférence pour un récitateur en attente, ni pour le profil d'une autre famille
    expect(
      (
        await c.req('PUT', `/api/v1/profiles/${kid}/quran/reciter`, P, {
          reciterId: 'muaiqly-hafs',
        })
      ).statusCode,
    ).toBe(404);
    const other = await parent(c, 'autre27@exemple.org');
    expect((await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, other.P)).statusCode).toBe(
      404,
    );
  });

  it('restrictions : liste du parent (code parent), liste de la classe, intersection', async () => {
    const url = `/api/v1/profiles/${kid}/quran/allowed-reciters`;
    expect((await c.req('PUT', url, P, { reciters: ['huthify-qalun'] })).statusCode).toBe(401);
    expect((await c.req('PUT', url, pin, { reciters: ['inconnu-hafs'] })).statusCode).toBe(400);
    expect((await c.req('PUT', url, pin, { reciters: ['huthify-qalun'] })).statusCode).toBe(200);
    expect((await c.req('GET', url, P)).json().parent).toEqual(['huthify-qalun']);
    const l = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(l.restreint).toBe(true);
    expect(l.reciters.map((x: { id: string }) => x.id)).toEqual(['huthify-qalun']);
    expect(
      (await c.req('PUT', `/api/v1/profiles/${kid}/quran/reciter`, P, { reciterId: 'ayyoub-hafs' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await c.req(
          'GET',
          `/api/v1/profiles/${kid}/quran/suras/112/tracks?recitateur=ayyoub-hafs`,
          P,
        )
      ).statusCode,
    ).toBe(403);
    // enseignant : liste de la classe
    const T = await teacher(c, 'prof27@exemple.org');
    const cls = await newClass(c, T, 'Classe 27');
    await joinClass(c, P, kid, cls);
    const curl = `/api/v1/teacher/classes/${cls.id}/quran/allowed-reciters`;
    expect((await c.req('PUT', curl, P, { reciters: ['ayyoub-hafs'] })).statusCode).toBe(403);
    expect((await c.req('PUT', curl, T, { reciters: ['ayyoub-hafs'] })).statusCode).toBe(200);
    // intersection vide : rien n'est proposé (parent : Qālūn ; classe : Ayyūb)
    const none = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(none.reciters).toEqual([]);
    expect(none.preference.effectif).toBeNull();
    // le parent lève sa liste : seule celle de la classe s'applique
    await c.req('PUT', url, pin, { reciters: null });
    const cl = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(cl.reciters.map((x: { id: string }) => x.id)).toEqual(['ayyoub-hafs']);
    // un enseignant ne règle pas la classe d'un autre
    const T2 = await teacher(c, 'prof27b@exemple.org');
    expect((await c.req('PUT', curl, T2, { reciters: null })).statusCode).toBe(404);
    await c.req('PUT', curl, T, { reciters: null });
    // un adulte autonome n'a pas de liste parentale
    const ad = await adult(c, 'adulte27@exemple.org');
    expect(
      (
        await c.req('PUT', `/api/v1/profiles/${ad.profileId}/quran/allowed-reciters`, ad.A, {
          reciters: [],
        })
      ).statusCode,
    ).toBe(403);
  });

  it('relais d’école : liste des fichiers des récitateurs choisis par l’école (jeton du relais)', async () => {
    const rel = await createRelay(c.h.db, 'École 27', 'ecole-27.relais.exemple.org');
    relToken = rel.token;
    expect(
      (await c.req('PUT', `/api/v1/admin/relais/${rel.id}/quran-reciters`, P, { reciters: [] }))
        .statusCode,
    ).toBe(403);
    const put = await c.req('PUT', `/api/v1/admin/relais/${rel.id}/quran-reciters`, ADM, {
      reciters: ['ayyoub-hafs'],
    });
    expect(put.statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/relais/quran-audio')).statusCode).toBe(401);
    const r = (
      await c.req('GET', '/api/v1/relais/quran-audio', { 'x-relais-jeton': rel.token })
    ).json();
    expect(r.reciters).toHaveLength(1);
    expect(r.reciters[0].files).toHaveLength(22);
    expect(r.reciters[0].bytes).toBe(
      r.reciters[0].files.reduce((n: number, f: { bytes: number }) => n + f.bytes, 0),
    );
  });

  it('Coran épuré : un récitateur d’ESSAI (« essai-* ») n’est jamais proposé hors des tests', async () => {
    await upsertReciter(c.h.db, { ...cat('ayyoub-hafs'), id: 'essai-hafs' });
    writeTestMushaf(join(src, 'e'), [112]);
    const e = await importReciterAudio(c.h.db, {
      reciterId: 'essai-hafs',
      dir: join(src, 'e'),
      pattern: 'SSSVVV.wav',
      suras: [112],
      storageDir: store,
      activate: true,
      partialOk: true,
    });
    expect(e.status).toBe('active');
    const ids = async () =>
      (await c.req('GET', '/api/v1/quran/audio/reciters'))
        .json()
        .reciters.map((x: { id: string }) => x.id);
    expect(await ids()).not.toContain('essai-hafs');
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/essai-hafs/suras/112')).statusCode,
    ).toBe(404);
    const p = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(p.reciters.map((x: { id: string }) => x.id)).not.toContain('essai-hafs');
    process.env.AWFORM_AUDIO_ESSAI = 'on';
    try {
      expect(await ids()).toContain('essai-hafs');
    } finally {
      delete process.env.AWFORM_AUDIO_ESSAI;
    }
  });

  it('retrait immédiat (administrateur, motif) : hors des réponses, des paquets, des fichiers et du relais', async () => {
    const f = (await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/suras/112')).json()
      .files[0];
    expect(
      (
        await c.req('POST', '/api/v1/admin/quran/reciters/ayyoub-hafs/retire', P, {
          motif: 'essai',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await c.req('POST', '/api/v1/admin/quran/reciters/ayyoub-hafs/retire', ADM, {})).statusCode,
    ).toBe(400);
    const r = await c.req('POST', '/api/v1/admin/quran/reciters/ayyoub-hafs/retire', ADM, {
      motif: 'essai de coupure',
    });
    expect(r.statusCode).toBe(200);
    const list = (await c.req('GET', '/api/v1/quran/audio/reciters')).json();
    expect(list.reciters.map((x: { id: string }) => x.id)).toEqual(['huthify-qalun']);
    expect((await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/packs')).statusCode).toBe(
      404,
    );
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/ayyoub-hafs/packs/112')).statusCode,
    ).toBe(404);
    expect((await c.req('GET', f.url)).statusCode).toBe(410);
    const p = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(p.reciters.map((x: { id: string }) => x.id)).toEqual(['huthify-qalun']);
    expect(p.conseilDebutant).toBeNull();
    const rl = await c.req('GET', '/api/v1/relais/quran-audio', { 'x-relais-jeton': relToken });
    expect(rl.json().reciters).toEqual([]);
    const adm = (await c.req('GET', '/api/v1/admin/quran/reciters', ADM)).json();
    const ay = adm.reciters.find((x: { id: string }) => x.id === 'ayyoub-hafs');
    expect(ay).toMatchObject({ status: 'retire', retiredReason: 'essai de coupure', tracks: 22 });
    expect(ay.lastImport.status).toBe('active');
  });
});
