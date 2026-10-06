/**
 * Chantier A27 — parcours par niveau et par classe, de bout en bout par l'API (base de test, contenu
 * SYNTHÉTIQUE : aucun texte religieux ; le « verset » de référence est une phrase inventée posée dans la table
 * de référence du test) :
 *  - l'élève ne voit QUE son niveau (leçons, état, écriture), le suivant en aperçu (titres seuls) ;
 *  - « J'écris le Coran » n'apparaît qu'à partir de la leçon où le livre fait recopier le premier verset ;
 *  - test de positionnement (exercices de l'épreuve de fin de niveau, notés par le serveur, sans corrigé
 *    envoyé) qui fixe le niveau ; épreuve de passage (niveau suivant, origine « épreuve », nouvel essai le
 *    lendemain) ; mots du Coran du niveau et couverture calculée ;
 *  - décisions D-F2 : demande d'émancipation du jeune (de droit à 18 ans), proposition de réinscription,
 *    messages d'un enseignant parti gardés (« ancien enseignant »), archives anonymisées après 3 ans ;
 *  - correctif : nombre de copies d'une session d'épreuve (colonne SQL non qualifiée).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  anonymizeSchoolArchives,
  ARCHIVE_NAME,
  classExamSessions,
  expectedPlacementLevel,
  importQuranLemmas,
  purgeDeletedAccounts,
  schema as t,
} from '@awform/db';
import { gradeSelection, selectExercises } from '../src/parcours-a27.js';
import {
  adult,
  child,
  join,
  newClass,
  parent,
  PW,
  setup,
  teacher,
  YEAR,
  type Ctx,
} from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

/** phrase inventée tenant lieu de verset dans la table de référence du test (jamais un vrai verset) */
const VERSE = 'كَتَبَ ٱلْوَلَدُ دَرْسَهُ فِى ٱلْبَيْتِ';
const exam = (lv: string, n: number) => ({
  id: `${lv}.l${String(n).padStart(2, '0')}`,
  n,
  kind: 'examen' as const,
  content: {
    n,
    type: 'examen',
    lecture: { phrases: [{ ar: 'نَصٌّ قَصِيرٌ', fr: 'Texte court' }] },
    exercices: [
      {
        id: `${lv}.ex1`,
        type: 'vrai_faux',
        items: [
          { fr: 'Phrase A', vrai: true },
          { fr: 'Phrase B', vrai: false },
        ],
      },
      {
        id: `${lv}.ex2`,
        type: 'complete',
        items: [
          { avant: 'أَ', apres: '', options: ['بٌ', 'تٌ'], reponse: 'بٌ' },
          { avant: 'دَ', apres: '', options: ['رٌ', 'زٌ'], reponse: 'زٌ' },
        ],
      },
      { id: `${lv}.ex3`, type: 'ecoute', items: [{ options: ['a', 'b'], reponse: 'a' }] },
    ],
  },
});
const GOOD = (lv: string) => ({
  [`${lv}.ex1`]: { 0: { value: true }, 1: { value: false } },
  [`${lv}.ex2`]: { 0: { choice: 'بٌ' }, 1: { choice: 'زٌ' } },
});
const BAD = (lv: string) => ({
  [`${lv}.ex1`]: { 0: { value: false }, 1: { value: true } },
  [`${lv}.ex2`]: { 0: { choice: 'تٌ' }, 1: { choice: 'رٌ' } },
});

describe.skipIf(!URL)('A27 — parcours par niveau et par classe (awform_test)', () => {
  let c: Ctx;
  let T: H;

  async function addUnit(
    level: string,
    u: { id: string; n: number; kind?: 'lecon' | 'bilan' | 'examen'; content?: object },
  ) {
    await c.h.db
      .insert(t.unit)
      .values({ id: u.id, levelCode: level, n: u.n, kind: u.kind ?? 'lecon' });
    const content = (u.content ?? { n: u.n, type: u.kind ?? 'lecon', exercices: [] }) as {
      exercices?: Array<{ id: string; type: string }>;
    };
    await c.h.db.insert(t.unitVersion).values({
      editionId: c.editionId,
      unitId: u.id,
      numLecon: (u.kind ?? 'lecon') === 'lecon' ? u.n : null,
      numBilan: null,
      titleAr: 'عُنْوَانٌ',
      titleFr: `Titre ${u.id}`,
      sha256: u.id,
      strictJson: true,
      content,
      student: content,
    });
    let pos = 0;
    for (const e of content.exercices ?? []) {
      await c.h.db
        .insert(t.exercise)
        .values({ id: e.id, unitId: u.id, position: ++pos, type: e.type, graded: true });
      await c.h.db.insert(t.exerciseVersion).values({
        editionId: c.editionId,
        exerciseId: e.id,
        position: pos,
        hash: `h-${e.id}`,
        itemCount: 2,
        content: e,
      });
    }
  }

  beforeAll(async () => {
    c = await setup(URL!, []);
    await c.h.pool.query(`update level set subject_code = 'arabe' where code = 'en1'`);
    await c.h.pool.query(
      `insert into level (code, track, rank, title_fr, subject_code) values
        ('en2', 'enfants', 2, 'Niveau 2', 'arabe'), ('en3', 'enfants', 3, 'Niveau 3', 'arabe')`,
    );
    await c.h.db.insert(t.levelVersion).values(
      ['en1', 'en2', 'en3'].map((levelCode) => ({
        editionId: c.editionId,
        levelCode,
        book: { titre_fr: `Livre ${levelCode}`, titre_ar: 'كِتَابٌ' },
      })),
    );
    // en1 : l01 (écriture sans verset), l02 (le livre fait recopier le « verset »), l03 examen
    await addUnit('en1', {
      id: 'en1.l01',
      n: 1,
      content: { n: 1, type: 'lecon', ecriture: { mots: ['بَابٌ'], copie: ['بَابٌ كَبِيرٌ.'] } },
    });
    await addUnit('en1', {
      id: 'en1.l02',
      n: 2,
      content: { n: 2, type: 'lecon', ecriture: { copie: [VERSE] } },
    });
    await addUnit('en1', exam('en1', 3));
    await addUnit('en2', {
      id: 'en2.l01',
      n: 1,
      content: { n: 1, type: 'lecon', secret: 'contenu' },
    });
    await addUnit('en2', exam('en2', 2));
    await addUnit('en3', { id: 'en3.l01', n: 1 });
    await addUnit('en3', exam('en3', 2));
    await c.h.db.insert(t.quranVerse).values({ sura: 1, aya: 1, text: VERSE });
    T = await teacher(c, 'maitre-a27@ecole.example');
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('espace du niveau : le seul niveau courant, le suivant en aperçu (titres sans contenu)', async () => {
    const fam = await parent(c, 'espace@exemple.org');
    const kid = await child(c, fam.P, 'Amina', 8);
    const r = await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P);
    expect(r.statusCode, r.body).toBe(200);
    const s = r.json();
    expect(s.courant).toMatchObject({ code: 'en1', origine: 'inscription' });
    expect(s.unites.map((u: { id: string }) => u.id)).toEqual(['en1.l01', 'en1.l02', 'en1.l03']);
    expect(s.unites.every((u: { id: string }) => u.id.startsWith('en1.'))).toBe(true);
    expect(s.prochaine).toBe('en1.l01');
    expect(s.examen).toMatchObject({ id: 'en1.l03' });
    expect(s.progression).toEqual({ faites: 0, total: 2 });
    expect(s.anciens).toEqual([]);
    expect(s.suivant.code).toBe('en2');
    expect(s.suivant.lecons.map((l: { titleFr: string }) => l.titleFr)).toEqual([
      'Titre en2.l01',
      'Titre en2.l02',
    ]);
    // aperçu : jamais le contenu d'une leçon du niveau suivant
    expect(r.body).not.toContain('secret');
    // l'en3 (deux niveaux plus loin) n'apparaît nulle part
    expect(r.body).not.toContain('en3.l01');
    // aucune matière inconnue, un autre compte : refusé
    const autre = await parent(c, 'autre-espace@exemple.org');
    expect((await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, autre.P)).statusCode).toBe(
      404,
    );
  });

  it('écriture : « J’écris le Coran » seulement à partir de la leçon du premier verset recopié', async () => {
    const fam = await parent(c, 'ecriture@exemple.org');
    const kid = await child(c, fam.P, 'Yanis', 9);
    let s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s.coranEcriture).toEqual({ depuis: 'en1.l02', visible: false });
    let w = (await c.req('GET', `/api/v1/profiles/${kid}/ecriture`, fam.P)).json();
    expect(w.coran.visible).toBe(false);
    expect(w.coran.versets).toEqual([]);
    expect(w.lecons.map((l: { id: string }) => l.id)).toEqual(['en1.l01']);
    // leçon 1 terminée → la leçon 2 (premier verset) est atteinte
    await c.h.db
      .insert(t.progress)
      .values({ profileId: kid, unitId: 'en1.l01', status: 'terminee' });
    s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s.coranEcriture).toEqual({ depuis: 'en1.l02', visible: true });
    expect(s.derniere).toMatchObject({ id: 'en1.l01', aEcriture: true, ecritureFaite: false });
    w = (await c.req('GET', `/api/v1/profiles/${kid}/ecriture`, fam.P)).json();
    expect(w.lecons.map((l: { id: string }) => l.id)).toEqual(['en1.l01', 'en1.l02']);
    // le texte vient de la table de référence, tel quel
    expect(w.coran.versets).toEqual([{ ref: '1:1', lecon: 'en1.l02', texte: VERSE }]);
    expect(w.coran.qc1Termine).toBe(false);
    // « J'ai fait l'écriture » et l'étape 1 d'un verset : journal d'entraînement (file hors ligne)
    const ev = (item: string, i: number) => ({
      id: `01900000-0000-7000-8000-0000000a27${String(i).padStart(2, '0')}`,
      profileId: kid,
      eventType: 'trace',
      unitId: 'entrainement',
      response: { item, ok: true, day: `${YEAR}-03-01` },
      deviceAt: new Date().toISOString(),
    });
    const sync = await c.req('POST', '/api/v1/attempts', fam.P, {
      events: [ev('cahier:en1.l01', 1), ev('coran:1:1:1', 2)],
    });
    expect(sync.statusCode, sync.body).toBe(200);
    s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s.derniere.ecritureFaite).toBe(true);
    w = (await c.req('GET', `/api/v1/profiles/${kid}/ecriture`, fam.P)).json();
    expect(w.coran.faits).toEqual(['1:1:1']);
  });

  it('positionnement : exercices de l’épreuve de fin de niveau, sans corrigé, qui fixent le niveau', async () => {
    const fam = await parent(c, 'positionnement@exemple.org');
    const kid = await child(c, fam.P, 'Nour', 9);
    const st = (await c.req('GET', `/api/v1/profiles/${kid}/positionnement/arabe`, fam.P)).json();
    expect(st).toMatchObject({ piste: 'en', niveaux: ['en1', 'en2', 'en3'], aTester: 'en1' });
    const v = await c.req('GET', `/api/v1/profiles/${kid}/positionnement/arabe/en1`, fam.P);
    expect(v.statusCode, v.body).toBe(200);
    // test COURT : deux exercices du livre (l'écoute, qui demande l'audio, n'est pas retenue)
    expect(v.json().exercises.map((e: { id: string }) => e.id)).toEqual(['en1.ex1', 'en1.ex2']);
    expect(v.body).not.toContain('reponse');
    expect(v.body).not.toContain('"vrai"');
    // hors de l'ordre du test : refusé ; enfant : code parent
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${kid}/positionnement/arabe/en2`, fam.pin, {
          answers: GOOD('en2'),
        })
      ).json().error.code,
    ).toBe('niveau_hors_ordre');
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${kid}/positionnement/arabe/en1`, fam.P, {
          answers: GOOD('en1'),
        })
      ).statusCode,
    ).toBe(401);
    const a = await c.req('POST', `/api/v1/profiles/${kid}/positionnement/arabe/en1`, fam.pin, {
      answers: GOOD('en1'),
    });
    expect(a.json()).toMatchObject({
      points: 4,
      max: 4,
      reussi: true,
      fini: false,
      suivant: 'en2',
    });
    const b = await c.req('POST', `/api/v1/profiles/${kid}/positionnement/arabe/en2`, fam.pin, {
      answers: BAD('en2'),
    });
    expect(b.json()).toMatchObject({ reussi: false, fini: true, niveau: 'en2', change: true });
    const lv = (await c.req('GET', `/api/v1/profiles/${kid}/niveaux`, fam.P)).json();
    const cur = lv.courants.find((x: { subject: string }) => x.subject === 'arabe');
    expect(cur).toMatchObject({ levelCode: 'en2', source: 'positionnement' });
    // le niveau en2 est désormais le seul visible ; en1 passe dans « Mes anciens livres »
    const s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s.courant.code).toBe('en2');
    expect(s.anciens.map((x: { code: string }) => x.code)).toEqual(['en1']);
    // le maître peut corriger (décision du maître, F2)
    const cls = await newClass(c, T, 'Classe A27');
    await join(c, fam.P, kid, cls);
    const [pupil] = await c.h.db
      .select()
      .from(t.classPupil)
      .where(and(eq(t.classPupil.classId, cls.id), eq(t.classPupil.profileId, kid)));
    const up = await c.req('PUT', `/api/v1/ecole/pupils/${pupil!.id}/niveau`, T, {
      levelCode: 'en1',
      source: 'enseignant',
    });
    expect(up.statusCode, up.body).toBe(200);
    expect(
      (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json().courant,
    ).toMatchObject({
      code: 'en1',
      origine: 'enseignant',
    });
  });

  it('épreuve de passage : niveau suivant (origine « épreuve »), nouvel essai le lendemain', async () => {
    const fam = await parent(c, 'passage-a27@exemple.org');
    const kid = await child(c, fam.P, 'Bilal', 9);
    // A39 : l'attente du lendemain ne vaut qu'« avec vérification » (choisi par le parent ; défaut d'un enfant :
    // défi doux, essais libres — voir a39.test.ts)
    expect(
      (
        await c.req('PUT', `/api/v1/profiles/${kid}/mode-evaluation`, fam.pin, {
          mode: 'verification',
        })
      ).statusCode,
    ).toBe(200);
    const v = await c.req('GET', `/api/v1/profiles/${kid}/epreuve/arabe`, fam.P);
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json().unit).toBe('en1.l03');
    expect(v.body).not.toContain('reponse');
    const ko = await c.req('POST', `/api/v1/profiles/${kid}/epreuve/arabe`, fam.pin, {
      answers: BAD('en1'),
    });
    expect(ko.json()).toMatchObject({ reussi: false, niveau: 'en1' });
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${kid}/epreuve/arabe`, fam.pin, {
          answers: GOOD('en1'),
        })
      ).json().error.code,
    ).toBe('reessayer_plus_tard');
    const s0 = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s0.epreuve).toMatchObject({ reussie: false, niveau: 'en1' });
    expect(s0.epreuve.attendre).toBeTruthy();
    // le lendemain
    await c.h.db
      .update(t.placementAttempt)
      .set({ at: new Date(Date.now() - 21 * 3600_000) })
      .where(eq(t.placementAttempt.profileId, kid));
    const ok = await c.req('POST', `/api/v1/profiles/${kid}/epreuve/arabe`, fam.pin, {
      answers: GOOD('en1'),
    });
    expect(ok.json()).toMatchObject({ reussi: true, niveau: 'en2' });
    const lv = (await c.req('GET', `/api/v1/profiles/${kid}/niveaux`, fam.P)).json();
    expect(lv.historique.filter((x: { subject: string }) => x.subject === 'arabe')).toEqual([
      expect.objectContaining({ levelCode: 'en1', outcome: 'termine' }),
      expect.objectContaining({ levelCode: 'en2', source: 'epreuve' }),
    ]);
  });

  it('commencer une matière au niveau proposé (aucun niveau encore choisi)', async () => {
    const { A, profileId } = await adult(c, 'commencer@exemple.org');
    await c.h.pool.query(
      `insert into level (code, track, rank, title_fr, subject_code) values ('ad1', 'adultes', 1, 'Adultes 1', 'arabe')`,
    );
    await c.h.db
      .insert(t.levelVersion)
      .values({ editionId: c.editionId, levelCode: 'ad1', book: { titre_fr: 'Livre ad1' } });
    const s = (await c.req('GET', `/api/v1/profiles/${profileId}/espace/arabe`, A)).json();
    expect(s).toMatchObject({ courant: null, proposition: 'ad1', piste: 'ad' });
    const r = await c.req('POST', `/api/v1/profiles/${profileId}/commencer/arabe`, A, {});
    expect(r.statusCode, r.body).toBe(201);
    expect(
      (await c.req('GET', `/api/v1/profiles/${profileId}/espace/arabe`, A)).json().courant.code,
    ).toBe('ad1');
    expect(
      (await c.req('POST', `/api/v1/profiles/${profileId}/commencer/arabe`, A, {})).statusCode,
    ).toBe(409);
  });

  it('mots du Coran : ceux du niveau du livre, sens du livre, couverture calculée', async () => {
    await importQuranLemmas(
      c.h.db,
      {
        meta: { total_mots_coran: 1000 },
        lemmes: [
          {
            n: 1,
            arabe: 'مِنْ',
            lemme_corpus_buckwalter: 'min',
            frequence: 50,
            niveau_enfants: 'E1',
            sens_fr: 'de',
            reference: '1:1',
            racine: '',
          },
          {
            n: 2,
            arabe: 'فِي',
            lemme_corpus_buckwalter: 'fiY',
            frequence: 30,
            niveau_enfants: 'E1',
            sens_fr: 'dans',
            reference: 'x',
          },
          {
            n: 3,
            arabe: 'لَا',
            lemme_corpus_buckwalter: 'laA',
            frequence: 20,
            niveau_enfants: 'E2',
            sens_fr: 'non',
          },
        ],
      },
      'test-a27',
    );
    const fam = await parent(c, 'mots@exemple.org');
    const kid = await child(c, fam.P, 'Hawa', 8);
    let m = (await c.req('GET', `/api/v1/profiles/${kid}/mots-coran`, fam.P)).json();
    expect(m.niveau).toBe('en1');
    expect(m.mots).toEqual([
      expect.objectContaining({
        rang: 1,
        ar: 'مِنْ',
        sens: 'de',
        ref: '1:1',
        racine: null,
        acquis: false,
      }),
      expect.objectContaining({ rang: 2, sens: 'dans', ref: null, acquis: false }),
    ]);
    expect(m.couverture).toEqual({ acquis: 0, total: 1000, pct: 0 });
    // validé par le jeu du niveau ; un mot d'un niveau à venir est ignoré
    const r = await c.req('POST', `/api/v1/profiles/${kid}/mots-coran`, fam.P, { rangs: [1, 3] });
    expect(r.json()).toEqual({ ajoutes: 1 });
    m = (await c.req('GET', `/api/v1/profiles/${kid}/mots-coran`, fam.P)).json();
    expect(m.mots[0].acquis).toBe(true);
    expect(m.couverture).toEqual({ acquis: 1, total: 1000, pct: 5 });
    const s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s.mots).toBe(2);
  });

  it('mots du Coran : rattachement ados et lien mot ↔ leçon lus en relançant l’import', async () => {
    await c.h.pool.query(
      `insert into level (code, track, rank, title_fr, subject_code) values ('ado1', 'ados', 1, 'Ados 1', 'arabe')
       on conflict do nothing`,
    );
    const r = await importQuranLemmas(
      c.h.db,
      {
        lemmes: [
          {
            n: 1,
            arabe: 'مِنْ',
            lemme_corpus_buckwalter: 'min',
            frequence: 50,
            niveau_enfants: 'E1',
            niveau_ados: 'D1',
            lecon_enfants: 'en1.l02',
          },
          {
            n: 2,
            arabe: 'فِي',
            lemme_corpus_buckwalter: 'fiY',
            frequence: 30,
            niveau_enfants: 'E1',
            niveau_ados: 'ado1',
            lecon_enfants: 'en2.l01',
          },
        ],
      },
      'test-a27-ados',
    );
    // une leçon d'un autre niveau que celui du mot est refusée
    expect(r).toMatchObject({ lemmes: 2, enfants: 2, ados: 2, lecons: 1, ignores: 1 });
    const [l1] = await c.h.db.select().from(t.quranLemma).where(eq(t.quranLemma.rank, 1));
    expect(l1).toMatchObject({ levelAdos: 'ado1', unitEnfants: 'en1.l02' });
    // la leçon du livre faite : le mot est acquis sans passer par le jeu
    const fam = await parent(c, 'mots-lecon@exemple.org');
    const kid = await child(c, fam.P, 'Idriss', 8);
    await c.h.db
      .insert(t.progress)
      .values({ profileId: kid, unitId: 'en1.l02', status: 'terminee' });
    const m = (await c.req('GET', `/api/v1/profiles/${kid}/mots-coran`, fam.P)).json();
    expect(m.mots.map((x: { rang: number; acquis: boolean }) => [x.rang, x.acquis])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('accueil : résumé des matières, piste Coran, classes', async () => {
    const fam = await parent(c, 'accueil@exemple.org');
    const kid = await child(c, fam.P, 'Sami', 8);
    const cls = await newClass(c, T, 'Classe accueil');
    await join(c, fam.P, kid, cls);
    const a = (await c.req('GET', `/api/v1/profiles/${kid}/accueil`, fam.P)).json();
    expect(a.arabe).toMatchObject({
      courant: { code: 'en1' },
      prochaine: { id: 'en1.l01', n: 1 },
      progression: { faites: 0, total: 2 },
    });
    expect(a.sciences).toMatchObject({ courant: null });
    expect(a.coran).toMatchObject({ plan: null, cercles: [] });
    expect(a.classes.map((x: { name: string }) => x.name)).toEqual(['Classe accueil']);
  });

  it('sélection et note des exercices (fonctions pures)', () => {
    const exs = exam('en1', 3).content.exercices.map((e, i) => ({
      id: e.id,
      position: i + 1,
      type: e.type,
      content: e,
    }));
    expect(selectExercises(exs, 'positionnement').map((e) => e.id)).toEqual(['en1.ex1', 'en1.ex2']);
    expect(selectExercises(exs, 'epreuve').map((e) => e.id)).toEqual(['en1.ex1', 'en1.ex2']);
    // D-A27 : QUATRE exercices par niveau, ceux du livre d'abord, puis du cahier ; ordre du livre gardé
    const six = ['vrai_faux', 'complete', 'ecoute', 'complete', 'ordre', 'complete'].map(
      (type, i) => ({
        id: `x${i + 1}`,
        position: i + 1,
        type,
        content: { type, items: [{}], ...(i === 1 || i === 3 ? { livre: 'ecriture' } : {}) },
      }),
    );
    expect(selectExercises(six, 'positionnement').map((e) => e.id)).toEqual([
      'x1',
      'x2',
      'x5',
      'x6',
    ]);
    expect(gradeSelection(exs.slice(0, 2), GOOD('en1'))).toEqual({ points: 4, max: 4 });
    const qcm = {
      id: 'q',
      type: 'qcm',
      content: {
        type: 'qcm',
        items: [
          { options: ['a', 'b'], reponse: 'b' },
          { options: ['c'], reponse: 'c' },
        ],
      },
    };
    expect(gradeSelection([qcm], { q: { 0: { choice: 'b' }, 1: { choice: 'x' } } })).toEqual({
      points: 1,
      max: 2,
    });
    // ordre du test de positionnement
    const L = ['en1', 'en2', 'en3'];
    expect(expectedPlacementLevel(L, [])).toBe('en1');
    expect(expectedPlacementLevel(L, [{ levelCode: 'en1', passed: true }])).toBe('en2');
    expect(
      expectedPlacementLevel(L, [
        { levelCode: 'en1', passed: true },
        { levelCode: 'en2', passed: false },
      ]),
    ).toBe('en1');
  });

  it('D-F2 (2) : le jeune demande son autonomie ; le parent valide ; de droit à 18 ans', async () => {
    const fam = await parent(c, 'autonomie@exemple.org');
    const petit = await child(c, fam.pin, 'Petit', 12);
    expect(
      (await c.req('POST', `/api/v1/profiles/${petit}/emancipation/demande`, fam.P, {})).json()
        .error.code,
    ).toBe('trop_jeune');
    const ado = await child(c, fam.pin, 'Ado', 16);
    const d = await c.req('POST', `/api/v1/profiles/${ado}/emancipation/demande`, fam.P, {});
    expect(d.statusCode, d.body).toBe(201);
    expect(d.json()).toMatchObject({ deDroit: false, demandee: true });
    let dem = (await c.req('GET', '/api/v1/famille/demandes', fam.P)).json();
    expect(dem.emancipations).toEqual([
      expect.objectContaining({ profileId: ado, pseudonyme: 'Ado' }),
    ]);
    // le parent valide : code de reprise, la demande disparaît
    const em = await c.req('POST', `/api/v1/profiles/${ado}/emancipation`, fam.P, { password: PW });
    expect(em.statusCode, em.body).toBe(201);
    dem = (await c.req('GET', '/api/v1/famille/demandes', fam.P)).json();
    expect(dem.emancipations).toEqual([]);
    // refus d'une nouvelle demande
    await c.req('POST', `/api/v1/profiles/${ado}/emancipation/demande`, fam.P, {});
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${ado}/emancipation/demande`, fam.P)).statusCode,
    ).toBe(200);
    expect((await c.req('GET', '/api/v1/famille/demandes', fam.P)).json().emancipations).toEqual(
      [],
    );
    // 18 ans : de droit, le code est donné aussitôt
    const grand = await child(c, fam.pin, 'Grand', 16);
    await c.h.db
      .update(t.profile)
      .set({ birthYear: YEAR - 19 })
      .where(eq(t.profile.id, grand));
    const g = await c.req('POST', `/api/v1/profiles/${grand}/emancipation/demande`, fam.P, {});
    expect(g.json()).toMatchObject({ deDroit: true });
    expect(g.json().code).toBeTruthy();
  });

  it('D-F2 (5) : passage d’année — la famille reçoit une proposition de réinscription, confirmée d’un geste', async () => {
    const m = (await c.req('GET', '/api/v1/auth/me', T)).json();
    const schoolId = m.ecoles[0].id as string;
    const fam = await parent(c, 'reinscription@exemple.org');
    const kid = await child(c, fam.P, 'Moussa', 9);
    const k1 = await newClass(c, T, 'Arabe 1 (A27)');
    await c.h.db.update(t.classGroup).set({ levelCode: 'en1' }).where(eq(t.classGroup.id, k1.id));
    await join(c, fam.P, kid, k1);
    const d0 = (await c.req('GET', `/api/v1/ecole/ecoles/${schoolId}`, T)).json();
    const year = d0.annees.find((a: { status: string }) => a.status === 'en_cours');
    const y0 = Number(year.label.slice(0, 4));
    const prep = await c.req('POST', `/api/v1/ecole/ecoles/${schoolId}/annees`, T, {
      label: `${y0 + 1}-${y0 + 2}`,
      startsOn: `${y0 + 1}-09-01`,
      endsOn: `${y0 + 2}-07-31`,
    });
    expect(prep.statusCode, prep.body).toBe(201);
    const next = await c.req('POST', '/api/v1/teacher/classes', T, {
      name: 'Arabe 2 (A27)',
      schoolId,
      yearId: prep.json().annee.id,
    });
    const nextId = next.json().class.id as string;
    const list = (await c.req('GET', `/api/v1/ecole/annees/${year.id}/eleves`, T)).json()
      .eleves as Array<{ pupilId: string; displayName: string }>;
    const decisions = list.map((x) => ({
      pupilId: x.pupilId,
      outcome: 'admis',
      nextClassId: x.displayName === 'Moussa' ? nextId : null,
    }));
    const r = await c.req('POST', `/api/v1/ecole/annees/${year.id}/cloture`, T, { decisions });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().propositions).toBeGreaterThanOrEqual(1);
    const dem = (await c.req('GET', '/api/v1/famille/demandes', fam.P)).json();
    const offer = dem.reinscriptions.find((o: { profileId: string }) => o.profileId === kid);
    expect(offer).toMatchObject({ className: 'Arabe 2 (A27)', pseudonyme: 'Moussa' });
    // avant l'accord : pas de partage avec la nouvelle classe
    const member = () =>
      c.h.db
        .select()
        .from(t.classMember)
        .where(and(eq(t.classMember.classId, nextId), eq(t.classMember.profileId, kid)));
    expect(await member()).toHaveLength(0);
    const ok = await c.req('POST', `/api/v1/famille/reinscriptions/${offer.id}`, fam.P, {
      accepter: true,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await member()).toHaveLength(1);
    expect((await c.req('GET', '/api/v1/famille/demandes', fam.P)).json().reinscriptions).toEqual(
      [],
    );
    // une autre famille ne peut pas décider
    const autre = await parent(c, 'autre-reinscription@exemple.org');
    expect(
      (
        await c.req('POST', `/api/v1/famille/reinscriptions/${offer.id}`, autre.P, {
          accepter: false,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('D-F2 (8) : messages d’un enseignant parti gardés pour l’école, auteur « ancien enseignant »', async () => {
    const m = (await c.req('GET', '/api/v1/auth/me', T)).json();
    const schoolId = m.ecoles[0].id as string;
    const B = await teacher(c, 'part@ecole.example');
    const [b] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'part@ecole.example'));
    await c.req('POST', `/api/v1/ecole/ecoles/${schoolId}/membres`, T, {
      email: 'part@ecole.example',
      role: 'enseignant',
    });
    const k = await c.req('POST', '/api/v1/teacher/classes', B, { name: 'CE1 (A27)', schoolId });
    expect(k.statusCode, k.body).toBe(201);
    const cls = k.json().class as { id: string; joinCode: string };
    const fam = await parent(c, 'messages-a27@exemple.org');
    const kid = await child(c, fam.P, 'Khadija', 9);
    await join(c, fam.P, kid, cls);
    const w = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/eleves/${kid}/messages`, B, {
      texte: 'Bonjour, Khadija a bien travaillé.',
    });
    expect(w.statusCode, w.body).toBe(201);
    const fil = w.json().fil as string;
    expect((await c.req('POST', '/api/v1/account/delete', B, { password: PW })).statusCode).toBe(
      200,
    );
    await c.h.db
      .update(t.account)
      .set({ deletedAt: new Date(Date.now() - 40 * 86400_000) })
      .where(eq(t.account.id, b!.id));
    expect(await purgeDeletedAccounts(c.h.db)).toBeGreaterThanOrEqual(1);
    const [th] = await c.h.db.select().from(t.messageThread).where(eq(t.messageThread.id, fil));
    expect(th).toBeTruthy();
    expect(th!.teacherAccountId).toBeNull();
    const r = (await c.req('GET', `/api/v1/fils/${fil}`, fam.P)).json();
    expect(r.messages).toEqual([
      expect.objectContaining({
        texte: 'Bonjour, Khadija a bien travaillé.',
        ancienEnseignant: true,
      }),
    ]);
  });

  it('D-F2 (1) : registre d’un élève parti depuis 3 ans anonymisé (notes gardées)', async () => {
    const cls = await newClass(c, T, 'Archives A27');
    const ins = async (name: string, yearsAgo: number) => {
      const left = new Date();
      left.setUTCFullYear(left.getUTCFullYear() - yearsAgo);
      const [p] = await c.h.db
        .insert(t.classPupil)
        .values({ classId: cls.id, displayName: name, nameAr: 'اِسْمٌ', leftAt: left })
        .returning({ id: t.classPupil.id });
      return p!.id;
    };
    const old = await ins('Ancien É.', 4);
    const recent = await ins('Récent R.', 1);
    expect(await anonymizeSchoolArchives(c.h.db)).toBe(1);
    const [a] = await c.h.db.select().from(t.classPupil).where(eq(t.classPupil.id, old));
    expect(a).toMatchObject({ displayName: ARCHIVE_NAME, nameAr: null, profileId: null });
    const [b] = await c.h.db.select().from(t.classPupil).where(eq(t.classPupil.id, recent));
    expect(b!.displayName).toBe('Récent R.');
    // deuxième passage : rien à faire
    expect(await anonymizeSchoolArchives(c.h.db)).toBe(0);
  });

  it('correctif epreuves.ts:76 : le nombre de copies d’une session est compté', async () => {
    const fam = await parent(c, 'copies@exemple.org');
    const kid = await child(c, fam.P, 'Copie', 9);
    const cls = await newClass(c, T, 'Épreuves A27');
    const [s] = await c.h.db
      .insert(t.examSession)
      .values({
        classId: cls.id,
        unitId: 'en1.l03',
        editionId: c.editionId,
        bareme: 100,
        opensAt: new Date(Date.now() - 3600_000),
        closesAt: new Date(Date.now() + 3600_000),
        seed: 'x',
      })
      .returning({ id: t.examSession.id });
    expect((await classExamSessions(c.h.db, cls.id))[0]!.copies).toBe(0);
    await c.h.db.insert(t.examSubmission).values({
      sessionId: s!.id,
      profileId: kid,
      answers: {},
      autoPoints: 1,
      autoMax: 2,
      detail: [],
    });
    expect((await classExamSessions(c.h.db, cls.id))[0]!.copies).toBe(1);
  });
});
