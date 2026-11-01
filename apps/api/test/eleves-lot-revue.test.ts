/**
 * V2-5, relecture de sécurité — point 5 : l'élève de l'école garde le type de compte « école » (indicateur explicite),
 * ne voit que SON profil et SON droit, en nombre fixe de requêtes ; plafonds par heure et idempotence.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupBilling } from '@awform/billing';
import { schema as t } from '@awform/db';
import { codePg } from '../src/ecole-eleves.js';
import {
  child,
  cookieOf,
  newClass,
  parent,
  PW,
  setup,
  teacher,
  YEAR,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const UNITS = [
  { id: 'en1.l01', n: 1 },
  { id: 'en1.l07', n: 7 },
];
const an = YEAR - 9;

export async function creerLot(
  c: Ctx,
  T: Record<string, string>,
  classId: string,
  eleves: Array<{ prenom: string; annee: number }>,
  extra: Record<string, unknown> = {},
) {
  return c.req('POST', `/api/v1/ecole/classes/${classId}/eleves/lot`, T, {
    eleves,
    accordParents: true,
    password: PW,
    ...extra,
  });
}

export async function connexion(c: Ctx, identifiant: string, motDePasse: string) {
  const r = await c.req(
    'POST',
    '/api/v1/auth/login',
    {},
    { email: identifiant, password: motDePasse },
  );
  return { r, E: { cookie: cookieOf(r) } };
}

/** nombre de requêtes SQL passées pendant `f` */
export async function compterRequetes(c: Ctx, f: () => Promise<unknown>): Promise<number> {
  const pool = c.h.pool as unknown as { query: (...a: unknown[]) => unknown };
  const orig = pool.query.bind(pool);
  let n = 0;
  pool.query = (...a: unknown[]) => {
    n++;
    return orig(...a);
  };
  try {
    await f();
  } finally {
    pool.query = orig;
  }
  return n;
}

describe('codePg (sans base)', () => {
  it('lit le code PostgreSQL dans la cause d’une erreur drizzle', () => {
    expect(codePg({ cause: { code: '23505' } })).toBe('23505');
    expect(codePg({ code: '23505' })).toBe('23505');
    expect(codePg(new Error('x'))).toBeUndefined();
  });
});

describe.skipIf(!URL_)('point 5 — élève de l’école, droits et plafonds (awform_test)', () => {
  let c: Ctx;
  let T1: Record<string, string>;
  let T2: Record<string, string>;
  let petite: { id: string };
  let grande: { id: string };
  let p1: { identifiant: string; motDePasse: string; profileId: string; pupilId: string };
  let p2: { identifiant: string; motDePasse: string; profileId: string };

  beforeAll(async () => {
    c = await setup(URL_!, UNITS, {
      billing: setupBilling({
        AWFORM_PAIEMENT: 'simule',
        AWFORM_PAIEMENT_SIM_SECRET: 'x',
        AWFORM_DROITS: 'on',
      }),
    });
    T1 = await teacher(c, 'un@exemple.org');
    T2 = await teacher(c, 'deux@exemple.org');
    petite = await newClass(c, T1, 'CP');
    grande = await newClass(c, T2, 'CM2');
    const r1 = await creerLot(c, T1, petite.id, [{ prenom: 'Awa', annee: an }]);
    expect(r1.statusCode, r1.body).toBe(201);
    p1 = r1.json().eleves[0];
    // la grande école : 40 élèves (profils dont le compte technique de l'école est titulaire)
    for (let k = 0; k < 2; k++) {
      const r = await creerLot(
        c,
        T2,
        grande.id,
        Array.from({ length: 20 }, (_, i) => ({
          prenom: `Moussa${'abcdefghijklmnopqrst'[i]}`,
          annee: an,
        })),
      );
      expect(r.statusCode, r.body).toBe(201);
      if (k === 0) p2 = r.json().eleves[0];
    }
  }, 180_000);
  afterAll(async () => {
    await c.app.close();
    await c.h.close();
  });

  it('kind « école » conservé, mais /auth/me ne renvoie que SON profil, sans les accords ni les rôles du titulaire', async () => {
    const { E } = await connexion(c, p2.identifiant, p2.motDePasse);
    const me = (await c.req('GET', '/api/v1/auth/me', E)).json();
    expect(me.enfantSession).toBe(true);
    expect(me.profiles.map((p: { id: string }) => p.id)).toEqual([p2.profileId]);
    expect(me.roles).toEqual([]);
    expect(me.ecoles).toEqual([]);
    const [s] = await c.h.db.select().from(t.session).where(eq(t.session.profileId, p2.profileId));
    const [a] = await c.h.db.select().from(t.account).where(eq(t.account.id, s!.accountId));
    expect(a!.kind).toBe('ecole');
  });

  it('mêmes réponses que l’enfant d’un parent sur les routes d’apprentissage ; refus identiques ailleurs', async () => {
    const { pin } = await parent(c, 'pere@exemple.org');
    const idEnfant = await child(c, pin, 'Yanis');
    const acces = await c.req('POST', `/api/v1/profiles/${idEnfant}/acces`, pin, {
      identifiant: 'yanis-742',
      motDePasse: 'soleil-vert-42',
      declaration: true,
      password: PW,
    });
    expect(acces.statusCode, acces.body).toBe(201);
    const enfant = await connexion(c, 'yanis-742', 'soleil-vert-42');
    expect(enfant.r.statusCode).toBe(200);
    const eleve = await connexion(c, p2.identifiant, p2.motDePasse);
    const chemins = (id: string) => [
      `/api/v1/profiles/${id}/accueil`,
      `/api/v1/profiles/${id}/espace/arabe`,
      `/api/v1/profiles/${id}/parcours`,
      `/api/v1/today/${id}`,
      '/api/v1/levels',
      '/api/v1/units/en1.l01',
      '/api/v1/profiles',
      '/api/v1/account/export',
      `/api/v1/profiles/${id}/responsables`,
      '/api/v1/famille/demandes',
    ];
    const a = chemins(idEnfant);
    const b = chemins(p2.profileId);
    for (let i = 0; i < a.length; i++) {
      const ra = await c.req('GET', a[i]!, enfant.E);
      const rb = await c.req('GET', b[i]!, eleve.E);
      expect(rb.statusCode, b[i]).toBe(ra.statusCode);
    }
    // et le profil du voisin : refusé
    const voisin = await c.req('GET', `/api/v1/profiles/${p1.profileId}/accueil`, eleve.E);
    expect(voisin.statusCode).toBe(403);
  });

  it('droits (AWFORM_DROITS=on) : la licence de SON école, en nombre de requêtes fixe quel que soit le nombre d’élèves', async () => {
    const e1 = await connexion(c, p1.identifiant, p1.motDePasse);
    const e2 = await connexion(c, p2.identifiant, p2.motDePasse);
    const compte = async (E: Record<string, string>, u: string) =>
      compterRequetes(c, () => c.req('GET', u, E));
    // sans licence : la leçon 7 est fermée
    const ferme = await c.req('GET', '/api/v1/units/en1.l07', e2.E);
    expect(ferme.statusCode).toBe(403);
    expect(ferme.json().error.code).toBe('droits_insuffisants');
    const n1 = await compte(e1.E, '/api/v1/units/en1.l01');
    const n2 = await compte(e2.E, '/api/v1/units/en1.l01'); // l’école de 40 élèves
    expect(n2).toBe(n1);
    expect(n2).toBeLessThan(40);
    const m1 = await compte(e1.E, '/api/v1/auth/me');
    const m2 = await compte(e2.E, '/api/v1/auth/me');
    expect(m2).toBe(m1);
    // licence de l’école de la grande classe : seulement SES élèves y ont droit
    const [ecole] = await c.h.db
      .select()
      .from(t.school)
      .where(
        eq(
          t.school.id,
          (await c.h.db.select().from(t.classGroup).where(eq(t.classGroup.id, grande.id)))[0]!
            .schoolId,
        ),
      );
    await c.h.db.insert(t.subscription).values({
      accountId: ecole!.accountId!,
      schoolId: ecole!.id,
      planCode: 'licence_ecole',
      status: 'active',
      provider: 'aucun',
      seats: 100,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86_400_000 * 30),
    });
    expect((await c.req('GET', '/api/v1/units/en1.l07', e2.E)).statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/units/en1.l07', e1.E)).statusCode).toBe(403);
  });

  it('plafond de 300 élèves par heure et par enseignant, toutes classes confondues', async () => {
    const T3 = await teacher(c, 'trois@exemple.org');
    const A = await newClass(c, T3, 'A');
    const B = await newClass(c, T3, 'B');
    const [tr] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'trois@exemple.org'));
    // 299 comptes déjà créés dans l’heure par cet enseignant (insérés directement : seul le comptage nous intéresse)
    await c.h.pool.query(
      `WITH p AS (INSERT INTO profile (owner_account_id, kind, pseudonym, birth_year, avatar)
          SELECT $1::uuid, 'enfant', 'x' || i, ${an}, 'etoile' FROM generate_series(1, 299) i RETURNING id, pseudonym)
       INSERT INTO profile_login (profile_id, login, password_hash, created_by_account_id)
          SELECT id, 'zz-' || pseudonym, 'x', $1::uuid FROM p`,
      [tr!.id],
    );
    const un = await creerLot(c, T3, A.id, [{ prenom: 'Fatou', annee: an }]);
    expect(un.statusCode, un.body).toBe(201); // le 300e
    const deux = await creerLot(c, T3, B.id, [{ prenom: 'Bintou', annee: an }]);
    expect(deux.statusCode).toBe(429); // autre classe, même enseignant : refusé
    expect(deux.json().error.code).toBe('trop_de_demandes');
    // fenêtre GLISSANTE : les comptes vieux de plus d’une heure ne comptent plus
    await c.h.pool.query(
      `UPDATE profile_login SET created_at = now() - interval '2 hours' WHERE created_by_account_id = $1::uuid`,
      [tr!.id],
    );
    expect((await creerLot(c, T3, B.id, [{ prenom: 'Bintou', annee: an }])).statusCode).toBe(201);
  }, 120_000);

  it('10 lots par heure, comptés sur les lots CRÉÉS : les refus ne consomment rien, la fenêtre glisse', async () => {
    const T4 = await teacher(c, 'quatre@exemple.org');
    const cl = await newClass(c, T4, 'CE1');
    // 15 refus (année d’adulte) : aucun lot n’est créé, aucune tentative n’est comptée
    for (let i = 0; i < 15; i++)
      expect(
        (await creerLot(c, T4, cl.id, [{ prenom: 'Zaid', annee: YEAR - 30 }])).statusCode,
      ).toBe(400);
    for (let i = 0; i < 10; i++) {
      const r = await creerLot(c, T4, cl.id, [{ prenom: `Lot${'abcdefghij'[i]}`, annee: an }]);
      expect(r.statusCode, `lot ${i}`).toBe(201);
    }
    expect((await creerLot(c, T4, cl.id, [{ prenom: 'Onze', annee: an }])).statusCode).toBe(429);
    const [tr] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'quatre@exemple.org'));
    await c.h.pool.query(
      `UPDATE profile_custodian SET created_at = now() - interval '61 minutes' WHERE created_by = $1::uuid`,
      [tr!.id],
    );
    expect((await creerLot(c, T4, cl.id, [{ prenom: 'Douze', annee: an }])).statusCode).toBe(201);
  }, 120_000);

  it('clé d’idempotence : un double envoi (même simultané) ne crée qu’un lot', async () => {
    const T5 = await teacher(c, 'cinq@exemple.org');
    const cl = await newClass(c, T5, 'CE2');
    const cle = randomUUID();
    const [a, b] = await Promise.all([
      creerLot(c, T5, cl.id, [{ prenom: 'Sokhna', annee: an }], { cle }),
      creerLot(c, T5, cl.id, [{ prenom: 'Sokhna', annee: an }], { cle }),
    ]);
    expect([a.statusCode, b.statusCode].sort(), a.body + b.body).toEqual([201, 409]);
    const refus = a.statusCode === 409 ? a : b;
    expect(refus.json().error.code).toBe('lot_deja_cree');
    const g = (await c.req('GET', `/api/v1/ecole/classes/${cl.id}/eleves/acces`, T5)).json();
    expect(g.eleves).toHaveLength(1);
    // une autre clé : un nouveau lot
    expect(
      (await creerLot(c, T5, cl.id, [{ prenom: 'Sokhna', annee: an }], { cle: randomUUID() }))
        .statusCode,
    ).toBe(201);
  }, 60_000);

  it('niveau et journal sont écrits dans la même transaction que les comptes', async () => {
    const T6 = await teacher(c, 'six@exemple.org');
    const cl = await newClass(c, T6, 'CP-en1');
    await c.h.pool.query(`UPDATE class_group SET level_code = 'en1' WHERE id = $1::uuid`, [cl.id]);
    const r = await creerLot(c, T6, cl.id, [{ prenom: 'Mame', annee: an }]);
    expect(r.statusCode, r.body).toBe(201);
    const [pr] = await c.h.db
      .select()
      .from(t.profile)
      .where(eq(t.profile.id, r.json().eleves[0].profileId));
    expect(pr!.levelCode).toBe('en1');
    const j = await c.h.pool.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'ecole.eleves.lot' AND target = $1`,
      [cl.id],
    );
    expect(j.rows[0].n).toBe(1);
  });
});
