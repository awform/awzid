/**
 * Indication des madd (25/10/2026, interrupteur `tajwid_madd`) : coupé par défaut ; ADULTES seulement ; accord « analyse vocale par IA » ;
 * la référence est la récitation d'Ayyūb (fichier du Complexe) ; la sortie est UNE INDICATION OU RIEN (« trop_court » ou null — jamais
 * « correct », jamais un nombre, même si le service répond autre chose) ; la voix n'est jamais conservée.
 * Service FACTICE (aucun modèle) ; audio d'essai non coranique (bips WAV générés par `writeTestMushaf`).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  COMPLEXE_CATALOGUE,
  importReciterAudio,
  invalidateFlags,
  schema as t,
  upsertReciter,
  writeTestMushaf,
} from '@awform/db';
import {
  indicationSure,
  REFERENCE_MADD,
  type ClientMadd,
  type DemandeMadd,
} from '../src/tajwid-madd.js';
import { adult, child, parent, setup, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const VOIX = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(3000, 7)]);

describe('indication des madd : la sortie du service est bornée', () => {
  it('seule « trop_court » passe ; tout le reste devient « rien »', () => {
    expect(indicationSure('trop_court')).toBe('trop_court');
    for (const v of [
      null,
      undefined,
      'correct',
      'ok',
      'trop_long',
      0.7,
      1,
      true,
      {},
      ['trop_court'],
    ])
      expect(indicationSure(v)).toBeNull();
    expect(REFERENCE_MADD).toBe('ayyoub-hafs');
  });
});

describe.skipIf(!URL_)('indication des madd (API, base de test)', () => {
  let c: Ctx;
  let store: string;
  let src: string;
  let A: Record<string, string>;
  let adulte = '';
  let P: Record<string, string>;
  let enfant = '';
  let accord = true;
  let reponse: Awaited<ReturnType<ClientMadd['madd']>> = {
    indication: null,
    raison: 'zone_non_signalee',
  };
  const appels: Array<{ ref: Buffer; eleve: Buffer; d: DemandeMadd }> = [];
  const client: ClientMadd = {
    madd: async (ref, eleve, d) => {
      appels.push({ ref, eleve, d });
      return reponse;
    },
    sante: async () => true,
  };

  const ouvrir = async () => {
    await c.h.db.delete(t.featureFlag).where(eq(t.featureFlag.key, 'tajwid_madd'));
    await c.h.db.insert(t.featureFlag).values({ key: 'tajwid_madd', state: 'on' });
    invalidateFlags();
  };
  const demander = (
    h: Record<string, string>,
    profil = adulte,
    q = 's=112&a=2&k=0&type=muttasil&n=1',
    body: Buffer = VOIX,
    type = 'audio/webm',
  ) =>
    c.app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${profil}/tajwid/madd?${q}`,
      payload: body,
      headers: { 'x-awform': '1', 'content-type': type, ...h },
    });

  beforeAll(async () => {
    store = mkdtempSync(join(tmpdir(), 'awzid-madd-store-'));
    src = mkdtempSync(join(tmpdir(), 'awzid-madd-src-'));
    c = await setup(URL_!, [], {
      audioDir: store,
      madd: { client, consentement: async () => accord },
    });
    // Ayyūb : sourate d'essai 112 (bips WAV, jamais une récitation)
    await upsertReciter(
      c.h.db,
      COMPLEXE_CATALOGUE.find((x) => x.id === 'ayyoub-hafs')!,
    );
    writeTestMushaf(join(src, 'a'), [112]);
    const imp = await importReciterAudio(c.h.db, {
      reciterId: 'ayyoub-hafs',
      dir: join(src, 'a'),
      pattern: 'SSSVVV.wav',
      suras: [112],
      storageDir: store,
      activate: true,
      partialOk: true,
    });
    expect(imp.status).toBe('active');
    // versets de la base de test : petites phrases ORDINAIRES si le contenu coranique manque
    await c.h.db
      .insert(t.quranVerse)
      .values(
        [1, 2, 3, 4].map((aya) => ({ sura: 112, aya, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ' })),
      )
      .onConflictDoNothing();
    ({ A, profileId: adulte } = await adult(c, 'adulte-madd@exemple.org'));
    const p = await parent(c, 'parent-madd@exemple.org');
    P = p.P;
    enfant = await child(c, P, 'Maryam', 9);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
    rmSync(store, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  });

  it('coupé par défaut : le serveur refuse partout (fonction_coupee)', async () => {
    const g = await c.req('GET', `/api/v1/profiles/${adulte}/tajwid/madd`, A);
    expect(g.statusCode).toBe(403);
    expect(g.json().error.code).toBe('fonction_coupee');
    const r = await demander(A);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('fonction_coupee');
    expect(appels).toHaveLength(0);
    await ouvrir();
  });

  it('adultes seulement : un profil d’enfant est refusé, même fonction ouverte', async () => {
    for (const r of [
      await c.req('GET', `/api/v1/profiles/${enfant}/tajwid/madd`, P),
      await demander(P, enfant),
    ]) {
      expect(r.statusCode).toBe(403);
      expect(r.json().error.code).toBe('adultes_seulement');
    }
    expect(appels).toHaveLength(0);
  });

  it('état pour l’appareil : fonction ouverte, service prêt, accord', async () => {
    const g = (await c.req('GET', `/api/v1/profiles/${adulte}/tajwid/madd`, A)).json();
    expect(g).toEqual({ active: true, disponible: true, accord: true });
  });

  it('accord « analyse vocale par IA » exigé', async () => {
    accord = false;
    const r = await demander(A);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('accord_requis');
    expect(appels).toHaveLength(0);
    accord = true;
  });

  it('entrées contrôlées : type non long, verset absent, audio vide ou non audio', async () => {
    expect((await demander(A, adulte, 's=112&a=2&k=0&type=tabii')).statusCode).toBe(400);
    expect((await demander(A, adulte, 's=112&a=2&type=muttasil')).statusCode).toBe(400);
    const absent = await demander(A, adulte, 's=112&a=99&k=0&type=muttasil');
    expect(absent.statusCode).toBe(400);
    expect(absent.json().error.code).toBe('portion_invalide');
    const nonAudio = await demander(
      A,
      adulte,
      undefined,
      Buffer.from('xx'),
      'application/octet-stream',
    );
    expect(nonAudio.json().error.code).toBe('audio_invalide');
    expect(appels).toHaveLength(0);
  });

  it('référence = récitation d’Ayyūb du verset (fichier du Complexe) ; l’élève part tel quel ; une indication « trop_court »', async () => {
    reponse = { indication: 'trop_court', raison: 'sous_le_seuil' };
    const r = await demander(A);
    expect(r.statusCode, r.body).toBe(200);
    // SEULE sortie : l'indication (pas de raison, pas de mesure)
    expect(r.json()).toEqual({ indication: 'trop_court' });
    const a = appels.at(-1)!;
    expect(a.d).toEqual({ k: 0, type: 'muttasil', n: 1 });
    expect(a.eleve.equals(VOIX)).toBe(true);
    const dir = join(store, 'ayyoub-hafs');
    const fichier = readdirSync(dir).find((f) => f.startsWith('112002-'))!;
    expect(a.ref.equals(readFileSync(join(dir, fichier)))).toBe(true);
  });

  it('jamais « correct » ni un nombre : si le service répond autre chose, l’API rend « rien »', async () => {
    for (const v of ['correct', 'ok', 0.93, 1, 'trop_long', { r: 0.8 }]) {
      reponse = { indication: v, raison: 'x' };
      const r = await demander(A);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ indication: null });
    }
    reponse = { indication: null, raison: 'zone_non_signalee' };
    expect((await demander(A, adulte, 's=112&a=3&k=1&type=lazim')).json()).toEqual({
      indication: null,
    });
    expect(appels.at(-1)!.d).toEqual({ k: 1, type: 'lazim' });
  });

  it('référence absente (verset non hébergé) : 404, rien n’est envoyé au service', async () => {
    const avant = appels.length;
    await c.h.db
      .insert(t.quranVerse)
      .values({ sura: 113, aya: 1, text: 'ذَهَبَ الوَلَدُ' })
      .onConflictDoNothing();
    const r = await demander(A, adulte, 's=113&a=1&k=0&type=muttasil');
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('reference_absente');
    expect(appels).toHaveLength(avant);
  });

  it('service en échec : « indisponible », jamais une fausse indication', async () => {
    reponse = { erreur: 'occupe', statut: 503 };
    let r = await demander(A);
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('ecoute_occupee');
    reponse = { erreur: 'madd_indisponible', statut: 503 };
    r = await demander(A);
    expect(r.json().error.code).toBe('madd_indisponible');
    reponse = { erreur: 'audio_cadrage', statut: 400 };
    r = await demander(A);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('audio_invalide');
    reponse = { indication: null, raison: 'zone_non_signalee' };
  });

  it('la voix n’est jamais conservée : aucune ligne audio en base, journal sans voix ni mesure', async () => {
    expect(await c.h.db.select().from(t.recitationUpload)).toHaveLength(0);
    const journal = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'tajwid.madd'));
    expect(journal.length).toBeGreaterThan(0);
    for (const l of journal) {
      expect(Object.keys(l.after as object).sort()).toEqual(['indication', 'type', 'verset']);
      const s = JSON.stringify(l);
      expect(s).not.toContain('OggS');
      expect(s).not.toMatch(/correct|duree|rapport|pourcent|score/i);
    }
  });
});
