/**
 * V2-5, relecture de sécurité (2) — journal sans donnée personnelle, fin d'année sans classe suivante, élève encore
 * inscrit ailleurs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { erreurSure } from '../src/log-sur.js';
import { newClass, setup, teacher, YEAR, type Ctx } from './helpers.js';
import { connexion, creerLot } from './eleves-aide.js';

const URL_ = process.env.TEST_DATABASE_URL;
const an = YEAR - 9;

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
  },
);
