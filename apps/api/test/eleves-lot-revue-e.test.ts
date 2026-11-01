/**
 * V2-5, relecture de sécurité (2) — journal sans donnée personnelle, fin d'année sans classe suivante, élève encore
 * inscrit ailleurs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { erreurSure } from '../src/log-sur.js';
import { VerrouLot } from '../src/ecole-eleves.js';
import { decideReenrolment } from '@awform/db';
import { newClass, parent, PW, setup, teacher, YEAR, type Ctx } from './helpers.js';
import { connexion, creerLot } from './eleves-aide.js';

const URL_ = process.env.TEST_DATABASE_URL;
const an = YEAR - 9;

describe('verrou d’un lot par enseignant (sans base)', () => {
  it('pris une fois, libéré, et considéré comme libre après 5 minutes', () => {
    const v = new VerrouLot(5 * 60_000);
    expect(v.prendre('t1', 0)).toBe(true);
    expect(v.prendre('t1', 1000)).toBe(false);
    expect(v.prendre('t2', 1000)).toBe(true); // un autre enseignant n'est pas gêné
    v.liberer('t1');
    expect(v.prendre('t1', 2000)).toBe(true);
    expect(v.prendre('t1', 2000 + 5 * 60_000 - 1)).toBe(false);
    expect(v.prendre('t1', 2000 + 5 * 60_000)).toBe(true); // verrou périmé
  });
});

describe('journal d’erreurs sans paramètres (sans base)', () => {
  it('une erreur de requête ne laisse ni empreinte, ni prénom, ni année, ni identifiant', () => {
    const e = Object.assign(
      new Error(
        'Failed query: insert into "profile_login" ("login", "password_hash") values ($1, $2)\nparams: awa-123,$argon2id$v=19$m=65536$SECRET,Awa,2017',
      ),
      {
        cause: {
          code: '23505',
          constraint: 'profile_login_login_unique',
          table: 'profile_login',
          detail: 'Key (login)=(awa-123) already exists.',
        },
      },
    );
    const sortie = JSON.stringify(erreurSure(e));
    for (const secret of ['argon2id', 'SECRET', 'awa-123', 'Awa', '2017', 'already exists'])
      expect(sortie, secret).not.toContain(secret);
    expect(erreurSure(e)).toMatchObject({
      code: '23505',
      contrainte: 'profile_login_login_unique',
    });
    expect(erreurSure('chaîne').pile).toEqual([]);
  });
});

describe.skipIf(!URL_)(
  'fin d’année : un élève sans classe suivante n’a plus d’accès (awform_test)',
  () => {
    let c: Ctx;
    beforeAll(async () => {
      c = await setup(URL_!);
    }, 60_000);
    afterAll(async () => {
      await c.app.close();
      await c.h.close();
    });

    it('admis sans classe suivante : accès fermé ; admis avec classe suivante : accès gardé', async () => {
      const T = await teacher(c, 'cloture@exemple.org');
      const cls = await newClass(c, T, 'CE1');
      const [cl] = await c.h.db.select().from(t.classGroup).where(eq(t.classGroup.id, cls.id));
      const schoolId = cl!.schoolId;
      const r = await creerLot(c, T, cls.id, [
        { prenom: 'Sans', annee: an },
        { prenom: 'Avec', annee: an },
      ]);
      expect(r.statusCode, r.body).toBe(201);
      const [sans, avec] = r.json().eleves;
      const eSans = await connexion(c, sans.identifiant, sans.motDePasse);
      expect(eSans.r.statusCode).toBe(200);
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
        name: 'CE2',
        schoolId,
        yearId: prep.json().annee.id,
      });
      const nextId = next.json().class.id as string;
      const list = (await c.req('GET', `/api/v1/ecole/annees/${year.id}/eleves`, T)).json()
        .eleves as Array<{ pupilId: string; displayName: string }>;
      const decisions = list.map((x) => ({
        pupilId: x.pupilId,
        outcome: 'admis',
        nextClassId: x.displayName === 'Avec' ? nextId : null,
      }));
      const cl2 = await c.req('POST', `/api/v1/ecole/annees/${year.id}/cloture`, T, { decisions });
      expect(cl2.statusCode, cl2.body).toBe(200);
      // sans classe suivante : connexion refusée, session fermée
      expect((await connexion(c, sans.identifiant, sans.motDePasse)).r.statusCode).toBe(401);
      expect((await c.req('GET', '/api/v1/auth/me?doux=1', eSans.E)).json().anonyme).toBe(true);
      // avec classe suivante : il continue d’apprendre
      expect((await connexion(c, avec.identifiant, avec.motDePasse)).r.statusCode).toBe(200);
    }, 90_000);

    it('M-1 — un élève encore inscrit dans une autre classe de l’école garde son accès à son départ d’une classe', async () => {
      const T = await teacher(c, 'deuxclasses@exemple.org');
      const a = await newClass(c, T, 'Classe A');
      const b = await newClass(c, T, 'Classe B');
      const r = await creerLot(c, T, a.id, [{ prenom: 'Double', annee: an }]);
      expect(r.statusCode, r.body).toBe(201);
      const x = r.json().eleves[0];
      // même profil, aussi inscrit dans la classe B
      await c.h.db
        .insert(t.classPupil)
        .values({ classId: b.id, profileId: x.profileId, displayName: 'Double' });
      expect((await c.req('DELETE', `/api/v1/ecole/pupils/${x.pupilId}`, T)).statusCode).toBe(200);
      expect((await connexion(c, x.identifiant, x.motDePasse)).r.statusCode).toBe(200);
      // il quitte aussi la classe B : plus d’accès
      const [pb] = await c.h.db.select().from(t.classPupil).where(eq(t.classPupil.classId, b.id));
      expect((await c.req('DELETE', `/api/v1/ecole/pupils/${pb!.id}`, T)).statusCode).toBe(200);
      expect((await connexion(c, x.identifiant, x.motDePasse)).r.statusCode).toBe(401);
    }, 60_000);

    it('M-3 — un second lot simultané du même enseignant est refusé (429) avant tout calcul', async () => {
      const T = await teacher(c, 'simultane@exemple.org');
      const cl = await newClass(c, T, 'CP');
      const gros = Array.from({ length: 30 }, (_, i) => ({
        prenom: `Eleve${'abcdefghijklmnopqrstuvwxyzABCD'[i]}`,
        annee: an,
      }));
      const [a, b] = await Promise.all([creerLot(c, T, cl.id, gros), creerLot(c, T, cl.id, gros)]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 429]);
    }, 90_000);

    it('le verrou est relâché après un lot refusé ou en erreur : le suivant n’est pas bloqué (429)', async () => {
      const T = await teacher(c, 'relache@exemple.org');
      const cl = await newClass(c, T, 'CP');
      const mauvais = await creerLot(c, T, cl.id, [{ prenom: 'Zaid', annee: an }], {
        password: 'faux',
      });
      expect(mauvais.statusCode).toBe(401);
      const adulte = await creerLot(c, T, cl.id, [{ prenom: 'Zaid', annee: YEAR - 30 }]);
      expect(adulte.statusCode).toBe(400);
      const inconnue = await creerLot(c, T, '00000000-0000-4000-8000-000000000000', [
        { prenom: 'Zaid', annee: an },
      ]);
      expect(inconnue.statusCode).toBe(404);
      const bon = await creerLot(c, T, cl.id, [{ prenom: 'Zaid', annee: an }]);
      expect(bon.statusCode, bon.body).toBe(201);
    }, 60_000);

    it('le refus d’une réinscription ferme l’accès de l’élève de l’école (sans autre inscription active)', async () => {
      const T = await teacher(c, 'refus@exemple.org');
      const [enseignant] = await c.h.db
        .select()
        .from(t.account)
        .where(eq(t.account.email, 'refus@exemple.org'));
      const a = await newClass(c, T, 'Année 1');
      const b = await newClass(c, T, 'Année 2');
      const r = await creerLot(c, T, a.id, [{ prenom: 'Refus', annee: an }]);
      expect(r.statusCode, r.body).toBe(201);
      const x = r.json().eleves[0];
      expect((await connexion(c, x.identifiant, x.motDePasse)).r.statusCode).toBe(200);
      // la classe de l'année précédente est close : plus d'inscription active ; une proposition vers la classe B
      await c.h.pool.query(`UPDATE class_pupil SET left_at = now() WHERE id = $1::uuid`, [
        x.pupilId,
      ]);
      await c.h.db
        .insert(t.classPupil)
        .values({ classId: b.id, profileId: x.profileId, displayName: 'Refus' });
      const [offre] = await c.h.db
        .insert(t.reenrolmentOffer)
        .values({ profileId: x.profileId, classId: b.id })
        .returning();
      const res = await decideReenrolment(c.h.db, offre!.id, [x.profileId], enseignant!.id, false);
      expect(res).toMatchObject({ profileId: x.profileId });
      expect((await connexion(c, x.identifiant, x.motDePasse)).r.statusCode).toBe(401);
      expect(
        (
          await c.h.db
            .select()
            .from(t.profileLogin)
            .where(eq(t.profileLogin.profileId, x.profileId))
        ).length,
      ).toBe(0);
    }, 60_000);

    it('reprise par un parent simultanée à une recréation : aucun mot de passe de l’école ne survit', async () => {
      const T = await teacher(c, 'course@exemple.org');
      const cl = await newClass(c, T, 'CE1');
      const fam = await parent(c, 'course-parent@exemple.org');
      for (let essai = 0; essai < 3; essai++) {
        const r = await creerLot(c, T, cl.id, [{ prenom: `Course${'abc'[essai]}`, annee: an }]);
        expect(r.statusCode, r.body).toBe(201);
        const x = r.json().eleves[0];
        const code = (
          await c.req('POST', `/api/v1/ecole/pupils/${x.pupilId}/code-parent`, T)
        ).json().code;
        const [rec, att] = await Promise.all([
          c.req('POST', `/api/v1/ecole/pupils/${x.pupilId}/mot-de-passe`, T, { password: PW }),
          c.req('POST', '/api/v1/profiles/rattacher', fam.P, { code, password: PW }),
        ]);
        expect(att.statusCode, att.body).toBe(201);
        expect([200, 409, 404]).toContain(rec.statusCode);
        // quel que soit l'ordre : plus d'identifiant de l'école, ni l'ancien ni le nouveau mot de passe ne marchent
        expect(
          (
            await c.h.db
              .select()
              .from(t.profileLogin)
              .where(eq(t.profileLogin.profileId, x.profileId))
          ).length,
        ).toBe(0);
        expect((await connexion(c, x.identifiant, x.motDePasse)).r.statusCode).toBe(401);
        if (rec.statusCode === 200)
          expect((await connexion(c, x.identifiant, rec.json().motDePasse)).r.statusCode).toBe(401);
      }
    }, 120_000);
  },
);
