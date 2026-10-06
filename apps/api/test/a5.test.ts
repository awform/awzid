/**
 * A5 — « L'IA qui écoute la récitation » : interrupteur, accord « analyse vocale par IA » (enfant : code parent),
 * vérification d'une portion (écarts, positions, confiance), refus du service (trop long, occupé), suivi en
 * direct (séance à soi), et VOIX JAMAIS CONSERVÉE (rien en base, journal sans contenu).
 * Service d'écoute FACTICE (aucun modèle) ; texte de la portion lu dans la base de test (contenu synthétique).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t, versesOf } from '@awform/db';
import { cleMot, motsAttendus, type MotEntendu } from '@awform/hifz';
import type { ClientEcoute } from '../src/ecoute-ia.js';
import { adult, child, parent, setup, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const AUDIO = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(3000, 7)]);

describe.skipIf(!URL_)('A5 : écoute de la récitation (awform_test)', () => {
  let c: Ctx;
  let ouvert = true;
  let reponse: (att: string[]) => Awaited<ReturnType<ClientEcoute['ecouter']>>;
  const recus: Buffer[] = [];
  const fins: string[] = [];
  let P: Record<string, string>;
  let PIN: Record<string, string>;
  let A: Record<string, string>;
  let enfant = '';
  let adulteP = '';
  let attendus: string[] = [];
  // portion de test : 3 premiers versets de la sourate 2 de la base de test (texte de la base, jamais retapé)
  const S = 2;
  const Q = `s=${S}&from=1&to=3`;

  const client: ClientEcoute = {
    ecouter: async (audio) => {
      recus.push(audio);
      return reponse(attendus);
    },
    direct: async (_sid, pcm) => ({ mots: [], partiel: [], t: pcm.length / 32000 }),
    finDirect: async (sid) => {
      fins.push(sid);
    },
    sante: async () => true,
  };
  const juste = (att: string[]) => ({
    mots: att.map((w, n) => ({ w, conf: 0.95, t0: n * 0.5, t1: n * 0.5 + 0.4 })) as MotEntendu[],
    voix: att.map((_, n) => [n * 0.5, n * 0.5 + 0.4] as [number, number]),
    duree: att.length * 0.5,
    calcul: 0.2,
  });

  beforeAll(async () => {
    c = await setup(URL_!, [], { ecoute: { client, decision: () => ouvert } });
    const vs = await versesOf(c.h.db, S, 1, 3);
    if (vs.length !== 3) {
      // base sans contenu coranique : petites phrases ORDINAIRES (aucun texte religieux)
      await c.h.db.insert(t.quranVerse).values([
        { sura: S, aya: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ' },
        { sura: S, aya: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ' },
        { sura: S, aya: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا' },
      ]);
    }
    const [b] = await versesOf(c.h.db, 1, 1, 1);
    attendus = motsAttendus(await versesOf(c.h.db, S, 1, 3), b?.text ?? '')
      .filter((m) => !m.facultatif && !m.lettres)
      .map((m) => m.cle);
    ({ P, pin: PIN } = await parent(c, 'parent-a5@exemple.org'));
    enfant = await child(c, P, 'Aminata', 9);
    ({ A, profileId: adulteP } = await adult(c, 'adulte-a5@exemple.org'));
    reponse = juste;
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const verifier = (
    h: Record<string, string>,
    profil = enfant,
    q = Q,
    body = AUDIO,
    type = 'audio/webm',
  ) =>
    c.app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${profil}/ecoute/verifier?${q}`,
      payload: body,
      headers: { 'x-awform': '1', 'content-type': type, ...h },
    });

  it('interrupteur fermé : rien n’est proposé, la vérification est refusée', async () => {
    ouvert = false;
    expect((await c.req('GET', `/api/v1/profiles/${enfant}/ecoute`, P)).json()).toEqual({
      active: false,
    });
    expect((await verifier(P)).json().error.code).toBe('fonction_fermee');
    ouvert = true;
    const e = (await c.req('GET', `/api/v1/profiles/${enfant}/ecoute`, P)).json();
    expect(e).toMatchObject({ active: true, accord: false, enfant: true, maxSecondes: 300 });
  });

  it('accord « analyse vocale par IA » exigé ; enfant : seulement avec le code parent', async () => {
    const r = await verifier(P);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('accord_requis');
    const sansCode = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/accord`, P, {});
    expect(sansCode.json().error.code).toBe('code_parent_incorrect');
    const avecCode = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/accord`, PIN, {});
    expect(avecCode.statusCode, avecCode.body).toBe(200);
    const [row] = (
      await c.h.db.select().from(t.consent).where(eq(t.consent.profileId, enfant))
    ).filter((x) => x.type === 'analyse_vocale_ia');
    expect(row).toMatchObject({ type: 'analyse_vocale_ia', withdrawnAt: null });
    expect((row!.evidence as { methode: string }).methode).toBe('code_parent');
    // adulte : son propre accord
    expect(
      (await c.req('POST', `/api/v1/profiles/${adulteP}/ecoute/accord`, A, {})).statusCode,
    ).toBe(200);
  });

  it('récitation juste : aucun écart, positions des mots pour surligner le texte', async () => {
    const r = await verifier(P);
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.resultat.statut).toBe('resultat');
    expect(j.resultat.ecarts).toEqual([]);
    expect(j.aRevoir).toBe(0);
    expect(j.positions[0]).toEqual([S, 1, expect.any(Number)]);
    expect(recus.at(-1)!.equals(AUDIO)).toBe(true);
  });

  it('mot oublié : signalé avec sa position et sa confiance', async () => {
    reponse = (att) => {
      const x = juste(att);
      // le mot n'a pas été dit : ni mot, ni voix à sa place
      return {
        ...x,
        mots: x.mots.filter((_, n) => n !== 4),
        voix: x.voix.filter((_, n) => n !== 4),
      };
    };
    const j = (await verifier(A, adulteP)).json();
    expect(j.resultat.ecarts).toHaveLength(1);
    expect(j.resultat.ecarts[0]).toMatchObject({ type: 'oublie', s: S });
    expect(j.resultat.ecarts[0].confiance).toBeGreaterThanOrEqual(0.6);
    expect(j.aRevoir).toBe(1);
    reponse = juste;
  });

  it('bruit ou autre passage : « pas compris », aucun écart inventé', async () => {
    reponse = () => juste(['كتب', 'الطالب', 'رسالة', 'طويلة'].map(cleMot));
    const j = (await verifier(P)).json();
    expect(j.resultat.statut).toBe('pas_compris');
    expect(j.resultat.ecarts).toEqual([]);
    reponse = juste;
  });

  it('refus : portion inconnue, corps non audio, audio trop long, service occupé', async () => {
    expect((await verifier(P, enfant, 's=2&from=3&to=1')).json().error.code).toBe(
      'portion_invalide',
    );
    expect(
      (await verifier(P, enfant, Q, Buffer.from('{}'), 'application/octet-stream')).statusCode,
    ).toBe(400);
    reponse = () => ({ erreur: 'audio_trop_long', statut: 413 });
    const r = await verifier(P);
    expect(r.statusCode).toBe(413);
    expect(r.json().error.code).toBe('audio_trop_long');
    reponse = () => ({ erreur: 'occupe', statut: 503 });
    expect((await verifier(P)).json().error.code).toBe('ecoute_occupee');
    reponse = juste;
  });

  it('la voix n’est jamais conservée : aucune ligne audio en base, journal sans contenu', async () => {
    const recits = await c.h.db.select().from(t.recitationUpload);
    expect(recits).toHaveLength(0);
    const journal = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'ecoute.verifier'));
    expect(journal.length).toBeGreaterThan(0);
    for (const l of journal) {
      const s = JSON.stringify(l);
      expect(s).not.toMatch(/[\u0600-\u06FF]/); // aucun mot entendu
      expect(s).not.toContain('OggS');
    }
  });

  it('suivi en direct : séance à soi, morceaux relayés, fin = effacement', async () => {
    const d = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/direct?${Q}`, P, {});
    expect(d.statusCode).toBe(200);
    const sid = d.json().sid as string;
    const morceau = await c.app.inject({
      method: 'POST',
      url: `/api/v1/ecoute/direct/${sid}`,
      payload: Buffer.alloc(32000),
      headers: { 'x-awform': '1', 'content-type': 'application/octet-stream', ...P },
    });
    expect(morceau.json()).toEqual({ mots: [], partiel: [], t: 1 });
    // une autre famille ne peut pas s'en servir
    const autre = await c.app.inject({
      method: 'POST',
      url: `/api/v1/ecoute/direct/${sid}`,
      payload: Buffer.alloc(320),
      headers: { 'x-awform': '1', 'content-type': 'application/octet-stream', ...A },
    });
    expect(autre.statusCode).toBe(404);
    expect((await c.req('DELETE', `/api/v1/ecoute/direct/${sid}`, P)).statusCode).toBe(200);
    expect(fins).toContain(sid);
  });

  it('retrait de l’accord : plus d’analyse ; personnel : jamais', async () => {
    expect((await c.req('DELETE', `/api/v1/profiles/${enfant}/ecoute/accord`, P)).statusCode).toBe(
      200,
    );
    expect((await verifier(P)).json().error.code).toBe('accord_requis');
    const T = await teacher(c, 'maitre-a5@ecole.example');
    expect((await verifier(T)).statusCode).toBe(403);
  });
});
