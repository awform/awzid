/**
 * Chantier A2 — récitateurs EN LIGNE de Quran Foundation dans l'API (base de test, API QF SIMULÉE) :
 * catalogue synchronisé après les migrations, liste (étiquette « en ligne », crédit QF), pistes verset par
 * verset pour les comptes connectés seulement, aucun paquet hors ligne ni relais, préférence et listes
 * autorisées, mode mémoriser (Ḥafṣ), panne de QF, retrait immédiat, fonction inactive sans identifiants.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRelay, HAFS_SURA_VERSES, retireReciter, schema as t } from '@awform/db';
import { eq } from 'drizzle-orm';
import { QF_ENDPOINTS, QfAudioClient, type FetchLike } from '../src/coran-qf.js';
import { buildApp } from '../src/app.js';
import { adult, child, parent, setup, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

let down = false;
const fake: FetchLike = async (url) => {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url === QF_ENDPOINTS.prelive.oauth)
    return json({ access_token: 'jeton-serveur-a2', expires_in: 3600 });
  if (down) return json({ message: 'indisponible' }, 503);
  const m = /recitations\/(\d+)\/by_chapter\/(\d+)\?per_page=(\d+)&page=(\d+)/.exec(url);
  if (!m) return json({}, 404);
  const [rec, sura, per, page] = m.slice(1).map(Number) as [number, number, number, number];
  // prélancement : seulement al-Fātiḥa et al-Baqara
  if (sura > 2) return json({ message: 'introuvable' }, 404);
  const n = HAFS_SURA_VERSES[sura - 1]!;
  const all = Array.from({ length: n }, (_, i) => i + 1).slice((page - 1) * per, page * per);
  return json({
    audio_files: all.map((a) => ({
      verse_key: `${sura}:${a}`,
      url: `R${rec}/mp3/${String(sura).padStart(3, '0')}${String(a).padStart(3, '0')}.mp3`,
    })),
    pagination: { next_page: page * per < n ? page + 1 : null },
  });
};

describe.skipIf(!URL_)('A2 : récitateurs en ligne (Quran Foundation, API simulée)', () => {
  let c: Ctx;
  let A: Record<string, string>;
  let profileId: string;
  const qf = new QfAudioClient(
    { env: 'prelive', clientId: 'client-a2', clientSecret: 'secret-a2' },
    fake,
  );

  beforeAll(async () => {
    c = await setup(URL_!, [], { qf, audioDir: null });
    ({ A, profileId } = await adult(c, 'adulte-a2@exemple.org'));
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('catalogue QF en base après les migrations : source « qf », actif, Ḥafṣ', async () => {
    const rows = await c.h.db.select().from(t.quranReciter).where(eq(t.quranReciter.source, 'qf'));
    expect(rows.length).toBeGreaterThanOrEqual(11);
    expect(rows.every((r) => r.status === 'actif' && r.riwaya === 'hafs')).toBe(true);
  });

  it('liste : al-Ḥuṣarī et al-ʿAfāsī (prélancement) « en ligne », crédit et conditions de QF', async () => {
    const b = (await c.req('GET', '/api/v1/quran/audio/reciters')).json();
    const online = b.reciters.filter((r: { enLigne: boolean }) => r.enLigne);
    expect(online.map((r: { id: string }) => r.id)).toEqual(['qf-afasy', 'qf-husary']);
    expect(online[1]).toMatchObject({
      nameAr: 'محمود خليل الحصري',
      riwaya: 'hafs',
      riwayaFr: 'Ḥafṣ ʿan ʿĀṣim',
      verses: 6236,
      surlignage: 'verset',
      enLigne: true,
    });
    expect(online[1].credit).toContain('Quran Foundation');
    expect(online[1].usageNote).toContain('en ligne seulement');
    expect(online[1].license.url).toBe('https://api-docs.quran.foundation/legal/developer-terms/');
    expect(JSON.stringify(b)).not.toContain('jeton-serveur-a2');
  });

  it('pistes : comptes connectés seulement ; verset par verset, adresses https de QF, jamais le jeton', async () => {
    expect((await c.req('GET', '/api/v1/quran/audio/reciters/qf-afasy/suras/1')).statusCode).toBe(
      401,
    );
    const r = await c.req('GET', '/api/v1/quran/audio/reciters/qf-afasy/suras/1', A);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('private, max-age=3600');
    const m = r.json();
    expect(m).toMatchObject({
      reciter: 'qf-afasy',
      mode: 'versets',
      enLigne: true,
      surlignage: 'verset',
    });
    expect(m.files.map((f: { aya: number }) => f.aya)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(m.files[2].url).toBe('https://verses.quran.foundation/R7/mp3/001003.mp3');
    expect(r.body).not.toContain('jeton-serveur-a2');
    expect(r.body).not.toContain('secret-a2');
    // profil : mêmes pistes, mode mémoriser permis (Ḥafṣ)
    const p = await c.req(
      'GET',
      `/api/v1/profiles/${profileId}/quran/suras/2/tracks?recitateur=qf-husary&mode=memoriser`,
      A,
    );
    expect(p.statusCode).toBe(200);
    expect(p.json().files).toHaveLength(286);
    expect(p.json().files[285].url).toBe('https://verses.quran.foundation/R6/mp3/002286.mp3');
    // sourate absente du prélancement
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/qf-afasy/suras/112', A)).statusCode,
    ).toBe(404);
  });

  it('hors ligne : aucun paquet, aucun relais d’école pour un récitateur en ligne', async () => {
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/qf-afasy/packs', A)).json().error.code,
    ).toBe('en_ligne_seulement');
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/qf-afasy/packs/1', A)).statusCode,
    ).toBe(404);
    // même inscrit par erreur pour une école, un récitateur en ligne ne donne aucun fichier au relais
    const rel = await createRelay(c.h.db, 'École A2', 'ecole-a2.relais.exemple.org');
    await c.h.db.insert(t.relayReciter).values({ relayId: rel.id, reciterId: 'qf-afasy' });
    const rl = await c.req('GET', '/api/v1/relais/quran-audio', { 'x-relais-jeton': rel.token });
    expect(rl.statusCode).toBe(200);
    expect(rl.json().reciters).toEqual([]);
  });

  it('préférence et liste du parent : un récitateur en ligne se choisit comme les autres', async () => {
    expect(
      (
        await c.req('PUT', `/api/v1/profiles/${profileId}/quran/reciter`, A, {
          reciterId: 'qf-afasy',
        })
      ).statusCode,
    ).toBe(200);
    const me = (await c.req('GET', `/api/v1/profiles/${profileId}/quran/reciters`, A)).json();
    expect(me.preference).toEqual({ choisi: 'qf-afasy', effectif: 'qf-afasy' });
    const { P, pin } = await parent(c, 'parent-a2@exemple.org');
    const kid = await child(c, P, 'EnfantA2');
    expect(
      (
        await c.req('PUT', `/api/v1/profiles/${kid}/quran/allowed-reciters`, pin, {
          reciters: ['qf-husary'],
        })
      ).statusCode,
    ).toBe(200);
    const k = (await c.req('GET', `/api/v1/profiles/${kid}/quran/reciters`, P)).json();
    expect(k.reciters.map((r: { id: string }) => r.id)).toEqual(['qf-husary']);
    expect(
      (await c.req('GET', `/api/v1/profiles/${kid}/quran/suras/1/tracks?recitateur=qf-afasy`, P))
        .statusCode,
    ).toBe(403);
  });

  it('panne de QF : 502 « qf_indisponible » (sans détail) ; le cache sert encore les sourates déjà vues', async () => {
    down = true;
    try {
      const r = await c.req('GET', '/api/v1/quran/audio/reciters/qf-husary/suras/1', A);
      expect(r.statusCode).toBe(502);
      expect(r.json().error.code).toBe('qf_indisponible');
      // al-Fātiḥa d'al-ʿAfāsī : déjà demandée, gardée (≤ 24 h)
      expect(
        (await c.req('GET', '/api/v1/quran/audio/reciters/qf-afasy/suras/1', A)).statusCode,
      ).toBe(200);
    } finally {
      down = false;
    }
  });

  it('sans identifiants QF : fonction inactive, récitateurs en ligne absents, sans erreur', async () => {
    const off = buildApp({ db: c.h.db, relaisCertsDir: null, qf: null, audioDir: null });
    await off.ready();
    try {
      const b = (await off.inject({ method: 'GET', url: '/api/v1/quran/audio/reciters' })).json();
      expect(b.reciters.some((r: { enLigne: boolean }) => r.enLigne)).toBe(false);
      const r = await off.inject({
        method: 'GET',
        url: '/api/v1/quran/audio/reciters/qf-afasy/suras/1',
      });
      expect(r.statusCode).toBe(404);
    } finally {
      await off.close();
    }
  });

  it('retrait immédiat d’un récitateur en ligne par l’administrateur', async () => {
    await retireReciter(c.h.db, 'qf-husary', 'essai de coupure A2', null);
    const b = (await c.req('GET', '/api/v1/quran/audio/reciters')).json();
    expect(b.reciters.map((r: { id: string }) => r.id)).not.toContain('qf-husary');
    expect(
      (await c.req('GET', '/api/v1/quran/audio/reciters/qf-husary/suras/1', A)).statusCode,
    ).toBe(404);
  });
});
