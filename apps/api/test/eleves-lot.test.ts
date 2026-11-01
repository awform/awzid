/**
 * V2-5 — l'enseignant crée les comptes de ses élèves en liste : 40 élèves, prénoms en double, identifiants uniques,
 * preuve de l'accord des parents, fiche PDF, message WhatsApp sans mot de passe, enseignant d'une autre classe refusé,
 * et les MÊMES protections que pour un enfant créé par un parent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { lireListeEleves } from '@awform/school/eleves-lot';
import { ficheClassePdf, texteWinAnsi } from '../src/pdf-fiche.js';
import { tirerIdentifiants } from '../src/ecole-eleves.js';
import { LOGIN_ENFANT } from '../src/auth/enfant-login.js';
import { cookieOf, newClass, PW, setup, teacher, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;

describe('fiche PDF (sans base)', () => {
  it('une page pour 10 étiquettes, accents en WinAnsi, parenthèses échappées', () => {
    const e = (i: number) => ({
      prenom: `Élève (${i})`,
      login: `eleve-${100 + i}`,
      motDePasse: 'k7m2x9qa',
    });
    const un = ficheClassePdf({
      ecole: 'École',
      classe: 'CE2',
      date: '2026-11-01',
      etiquettes: [e(1)],
    });
    const vingtEtUn = ficheClassePdf({
      ecole: null,
      classe: 'CE2',
      date: '2026-11-01',
      etiquettes: Array.from({ length: 21 }, (_, i) => e(i)),
    });
    expect(un.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(un.toString('latin1')).toContain('/Count 1');
    expect(vingtEtUn.toString('latin1')).toContain('/Count 3');
    expect(vingtEtUn.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(texteWinAnsi('Éa(b)\\')).toBe('(\xC9a\\(b\\)\\\\)');
    expect(texteWinAnsi('أ')).toBe('(?)');
  });
});

describe('identifiants « prénom-NNN » (sans base de prénoms réelle)', () => {
  it('liste vide en base : 40 « Awa » reçoivent 40 identifiants distincts de la bonne forme', async () => {
    const faux = { select: () => ({ from: () => ({ where: async () => [] }) }) } as never;
    const ids = await tirerIdentifiants(
      faux,
      Array.from({ length: 40 }, () => 'Awa'),
    );
    expect(new Set(ids).size).toBe(40);
    for (const i of ids) expect(i).toMatch(/^awa-\d{3,4}$/);
  });
});

describe.skipIf(!URL)('création en lot par l’enseignant (awform_test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let autre: Record<string, string>;
  let classe: { id: string; joinCode: string };
  let classeAutre: { id: string };

  const lot = (cookie: Record<string, string>, id: string, corps: Record<string, unknown>) =>
    c.req('POST', `/api/v1/ecole/classes/${id}/eleves/lot`, cookie, {
      accordParents: true,
      password: PW,
      ...corps,
    });
  const an = YEAR - 9;

  beforeAll(async () => {
    c = await setup(URL!);
    T = await teacher(c, 'maitre@exemple.org');
    autre = await teacher(c, 'autre@exemple.org');
    classe = await newClass(c, T, 'CE2');
    classeAutre = await newClass(c, autre, 'CM1');
  }, 60_000);
  afterAll(async () => {
    await c.app.close();
    await c.h.pool.end();
  });

  let crees: Array<{
    profileId: string;
    pupilId: string;
    prenom: string;
    identifiant: string;
    motDePasse: string;
    whatsapp: string;
  }> = [];

  it('40 élèves d’un coup, prénoms en double compris : identifiants uniques, mots de passe de 8 caractères', async () => {
    const prenoms = ['Awa', 'Moussa', 'Ibrahima', 'Fatou', 'Aïcha', 'Jean-Éric', 'Awa', 'Moussa'];
    const eleves = Array.from({ length: 40 }, (_, i) => ({
      prenom: prenoms[i % prenoms.length]!,
      annee: an - (i % 4),
    }));
    const r = await lot(T, classe.id, { eleves });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    crees = r.json().eleves;
    expect(crees).toHaveLength(40);
    const logins = crees.map((e) => e.identifiant);
    expect(new Set(logins).size).toBe(40);
    for (const e of crees) {
      expect(e.identifiant).toMatch(LOGIN_ENFANT);
      expect(e.motDePasse).toMatch(/^[a-z2-9]{8}$/);
    }
    // les prénoms en double ont des identifiants différents
    const awa = crees.filter((e) => e.prenom === 'Awa').map((e) => e.identifiant);
    expect(new Set(awa).size).toBe(awa.length);
    expect(awa.every((l) => l.startsWith('awa-'))).toBe(true);
    expect(crees.find((e) => e.prenom === 'Aïcha')!.identifiant.startsWith('aicha-')).toBe(true);
    // en base : un identifiant par élève, mot de passe haché (jamais en clair), élève dans la classe
    const lignes = await c.h.db
      .select()
      .from(t.profileLogin)
      .where(
        inArray(
          t.profileLogin.profileId,
          crees.map((e) => e.profileId),
        ),
      );
    expect(lignes).toHaveLength(40);
    for (const l of lignes) {
      expect(l.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(crees.map((e) => e.motDePasse)).not.toContain(l.passwordHash);
    }
    const dansClasse = await c.h.db
      .select()
      .from(t.classPupil)
      .where(eq(t.classPupil.classId, classe.id));
    expect(dansClasse).toHaveLength(40);
    const membres = await c.h.db
      .select()
      .from(t.classMember)
      .where(eq(t.classMember.classId, classe.id));
    expect(membres).toHaveLength(40);
  }, 120_000);

  it('preuve de l’accord des parents sur chaque profil : école, date, enseignant', async () => {
    const cust = await c.h.db
      .select()
      .from(t.profileCustodian)
      .where(
        inArray(
          t.profileCustodian.profileId,
          crees.map((e) => e.profileId),
        ),
      );
    expect(cust).toHaveLength(40);
    const lots = new Set<string>();
    for (const x of cust) {
      expect(x.nature).toBe('ecole');
      expect(x.status).toBe('actif');
      expect(x.schoolId).toBeTruthy();
      const ev = x.evidence as Record<string, string>;
      expect(ev.forme).toBe('case_accord_ecole');
      expect(ev.date).toBe(new Date().toISOString().slice(0, 10));
      expect(ev.ecoleId).toBe(x.schoolId);
      expect(ev.enseignant).toBe(x.createdBy);
      lots.add(ev.lot!);
    }
    expect(lots.size).toBe(1);
    const consents = await c.h.db
      .select()
      .from(t.consent)
      .where(eq(t.consent.profileId, crees[0]!.profileId));
    expect(consents.map((x) => x.type).sort()).toEqual(['compte_suivi', 'partage_enseignant']);
  });

  it('sans la case d’accord, ou avec un mauvais mot de passe : rien n’est créé', async () => {
    const avant = (await c.h.db.select().from(t.profileLogin)).length;
    const sansCase = await lot(T, classe.id, {
      eleves: [{ prenom: 'Zaïd', annee: an }],
      accordParents: false,
    });
    expect(sansCase.statusCode).toBe(400);
    expect(sansCase.json().error.code).toBe('accord_ecole_requis');
    const manque = await c.req('POST', `/api/v1/ecole/classes/${classe.id}/eleves/lot`, T, {
      eleves: [{ prenom: 'Zaïd', annee: an }],
    });
    expect(manque.statusCode).toBe(400);
    const faux = await lot(T, classe.id, {
      eleves: [{ prenom: 'Zaïd', annee: an }],
      password: 'un tout autre mot de passe',
    });
    expect(faux.statusCode).toBe(401);
    expect((await c.h.db.select().from(t.profileLogin)).length).toBe(avant);
  });

  it('une ligne invalide annule tout le lot (adulte, trop jeune, prénom incorrect)', async () => {
    const avant = (await c.h.db.select().from(t.profileLogin)).length;
    const r = await lot(T, classe.id, {
      eleves: [
        { prenom: 'Bon', annee: an },
        { prenom: 'Adulte', annee: YEAR - 30 },
        { prenom: 'Bébé', annee: YEAR },
        { prenom: 'A<b>', annee: an },
      ],
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('lignes_invalides');
    expect(r.json().error.lignes).toEqual([
      { ligne: 2, code: 'adulte_compte_personnel' },
      { ligne: 3, code: 'annee_naissance_invalide' },
      { ligne: 4, code: 'prenom_invalide' },
    ]);
    expect((await c.h.db.select().from(t.profileLogin)).length).toBe(avant);
    const trop = await lot(T, classe.id, {
      eleves: Array.from({ length: 61 }, () => ({ prenom: 'X', annee: an })),
    });
    expect(trop.statusCode).toBe(400);
  });

  it('collage depuis un tableur : la liste lue est acceptée telle quelle', async () => {
    const { eleves } = lireListeEleves(`Prénom\tAnnée\nSokhna\t${an}\nBabacar\t${an - 1}`, YEAR);
    const r = await lot(T, classe.id, { eleves });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().eleves.map((e: { prenom: string }) => e.prenom)).toEqual(['Sokhna', 'Babacar']);
    crees.push(...r.json().eleves);
  }, 30_000);

  it('message WhatsApp : l’identifiant, jamais le mot de passe', async () => {
    for (const e of crees) {
      expect(e.whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
      const texte = decodeURIComponent(e.whatsapp);
      expect(texte).toContain(e.identifiant);
      expect(texte).not.toContain(e.motDePasse);
    }
    const g = await c.req('GET', `/api/v1/ecole/classes/${classe.id}/eleves/acces?langue=en`, T);
    expect(g.statusCode).toBe(200);
    expect(g.headers['cache-control']).toBe('no-store');
    const liste = g.json().eleves as Array<{ identifiant: string; whatsapp: string }>;
    expect(liste).toHaveLength(42);
    const brut = g.body;
    for (const e of crees) expect(brut).not.toContain(e.motDePasse);
    expect(decodeURIComponent(liste[0]!.whatsapp)).toContain('Username');
  });

  it('fiche PDF : une étiquette par élève avec identifiant et mot de passe', async () => {
    const ceux = crees.slice(0, 12);
    const r = await c.req('POST', `/api/v1/ecole/classes/${classe.id}/fiche.pdf`, T, {
      eleves: ceux.map((e) => ({ pupilId: e.pupilId, motDePasse: e.motDePasse })),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['cache-control']).toBe('no-store');
    const pdf = r.rawPayload;
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const txt = pdf.toString('latin1');
    expect(txt).toContain('/Count 2'); // 12 étiquettes : deux pages de 10
    for (const e of ceux) {
      expect(txt).toContain(`(${e.identifiant})`);
      expect(txt).toContain(`(${e.motDePasse})`);
    }
  });

  it('élève connecté : session limitée à son profil, aucun accès hors de son profil', async () => {
    const e = crees[0]!;
    const L = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: e.identifiant, password: e.motDePasse },
    );
    expect(L.statusCode, L.body).toBe(200);
    const E = { cookie: cookieOf(L) };
    const me = (await c.req('GET', '/api/v1/auth/me', E)).json();
    expect(me.enfantSession).toBe(true);
    expect(me.profiles.map((p: { id: string }) => p.id)).toEqual([e.profileId]);
    expect(me.account.email).toBeNull();
    // l’espace de son profil : permis ; tout le reste : refusé
    for (const u of [
      `/api/v1/profiles/${e.profileId}/accueil`,
      `/api/v1/today/${e.profileId}`,
      '/api/v1/levels',
    ]) {
      const r = await c.req('GET', u, E);
      expect([401, 403], u).not.toContain(r.statusCode);
    }
    for (const [m, u] of [
      ['GET', '/api/v1/profiles'],
      ['GET', `/api/v1/profiles/${crees[1]!.profileId}/accueil`],
      ['GET', `/api/v1/ecole/classes/${classe.id}`],
      ['GET', `/api/v1/ecole/classes/${classe.id}/eleves/acces`],
      ['POST', `/api/v1/ecole/classes/${classe.id}/fiche.pdf`],
      ['POST', `/api/v1/ecole/pupils/${e.pupilId}/mot-de-passe`],
      ['GET', '/api/v1/account/export'],
    ] as const) {
      const r = await c.req(m, u, E, m === 'POST' ? {} : undefined);
      expect(r.statusCode, `${m} ${u}`).toBe(403);
    }
    // mauvais mot de passe : refus sans rien révéler
    const faux = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: e.identifiant, password: 'faux-mot-de-passe' },
    );
    expect(faux.statusCode).toBe(401);
  });

  it('enseignant d’une AUTRE classe : refusé partout (404, rien n’est créé ni divulgué)', async () => {
    const e = crees[2]!;
    const avant = (await c.h.db.select().from(t.profileLogin)).length;
    const r1 = await lot(autre, classe.id, { eleves: [{ prenom: 'Intrus', annee: an }] });
    expect(r1.statusCode).toBe(404);
    const r2 = await c.req('GET', `/api/v1/ecole/classes/${classe.id}/eleves/acces`, autre);
    expect(r2.statusCode).toBe(404);
    const r3 = await c.req('POST', `/api/v1/ecole/classes/${classe.id}/fiche.pdf`, autre, {
      eleves: [{ pupilId: e.pupilId, motDePasse: e.motDePasse }],
    });
    expect(r3.statusCode).toBe(404);
    const r4 = await c.req('POST', `/api/v1/ecole/pupils/${e.pupilId}/mot-de-passe`, autre, {
      password: PW,
    });
    expect(r4.statusCode).toBe(404);
    // sa propre classe, avec un élève d’une autre classe dans la fiche : refusé
    const r5 = await c.req('POST', `/api/v1/ecole/classes/${classeAutre.id}/fiche.pdf`, autre, {
      eleves: [{ pupilId: e.pupilId, motDePasse: e.motDePasse }],
    });
    expect(r5.statusCode).toBe(404);
    expect((await c.h.db.select().from(t.profileLogin)).length).toBe(avant);
    // un parent ou un visiteur : refusé
    expect(
      (
        await c.req(
          'POST',
          `/api/v1/ecole/classes/${classe.id}/eleves/lot`,
          {},
          {
            eleves: [{ prenom: 'X', annee: an }],
            accordParents: true,
            password: PW,
          },
        )
      ).statusCode,
    ).toBe(401);
  });

  it('nouveau mot de passe : l’ancien ne marche plus, la session de l’élève est fermée', async () => {
    const e = crees[3]!;
    const L = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: e.identifiant, password: e.motDePasse },
    );
    const E = { cookie: cookieOf(L) };
    expect((await c.req('GET', '/api/v1/auth/me', E)).json().enfantSession).toBe(true);
    const sans = await c.req('POST', `/api/v1/ecole/pupils/${e.pupilId}/mot-de-passe`, T, {});
    expect(sans.statusCode).toBe(400);
    const r = await c.req('POST', `/api/v1/ecole/pupils/${e.pupilId}/mot-de-passe`, T, {
      password: PW,
    });
    expect(r.statusCode, r.body).toBe(200);
    const neuf = r.json().motDePasse as string;
    expect(neuf).toMatch(/^[a-z2-9]{8}$/);
    expect(neuf).not.toBe(e.motDePasse);
    expect((await c.req('GET', '/api/v1/auth/me?doux=1', E)).json().anonyme).toBe(true);
    const ancien = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: e.identifiant, password: e.motDePasse },
    );
    expect(ancien.statusCode).toBe(401);
    const bon = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: e.identifiant, password: neuf },
    );
    expect(bon.statusCode).toBe(200);
    // déblocage seul
    const d = await c.req('POST', `/api/v1/ecole/pupils/${e.pupilId}/mot-de-passe`, T, {
      password: PW,
      debloquer: true,
    });
    expect(d.statusCode).toBe(200);
    expect(d.json().motDePasse).toBeUndefined();
  }, 60_000);

  it('plafond : 10 créations par heure et par enseignant', async () => {
    const T2 = await teacher(c, 'presse@exemple.org');
    const cl = await newClass(c, T2, 'CP');
    let dernier = 201;
    for (let i = 0; i < 11 && dernier === 201; i++)
      dernier = (
        await lot(T2, cl.id, { eleves: [{ prenom: `Eleve${'abcdefghijkl'[i]}`, annee: an }] })
      ).statusCode;
    expect(dernier).toBe(429);
  }, 120_000);
});
