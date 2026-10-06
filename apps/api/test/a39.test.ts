/**
 * Chantier A39 « MODE SEREIN » (décision du client, 06/10/2026), de bout en bout par l'API (base de test,
 * contenu SYNTHÉTIQUE, aucun texte religieux) :
 *  - adulte : « Avec vérification » ou « Mode serein » choisi à l'inscription, modifiable ; en mode serein, le
 *    niveau suivant s'ouvre quand les leçons sont faites, sans épreuve ; il peut choisir son niveau lui-même ;
 *  - enfant : le PARENT choisit (code parent) ; défaut « vérification douce » (étoiles, essais libres) ; l'ado
 *    exprime une préférence que le parent valide ou refuse ;
 *  - enfant en classe : l'ENSEIGNANT décide pour la classe ; hors classe, le choix du parent s'applique ;
 *  - garde-fou : notions fragiles (erreurs non revues) recommandées avant le niveau suivant, jamais bloquant en
 *    mode serein ; suivi discret pour l'enseignant ;
 *  - certificat : seulement après une épreuve réussie ; rubrique « Pour aller plus loin » hors passage.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { fragileNotions, isOptionalUnit, schema as t } from '@awform/db';
import { starsFor } from '../src/parcours-a27.js';
import {
  child,
  cookieOf,
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

const exam = (lv: string, n: number) => ({
  id: `${lv}.l${String(n).padStart(2, '0')}`,
  n,
  kind: 'examen' as const,
  content: {
    n,
    type: 'examen',
    exercices: [
      {
        id: `${lv}.ex1`,
        type: 'vrai_faux',
        items: [
          { fr: 'Phrase A', vrai: true },
          { fr: 'Phrase B', vrai: false },
        ],
      },
    ],
  },
});
const GOOD = (lv: string) => ({ [`${lv}.ex1`]: { 0: { value: true }, 1: { value: false } } });
const BAD = (lv: string) => ({ [`${lv}.ex1`]: { 0: { value: false }, 1: { value: true } } });

describe.skipIf(!URL)('A39 — mode serein (awform_test)', () => {
  let c: Ctx;
  let T: H;

  async function addUnit(
    level: string,
    u: { id: string; n: number; kind?: 'lecon' | 'bilan' | 'examen'; content?: object },
    facultatif = false,
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
      facultatif,
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
  const done = (profileId: string, ...units: string[]) =>
    c.h.db
      .insert(t.progress)
      .values(units.map((unitId) => ({ profileId, unitId, status: 'terminee' as const })));
  /** réponse d'un item (erreur = correct 0), comme la file de l'appareil */
  const answer = (profileId: string, unitId: string, item: number, correct: 0 | 1, ago = 0) =>
    c.h.db.insert(t.attempt).values({
      id: randomUUID(),
      profileId,
      editionId: c.editionId,
      unitId,
      exerciseId: `${unitId}.ex1`,
      itemIndex: item,
      eventType: 'reponse',
      correct,
      total: 1,
      deviceAt: new Date(Date.now() - ago),
    });

  async function adultSignup(email: string, evalMode?: 'verification' | 'serein') {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email,
        password: PW,
        country: 'FR',
        consents: ['cgu'],
        birthYear: YEAR - 30,
        ...(evalMode ? { evalMode } : {}),
      },
    );
    expect(su.statusCode, su.body).toBe(201);
    const A = { cookie: cookieOf(su) };
    const me = (await c.req('GET', '/api/v1/auth/me', A)).json();
    return { A, id: me.profiles[0].id as string };
  }

  beforeAll(async () => {
    c = await setup(URL!, []);
    await c.h.pool.query(`update level set subject_code = 'arabe' where code = 'en1'`);
    await c.h.pool.query(
      `insert into level (code, track, rank, title_fr, subject_code) values
        ('en2', 'enfants', 2, 'Niveau 2', 'arabe'),
        ('ad1', 'adultes', 1, 'Niveau A1', 'arabe'), ('ad2', 'adultes', 2, 'Niveau A2', 'arabe'),
        ('ad3', 'adultes', 3, 'Niveau A3', 'arabe')`,
    );
    await c.h.db.insert(t.levelVersion).values(
      ['en1', 'en2', 'ad1', 'ad2', 'ad3'].map((levelCode) => ({
        editionId: c.editionId,
        levelCode,
        book: { titre_fr: `Livre ${levelCode}`, titre_ar: 'كِتَابٌ' },
      })),
    );
    const lesson = (id: string, n: number) => ({
      id,
      n,
      content: {
        n,
        type: 'lecon',
        exercices: [{ id: `${id}.ex1`, type: 'vrai_faux', items: [{ fr: 'x', vrai: true }] }],
      },
    });
    for (const lv of ['en1', 'ad1']) {
      await addUnit(lv, lesson(`${lv}.l01`, 1));
      await addUnit(lv, lesson(`${lv}.l02`, 2));
      // rubrique « Pour aller plus loin » : ne compte jamais pour le passage
      await addUnit(lv, { id: `${lv}.l03`, n: 3 }, true);
      await addUnit(lv, exam(lv, 4));
    }
    for (const lv of ['en2', 'ad2', 'ad3']) {
      await addUnit(lv, { id: `${lv}.l01`, n: 1 });
      await addUnit(lv, exam(lv, 2));
    }
    T = await teacher(c, 'maitre-a39@ecole.example');
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('fonctions pures : étoiles (jamais zéro), unité facultative lue dans le livre', () => {
    expect(starsFor(0, 4)).toBe(1);
    expect(starsFor(3, 4)).toBe(2);
    expect(starsFor(4, 4)).toBe(3);
    expect(isOptionalUnit({ facultatif: true })).toBe(true);
    expect(isOptionalUnit({ rubrique: 'pour_aller_plus_loin' })).toBe(true);
    expect(isOptionalUnit({ type: 'lecon' })).toBe(false);
  });

  it('adulte en mode serein : le niveau suivant s’ouvre quand les leçons sont faites, sans épreuve', async () => {
    const { A, id } = await adultSignup('serein@exemple.org', 'serein');
    let m = (await c.req('GET', `/api/v1/profiles/${id}/mode-evaluation`, A)).json();
    expect(m).toMatchObject({ mode: 'serein', decideur: 'soi', moi: 'soi' });
    expect(m.choix).toEqual(['verification', 'serein']);
    expect((await c.req('POST', `/api/v1/profiles/${id}/commencer/arabe`, A, {})).statusCode).toBe(
      201,
    );
    let s = (await c.req('GET', `/api/v1/profiles/${id}/espace/arabe`, A)).json();
    expect(s.mode).toMatchObject({ mode: 'serein', decideur: 'soi' });
    // « Pour aller plus loin » hors progression : 2 leçons à faire, pas 3
    expect(s.progression).toEqual({ faites: 0, total: 2 });
    expect(s.unites.find((u: { id: string }) => u.id === 'ad1.l03').facultatif).toBe(true);
    const no = await c.req('POST', `/api/v1/profiles/${id}/niveau-suivant/arabe`, A, {});
    expect(no.json().error.code).toBe('lecons_a_finir');
    await done(id, 'ad1.l01', 'ad1.l02');
    const r = (await c.req('GET', `/api/v1/profiles/${id}/recapitulatif/arabe`, A)).json();
    expect(r).toMatchObject({
      niveau: 'ad1',
      suivant: 'ad2',
      mode: 'serein',
      toutesFaites: true,
      recommandation: false,
      fragiles: [],
      semaine: 2,
    });
    const ok = await c.req('POST', `/api/v1/profiles/${id}/niveau-suivant/arabe`, A, {});
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ niveau: 'ad2' });
    const lv = (await c.req('GET', `/api/v1/profiles/${id}/niveaux`, A)).json();
    expect(lv.courants.find((x: { subject: string }) => x.subject === 'arabe')).toMatchObject({
      levelCode: 'ad2',
      source: 'lecons',
    });
    // aucune épreuve passée : aucun certificat possible pour ad1
    s = (await c.req('GET', `/api/v1/profiles/${id}/espace/arabe`, A)).json();
    expect(s.epreuvesReussies).toEqual([]);
    expect(
      await c.h.db.select().from(t.placementAttempt).where(eq(t.placementAttempt.profileId, id)),
    ).toEqual([]);
    // test de positionnement facultatif : l'adulte choisit son niveau lui-même
    const ch = await c.req('POST', `/api/v1/profiles/${id}/choisir-niveau/arabe`, A, {
      niveau: 'ad3',
    });
    expect(ch.statusCode, ch.body).toBe(200);
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${id}/choisir-niveau/arabe`, A, { niveau: 'en1' })
      ).json().error.code,
    ).toBe('niveau_inconnu');
    // mode modifiable dans le compte ; « douce » n'est pas proposé à un adulte ; historique gardé
    expect(
      (await c.req('PUT', `/api/v1/profiles/${id}/mode-evaluation`, A, { mode: 'douce' })).json()
        .error.code,
    ).toBe('mode_non_propose');
    await c.req('PUT', `/api/v1/profiles/${id}/mode-evaluation`, A, { mode: 'verification' });
    m = (await c.req('GET', `/api/v1/profiles/${id}/mode-evaluation`, A)).json();
    expect(m.mode).toBe('verification');
    expect(m.historique.map((h: { mode: string; decideur: string }) => h.mode)).toEqual([
      'serein',
      'verification',
    ]);
    expect(m.historique[0].jusqua).toBeTruthy();
  });

  it('adulte « avec vérification » (défaut) : l’épreuve reste exigée ; le choix du niveau aussi', async () => {
    const { A, id } = await adultSignup('verif@exemple.org');
    expect((await c.req('GET', `/api/v1/profiles/${id}/mode-evaluation`, A)).json()).toMatchObject({
      mode: 'verification',
      decideur: 'defaut',
    });
    await c.req('POST', `/api/v1/profiles/${id}/commencer/arabe`, A, {});
    await done(id, 'ad1.l01', 'ad1.l02');
    expect(
      (await c.req('POST', `/api/v1/profiles/${id}/niveau-suivant/arabe`, A, {})).json().error.code,
    ).toBe('epreuve_requise');
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${id}/choisir-niveau/arabe`, A, { niveau: 'ad3' })
      ).json().error.code,
    ).toBe('epreuve_requise');
    // l'épreuve « avec vérification » donne une note chiffrée
    const ok = await c.req('POST', `/api/v1/profiles/${id}/epreuve/arabe`, A, {
      answers: GOOD('ad1'),
    });
    expect(ok.json()).toMatchObject({ points: 2, max: 2, reussi: true, certificat: true });
  });

  it('certificat seulement avec une épreuve réussie (épreuve facultative en mode serein)', async () => {
    const { A, id } = await adultSignup('certif@exemple.org', 'serein');
    await c.req('POST', `/api/v1/profiles/${id}/commencer/arabe`, A, {});
    // épreuve facultative : manquée sans attente ni note chiffrée, puis réussie → certificat possible
    const ko = (
      await c.req('POST', `/api/v1/profiles/${id}/epreuve/arabe`, A, { answers: BAD('ad1') })
    ).json();
    expect(ko).toEqual({ reussi: false, niveau: 'ad1', certificat: false, etoiles: 1 });
    const ok = (
      await c.req('POST', `/api/v1/profiles/${id}/epreuve/arabe`, A, { answers: GOOD('ad1') })
    ).json();
    expect(ok).toEqual({ reussi: true, niveau: 'ad2', certificat: true, etoiles: 3 });
    const s = (await c.req('GET', `/api/v1/profiles/${id}/espace/arabe`, A)).json();
    expect(s.epreuvesReussies).toEqual(['ad1']);
  });

  it('D-A39 (4) : certificat individuel de l’adulte autonome, même modèle, vérifiable en ligne', async () => {
    // modèle « niveau » des livres (forme seulement, texte de test) ; règles : celles par défaut
    await c.h.db
      .insert(t.evalDoc)
      .values({
        editionId: c.editionId,
        key: 'certificats',
        content: {
          modeles: {
            niveau_adultes: {
              titre_fr: 'Certificat de niveau',
              fr: [
                "L'établissement {etablissement} certifie que **{civilite} {prenom_nom}**, né(e) le {naissance}, a réussi le niveau {n} : {nf}/100, mention {mention}.",
                'Coran : {degre_C}. Fait à {lieu}, le {date}.',
              ],
            },
          },
        },
      })
      .onConflictDoNothing();
    const { A, id } = await adultSignup('certif-auto@exemple.org', 'serein');
    await c.req('POST', `/api/v1/profiles/${id}/commencer/arabe`, A, {});
    const body = { niveau: 'ad1', nom: 'Samir Diallo', civilite: 'M.' };
    // pas d'épreuve réussie : pas de certificat
    expect(
      (await c.req('POST', `/api/v1/profiles/${id}/certificats`, A, body)).json().error.code,
    ).toBe('epreuve_requise');
    await c.req('POST', `/api/v1/profiles/${id}/epreuve/arabe`, A, { answers: GOOD('ad1') });
    let l = (await c.req('GET', `/api/v1/profiles/${id}/certificats`, A)).json();
    expect(l).toMatchObject({ autonome: true, certificats: [], possibles: ['ad1'] });
    const r = await c.req('POST', `/api/v1/profiles/${id}/certificats`, A, body);
    expect(r.statusCode, r.body).toBe(201);
    const cert = r.json().certificate;
    expect(cert.number).toMatch(/^AWF-AD1-\d{4}-\d{4}$/);
    expect(cert.verifCode).toBeTruthy();
    const text = JSON.stringify(cert.document);
    expect(text).toContain('Awzid — parcours autonome');
    expect(text).toContain('100/100');
    expect(text).toContain('Très bien');
    // champs qu'aucune école n'a saisis : « — », jamais de blanc à remplir
    expect(text).not.toContain('…………');
    // même vérification publique que les certificats d'école
    const v = await c.req('GET', `/api/v1/public/certificats/${cert.number}?c=${cert.verifCode}`);
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json()).toMatchObject({ titulaire: 'Samir Diallo', statut: 'valide', sujet: 'ad1' });
    // un seul certificat valide par niveau ; lisible par son titulaire
    const again = (await c.req('POST', `/api/v1/profiles/${id}/certificats`, A, body)).json();
    expect(again.certificate.id).toBe(cert.id);
    l = (await c.req('GET', `/api/v1/profiles/${id}/certificats`, A)).json();
    expect(l.certificats).toEqual([expect.objectContaining({ id: cert.id, niveau: 'ad1' })]);
    expect(
      (await c.req('GET', `/api/v1/profiles/${id}/certificats/${cert.id}`, A)).json().certificate
        .number,
    ).toBe(cert.number);
    // réservé à l'adulte autonome : pas pour l'enfant d'un parent
    const fam = await parent(c, 'parent-certif@exemple.org');
    const kid = await child(c, fam.P, 'Nadia', 9);
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${kid}/certificats`, fam.pin, {
          niveau: 'en1',
          nom: 'Nadia',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('enfant : le parent choisit (code parent), défaut « vérification douce » avec étoiles et essais libres', async () => {
    const fam = await parent(c, 'parent-a39@exemple.org');
    const kid = await child(c, fam.P, 'Sara', 8);
    let m = (await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json();
    expect(m).toMatchObject({ mode: 'douce', decideur: 'defaut', moi: 'parent' });
    expect(m.choix).toEqual(['douce', 'serein', 'verification']);
    // défi doux : aucune note chiffrée, étoiles, nouvel essai tout de suite
    const ko = await c.req('POST', `/api/v1/profiles/${kid}/epreuve/arabe`, fam.pin, {
      answers: BAD('en1'),
    });
    expect(ko.json()).toEqual({ reussi: false, niveau: 'en1', certificat: false, etoiles: 1 });
    const s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
    expect(s.epreuve.attendre).toBeNull();
    // sans le code parent : refusé (c'est le parent qui choisit)
    expect(
      (await c.req('PUT', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P, { mode: 'serein' }))
        .statusCode,
    ).toBe(401);
    const put = await c.req('PUT', `/api/v1/profiles/${kid}/mode-evaluation`, fam.pin, {
      mode: 'serein',
    });
    expect(put.statusCode, put.body).toBe(200);
    m = (await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json();
    expect(m).toMatchObject({ mode: 'serein', decideur: 'parent' });
    // un autre compte ne voit rien
    const autre = await parent(c, 'autre-a39@exemple.org');
    expect(
      (await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, autre.P)).statusCode,
    ).toBe(404);
    // l'enfant ne peut pas « souhaiter » (préférence réservée aux ados)
    expect(
      (
        await c.req('POST', `/api/v1/profiles/${kid}/mode-evaluation/souhait`, fam.P, {
          mode: 'verification',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('ado : il exprime une préférence, le parent la valide ou la refuse', async () => {
    const fam = await parent(c, 'parent-ado-a39@exemple.org');
    const ado = await child(c, fam.P, 'Ilyas', 14);
    const w = await c.req('POST', `/api/v1/profiles/${ado}/mode-evaluation/souhait`, fam.P, {
      mode: 'serein',
    });
    expect(w.statusCode, w.body).toBe(201);
    let m = (await c.req('GET', `/api/v1/profiles/${ado}/mode-evaluation`, fam.P)).json();
    expect(m.mode).toBe('douce');
    expect(m.souhait.mode).toBe('serein');
    // le parent valide (code parent) : la préférence devient le choix, elle disparaît de la liste
    await c.req('PUT', `/api/v1/profiles/${ado}/mode-evaluation`, fam.pin, { mode: 'serein' });
    m = (await c.req('GET', `/api/v1/profiles/${ado}/mode-evaluation`, fam.P)).json();
    expect(m).toMatchObject({ mode: 'serein', decideur: 'parent', souhait: null });
    // nouvelle préférence, refusée par le parent
    await c.req('POST', `/api/v1/profiles/${ado}/mode-evaluation/souhait`, fam.P, {
      mode: 'verification',
    });
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${ado}/mode-evaluation/souhait`, fam.P)).statusCode,
    ).toBe(401);
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${ado}/mode-evaluation/souhait`, fam.pin))
        .statusCode,
    ).toBe(200);
    m = (await c.req('GET', `/api/v1/profiles/${ado}/mode-evaluation`, fam.P)).json();
    expect(m).toMatchObject({ mode: 'serein', souhait: null });
  });

  it('enfant en classe : l’enseignant décide pour la classe ; hors classe, le choix du parent', async () => {
    const fam = await parent(c, 'parent-classe-a39@exemple.org');
    const kid = await child(c, fam.P, 'Moussa', 9);
    await c.req('PUT', `/api/v1/profiles/${kid}/mode-evaluation`, fam.pin, { mode: 'serein' });
    const cls = await newClass(c, T, 'Classe A39');
    await join(c, fam.P, kid, cls);
    // classe sans décision : le choix du parent s'applique
    expect((await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json().mode).toBe(
      'serein',
    );
    // un parent n'est pas enseignant de la classe
    expect(
      (
        await c.req('PUT', `/api/v1/ecole/classes/${cls.id}/mode-evaluation`, fam.P, {
          mode: 'verification',
        })
      ).statusCode,
    ).toBe(403);
    const put = await c.req('PUT', `/api/v1/ecole/classes/${cls.id}/mode-evaluation`, T, {
      mode: 'verification',
    });
    expect(put.statusCode, put.body).toBe(200);
    let m = (await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json();
    expect(m).toMatchObject({
      mode: 'verification',
      decideur: 'enseignant',
      classe: { id: cls.id, name: 'Classe A39' },
      famille: 'serein',
    });
    // en classe, le mode serein du parent n'ouvre pas le niveau suivant sans épreuve
    await done(kid, 'en1.l01', 'en1.l02');
    expect(
      (await c.req('POST', `/api/v1/profiles/${kid}/niveau-suivant/arabe`, fam.P, {})).json().error
        .code,
    ).toBe('epreuve_requise');
    // l'enseignant laisse le choix aux familles : retour au choix du parent ; historique de la classe
    await c.req('PUT', `/api/v1/ecole/classes/${cls.id}/mode-evaluation`, T, { mode: null });
    m = (await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json();
    expect(m).toMatchObject({ mode: 'serein', decideur: 'parent', classe: null });
    const h = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/mode-evaluation`, T)).json();
    expect(h.mode).toBeNull();
    expect(h.historique.map((x: { mode: string | null }) => x.mode)).toEqual([
      'verification',
      null,
    ]);
    // parti de la classe : la décision de l'enseignant ne s'applique plus
    await c.req('PUT', `/api/v1/ecole/classes/${cls.id}/mode-evaluation`, T, { mode: 'douce' });
    expect((await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json().mode).toBe(
      'douce',
    );
    await c.h.db
      .update(t.classPupil)
      .set({ leftAt: new Date() })
      .where(and(eq(t.classPupil.classId, cls.id), eq(t.classPupil.profileId, kid)));
    await c.h.db
      .delete(t.classMember)
      .where(and(eq(t.classMember.classId, cls.id), eq(t.classMember.profileId, kid)));
    expect((await c.req('GET', `/api/v1/profiles/${kid}/mode-evaluation`, fam.P)).json().mode).toBe(
      'serein',
    );
  });

  it('garde-fou : notions fragiles recommandées (jamais bloquant en mode serein), suivi de l’enseignant', async () => {
    const fam = await parent(c, 'parent-fragile-a39@exemple.org');
    const kid = await child(c, fam.P, 'Awa', 9);
    await c.req('PUT', `/api/v1/profiles/${kid}/mode-evaluation`, fam.pin, { mode: 'serein' });
    await done(kid, 'en1.l01', 'en1.l02');
    // l01 : 3 items faux (dont un refait juste ensuite : revu) ; l02 : une seule erreur (pas fragile)
    await answer(kid, 'en1.l01', 0, 0, 60_000);
    await answer(kid, 'en1.l01', 0, 1, 1000);
    await answer(kid, 'en1.l01', 1, 0);
    await answer(kid, 'en1.l01', 2, 0);
    await answer(kid, 'en1.l02', 0, 0);
    const r = (await c.req('GET', `/api/v1/profiles/${kid}/recapitulatif/arabe`, fam.P)).json();
    expect(r.recommandation).toBe(true);
    expect(r.fragiles).toEqual([
      expect.objectContaining({ unitId: 'en1.l01', erreurs: 2, titleFr: 'Titre en1.l01' }),
    ]);
    // l'enseignant de la classe voit discrètement les notions fragiles de ses élèves
    const cls = await newClass(c, T, 'Classe fragile');
    await join(c, fam.P, kid, cls);
    const f = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/notions-fragiles`, T)).json();
    expect(f.eleves).toEqual([
      expect.objectContaining({
        niveau: 'en1',
        fragiles: [expect.objectContaining({ unitId: 'en1.l01' })],
      }),
    ]);
    // « Continuer quand même » : jamais bloquant en mode serein
    const ok = await c.req('POST', `/api/v1/profiles/${kid}/niveau-suivant/arabe`, fam.P, {
      continuerQuandMeme: true,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const [lv] = await c.h.db
      .select()
      .from(t.profileLevel)
      .where(and(eq(t.profileLevel.profileId, kid), eq(t.profileLevel.levelCode, 'en2')));
    expect(lv?.details).toMatchObject({ fragiles: ['en1.l01'], continuerQuandMeme: true });
    // « Revoir d'abord » : une fois les erreurs refaites justes, la notion n'est plus fragile
    await answer(kid, 'en1.l01', 1, 1);
    await answer(kid, 'en1.l01', 2, 1);
    expect(await fragileNotions(c.h.db, c.editionId, kid, 'en1')).toEqual([]);
  });

  it('inscription : un choix de mode inconnu est refusé', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'mauvais-mode@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
        birthYear: YEAR - 30,
        evalMode: 'douce',
      },
    );
    expect(su.statusCode).toBe(400);
  });
});
