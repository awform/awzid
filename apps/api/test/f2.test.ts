/**
 * Lot F2 (revue d'architecture E1, E2, E3, E4, E8) — école, rôles, responsables, niveaux, de bout en bout par
 * l'API (base de test, contenu synthétique) :
 *  - l'école inscrit un élève « papier », le convertit en profil (consentement papier prouvé), mode tablette,
 *    puis le rattache à un parent par un code ;
 *  - un enseignant supprime son compte : ses classes, listes et notes restent, transférées ;
 *  - un même e-mail parent ET enseignant ; deux parents (invitation, acceptation, retrait) ; émancipation ;
 *  - niveaux par matière (historique), passage de fin d'année, archivage des notes, « mon parcours ».
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { importQuranLemmas, schema as t } from '@awform/db';
import { totpAt } from '../src/auth/crypto.js';
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

describe.skipIf(!URL)('lot F2 — école, rôles, responsables, niveaux (awform_test)', () => {
  let c: Ctx;
  let T: H; // enseignant A (direction de son école personnelle)
  let schoolId: string;
  let cls: { id: string; joinCode: string };

  const totp = async (cookie: H) => {
    const s = (await c.req('POST', '/api/v1/auth/totp/setup', cookie, {})).json();
    // pas de temps décalé : jamais le même code qu'une autre activation de la même seconde
    const r = await c.req('POST', '/api/v1/auth/totp/confirm', cookie, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
    expect(r.statusCode, r.body).toBe(200);
  };
  const me = async (h: H) => (await c.req('GET', '/api/v1/auth/me', h)).json();
  const paper = async (name: string, classId = cls.id, h = T) => {
    const r = await c.req('POST', `/api/v1/ecole/classes/${classId}/pupils`, h, {
      displayName: name,
    });
    expect(r.statusCode, r.body).toBe(201);
    return r.json().pupil.id as string;
  };
  const note = (pid: string, score: number, h = T) =>
    c.req('PUT', `/api/v1/ecole/pupils/${pid}/resultats`, h, {
      levelCode: 'en1',
      day: `${YEAR}-06-01`,
      items: [{ item: 'examen', score, max: 20 }],
    });

  beforeAll(async () => {
    c = await setup(URL!, [
      { id: 'en1.l01', n: 1 },
      { id: 'en1.l02', n: 2 },
    ]);
    await c.h.pool.query(
      `insert into level (code, track, rank, title_fr, subject_code) values
        ('en2', 'enfants', 2, 'Niveau 2', 'arabe'), ('re1', 'religion', 1, 'Sciences 1', 'sciences'),
        ('ad1', 'adultes', 1, 'Adultes 1', 'arabe')`,
    );
    await c.h.pool.query(`update level set subject_code = 'arabe' where code = 'en1'`);
    await c.h.db.insert(t.levelVersion).values(
      ['en1', 'en2', 're1'].map((levelCode) => ({
        editionId: c.editionId,
        levelCode,
        book: { titre_fr: `Livre ${levelCode}` },
      })),
    );
    T = await teacher(c, 'maitre-f2@ecole.example');
    cls = await newClass(c, T, 'CP — Dakar');
    await c.req('PATCH', `/api/v1/ecole/classes/${cls.id}`, T, { levelCode: 'en1' });
    const m = await me(T);
    expect(m.ecoles).toHaveLength(1);
    expect(m.ecoles[0].roles.sort()).toEqual(['direction', 'enseignant']);
    schoolId = m.ecoles[0].id;
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('E1 : la classe appartient à une école (personnelle), le créateur en est titulaire', async () => {
    const d = (await c.req('GET', `/api/v1/ecole/ecoles/${schoolId}`, T)).json();
    expect(d.ecole.personal).toBe(true);
    expect(d.classes.map((x: { id: string }) => x.id)).toEqual([cls.id]);
    expect(d.annees).toHaveLength(1);
    const ens = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/enseignants`, T)).json();
    expect(ens.enseignants).toHaveLength(1);
    expect(ens.enseignants[0].role).toBe('titulaire');
  });

  it('E3 : l’école inscrit un élève papier, le convertit (consentement papier), tablette, puis code parent', async () => {
    const pid = await paper('Awa D.');
    // date du formulaire dans le futur : refusée ; adulte : refusé
    const bad = await c.req('POST', `/api/v1/ecole/pupils/${pid}/profil`, T, {
      birthYear: YEAR - 9,
      consent: { date: `${YEAR + 1}-01-01`, signataire: 'parent' },
    });
    expect(bad.json().error.code).toBe('date_consentement_invalide');
    const r = await c.req('POST', `/api/v1/ecole/pupils/${pid}/profil`, T, {
      birthYear: YEAR - 9,
      levelCode: 'en1',
      consent: { date: `${YEAR - 1}-09-15`, signataire: 'parent', reference: 'FORM-2026-014' },
    });
    expect(r.statusCode, r.body).toBe(201);
    const profileId = r.json().profileId as string;
    // profil titulaire = compte de l'école ; responsable « ecole » avec la preuve papier
    const [p] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, profileId));
    const [owner] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.id, p!.ownerAccountId));
    expect(owner!.kind).toBe('ecole');
    expect(owner!.email).toBeNull();
    const [cu] = await c.h.db
      .select()
      .from(t.profileCustodian)
      .where(eq(t.profileCustodian.profileId, profileId));
    expect(cu).toMatchObject({ nature: 'ecole', schoolId, status: 'actif' });
    expect(cu!.evidence).toMatchObject({ forme: 'papier', reference: 'FORM-2026-014' });
    expect(
      (
        await c.req('POST', `/api/v1/ecole/pupils/${pid}/profil`, T, {
          birthYear: YEAR - 9,
          consent: { date: `${YEAR - 1}-09-15`, signataire: 'parent' },
        })
      ).json().error.code,
    ).toBe('deja_profil');

    // une autre classe avec un autre élève de l'école (hors tablette)
    const other = await newClass(c, T, 'CE1');
    const pid2 = await paper('Moussa S.', other.id);
    const other2 = (
      await c.req('POST', `/api/v1/ecole/pupils/${pid2}/profil`, T, {
        birthYear: YEAR - 10,
        consent: { date: `${YEAR - 1}-09-15`, signataire: 'tuteur' },
      })
    ).json().profileId as string;

    // tablette de la classe CP : session du compte de l'école, limitée à la classe
    const tab = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/tablette`, T, { pin: '2468' });
    expect(tab.statusCode, tab.body).toBe(201);
    const TB = { cookie: cookieOf(tab) };
    // la session de l'enseignant est fermée sur cet appareil
    expect((await c.req('GET', '/api/v1/teacher/classes', T)).statusCode).toBe(401);
    const mt = await me(TB);
    expect(mt.tablette.classId).toBe(cls.id);
    expect(mt.roles).toEqual([]);
    expect(mt.profiles.map((x: { id: string }) => x.id)).toEqual([profileId]);
    expect((await c.req('GET', `/api/v1/profiles/${profileId}/parcours`, TB)).statusCode).toBe(200);
    expect((await c.req('GET', `/api/v1/profiles/${other2}/parcours`, TB)).statusCode).toBe(404);
    expect((await c.req('GET', '/api/v1/teacher/classes', TB)).statusCode).toBe(403);
    expect(
      (await c.req('POST', '/api/v1/account/pin/verify', TB, { pin: '2468' })).statusCode,
    ).toBe(200);

    // reconnexion de l'enseignant (second facteur) pour la suite
    T = await relogin('maitre-f2@ecole.example');
    // code pour le parent (affiché une fois) → le parent rattache l'enfant : il devient titulaire
    const code = (await c.req('POST', `/api/v1/ecole/pupils/${pid}/code-parent`, T)).json()
      .code as string;
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const fam = await parent(c, 'awa-maman@exemple.org');
    expect(
      (await c.req('POST', '/api/v1/profiles/rattacher', fam.P, { code, password: 'faux' }))
        .statusCode,
    ).toBe(401);
    const at = await c.req('POST', '/api/v1/profiles/rattacher', fam.P, { code, password: PW });
    expect(at.statusCode, at.body).toBe(201);
    expect(at.json()).toEqual({ profileId, titulaire: true });
    expect((await me(fam.P)).profiles.map((x: { id: string }) => x.id)).toContain(profileId);
    // code à usage unique
    expect(
      (await c.req('POST', '/api/v1/profiles/rattacher', fam.P, { code, password: PW })).statusCode,
    ).toBe(404);
    // l'école reste responsable pour sa classe ; l'enfant reste dans la classe
    const resp = (await c.req('GET', `/api/v1/profiles/${profileId}/responsables`, fam.P)).json();
    expect(resp.responsables.map((x: { nature: string }) => x.nature).sort()).toEqual([
      'ecole',
      'parent',
    ]);
    const [mem] = await c.h.db
      .select()
      .from(t.classMember)
      .where(and(eq(t.classMember.classId, cls.id), eq(t.classMember.profileId, profileId)));
    expect(mem).toBeTruthy();
  });

  /** reconnexion d'un compte de personnel avec son second facteur (secret relu en base) */
  async function relogin(email: string): Promise<H> {
    // session ouverte directement (second facteur vérifié), comme après une connexion avec le code TOTP
    const [a] = await c.h.db.select().from(t.account).where(eq(t.account.email, email));
    const { createSession } = await import('../src/auth/service.js');
    const s = await createSession(c.h.db, a!.id, a!.kind, true);
    return { cookie: `awform_session=${encodeURIComponent(s.token)}` };
  }

  it('E2 : un même e-mail parent ET enseignant (rôle donné par la direction), second facteur pour l’espace enseignant', async () => {
    const fam = await parent(c, 'parent-prof@exemple.org');
    const kid = await child(c, fam.P, 'Ilyas', 8);
    const add = await c.req('POST', `/api/v1/ecole/ecoles/${schoolId}/membres`, T, {
      email: 'parent-prof@exemple.org',
      role: 'enseignant',
    });
    expect(add.statusCode, add.body).toBe(201);
    // e-mail inconnu : refus neutre
    expect(
      (
        await c.req('POST', `/api/v1/ecole/ecoles/${schoolId}/membres`, T, {
          email: 'personne@exemple.org',
          role: 'enseignant',
        })
      ).json().error.code,
    ).toBe('compte_inconnu');
    // sans second facteur : la famille fonctionne, l'espace enseignant est refusé
    expect((await c.req('GET', `/api/v1/profiles/${kid}/parcours`, fam.P)).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/teacher/classes', fam.P)).json().error.code).toBe(
      'mfa_a_configurer',
    );
    await totp(fam.P);
    const m = await me(fam.P);
    expect(m.account.kind).toBe('parent');
    expect(m.roles).toEqual(expect.arrayContaining(['parent', 'enseignant']));
    expect(m.profiles.map((x: { id: string }) => x.id)).toEqual([kid]);
    const mine = await newClass(c, fam.P, 'Cercle du soir');
    expect(
      (await c.req('GET', '/api/v1/teacher/classes', fam.P))
        .json()
        .classes.map((x: { id: string }) => x.id),
    ).toContain(mine.id);
    // sa classe est dans l'école de la direction (unique école où il enseigne)
    const [row] = await c.h.db.select().from(t.classGroup).where(eq(t.classGroup.id, mine.id));
    expect(row!.schoolId).toBe(schoolId);
    // la direction voit la classe ; l'enseignant ne voit pas la classe CP de la direction
    expect((await c.req('GET', `/api/v1/ecole/classes/${mine.id}`, T)).statusCode).toBe(200);
    expect((await c.req('GET', `/api/v1/ecole/classes/${cls.id}`, fam.P)).statusCode).toBe(404);
  });

  it('E1 : un enseignant supprime son compte → classes, listes et notes conservées, transférées', async () => {
    const B = await teacher(c, 'remplace@ecole.example');
    const [b] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'remplace@ecole.example'));
    await c.req('POST', `/api/v1/ecole/ecoles/${schoolId}/membres`, T, {
      email: 'remplace@ecole.example',
      role: 'enseignant',
    });
    const k = await c.req('POST', '/api/v1/teacher/classes', B, { name: 'CM1', schoolId });
    expect(k.statusCode, k.body).toBe(201);
    const cm1 = k.json().class.id as string;
    await c.req('PATCH', `/api/v1/ecole/classes/${cm1}`, B, { levelCode: 'en1' });
    const pid = await paper('Fatou N.', cm1, B);
    const save = await note(pid, 15, B);
    expect(save.statusCode, save.body).toBeLessThan(300);
    // suppression du compte de B (mot de passe ressaisi)
    expect((await c.req('POST', '/api/v1/account/delete', B, { password: PW })).statusCode).toBe(
      200,
    );
    const [cg] = await c.h.db.select().from(t.classGroup).where(eq(t.classGroup.id, cm1));
    expect(cg).toBeTruthy();
    expect(cg!.teacherAccountId).toBeNull(); // sans suppléant : classe sans titulaire, à la direction
    expect(
      await c.h.db.select().from(t.paperResult).where(eq(t.paperResult.pupilId, pid)),
    ).toHaveLength(1);
    // la direction voit la classe et la transfère à un enseignant de l'école
    const d = (await c.req('GET', `/api/v1/ecole/ecoles/${schoolId}`, T)).json();
    expect(d.classes.find((x: { id: string }) => x.id === cm1).teacherAccountId).toBeNull();
    const [a] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'maitre-f2@ecole.example'));
    const tr = await c.req('POST', `/api/v1/ecole/classes/${cm1}/transfert`, T, {
      accountId: a!.id,
    });
    expect(tr.statusCode, tr.body).toBe(200);
    // effacement définitif plus tard : la clé RESTRICT ne bloque rien (le compte n'est plus titulaire)
    await c.h.db
      .update(t.account)
      .set({ deletedAt: new Date(Date.now() - 40 * 86400_000) })
      .where(eq(t.account.id, b!.id));
    const { purgeDeletedAccounts } = await import('@awform/db');
    expect(await purgeDeletedAccounts(c.h.db)).toBeGreaterThanOrEqual(1);
    const [still] = await c.h.db.select().from(t.classGroup).where(eq(t.classGroup.id, cm1));
    expect(still!.teacherAccountId).toBe(a!.id);
  });

  it('E4 : deux parents — invitation, acceptation, accès, retrait par le titulaire', async () => {
    const p1 = await parent(c, 'papa@exemple.org');
    const kid = await child(c, p1.P, 'Sara', 9);
    const p2 = await parent(c, 'maman@exemple.org');
    expect((await c.req('GET', `/api/v1/hifz/profiles/${kid}`, p2.P)).statusCode).toBe(404);
    const inv = await c.req('POST', `/api/v1/profiles/${kid}/second-parent`, p1.P, {
      password: PW,
    });
    expect(inv.statusCode, inv.body).toBe(201);
    const ok = await c.req('POST', '/api/v1/profiles/rattacher', p2.P, {
      code: inv.json().code,
      password: PW,
    });
    expect(ok.json()).toEqual({ profileId: kid, titulaire: false });
    const m2 = await me(p2.P);
    expect(m2.profiles).toEqual([expect.objectContaining({ id: kid, lien: 'parent' })]);
    expect((await c.req('GET', `/api/v1/hifz/profiles/${kid}`, p2.P)).statusCode).toBe(200);
    const [a2] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'maman@exemple.org'));
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${kid}/responsables/${a2!.id}`, p1.P)).statusCode,
    ).toBe(200);
    expect((await c.req('GET', `/api/v1/hifz/profiles/${kid}`, p2.P)).statusCode).toBe(404);
    // le titulaire qui supprime son compte : le profil passe au second parent (au lieu d'être effacé)
    const inv2 = await c.req('POST', `/api/v1/profiles/${kid}/second-parent`, p1.P, {
      password: PW,
    });
    await c.req('POST', '/api/v1/profiles/rattacher', p2.P, {
      code: inv2.json().code,
      password: PW,
    });
    expect((await c.req('POST', '/api/v1/account/delete', p1.P, { password: PW })).statusCode).toBe(
      200,
    );
    const [p] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, kid));
    expect(p!.ownerAccountId).toBe(a2!.id);
  });

  it('E4 : type recalculé depuis l’année de naissance ; émancipation avec tout l’historique', async () => {
    const fam = await parent(c, 'parent-ado@exemple.org');
    const ado = await child(c, fam.pin, 'Yanis', 17);
    // historique : un événement de hifẓ
    await c.h.db.insert(t.hifzEvent).values({
      id: '01900000-0000-7000-8000-00000000f201',
      profileId: ado,
      day: `${YEAR}-01-10`,
      part: '112:1-4',
      kind: 'appris',
      source: 'auto',
      deviceAt: new Date(),
    });
    // un profil créé « enfant » devenu « ado » : corrigé à la lecture
    await c.h.db.update(t.profile).set({ kind: 'enfant' }).where(eq(t.profile.id, ado));
    expect((await me(fam.P)).profiles.find((x: { id: string }) => x.id === ado).kind).toBe('ado');
    const em = await c.req('POST', `/api/v1/profiles/${ado}/emancipation`, fam.P, { password: PW });
    expect(em.statusCode, em.body).toBe(201);
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'yanis@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu'],
        birthYear: YEAR - 17,
        pseudonym: 'Yanis',
      },
    );
    expect(su.statusCode, su.body).toBe(201);
    const Y = { cookie: cookieOf(su) };
    const r = await c.req('POST', '/api/v1/account/reprendre-profil', Y, { code: em.json().code });
    expect(r.statusCode, r.body).toBe(201);
    const my = await me(Y);
    expect(my.profiles.map((x: { id: string }) => x.id)).toEqual([ado]);
    expect(
      await c.h.db.select().from(t.hifzEvent).where(eq(t.hifzEvent.profileId, ado)),
    ).toHaveLength(1);
    expect((await me(fam.P)).profiles.map((x: { id: string }) => x.id)).not.toContain(ado);
  });

  it('E8 : niveaux par matière, historisés (famille et maître)', async () => {
    const fam = await parent(c, 'niveaux@exemple.org');
    const kid = await child(c, fam.P, 'Nour', 8);
    let n = (await c.req('GET', `/api/v1/profiles/${kid}/niveaux`, fam.P)).json();
    expect(n.courants).toEqual([
      expect.objectContaining({ subject: 'arabe', levelCode: 'en1', source: 'inscription' }),
    ]);
    const s = await c.req('PUT', `/api/v1/profiles/${kid}/niveaux`, fam.P, {
      levelCode: 're1',
      source: 'positionnement',
      score: 0.8,
    });
    expect(s.statusCode, s.body).toBe(200);
    await join(c, fam.P, kid, cls);
    const [pupil] = await c.h.db
      .select()
      .from(t.classPupil)
      .where(and(eq(t.classPupil.classId, cls.id), eq(t.classPupil.profileId, kid)));
    const up = await c.req('PUT', `/api/v1/ecole/pupils/${pupil!.id}/niveau`, T, {
      levelCode: 'en2',
      source: 'epreuve',
    });
    expect(up.statusCode, up.body).toBe(200);
    n = (await c.req('GET', `/api/v1/profiles/${kid}/niveaux`, fam.P)).json();
    expect(
      n.courants
        .map((x: { subject: string; levelCode: string }) => `${x.subject}:${x.levelCode}`)
        .sort(),
    ).toEqual(['arabe:en2', 'sciences:re1']);
    expect(n.historique.filter((x: { subject: string }) => x.subject === 'arabe')).toEqual([
      expect.objectContaining({ levelCode: 'en1', outcome: 'termine' }),
      expect.objectContaining({ levelCode: 'en2', source: 'epreuve' }),
    ]);
    const [p] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, kid));
    expect(p!.levelCode).toBe('en2'); // copie de compatibilité
  });

  it('E8 : passage de fin d’année — décisions, niveau suivant, réinscription, archives (rien effacé)', async () => {
    const fam = await parent(c, 'passage@exemple.org');
    const kid = await child(c, fam.P, 'Bilal', 9);
    const k2 = await newClass(c, T, 'Arabe 1');
    await c.h.db.update(t.classGroup).set({ levelCode: 'en1' }).where(eq(t.classGroup.id, k2.id));
    await join(c, fam.P, kid, k2);
    const paperId = await paper('Khady B.', k2.id);
    expect((await note(paperId, 12)).statusCode).toBeLessThan(300);
    const d0 = (await c.req('GET', `/api/v1/ecole/ecoles/${schoolId}`, T)).json();
    const year = d0.annees[0];
    const y0 = Number(year.label.slice(0, 4));
    const prep = await c.req('POST', `/api/v1/ecole/ecoles/${schoolId}/annees`, T, {
      label: `${y0 + 1}-${y0 + 2}`,
      startsOn: `${y0 + 1}-09-01`,
      endsOn: `${y0 + 2}-07-31`,
    });
    expect(prep.statusCode, prep.body).toBe(201);
    const next = await c.req('POST', '/api/v1/teacher/classes', T, {
      name: 'Arabe 2',
      schoolId,
      yearId: prep.json().annee.id,
    });
    expect(next.statusCode, next.body).toBe(201);
    const nextId = next.json().class.id as string;
    const list = (await c.req('GET', `/api/v1/ecole/annees/${year.id}/eleves`, T)).json()
      .eleves as Array<{ pupilId: string; displayName: string }>;
    // décisions incomplètes : refus, rien n'est fait
    expect(
      (await c.req('POST', `/api/v1/ecole/annees/${year.id}/cloture`, T, { decisions: [] })).json()
        .error.code,
    ).toBe('decisions_incompletes');
    const decisions = list.map((x) => ({
      pupilId: x.pupilId,
      outcome: x.displayName === 'Khady B.' ? 'redouble' : 'admis',
      nextClassId: x.displayName === 'Bilal' ? nextId : null,
    }));
    const r = await c.req('POST', `/api/v1/ecole/annees/${year.id}/cloture`, T, { decisions });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      redouble: 1,
      reinscrits: 1,
      nouvelleAnnee: { label: `${y0 + 1}-${y0 + 2}` },
    });
    // niveau suivant pour l'admis ; ligne dans la classe de l'année suivante
    const lv = (await c.req('GET', `/api/v1/profiles/${kid}/niveaux`, fam.P)).json();
    expect(lv.courants.find((x: { subject: string }) => x.subject === 'arabe')).toMatchObject({
      levelCode: 'en2',
      source: 'passage',
    });
    const [again] = await c.h.db
      .select()
      .from(t.classPupil)
      .where(and(eq(t.classPupil.classId, nextId), eq(t.classPupil.profileId, kid)));
    expect(again?.leftAt).toBeNull();
    // archives : classes de l'année archivées, notes de Khady conservées, inscriptions closes avec leur issue
    const [old] = await c.h.db.select().from(t.classGroup).where(eq(t.classGroup.id, k2.id));
    expect(old!.status).toBe('archivee');
    const arch = (await c.req('GET', `/api/v1/ecole/classes/${k2.id}/archives`, T)).json();
    const kh = arch.eleves.find((x: { displayName: string }) => x.displayName === 'Khady B.');
    expect(kh.notes).toHaveLength(1);
    const enr = await c.h.db.select().from(t.enrolment).where(eq(t.enrolment.classId, k2.id));
    expect(enr.map((e) => e.outcome).sort()).toEqual(['admis', 'redouble']);
    expect(
      (await c.req('POST', `/api/v1/ecole/annees/${year.id}/cloture`, T, { decisions: [] })).json()
        .error.code,
    ).toBe('annee_non_ouverte');
  });

  it('E8 : départ d’une classe = archivage (notes gardées, retirées de la liste)', async () => {
    const pid = await paper('Ousmane K.');
    expect((await note(pid, 9)).statusCode).toBeLessThan(300);
    expect((await c.req('DELETE', `/api/v1/ecole/pupils/${pid}`, T)).statusCode).toBe(200);
    const list = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}`, T)).json();
    expect(list.pupils.map((x: { id: string }) => x.id)).not.toContain(pid);
    expect(
      await c.h.db.select().from(t.paperResult).where(eq(t.paperResult.pupilId, pid)),
    ).toHaveLength(1);
    const arch = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/archives`, T)).json();
    expect(arch.eleves.map((x: { id: string }) => x.id)).toContain(pid);
    // une ligne saisie par erreur, sans aucune note : vraiment effacée
    const oops = await paper('Erreur de saisie');
    expect((await c.req('DELETE', `/api/v1/ecole/pupils/${oops}`, T)).statusCode).toBe(200);
    expect(await c.h.db.select().from(t.classPupil).where(eq(t.classPupil.id, oops))).toHaveLength(
      0,
    );
  });

  it('API « mon parcours » : niveau par matière, prochaine leçon, aperçu du suivant, Coran, mots du Coran', async () => {
    await importQuranLemmas(
      c.h.db,
      {
        lemmes: [
          {
            n: 1,
            arabe: 'مِنْ',
            lemme_corpus_buckwalter: 'min',
            niveau_enfants: 'E1',
            niveau_adultes: 'A1',
          },
          {
            n: 2,
            arabe: 'فِي',
            lemme_corpus_buckwalter: 'fiY',
            niveau_enfants: 'E1',
            niveau_adultes: 'A1',
          },
          {
            n: 3,
            arabe: 'لَا',
            lemme_corpus_buckwalter: 'laA',
            niveau_enfants: 'E2',
            niveau_adultes: 'A2',
          },
        ],
      },
      'test',
    );
    const fam = await parent(c, 'parcours@exemple.org');
    const kid = await child(c, fam.P, 'Hawa', 8);
    const r = await c.req('GET', `/api/v1/profiles/${kid}/parcours`, fam.P);
    expect(r.statusCode, r.body).toBe(200);
    const p = r.json();
    const arabe = p.matieres.find((m: { matiere: string }) => m.matiere === 'arabe');
    expect(arabe.courant).toMatchObject({ code: 'en1', prochaineLecon: { id: 'en1.l01' } });
    expect(arabe.suivant).toMatchObject({ code: 'en2', acces: 'apercu' });
    expect(arabe.termines).toEqual([]);
    const sciences = p.matieres.find((m: { matiere: string }) => m.matiere === 'sciences');
    expect(sciences.courant).toBeNull();
    expect(sciences.proposition).toBe('re1');
    expect(p.coran).toEqual({ plan: null, cercles: [] });
    expect(p.motsDuCoran).toMatchObject({ niveau: 'en1', motsDuNiveau: 2, lienLecon: false });
    const mots = (await c.req('GET', '/api/v1/levels/en1/mots-coran')).json();
    expect(mots.mots.map((x: { lemmaKey: string }) => x.lemmaKey)).toEqual(['min', 'fiY']);
    // un autre compte : refusé
    const autre = await parent(c, 'autre-parcours@exemple.org');
    expect((await c.req('GET', `/api/v1/profiles/${kid}/parcours`, autre.P)).statusCode).toBe(404);
  });
});
