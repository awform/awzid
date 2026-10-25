/**
 * « Retrouve ce verset » et suivi de la récitation (interrupteur shazam_coran, coupé par défaut) : interrupteur,
 * accord « analyse vocale par IA » (enfant : code parent), recherche dans tout le texte (passage, ex æquo, seuil),
 * moins de 3 s de voix, refus du service, mode « suivi » du direct, et VOIX JAMAIS CONSERVÉE.
 * Service d'écoute FACTICE (aucun modèle) ; texte : petites phrases ORDINAIRES (aucun texte religieux).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { cleMot, type MotEntendu } from '@awform/hifz';
import type { ClientEcoute, RetrouverBrut } from '../src/ecoute-ia.js';
import { adult, child, parent, setup, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const AUDIO = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(2000, 5)]);
// petites phrases ordinaires ; 3:1 a le même texte que 2:2 (formule répétée)
const VERSETS = [
  { sura: 2, aya: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا مَعَ أَخِيهِ الصَّغِيرِ' },
  { sura: 2, aya: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ الكَبِيرِ' },
  { sura: 2, aya: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا بِمَا تَعَلَّمَ' },
  { sura: 3, aya: 1, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ الكَبِيرِ' },
  { sura: 3, aya: 2, text: 'كَتَبَتِ البِنْتُ رِسَالَةً طَوِيلَةً إِلَى جَدَّتِهَا' },
];
const mots = (sura: number, aya: number): MotEntendu[] =>
  VERSETS.find((v) => v.sura === sura && v.aya === aya)!
    .text.split(' ')
    .map((w, n) => ({ w: cleMot(w), conf: 0.95, t0: n * 0.5, t1: n * 0.5 + 0.4 }));

describe.skipIf(!URL_)('shazam_coran : Retrouve ce verset et suivi (awform_test)', () => {
  let c: Ctx;
  let ecouteOuvert = false;
  let shazamOuvert = false;
  let reponse: () => RetrouverBrut | { erreur: string; statut: number };
  const recus: Buffer[] = [];
  const directs: boolean[] = [];
  let P: Record<string, string>;
  let PIN: Record<string, string>;
  let A: Record<string, string>;
  let enfant = '';
  let adulteP = '';

  const client: ClientEcoute = {
    ecouter: async () => ({ erreur: 'inutile', statut: 503 }),
    direct: async (_sid, pcm, suivi) => {
      directs.push(!!suivi);
      return { mots: [], partiel: [], t: pcm.length / 32000 };
    },
    finDirect: async () => {},
    sante: async () => true,
    retrouver: async (audio) => {
      recus.push(audio);
      return reponse();
    },
  };
  const lu = (m: MotEntendu[], ctc = m, voix_s = 6): RetrouverBrut => ({
    mots: m,
    mots_ctc: ctc,
    voix_s,
    duree: 7,
    calcul: 0.3,
  });

  beforeAll(async () => {
    c = await setup(URL_!, [], {
      ecoute: { client, decision: () => ecouteOuvert, shazam: () => shazamOuvert },
    });
    await c.h.db.insert(t.quranVerse).values(VERSETS);
    ({ P, pin: PIN } = await parent(c, 'parent-shazam@exemple.org'));
    enfant = await child(c, P, 'Moussa', 10);
    ({ A, profileId: adulteP } = await adult(c, 'adulte-shazam@exemple.org'));
    reponse = () => lu(mots(2, 3));
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const retrouver = (
    h: Record<string, string>,
    profil = enfant,
    body = AUDIO,
    type = 'audio/webm',
  ) =>
    c.app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${profil}/ecoute/retrouver`,
      payload: body,
      headers: { 'x-awform': '1', 'content-type': type, ...h },
    });

  it('interrupteur coupé (défaut) : rien n’est proposé, la recherche est refusée', async () => {
    expect((await c.req('GET', `/api/v1/profiles/${enfant}/ecoute`, P)).json()).toEqual({
      active: false,
    });
    expect((await retrouver(P)).json().error.code).toBe('fonction_fermee');
    // « Réciter et vérifier » ouvert mais pas shazam_coran : aucun champ « shazam »
    ecouteOuvert = true;
    expect(
      (await c.req('GET', `/api/v1/profiles/${enfant}/ecoute`, P)).json().shazam,
    ).toBeUndefined();
    ecouteOuvert = false;
    expect(recus).toHaveLength(0);
  });

  it('interrupteur ouvert : accord exigé ; enfant : seulement avec le code parent', async () => {
    shazamOuvert = true;
    const e = (await c.req('GET', `/api/v1/profiles/${enfant}/ecoute`, P)).json();
    expect(e).toMatchObject({ active: false, shazam: true, accord: false, enfant: true });
    const r = await retrouver(P);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('accord_requis');
    const sansCode = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/accord`, P, {});
    expect(sansCode.json().error.code).toBe('code_parent_incorrect');
    const avecCode = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/accord`, PIN, {});
    expect(avecCode.statusCode, avecCode.body).toBe(200);
    expect(
      (await c.req('POST', `/api/v1/profiles/${adulteP}/ecoute/accord`, A, {})).statusCode,
    ).toBe(200);
    expect(recus).toHaveLength(0);
  });

  it('passage retrouvé : verset, passage, score ; l’audio est transmis tel quel', async () => {
    const r = await retrouver(P);
    expect(r.statusCode, r.body).toBe(200);
    const j = r.json();
    expect(j.statut).toBe('trouve');
    expect(j.resultats[0]).toMatchObject({ verset: '2:3', passage: ['2:3'], score: 1 });
    expect(j.egaux).toEqual([]);
    expect(recus.at(-1)!.equals(AUDIO)).toBe(true);
  });

  it('double lecture : une lecture fausse (RNN-T) est rattrapée par l’autre (CTC)', async () => {
    const faux = ['تفسير', 'سورة', 'الدرس', 'الاول'].map((w) => ({ w, conf: 0.9 }));
    reponse = () => lu(faux, mots(3, 2));
    const j = (await retrouver(A, adulteP)).json();
    expect(j.resultats[0].verset).toBe('3:2');
    reponse = () => lu(mots(2, 3));
  });

  it('lecture « décrochée » : la relecture sans le début de l’extrait retrouve le passage', async () => {
    const faux = ['تفسير', 'سورة', 'الاعراف', 'الدرس'].map((w) => ({ w, conf: 0.9 }));
    reponse = () => ({ ...lu(faux, faux), relecture: { mots: mots(2, 1), mots_ctc: [] } });
    const j = (await retrouver(A, adulteP)).json();
    expect(j.resultats[0].verset).toBe('2:1');
    reponse = () => lu(mots(2, 3));
  });

  it('texte identique ailleurs : les versets ex æquo, ensemble', async () => {
    reponse = () => lu(mots(2, 2));
    const j = (await retrouver(P)).json();
    expect(j.statut).toBe('trouve');
    expect([...j.egaux].sort()).toEqual(['2:2', '3:1']);
    reponse = () => lu(mots(2, 3));
  });

  it('moins de 3 s de voix : « trop court », rien n’est cherché ; autre chose : « pas trouvé »', async () => {
    reponse = () => lu([], [], 2.1);
    expect((await retrouver(P)).json()).toMatchObject({ statut: 'trop_court', resultats: [] });
    reponse = () =>
      lu(
        ['سافر', 'التاجر', 'بالقطار', 'الى', 'مدينة', 'بعيدة', 'جدا'].map((w) => ({
          w,
          conf: 0.9,
        })),
      );
    expect((await retrouver(P)).json()).toEqual(
      expect.objectContaining({ statut: 'pas_trouve', resultats: [], egaux: [] }),
    );
    reponse = () => lu(mots(2, 3));
  });

  it('refus : corps non audio, extrait trop long, service occupé', async () => {
    expect(
      (await retrouver(P, enfant, Buffer.from('{}'), 'application/octet-stream')).statusCode,
    ).toBe(400);
    reponse = () => ({ ...lu(mots(2, 3)), duree: 31 });
    expect((await retrouver(P)).json().error.code).toBe('audio_trop_long');
    reponse = () => ({ erreur: 'occupe', statut: 503 });
    expect((await retrouver(P)).json().error.code).toBe('ecoute_occupee');
    reponse = () => lu(mots(2, 3));
  });

  it('la voix n’est jamais conservée : aucune ligne audio, journal sans contenu (ni mots, ni verset)', async () => {
    expect(await c.h.db.select().from(t.recitationUpload)).toHaveLength(0);
    const journal = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'ecoute.retrouver'));
    expect(journal.length).toBeGreaterThan(0);
    for (const l of journal) {
      const s = JSON.stringify(l);
      expect(s).not.toMatch(/[؀-ۿ]/);
      expect(s).not.toContain('OggS');
      expect(Object.keys((l.after as object) ?? {}).sort()).toEqual(['secondes', 'statut']);
    }
  });

  it('suivi de la récitation : mode « suivi » seulement si shazam_coran est ouvert', async () => {
    ecouteOuvert = true;
    const Q = 's=2&from=1&to=3&suivi=1';
    const d = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/direct?${Q}`, P, {});
    expect(d.statusCode, d.body).toBe(200);
    expect(d.json().suivi).toBe(true);
    const morceau = (sid: string) =>
      c.app.inject({
        method: 'POST',
        url: `/api/v1/ecoute/direct/${sid}`,
        payload: Buffer.alloc(32000),
        headers: { 'x-awform': '1', 'content-type': 'application/octet-stream', ...P },
      });
    expect((await morceau(d.json().sid)).statusCode).toBe(200);
    expect(directs.at(-1)).toBe(true);
    shazamOuvert = false;
    const d2 = await c.req('POST', `/api/v1/profiles/${enfant}/ecoute/direct?${Q}`, P, {});
    expect(d2.json().suivi).toBeUndefined();
    await morceau(d2.json().sid);
    expect(directs.at(-1)).toBe(false);
    shazamOuvert = true;
    ecouteOuvert = false;
  });

  it('personnel : jamais ; retrait de l’accord : plus de recherche', async () => {
    const T = await teacher(c, 'maitre-shazam@ecole.example');
    expect((await retrouver(T)).statusCode).toBe(403);
    expect((await c.req('DELETE', `/api/v1/profiles/${enfant}/ecoute/accord`, P)).statusCode).toBe(
      200,
    );
    expect((await retrouver(P)).json().error.code).toBe('accord_requis');
  });
});
