/**
 * Bêta-support — « Signaler un problème » (API, base de test) :
 *  - envoi (catégorie, description, capture, page d'origine nettoyée, version jointe par le serveur) ;
 *  - un enfant n'envoie que la catégorie (jamais de texte ni d'image) ;
 *  - validations (catégorie inconnue, capture falsifiée, visiteur refusé) ;
 *  - limite anti-abus (5 par compte et par jour), interrupteur « signaler » ;
 *  - file de l'administrateur ou du support (second facteur), statut nouveau → en cours → réglé ;
 *  - conservation : capture effacée après 90 jours, signalement réglé supprimé après 12 mois.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { purgeProblemes, schema as t } from '@awform/db';
import { setupTutor } from '@awform/tutor';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import { child, cookieOf, parent, PW, setup, YEAR, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;

describe.skipIf(!URL)('Signaler un problème (awform_test)', () => {
  let c: Ctx;
  let A: H; // administrateur (second facteur)
  let P: H; // parent
  let kid: string; // enfant du parent
  let adultH: H;
  let adultProfile: string;
  const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')}`;

  beforeAll(async () => {
    c = await setup(URL!, [], { tutor: setupTutor({ AWFORM_TUTEUR: 'simule' }) });
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin.sup@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const login = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'admin.sup@exemple.org', password: PW },
    );
    A = { cookie: cookieOf(login) };
    const s = (await c.req('POST', '/api/v1/auth/totp/setup', A, {})).json();
    await c.req('POST', '/api/v1/auth/totp/confirm', A, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
    ({ P } = await parent(c, 'parent.sup@exemple.org'));
    kid = await child(c, P, 'Petit', 9);
    const r = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'adulte.sup@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
        birthYear: YEAR - 30,
        pseudonym: 'Moi',
      },
    );
    if (r.statusCode !== 201) throw new Error(r.body);
    adultH = { cookie: cookieOf(r) };
    adultProfile = r.json().profiles[0].id as string;
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('envoi : catégorie, description nettoyée, page sans paramètres, version jointe, capture contrôlée', async () => {
    const r = await c.req('POST', '/api/v1/problemes', adultH, {
      categorie: 'bug',
      texte: '  Le bouton ne répond pas  ',
      page: '/lecons/en1.l01?x=1#y',
      profil: adultProfile,
      capture: png,
    });
    expect(r.statusCode).toBe(201);
    const q = (await c.req('GET', '/api/v1/admin/problemes', A)).json().problemes;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      categorie: 'bug',
      role: 'eleve',
      age: 'adulte',
      texte: 'Le bouton ne répond pas',
      page: '/lecons/en1.l01',
      capture: true,
      statut: 'nouveau',
    });
    expect(typeof q[0].version).toBe('string');
    // aucune donnée personnelle superflue : ni e-mail, ni identifiant de compte dans la file
    expect(JSON.stringify(q)).not.toMatch(/adulte\.sup|account|email/i);
  });

  it('un enfant n’envoie que la catégorie : ni texte libre, ni image', async () => {
    const k = await c.req('POST', '/api/v1/problemes', P, {
      categorie: 'contenu',
      texte: 'Je m’appelle Awa',
      capture: png,
      profil: kid,
    });
    expect(k.statusCode).toBe(201);
    const q = (await c.req('GET', '/api/v1/admin/problemes?statut=nouveau', A)).json().problemes;
    const kd = q.find((x: { categorie: string }) => x.categorie === 'contenu');
    expect(kd).toMatchObject({ age: 'enfant', texte: null, capture: false });
    expect(JSON.stringify(q)).not.toContain('Awa');
  });

  it('validations : catégorie inconnue, capture falsifiée, visiteur refusé, point religieux accepté', async () => {
    expect(
      (await c.req('POST', '/api/v1/problemes', adultH, { categorie: 'idee' })).statusCode,
    ).toBe(400);
    expect(
      (
        await c.req('POST', '/api/v1/problemes', adultH, {
          categorie: 'bug',
          capture: 'data:image/png;base64,AAAA',
        })
      ).json().error.code,
    ).toBe('capture_invalide');
    expect((await c.req('POST', '/api/v1/problemes', {}, { categorie: 'bug' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await c.req('POST', '/api/v1/problemes', adultH, {
          categorie: 'religieux',
          texte: 'Vérifier la règle',
        })
      ).statusCode,
    ).toBe(201);
  });

  it('file réservée à l’administrateur ou au support avec second facteur ; statut nouveau → en cours → réglé', async () => {
    expect((await c.req('GET', '/api/v1/admin/problemes', P)).statusCode).toBe(403);
    expect((await c.req('GET', '/api/v1/admin/problemes', {})).statusCode).toBe(401);
    const q = (await c.req('GET', '/api/v1/admin/problemes', A)).json().problemes;
    const bug = q.find((x: { categorie: string }) => x.categorie === 'bug');
    const img = await c.req('GET', `/api/v1/admin/problemes/${bug.id}/capture`, A);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload[0]).toBe(0x89);
    expect((await c.req('GET', `/api/v1/admin/problemes/${bug.id}/capture`, P)).statusCode).toBe(
      403,
    );
    for (const statut of ['en_cours', 'regle']) {
      expect(
        (await c.req('PUT', `/api/v1/admin/problemes/${bug.id}`, A, { statut })).statusCode,
      ).toBe(200);
      const l = (await c.req('GET', `/api/v1/admin/problemes?statut=${statut}`, A)).json()
        .problemes;
      expect(l.map((x: { id: string }) => x.id)).toContain(bug.id);
    }
    expect(
      (await c.req('PUT', `/api/v1/admin/problemes/${bug.id}`, A, { statut: 'rejete' })).statusCode,
    ).toBe(400);
  });

  it('limite anti-abus : 5 par compte et par jour ; interrupteur « signaler » coupé : refus', async () => {
    // l'adulte en a déjà envoyé 2
    for (let i = 0; i < 3; i++)
      expect(
        (await c.req('POST', '/api/v1/problemes', adultH, { categorie: 'autre' })).statusCode,
      ).toBe(201);
    const r = await c.req('POST', '/api/v1/problemes', adultH, { categorie: 'autre' });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe('trop_de_signalements');
    await c.req('PUT', '/api/v1/admin/fonctions/signaler', A, { etat: 'off' });
    expect(
      (await c.req('POST', '/api/v1/problemes', P, { categorie: 'bug' })).json().error.code,
    ).toBe('fonction_coupee');
    await c.req('PUT', '/api/v1/admin/fonctions/signaler', A, { etat: 'on' });
  });

  it('conservation : capture effacée après 90 jours, signalement réglé supprimé après 12 mois', async () => {
    const q = (await c.req('GET', '/api/v1/admin/problemes?statut=regle', A)).json().problemes;
    const id = q[0].id as string;
    await c.h.db
      .update(t.problemReport)
      .set({ createdAt: new Date(Date.now() - 100 * 86_400_000) })
      .where(eq(t.problemReport.id, id));
    expect((await purgeProblemes(c.h.db)).captures).toBe(1);
    expect((await c.req('GET', `/api/v1/admin/problemes/${id}/capture`, A)).statusCode).toBe(404);
    await c.h.db
      .update(t.problemReport)
      .set({ createdAt: new Date(Date.now() - 400 * 86_400_000) })
      .where(eq(t.problemReport.id, id));
    expect((await purgeProblemes(c.h.db)).regles).toBe(1);
  });
});
