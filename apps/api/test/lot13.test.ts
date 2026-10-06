/**
 * Lot 13 — espace école : classes et groupes, élèves « papier », devoirs avec échéance, tableau de suivi,
 * classe papier (bilans, examen, récitations), décision de fin de niveau, certificats et attestations
 * (registre numéroté, jamais une ijāza), export CSV, et SURTOUT : accès limité à l'enseignant de la classe.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEdition } from '@awform/content';
import {
  connect,
  importEdition,
  purgeCertificateDocuments,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { REAL_BOOKS, TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL;
const PW = 'une longue phrase de passe 2026';
const YEAR = new Date().getUTCFullYear();
const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';

describe.skipIf(!READY)('lot 13 — espace école (awform_test)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let parent = '';
  let otherParent = '';
  let teacher = '';
  let teacher2 = '';
  let teacherNoMfa = '';
  let admin = '';
  let child = '';
  let classId = '';
  let joinCode = '';
  let paperId = '';
  let paper2Id = '';
  let childPupilId = '';
  let groupId = '';
  type M = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const req = (method: M, url: string, cookie = '', payload?: object) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...(cookie ? { cookie } : {}) },
    });
  const staff = async (kind: 'enseignant' | 'admin', email: string, mfa: boolean) => {
    await h.db.insert(t.account).values({
      kind,
      email,
      passwordHash: await hashSecret(PW),
      country: 'SN',
    });
    const c = cookieOf(await req('POST', '/api/v1/auth/login', '', { email, password: PW }));
    if (mfa) {
      const setup = (await req('POST', '/api/v1/auth/totp/setup', c, {})).json();
      await req('POST', '/api/v1/auth/totp/confirm', c, {
        code: totpAt(setup.secret, Math.floor(Date.now() / 30_000)),
      });
    }
    return c;
  };
  const signup = async (email: string) =>
    cookieOf(
      await req('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        birthYear: 1985,
        email,
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
      }),
    );

  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await importEdition(
      h.db,
      loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1'], withRegistry: false }),
      { code: 'l13', publish: true },
    );
    app = buildApp({ db: h.db, secretKey: randomBytes(32) });
    await app.ready();
    parent = await signup('p13@exemple.org');
    otherParent = await signup('autre13@exemple.org');
    child = (
      await req('POST', '/api/v1/profiles', parent, {
        pseudonym: 'Mariama',
        birthYear: YEAR - 8,
        levelCode: 'en1',
        password: PW,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      })
    ).json().id;
    teacher = await staff('enseignant', 'maitre13@ecole.example', true);
    teacher2 = await staff('enseignant', 'autre13@ecole.example', true);
    teacherNoMfa = await staff('enseignant', 'sans2fa13@ecole.example', false);
    admin = await staff('admin', 'admin13@ecole.example', true);
    const c = (
      await req('POST', '/api/v1/teacher/classes', teacher, { name: 'CE1 — Dakar' })
    ).json().class;
    classId = c.id;
    joinCode = c.joinCode;
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  it('classe : réglages (niveau, école, lieu), groupes, élèves papier ; le parent inscrit son enfant', async () => {
    const s = await req('PATCH', `/api/v1/ecole/classes/${classId}`, teacher, {
      levelCode: 'en1',
      schoolName: 'École pilote AWFORM',
      schoolNameAr: null,
      place: 'Dakar',
      placeAr: 'دَاكَار',
      schoolYear: '2026-2027',
    });
    expect(s.statusCode).toBe(200);
    expect(s.json().class.levelCode).toBe('en1');
    groupId = (
      await req('POST', `/api/v1/ecole/classes/${classId}/groups`, teacher, { name: 'Groupe A' })
    ).json().group.id;
    const p1 = await req('POST', `/api/v1/ecole/classes/${classId}/pupils`, teacher, {
      displayName: 'Awa D.',
      nameAr: 'عَوَا',
      gender: 'f',
      groupId,
    });
    expect(p1.statusCode).toBe(201);
    paperId = p1.json().pupil.id;
    paper2Id = (
      await req('POST', `/api/v1/ecole/classes/${classId}/pupils`, teacher, {
        displayName: 'Moussa S.',
        gender: 'm',
      })
    ).json().pupil.id;
    // groupe d'une autre classe : refusé
    expect(
      (
        await req('POST', `/api/v1/ecole/classes/${classId}/pupils`, teacher, {
          displayName: 'X',
          groupId: '00000000-0000-7000-8000-000000000000',
        })
      ).json().error.code,
    ).toBe('groupe_inconnu');
    // l'enfant de l'application rejoint la classe par son parent (consentement)
    expect(
      (
        await req('POST', `/api/v1/profiles/${child}/classes`, parent, {
          code: joinCode,
          consent: true,
        })
      ).statusCode,
    ).toBe(201);
    const d = (await req('GET', `/api/v1/ecole/classes/${classId}`, teacher)).json();
    expect(d.pupils.map((p: { displayName: string }) => p.displayName)).toEqual([
      'Awa D.',
      'Mariama',
      'Moussa S.',
    ]);
    childPupilId = d.pupils.find((p: { profileId: string | null }) => p.profileId === child).id;
    // le pseudonyme choisi par la famille n'est pas modifiable par l'école
    expect(
      (
        await req('PATCH', `/api/v1/ecole/pupils/${childPupilId}`, teacher, {
          displayName: 'Autre',
        })
      ).json().error.code,
    ).toBe('pseudonyme_de_la_famille');
    expect(
      (await req('PATCH', `/api/v1/ecole/pupils/${childPupilId}`, teacher, { groupId })).statusCode,
    ).toBe(200);
  });

  it('données des mineurs : réservées à l’enseignant de la classe (ni autre enseignant, ni admin, ni parent)', async () => {
    const urls: Array<[M, string, object?]> = [
      ['GET', `/api/v1/ecole/classes/${classId}`],
      ['GET', `/api/v1/ecole/classes/${classId}/tableau`],
      ['GET', `/api/v1/ecole/classes/${classId}/export.csv`],
      ['GET', `/api/v1/ecole/classes/${classId}/certificats`],
      ['PATCH', `/api/v1/ecole/pupils/${paperId}`, { nameAr: 'x' }],
      ['DELETE', `/api/v1/ecole/pupils/${paperId}`],
      ['PUT', `/api/v1/ecole/pupils/${paperId}/resultats`, { levelCode: 'en1', items: [] }],
      ['POST', `/api/v1/ecole/pupils/${paperId}/certificats`, { kind: 'niveau', apercu: true }],
    ];
    for (const [m, u, body] of urls) {
      expect((await req(m, u, teacher2, body)).statusCode, `autre enseignant ${u}`).toBe(404);
      expect((await req(m, u, admin, body)).json().error.code, `admin ${u}`).toBe(
        'reserve_aux_enseignants',
      );
      expect((await req(m, u, parent, body)).statusCode, `parent ${u}`).toBe(403);
      expect((await req(m, u, teacherNoMfa, body)).statusCode, `sans 2FA ${u}`).toBe(403);
      expect((await req(m, u, '', body)).statusCode, `anonyme ${u}`).toBe(401);
    }
    // l'élève papier existe toujours (aucune requête refusée n'a rien modifié)
    const d = (await req('GET', `/api/v1/ecole/classes/${classId}`, teacher)).json();
    expect(d.pupils).toHaveLength(3);
  });

  it('devoirs : leçon (suivi automatique), lecture (coche), hifẓ par groupe ; retard ; vue famille', async () => {
    const past = '2026-01-05';
    const mk = (body: object) =>
      req('POST', `/api/v1/ecole/classes/${classId}/assignments`, teacher, body);
    expect((await mk({ kind: 'lecon', target: 'en1.l99', dueDay: past })).json().error.code).toBe(
      'devoir_invalide',
    );
    expect((await mk({ kind: 'hifz', target: '115:1', dueDay: past })).json().error.code).toBe(
      'devoir_invalide',
    );
    const lecon = (await mk({ kind: 'lecon', target: 'en1.l01', dueDay: past })).json().assignment;
    const lecture = (await mk({ kind: 'lecture', target: 'en1-01', dueDay: '2099-01-01' })).json()
      .assignment;
    const hz = (
      await mk({ kind: 'hifz', target: '112:1-4', dueDay: '2099-01-01', groupId, note: 'Réciter' })
    ).json().assignment;
    // l'enfant termine la leçon dans l'application
    await h.db
      .insert(t.progress)
      .values({ profileId: child, unitId: 'en1.l01', status: 'terminee', score: 1, bestScore: 1 });
    await req('PUT', `/api/v1/ecole/assignments/${lecture.id}/marks/${paperId}`, teacher, {
      done: true,
    });
    const tb = (await req('GET', `/api/v1/ecole/classes/${classId}/tableau`, teacher)).json();
    const row = (id: string) => tb.rows.find((r: { pupil: { id: string } }) => r.pupil.id === id);
    const st = (id: string, aid: string) =>
      row(id).assignments.find((a: { id: string }) => a.id === aid);
    expect(st(childPupilId, lecon.id)).toMatchObject({ done: true, late: false, manual: false });
    expect(st(paperId, lecon.id)).toMatchObject({ done: false, late: true });
    expect(st(paperId, lecture.id)).toMatchObject({ done: true, manual: true });
    // devoir de groupe : Moussa (hors groupe) ne l'a pas
    expect(st(paper2Id, hz.id)).toBeUndefined();
    expect(st(paperId, hz.id)).toMatchObject({ done: false, late: false });
    expect(row(childPupilId).lessonsDone).toBe(1);
    expect(row(paperId).lessonsDone).toBeNull();
    // côté famille : les devoirs de l'enfant, sans rien des autres élèves
    const fam = (await req('GET', `/api/v1/profiles/${child}/devoirs`, parent)).json();
    expect(fam.devoirs.map((x: { target: string }) => x.target).sort()).toEqual([
      '112:1-4',
      'en1-01',
      'en1.l01',
    ]);
    expect(fam.devoirs.find((x: { target: string }) => x.target === 'en1.l01').done).toBe(true);
    expect(JSON.stringify(fam)).not.toContain('Awa');
    expect((await req('GET', `/api/v1/profiles/${child}/devoirs`, otherParent)).statusCode).toBe(
      404,
    );
    // un autre enseignant ne coche ni ne supprime
    expect(
      (
        await req('PUT', `/api/v1/ecole/assignments/${lecture.id}/marks/${paperId}`, teacher2, {
          done: false,
        })
      ).statusCode,
    ).toBe(404);
    expect((await req('DELETE', `/api/v1/ecole/assignments/${hz.id}`, teacher2)).statusCode).toBe(
      404,
    );
  });

  // vrais livres : 4 bilans du livre en1 et modèles de certificats (data/eval)
  it.skipIf(!REAL_BOOKS)(
    'classe papier : bilans et examen → note finale, décision, certificat de niveau numéroté',
    async () => {
      const tb = (await req('GET', `/api/v1/ecole/classes/${classId}/tableau`, teacher)).json();
      expect(tb.bilans.length).toBeGreaterThanOrEqual(4);
      expect(tb.examen).not.toBeNull();
      // incomplet : pas de certificat
      const early = await req('POST', `/api/v1/ecole/pupils/${paperId}/certificats`, teacher, {
        kind: 'niveau',
      });
      expect(early.statusCode).toBe(409);
      expect(early.json().error.raison).toMatch(/incomplets/);
      const items = [
        ...tb.bilans.map((b: { id: string }) => ({ item: `bilan:${b.id}`, score: 18, max: 20 })),
        { item: 'examen', score: 17, max: 20 },
      ];
      expect(
        (
          await req('PUT', `/api/v1/ecole/pupils/${paperId}/resultats`, teacher, {
            levelCode: 'en1',
            items: [{ item: 'examen', score: 25, max: 20 }],
          })
        ).json().error.code,
      ).toBe('note_invalide');
      expect(
        (
          await req('PUT', `/api/v1/ecole/pupils/${paperId}/resultats`, teacher, {
            levelCode: 'ad1',
            items,
          })
        ).json().error.code,
      ).toBe('niveau_de_la_classe');
      expect(
        (
          await req('PUT', `/api/v1/ecole/pupils/${paperId}/resultats`, teacher, {
            levelCode: 'en1',
            items,
          })
        ).statusCode,
      ).toBe(200);
      const tb2 = (await req('GET', `/api/v1/ecole/classes/${classId}/tableau`, teacher)).json();
      const r = tb2.rows.find((x: { pupil: { id: string } }) => x.pupil.id === paperId).result;
      // audit MET-2 : contrôle continu partiel → certificat à confirmer par l'enseignant
      expect(r).toMatchObject({
        status: 'complet',
        nf: 87,
        certificat: false,
        ccPartiel: true,
        aConfirmer: 'cc_partiel',
      });
      expect(r.decision.code).toBe('TB');

      const sans = (
        await req('POST', `/api/v1/ecole/pupils/${paperId}/certificats`, teacher, {
          kind: 'niveau',
          apercu: true,
        })
      ).json();
      expect(sans.eligible).toMatchObject({ ok: false, aConfirmer: 'cc_partiel' });
      const ap = (
        await req('POST', `/api/v1/ecole/pupils/${paperId}/certificats`, teacher, {
          kind: 'niveau',
          apercu: true,
          confirmerCcPartiel: true,
        })
      ).json();
      expect(ap.eligible.ok).toBe(true);
      expect(ap.document.model).toBe('niveau_enfants');
      const txt = [...ap.document.fr, ...ap.document.ar]
        .map((l: Array<{ t: string }>) => l.map((x) => x.t).join(''))
        .join('\n');
      expect(txt).toContain('Awa D.');
      expect(txt).toContain('Très bien');
      expect(txt).toContain('مُمْتَازٌ');
      expect(txt).toContain('École pilote AWFORM');
      // genre féminin appliqué : plus aucune variante « mot (mot) » dans le texte arabe du modèle
      expect(/[\u0600-\u06FF]+ \([\u0600-\u06FF]+\)/.test(txt)).toBe(false);
      expect(ap.document.ar.length).toBeGreaterThan(2);

      const c1 = await req('POST', `/api/v1/ecole/pupils/${paperId}/certificats`, teacher, {
        kind: 'niveau',
        fields: { prenom_nom: 'Awa Diop' },
        confirmerCcPartiel: true,
      });
      expect(c1.statusCode).toBe(201);
      expect(c1.json().certificate.number).toBe(`AWF-EN1-${YEAR}-0001`);
      const c2 = await req('POST', `/api/v1/ecole/pupils/${paperId}/certificats`, teacher, {
        kind: 'niveau',
        fields: { prenom_nom: 'Awa Diop' },
        confirmerCcPartiel: true,
      });
      expect(c2.json().certificate.number).toBe(`AWF-EN1-${YEAR}-0002`);
      const got = (
        await req('GET', `/api/v1/ecole/certificats/${c1.json().certificate.id}`, teacher)
      ).json().certificate;
      expect(got.document.number).toBe(`AWF-EN1-${YEAR}-0001`);
      expect(JSON.stringify(got.document)).toContain('Awa Diop');
      expect(
        (await req('GET', `/api/v1/ecole/certificats/${c1.json().certificate.id}`, teacher2))
          .statusCode,
      ).toBe(404);
    },
  );

  // vrais livres : 4 bilans du livre en1 et modèles de certificats (data/eval)
  it.skipIf(!REAL_BOOKS)(
    'hifẓ (classe papier) : récitation validée → attestation, jamais une ijāza',
    async () => {
      const counters = {
        aides: 0,
        hesitations: 1,
        sauts: 0,
        oublis: 0,
        claires: 0,
        discretes: 1,
        fluidite: 4,
      };
      const v = (
        await req('POST', `/api/v1/ecole/pupils/${paper2Id}/hifz`, teacher, {
          part: '112:1-4',
          day: '2026-10-12',
          counters,
        })
      ).json();
      expect(v.note.total).toBe(19);
      // élève de l'application : route habituelle (journal de son profil)
      expect(
        (
          await req('POST', `/api/v1/ecole/pupils/${childPupilId}/hifz`, teacher, {
            part: '112:1-4',
            day: '2026-10-12',
            counters,
          })
        ).json().error.code,
      ).toBe('eleve_application');
      expect(
        (
          await req('POST', `/api/v1/ecole/pupils/${paper2Id}/certificats`, teacher, {
            kind: 'hifz',
            part: '113:1-5',
          })
        ).json().error.code,
      ).toBe('non_eligible');
      const c = await req('POST', `/api/v1/ecole/pupils/${paper2Id}/certificats`, teacher, {
        kind: 'hifz',
        part: '112:1-4',
      });
      expect(c.statusCode).toBe(201);
      const cert = c.json().certificate;
      expect(cert.number).toBe(`AWF-HZ-${YEAR}-0001`);
      const txt = cert.document.fr
        .map((l: Array<{ t: string }>) => l.map((x) => x.t).join(''))
        .join('\n');
      expect(txt).toContain('Al-Ikhlāṣ');
      expect(txt).toContain('19/20');
      expect(txt).toContain("n'est pas une ijāza");
      expect(txt).not.toMatch(/ijāza de|accorde une ijāza|إِجَازَة/);
    },
  );

  // vrais livres : 4 bilans du livre en1 et modèles de certificats (data/eval)
  it.skipIf(!REAL_BOOKS)(
    'export CSV (tableur, « ; », BOM) et journal d’audit de chaque export',
    async () => {
      const r = await req('GET', `/api/v1/ecole/classes/${classId}/export.csv`, teacher);
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      expect(r.headers['content-disposition']).toMatch(
        /attachment; filename="awform-CE1-Dakar-tableau-/,
      );
      expect(r.body.charCodeAt(0)).toBe(0xfeff);
      const lines = r.body.slice(1).trim().split('\r\n');
      expect(lines[0]).toMatch(/^Élève;Groupe;Inscription;Leçons terminées;Bilan 1 \(%\)/);
      expect(lines.find((l) => l.startsWith('Awa D.'))).toMatch(
        /;papier;;90;90;90;90;85;90;87;Validé, mention Très bien;/,
      );
      const certs = await req(
        'GET',
        `/api/v1/ecole/classes/${classId}/export.csv?quoi=certificats`,
        teacher,
      );
      expect(certs.body).toContain(`AWF-EN1-${YEAR}-0001;niveau;Awa Diop;en1;Très bien;`);
      const devoirs = await req(
        'GET',
        `/api/v1/ecole/classes/${classId}/export.csv?quoi=devoirs`,
        teacher,
      );
      expect(devoirs.body).toContain('Al-Ikhlāṣ (112:1-4)');
      const log = await h.db.select().from(t.auditLog).where(eq(t.auditLog.action, 'ecole.export'));
      expect(log.length).toBe(3);
    },
  );

  // vrais livres : 4 bilans du livre en1 et modèles de certificats (data/eval)
  it.skipIf(!REAL_BOOKS)(
    'retrait : l’enfant quitte la classe → plus visible de l’enseignant ; le registre garde le certificat',
    async () => {
      await req('DELETE', `/api/v1/profiles/${child}/classes/${classId}`, parent);
      const d = (await req('GET', `/api/v1/ecole/classes/${classId}`, teacher)).json();
      expect(d.pupils.map((p: { displayName: string }) => p.displayName)).toEqual([
        'Awa D.',
        'Moussa S.',
      ]);
      expect((await req('DELETE', `/api/v1/ecole/pupils/${paperId}`, teacher)).statusCode).toBe(
        200,
      );
      const certs = (
        await req('GET', `/api/v1/ecole/classes/${classId}/certificats`, teacher)
      ).json().certificates;
      expect(certs.length).toBe(3);
      // lot F2 (revue E8) : l'élève parti reste au registre (ligne archivée) ; le certificat y reste rattaché
      const archivedPupil = certs.find(
        (c: { number: string }) => c.number === `AWF-EN1-${YEAR}-0001`,
      ).pupilId;
      const [left] = await h.db
        .select()
        .from(t.classPupil)
        .where(eq(t.classPupil.id, archivedPupil));
      expect(left?.leftAt).not.toBeNull();
      // registre durable (décision du pilote, à confirmer par le juriste) : 30 jours après le départ de
      // l'élève, le document est réduit au numéro, nom affiché, niveau, date et mention
      expect(await purgeCertificateDocuments(h.db, 30, new Date())).toBe(0);
      const later = new Date(Date.now() + 31 * 86400_000);
      expect(await purgeCertificateDocuments(h.db, 30, later)).toBe(2);
      const [row] = await h.db
        .select()
        .from(t.certificate)
        .where(eq(t.certificate.number, `AWF-EN1-${YEAR}-0001`));
      expect(row!.document).toEqual({
        reduit: true,
        number: `AWF-EN1-${YEAR}-0001`,
        kind: 'niveau',
        subject: 'en1',
        holderName: 'Awa Diop',
        mention: 'Très bien',
        issuedOn: row!.issuedAt.toISOString().slice(0, 10),
      });
      // Moussa est encore dans la classe : son attestation de hifẓ reste complète
      const [hz] = await h.db
        .select()
        .from(t.certificate)
        .where(eq(t.certificate.number, `AWF-HZ-${YEAR}-0001`));
      expect((hz!.document as { reduit?: boolean }).reduit).toBeUndefined();
      expect(hz!.detachedAt).toBeNull();
    },
  );
});
