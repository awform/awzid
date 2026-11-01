/**
 * V2-5, relecture de sécurité — points 1, 2 et 4 : l'école ne touche qu'à ses propres élèves ; un enfant rattaché à un
 * parent ou venu d'une famille n'est ni modifié ni exposé ; un élève parti ne se connecte plus.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { child, join, newClass, parent, PW, setup, teacher, YEAR, type Ctx } from './helpers.js';
import { connexion, creerLot } from './eleves-aide.js';

const URL_ = process.env.TEST_DATABASE_URL;
const an = YEAR - 9;

type Eleve = { identifiant: string; motDePasse: string; profileId: string; pupilId: string };

describe.skipIf(!URL_)('points 1, 2 et 4 — responsabilité de l’école (awform_test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let cls: { id: string; joinCode: string };
  let A: Eleve; // rattaché à un parent
  let B: Eleve; // reste à l’école
  let D: Eleve; // partira
  let P: Record<string, string>;
  let pin: Record<string, string>;
  let enfantFamille: string;

  beforeAll(async () => {
    c = await setup(URL_!);
    T = await teacher(c, 'maitre-revue@exemple.org');
    cls = await newClass(c, T, 'CE2');
    const r = await creerLot(c, T, cls.id, [
      { prenom: 'Awa', annee: an },
      { prenom: 'Bintou', annee: an },
      { prenom: 'Demba', annee: an },
    ]);
    expect(r.statusCode, r.body).toBe(201);
    [A, B, D] = r.json().eleves;
    const fam = await parent(c, 'famille-revue@exemple.org');
    P = fam.P;
    pin = fam.pin;
    // A est rattaché au compte d’un parent (code remis par l’école)
    const code = (await c.req('POST', `/api/v1/ecole/pupils/${A.pupilId}/code-parent`, T)).json()
      .code;
    const at = await c.req('POST', '/api/v1/profiles/rattacher', P, { code, password: PW });
    expect(at.statusCode, at.body).toBe(201);
    // un enfant de la famille, avec SON identifiant (créé par le parent), inscrit dans la classe par le code de classe
    enfantFamille = await child(c, pin, 'Yanis');
    const acces = await c.req('POST', `/api/v1/profiles/${enfantFamille}/acces`, pin, {
      identifiant: 'yanis-742',
      motDePasse: 'soleil-vert-42',
      declaration: true,
      password: PW,
    });
    expect(acces.statusCode, acces.body).toBe(201);
    await join(c, P, enfantFamille, cls);
  }, 120_000);
  afterAll(async () => {
    await c.app.close();
    await c.h.close();
  });

  const mdp = (id: string, corps: object = { password: PW }) =>
    c.req('POST', `/api/v1/ecole/pupils/${id}/mot-de-passe`, T, corps);

  it('point 1 — après rattachement : recréation refusée (409), identifiant et mot de passe intacts, déblocage permis', async () => {
    const [prof] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, A.profileId));
    const [par] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'famille-revue@exemple.org'));
    expect(prof!.ownerAccountId).toBe(par!.id); // le parent est devenu titulaire
    const avant = (
      await c.h.db.select().from(t.profileLogin).where(eq(t.profileLogin.profileId, A.profileId))
    )[0]!;
    const r = await mdp(A.pupilId);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('profil_rattache_a_un_parent');
    const apres = (
      await c.h.db.select().from(t.profileLogin).where(eq(t.profileLogin.profileId, A.profileId))
    )[0]!;
    expect(apres.passwordHash).toBe(avant.passwordHash);
    expect((await connexion(c, A.identifiant, A.motDePasse)).r.statusCode).toBe(200);
    // le déblocage reste permis
    const d = await mdp(A.pupilId, { password: PW, debloquer: true });
    expect(d.statusCode, d.body).toBe(200);
    // un élève resté à l’école : recréation permise
    const ok = await mdp(B.pupilId);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().motDePasse).toMatch(/^[a-z2-9]{8}$/);
  });

  it('point 1 — un identifiant créé par un autre compte n’est jamais recréé par l’école', async () => {
    // l’identifiant de Demba est attribué (par erreur ou par manipulation) à un compte étranger à l’école
    const [etranger] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'famille-revue@exemple.org'));
    await c.h.db
      .update(t.profileLogin)
      .set({ createdByAccountId: etranger!.id })
      .where(eq(t.profileLogin.profileId, D.profileId));
    const r = await mdp(D.pupilId);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('acces_non_gere_par_l_ecole');
    await c.h.db
      .update(t.profileLogin)
      .set({
        createdByAccountId: (
          await c.h.db
            .select()
            .from(t.account)
            .where(eq(t.account.email, 'maitre-revue@exemple.org'))
        )[0]!.id,
      })
      .where(eq(t.profileLogin.profileId, D.profileId));
  });

  it('point 2 — l’école ne voit que les identifiants de ses élèves (ni l’enfant d’une famille, ni l’enfant rattaché)', async () => {
    const g = await c.req('GET', `/api/v1/ecole/classes/${cls.id}/eleves/acces`, T);
    expect(g.statusCode).toBe(200);
    const liste = g.json().eleves as Array<{
      prenom: string;
      identifiant: string | null;
      whatsapp: string | null;
    }>;
    const par = (n: string) => liste.find((x) => x.prenom === n)!;
    expect(par('Bintou').identifiant).toBe(B.identifiant);
    expect(par('Demba').identifiant).toBe(D.identifiant);
    expect(par('Awa').identifiant).toBeNull(); // rattaché à un parent
    expect(par('Awa').whatsapp).toBeNull();
    expect(par('Yanis').identifiant).toBeNull(); // créé par un parent
    expect(par('Yanis').whatsapp).toBeNull();
    expect(g.body).not.toContain('yanis-742');
    expect(g.body).not.toContain(A.identifiant);
  });

  it('point 2 — la fiche PDF refuse l’enfant d’un parent, même avec son mot de passe', async () => {
    const [pu] = await c.h.db
      .select()
      .from(t.classPupil)
      .where(eq(t.classPupil.profileId, enfantFamille));
    for (const e of [
      { pupilId: pu!.id, motDePasse: 'soleil-vert-42' },
      { pupilId: A.pupilId, motDePasse: A.motDePasse },
    ]) {
      const r = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/fiche.pdf`, T, {
        eleves: [e],
      });
      expect(r.statusCode).toBe(404);
    }
    const ok = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/fiche.pdf`, T, {
      eleves: [{ pupilId: B.pupilId, motDePasse: 'abcdefgh' }],
    });
    expect(ok.statusCode).toBe(200);
    // un seul élève refusé : aucune fiche, même pour les autres
    const mix = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/fiche.pdf`, T, {
      eleves: [
        { pupilId: B.pupilId, motDePasse: 'abcdefgh' },
        { pupilId: A.pupilId, motDePasse: 'abcdefgh' },
      ],
    });
    expect(mix.statusCode).toBe(404);
  });

  it('point 4 — élève parti : connexion refusée, sessions fermées ; élève rattaché à un parent : rien n’est touché', async () => {
    const dem = await connexion(c, D.identifiant, D.motDePasse);
    expect(dem.r.statusCode).toBe(200);
    const aw = await connexion(c, A.identifiant, A.motDePasse);
    expect(aw.r.statusCode).toBe(200);
    expect((await c.req('GET', '/api/v1/auth/me', dem.E)).json().enfantSession).toBe(true);
    // l’enseignant retire Demba de la classe
    const rm = await c.req('DELETE', `/api/v1/ecole/pupils/${D.pupilId}`, T);
    expect(rm.statusCode, rm.body).toBe(200);
    expect((await c.req('GET', '/api/v1/auth/me?doux=1', dem.E)).json().anonyme).toBe(true);
    const neuf = await connexion(c, D.identifiant, D.motDePasse);
    expect(neuf.r.statusCode).toBe(401);
    expect(
      (await c.h.db.select().from(t.profileLogin).where(eq(t.profileLogin.profileId, D.profileId)))
        .length,
    ).toBe(0);
    // Awa (rattachée à un parent) quitte la classe : son compte familial continue de marcher
    const rm2 = await c.req('DELETE', `/api/v1/ecole/pupils/${A.pupilId}`, T);
    expect(rm2.statusCode, rm2.body).toBe(200);
    expect((await c.req('GET', '/api/v1/auth/me', aw.E)).json().enfantSession).toBe(true);
    expect((await connexion(c, A.identifiant, A.motDePasse)).r.statusCode).toBe(200);
    // un passage de classe (sortie autre que « parti ») ne coupe pas l’accès : voir `fermerAccesEleve`
  });
});
