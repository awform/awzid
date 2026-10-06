/**
 * Lot F5 « penser large » (API, base de test, aucun contenu religieux) :
 *  - interrupteurs : décision par rôle et par âge, refus serveur « fonction_coupee », effet immédiat après un
 *    réglage de l'administrateur (cache invalidé), valeur par défaut sûre sans réglage ;
 *  - canal bêta : une fonction « beta » n'est ouverte qu'aux comptes ou écoles marqués ;
 *  - avis : envoi (catégorie, texte, capture), jamais de texte libre d'un enfant, limite anti-abus, file de
 *    l'administrateur (statut, capture) ;
 *  - usage : agrégats par jour seulement, chiffres masqués sous le seuil d'anonymat (10), clés inconnues ignorées.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { purgeF5, schema as t } from '@awform/db';
import { fonctionActive, fonctionsParDefaut, SEUIL_ANONYMAT } from '@awform/school';
import { setupTutor } from '@awform/tutor';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { child, cookieOf, parent, PW, setup, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

describe('registre des fonctions (décision pure)', () => {
  const ctx = {
    roles: ['eleve'],
    age: 'enfant' as const,
    pays: 'SN',
    ecoles: ['e1'],
    canal: 'production' as const,
  };
  it('valeur par défaut sûre : publiées ouvertes, en essai réservées au canal bêta', () => {
    const d = fonctionsParDefaut();
    expect(d.tuteur && d.animations && d.mode_serein && d.avis).toBe(true);
    expect(fonctionActive('tuteur', ctx, 'beta')).toBe(false);
    expect(fonctionActive('tuteur', { ...ctx, canal: 'beta' }, 'beta')).toBe(true);
    expect(fonctionActive('tuteur', ctx, 'off')).toBe(false);
  });
  it('la règle la plus précise l’emporte ; à égalité, « off »', () => {
    const r = [
      { effet: 'off' as const, role: 'eleve' },
      { effet: 'on' as const, role: 'eleve', pays: 'SN' },
    ];
    expect(fonctionActive('tuteur', ctx, 'on', r)).toBe(true);
    expect(fonctionActive('tuteur', { ...ctx, pays: 'FR' }, 'on', r)).toBe(false);
    expect(
      fonctionActive('tuteur', ctx, 'on', [
        { effet: 'on', age: 'enfant' },
        { effet: 'off', ecoleId: 'e1' },
      ]),
    ).toBe(false);
    expect(fonctionActive('tuteur', ctx, 'off', [{ effet: 'on', ecoleId: 'e2' }])).toBe(false);
  });
});

describe.skipIf(!URL)('F5 — interrupteurs, bêta, avis, usage (awform_test)', () => {
  let c: Ctx;
  let A: H; // administrateur (second facteur)
  let P: H; // parent
  let kid: string; // enfant du parent
  let adultH: H;
  let adultProfile: string;

  const signupAdult = async (email: string, country = 'FR') => {
    const r = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email,
        password: PW,
        country,
        consents: country === 'FR' ? ['cgu'] : ['cgu', 'transfert_hors_pays'],
        birthYear: YEAR - 30,
        pseudonym: 'Moi',
      },
    );
    if (r.statusCode !== 201) throw new Error(r.body);
    const me = r.json();
    return { H: { cookie: cookieOf(r) }, profile: me.profiles[0].id as string };
  };
  const fonctions = async (h: H, profil?: string) =>
    (await c.req('GET', `/api/v1/fonctions${profil ? `?profil=${profil}` : ''}`, h)).json();

  beforeAll(async () => {
    c = await setup(URL!, [], { tutor: setupTutor({ AWFORM_TUTEUR: 'simule' }) });
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin.f5@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const login = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'admin.f5@exemple.org', password: PW },
    );
    A = { cookie: cookieOf(login) };
    const s = (await c.req('POST', '/api/v1/auth/totp/setup', A, {})).json();
    await c.req('POST', '/api/v1/auth/totp/confirm', A, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
    ({ P } = await parent(c, 'parent.f5@exemple.org'));
    kid = await child(c, P, 'Petit', 9);
    const a = await signupAdult('adulte.f5@exemple.org');
    adultH = a.H;
    adultProfile = a.profile;
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('sans réglage : tout est ouvert (valeur sûre), visiteur compris', async () => {
    const v = await fonctions({});
    expect(v.canal).toBe('production');
    expect(v.fonctions.tuteur).toBe(true);
    const k = await fonctions(P, kid);
    expect(k.fonctions).toMatchObject({ tuteur: true, vivre_islam: true, animations: true });
  });

  it('réservé à l’administrateur avec second facteur', async () => {
    expect((await c.req('GET', '/api/v1/admin/fonctions', P)).json().error.code).toBe(
      'reserve_admin',
    );
    const r = await c.req('GET', '/api/v1/admin/fonctions', A);
    expect(r.statusCode).toBe(200);
    expect(r.json().fonctions.map((f: { cle: string }) => f.cle)).toContain('mushaf_exact');
  });

  it('un interrupteur coupe une fonction pour un rôle et un âge, refusée aussi par le serveur', async () => {
    const add = await c.req('POST', '/api/v1/admin/fonctions/tuteur/regles', A, {
      effet: 'off',
      role: 'eleve',
      age: 'enfant',
    });
    expect(add.statusCode).toBe(201);
    // effet immédiat (cache invalidé) : l'enfant ne l'a plus, l'adulte et le parent seul l'ont encore
    expect((await fonctions(P, kid)).fonctions.tuteur).toBe(false);
    expect((await fonctions(P)).fonctions.tuteur).toBe(true);
    expect((await fonctions(adultH, adultProfile)).fonctions.tuteur).toBe(true);
    const ask = await c.req('POST', `/api/v1/tutor/${kid}/ask`, P, {
      unitId: 'en1.l01',
      action: 'explique',
    });
    expect(ask.statusCode).toBe(403);
    expect(ask.json().error).toMatchObject({ code: 'fonction_coupee', fonction: 'tuteur' });
    const askAdult = await c.req('POST', `/api/v1/tutor/${adultProfile}/ask`, adultH, {
      unitId: 'en1.l01',
      action: 'explique',
    });
    expect(askAdult.json().error?.code).not.toBe('fonction_coupee');
    // un profil d'un AUTRE compte n'est jamais pris en compte
    expect((await fonctions(adultH, kid)).fonctions.tuteur).toBe(true);
    // retrait de la règle : de nouveau ouvert
    const regle = (await c.req('GET', '/api/v1/admin/fonctions', A))
      .json()
      .fonctions.find((f: { cle: string }) => f.cle === 'tuteur').regles[0];
    expect(
      (await c.req('DELETE', `/api/v1/admin/fonctions/regles/${regle.id}`, A)).statusCode,
    ).toBe(200);
    expect((await fonctions(P, kid)).fonctions.tuteur).toBe(true);
    expect(
      (await c.req('POST', '/api/v1/admin/fonctions/tuteur/regles', A, { effet: 'off' })).json()
        .error.code,
    ).toBe('regle_sans_critere');
  });

  it('état de base « off » par pays ; « Mode serein » coupé n’est plus proposé', async () => {
    await c.req('PUT', '/api/v1/admin/fonctions/mode_serein', A, { etat: 'off' });
    const r = await c.req('PUT', `/api/v1/profiles/${adultProfile}/mode-evaluation`, adultH, {
      mode: 'serein',
    });
    expect(r.json().error.code).toBe('fonction_coupee');
    expect(
      (
        await c.req('PUT', `/api/v1/profiles/${adultProfile}/mode-evaluation`, adultH, {
          mode: 'verification',
        })
      ).statusCode,
    ).toBe(200);
    // exception : ouvert au Sénégal seulement
    await c.req('POST', '/api/v1/admin/fonctions/mode_serein/regles', A, {
      effet: 'on',
      pays: 'sn',
    });
    const sn = await signupAdult('adulte.sn.f5@exemple.org', 'SN');
    expect((await fonctions(sn.H, sn.profile)).fonctions.mode_serein).toBe(true);
    expect((await fonctions(adultH, adultProfile)).fonctions.mode_serein).toBe(false);
    await c.req('PUT', '/api/v1/admin/fonctions/mode_serein', A, { etat: 'on' });
  });

  it('canal bêta : fonction en essai réservée aux comptes et écoles marqués', async () => {
    await c.req('PUT', '/api/v1/admin/fonctions/mushaf_exact', A, { etat: 'beta' });
    expect((await fonctions(adultH, adultProfile)).fonctions.mushaf_exact).toBe(false);
    expect(
      (
        await c.req('PUT', '/api/v1/admin/beta', A, {
          type: 'compte',
          email: 'ADULTE.f5@exemple.org',
          beta: true,
        })
      ).statusCode,
    ).toBe(200);
    const b = await fonctions(adultH, adultProfile);
    expect(b.canal).toBe('beta');
    expect(b.fonctions.mushaf_exact).toBe(true);
    // école marquée bêta : ses élèves sont dans le canal bêta
    const [school] = await c.h.db
      .insert(t.school)
      .values({ name: 'École bêta' })
      .returning({ id: t.school.id });
    const [cls] = await c.h.db
      .insert(t.classGroup)
      .values({ schoolId: school!.id, name: 'CE1', joinCode: 'F5BETA01' })
      .returning({ id: t.classGroup.id });
    await c.h.db.insert(t.classMember).values({ classId: cls!.id, profileId: kid });
    expect((await fonctions(P, kid)).fonctions.mushaf_exact).toBe(false);
    await c.req('PUT', '/api/v1/admin/beta', A, { type: 'ecole', id: school!.id, beta: true });
    expect((await fonctions(P, kid)).canal).toBe('beta');
    const adm = (await c.req('GET', '/api/v1/admin/fonctions', A)).json();
    expect(adm.beta).toMatchObject({ comptes: 1, ecoles: [{ nom: 'École bêta' }] });
    expect(adm.ecoles.find((e: { id: string }) => e.id === school!.id).beta).toBe(true);
    // retrait
    await c.req('PUT', '/api/v1/admin/beta', A, { type: 'ecole', id: school!.id, beta: false });
    expect((await fonctions(P, kid)).canal).toBe('production');
    expect(
      (await c.req('PUT', '/api/v1/admin/beta', A, { type: 'compte', email: 'x@y.z', beta: true }))
        .statusCode,
    ).toBe(404);
    await c.req('PUT', '/api/v1/admin/fonctions/mushaf_exact', A, { etat: 'on' });
  });

  it('avis : envoi, enfant sans texte libre, capture contrôlée, limite, file de l’administrateur', async () => {
    const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')}`;
    const r = await c.req('POST', '/api/v1/avis', adultH, {
      categorie: 'idee',
      texte: '  Un mode nuit plus sombre  ',
      page: '/lecons/en1.l01?x=1#y',
      profil: adultProfile,
      capture: png,
    });
    expect(r.statusCode).toBe(201);
    const k = await c.req('POST', '/api/v1/avis', P, {
      categorie: 'difficile',
      texte: 'Je m’appelle Awa',
      profil: kid,
    });
    expect(k.statusCode).toBe(201);
    expect(
      (
        await c.req('POST', '/api/v1/avis', adultH, {
          categorie: 'probleme',
          capture: 'data:image/png;base64,AAAA',
        })
      ).json().error.code,
    ).toBe('capture_invalide');
    expect((await c.req('POST', '/api/v1/avis', {}, { categorie: 'aime' })).statusCode).toBe(401);
    const q = (await c.req('GET', '/api/v1/admin/avis', A)).json().avis;
    const ad = q.find((x: { categorie: string }) => x.categorie === 'idee');
    expect(ad).toMatchObject({
      role: 'eleve',
      age: 'adulte',
      texte: 'Un mode nuit plus sombre',
      page: '/lecons/en1.l01',
      capture: true,
      statut: 'nouveau',
    });
    const kd = q.find((x: { categorie: string }) => x.categorie === 'difficile');
    expect(kd).toMatchObject({ age: 'enfant', texte: null });
    expect(JSON.stringify(q)).not.toContain('Awa');
    const img = await c.req('GET', `/api/v1/admin/avis/${ad.id}/capture`, A);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload[0]).toBe(0x89);
    expect(
      (await c.req('PUT', `/api/v1/admin/avis/${ad.id}`, A, { statut: 'traite' })).statusCode,
    ).toBe(200);
    expect((await c.req('GET', '/api/v1/admin/avis?statut=traite', A)).json().avis).toHaveLength(1);
    expect((await c.req('GET', '/api/v1/admin/avis', P)).statusCode).toBe(403);
    // limite : 5 avis par compte et par jour
    for (let i = 0; i < 4; i++)
      expect((await c.req('POST', '/api/v1/avis', adultH, { categorie: 'aime' })).statusCode).toBe(
        201,
      );
    expect((await c.req('POST', '/api/v1/avis', adultH, { categorie: 'aime' })).statusCode).toBe(
      429,
    );
    // interrupteur « avis » coupé : refus
    await c.req('PUT', '/api/v1/admin/fonctions/avis', A, { etat: 'off' });
    expect((await c.req('POST', '/api/v1/avis', P, { categorie: 'aime' })).json().error.code).toBe(
      'fonction_coupee',
    );
    await c.req('PUT', '/api/v1/admin/fonctions/avis', A, { etat: 'on' });
    // conservation : capture effacée après 90 jours
    await c.h.db
      .update(t.feedback)
      .set({ createdAt: new Date(Date.now() - 100 * 86_400_000) })
      .where(eq(t.feedback.id, ad.id));
    expect((await purgeF5(c.h.db)).captures).toBe(1);
    expect((await c.req('GET', `/api/v1/admin/avis/${ad.id}/capture`, A)).statusCode).toBe(404);
  });

  it('usage sans traceur : agrégats par jour, seuil d’anonymat, clés inconnues ignorées', async () => {
    expect(SEUIL_ANONYMAT).toBe(10);
    // 12 profils d'une même famille ouvrent « coran » ; 3 seulement ouvrent « hifz »
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await child(c, P, `Enfant${i}`, 8));
    for (const [i, id] of ids.entries()) {
      const cles = i < 3 ? ['coran', 'hifz', 'inconnue'] : ['coran'];
      expect((await c.req('POST', '/api/v1/usage', P, { profil: id, cles })).statusCode).toBe(204);
    }
    // une même personne n'est comptée qu'une fois par jour
    await c.req('POST', '/api/v1/usage', P, { profil: ids[0], cles: ['coran'] });
    // visiteur : rien n'est compté
    await c.req('POST', '/api/v1/usage', {}, { cles: ['coran'] });
    const u = (await c.req('GET', '/api/v1/admin/usage?jours=7', A)).json();
    const by = (k: string) => u.usage.find((x: { cle: string }) => x.cle === k);
    expect(by('coran')).toMatchObject({ personnesJours: 12, ouvertures: 13, sousSeuil: false });
    expect(by('hifz')).toMatchObject({ personnesJours: null, ouvertures: null, sousSeuil: true });
    expect(u.usage.some((x: { cle: string }) => x.cle === 'inconnue')).toBe(false);
    expect(u.jamaisUtilisees).toContain('certificats');
    expect(u.jamaisUtilisees).not.toContain('hifz');
    // aucune empreinte lisible ni identifiant dans la réponse
    expect(JSON.stringify(u)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    const rows = await c.h.db.select().from(t.usageDay);
    expect(Object.keys(rows[0]!).sort()).toEqual(['day', 'events', 'key', 'persons', 'role']);
    // empreintes du jour effacées après 2 jours
    const later = new Date(Date.now() + 3 * 86_400_000);
    expect((await purgeF5(c.h.db, later)).empreintes).toBeGreaterThan(0);
    expect(await c.h.db.select().from(t.usageSalt)).toHaveLength(0);
  });

  it('leçons où l’on abandonne : seulement au-delà du seuil d’anonymat', async () => {
    const u = (await c.req('GET', '/api/v1/admin/usage', A)).json();
    expect(Array.isArray(u.lecons)).toBe(true);
    // aucune leçon commencée par 10 profils dans cette base : rien n'est montré
    expect(u.lecons).toEqual([]);
  });
});
