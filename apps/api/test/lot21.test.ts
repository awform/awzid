/**
 * Lot 21 (V1-f) — messagerie encadrée enseignant ↔ famille, annonces de classe, visio planifiée, protection des
 * mineurs (CDC §2.11, §2.12). Un test par fonction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { purgeRetention, schema as t } from '@awform/db';
import { hashSecret, totpAt } from '../src/auth/crypto.js';
import {
  child,
  cookieOf,
  join,
  newClass,
  parent,
  PW,
  setupEdition,
  teacher,
  YEAR,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]);

describe.skipIf(!URL_)('lot 21 — messagerie encadrée et visio', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let cls: { id: string; joinCode: string };
  let fam: Awaited<ReturnType<typeof parent>>;
  let autre: Awaited<ReturnType<typeof parent>>;
  let kid = '';
  beforeAll(async () => {
    c = await setupEdition(URL_!);
    T = await teacher(c, 'prof21@exemple.org');
    cls = await newClass(c, T, 'Classe 21');
    fam = await parent(c, 'famille21@exemple.org');
    autre = await parent(c, 'autre21@exemple.org');
    kid = await child(c, fam.P, 'Aminata');
    await join(c, fam.P, kid, cls);
    await child(c, autre.P, 'Hors-classe');
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('annonce de classe : chiffrée en base, lue par les familles de la classe seulement', async () => {
    const r = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/annonces`, T, {
      texte: 'Sortie à la bibliothèque jeudi.',
    });
    expect(r.statusCode, r.body).toBe(201);
    const [row] = await c.h.db
      .select()
      .from(t.message)
      .where(eq(t.message.id, r.json().message.id));
    expect(row!.body.toString('utf8')).not.toContain('bibliothèque');
    const f = (await c.req('GET', '/api/v1/famille/messages', fam.P)).json();
    expect(f.annonces.map((a: { texte: string }) => a.texte)).toContain(
      'Sortie à la bibliothèque jeudi.',
    );
    const o = (await c.req('GET', '/api/v1/famille/messages', autre.P)).json();
    expect(o.annonces).toEqual([]);
    // pas de réponse collective : une annonce n'a pas de fil
    expect(row!.threadId).toBeNull();
  });

  it('fil privé enseignant ↔ famille : écrit, lu (non lus), réponse de la famille', async () => {
    const r = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/eleves/${kid}/messages`, T, {
      texte: 'Aminata a bien progressé cette semaine.',
    });
    expect(r.statusCode, r.body).toBe(201);
    const fil = r.json().fil as string;
    let list = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/messages`, T)).json();
    expect(list.fils[0]).toMatchObject({ id: fil, pseudonym: 'Aminata', nonLus: 0 });
    const lu = (await c.req('GET', `/api/v1/fils/${fil}`, fam.P)).json();
    expect(lu.messages[0]).toMatchObject({
      texte: 'Aminata a bien progressé cette semaine.',
      lu: false,
    });
    const rep = await c.req('POST', `/api/v1/fils/${fil}/messages`, fam.P, {
      texte: 'Merci beaucoup.',
    });
    expect(rep.statusCode).toBe(201);
    list = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/messages`, T)).json();
    expect(list.fils[0].nonLus).toBe(1);
    // une autre famille ne voit pas le fil
    expect((await c.req('GET', `/api/v1/fils/${fil}`, autre.P)).statusCode).toBe(404);
    // la famille peut aussi ouvrir le fil elle-même
    const own = await c.req('POST', `/api/v1/profiles/${kid}/classes/${cls.id}/messages`, fam.P, {
      texte: 'Une question sur le devoir.',
    });
    expect(own.json().fil).toBe(fil);
  });

  it('pièces jointes : enseignant seulement, type réel PNG/JPEG/PDF, 2 Mo ; aucun lien raccourci', async () => {
    const url = `/api/v1/ecole/classes/${cls.id}/eleves/${kid}/messages`;
    const ok = await c.req('POST', url, T, {
      texte: 'La fiche',
      piece: { nom: 'fiche.png', base64: PNG.toString('base64') },
    });
    expect(ok.statusCode, ok.body).toBe(201);
    const faux = await c.req('POST', url, T, {
      texte: 'Pas une image',
      piece: { nom: 'virus.png', base64: Buffer.from('MZ exécutable').toString('base64') },
    });
    expect(faux.json().error.code).toBe('piece_type_refuse');
    const fil = ok.json().fil;
    const fromFamily = await c.req('POST', `/api/v1/fils/${fil}/messages`, fam.P, {
      texte: 'photo',
      piece: { nom: 'a.png', base64: PNG.toString('base64') },
    });
    expect(fromFamily.json().error.code).toBe('piece_jointe_enseignant_seulement');
    const court = await c.req('POST', url, T, { texte: 'Voir https://bit.ly/abc' });
    expect(court.json().error.code).toBe('lien_raccourci');
    const dl = await c.req('GET', `/api/v1/messages/${ok.json().message.id}/piece`, fam.P);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(Buffer.from(dl.rawPayload).equals(PNG)).toBe(true);
    expect(
      (await c.req('GET', `/api/v1/messages/${ok.json().message.id}/piece`, autre.P)).statusCode,
    ).toBe(404);
  });

  it('protection des mineurs : aucun élève ni titulaire mineur n’écrit ; aucun privé vers un compte mineur', async () => {
    const su = await c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'ado21@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
        birthYear: YEAR - 16,
      },
    );
    const ado = { cookie: cookieOf(su) };
    expect((await c.req('GET', '/api/v1/famille/messages', ado)).json().error.code).toBe(
      'parent_requis',
    );
    const me = (await c.req('GET', '/api/v1/auth/me', ado)).json();
    const adoProfile = me.profiles[0].id as string;
    await c.h.db.insert(t.classMember).values({ classId: cls.id, profileId: adoProfile });
    const r = await c.req(
      'POST',
      `/api/v1/ecole/classes/${cls.id}/eleves/${adoProfile}/messages`,
      T,
      {
        texte: 'Bonjour',
      },
    );
    expect(r.json().error.code).toBe('famille_mineure');
    await c.h.db.delete(t.classMember).where(eq(t.classMember.profileId, adoProfile));
  });

  it('signalement → file de modération (consultation journalisée), retrait, numéro d’aide du pays', async () => {
    const m = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/annonces`, T, {
      texte: 'Message à signaler',
    });
    const id = m.json().message.id as string;
    const s = await c.req('POST', `/api/v1/messages/${id}/signaler`, fam.P, {
      motif: 'inapproprié',
    });
    expect(s.json()).toMatchObject({ ok: true, aide: expect.stringContaining('119') });
    // administrateur avec second facteur
    await c.h.db.insert(t.account).values({
      kind: 'admin',
      email: 'admin21@exemple.org',
      passwordHash: await hashSecret(PW),
      country: 'FR',
    });
    const A = {
      cookie: cookieOf(
        await c.req(
          'POST',
          '/api/v1/auth/login',
          {},
          { email: 'admin21@exemple.org', password: PW },
        ),
      ),
    };
    const sec = (await c.req('POST', '/api/v1/auth/totp/setup', A, {})).json();
    await c.req('POST', '/api/v1/auth/totp/confirm', A, {
      code: totpAt(sec.secret, Math.floor(Date.now() / 30_000)),
    });
    const q = (await c.req('GET', '/api/v1/admin/moderation', A)).json();
    const rep = q.signalements.find((x: { message: { id: string } }) => x.message.id === id);
    expect(rep.message.texte).toBe('Message à signaler');
    const log = await c.h.db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.action, 'moderation.consultation'));
    expect(log.map((l) => l.target)).toContain(id);
    expect(
      (await c.req('POST', `/api/v1/admin/moderation/${rep.id}`, A, { decision: 'retire' }))
        .statusCode,
    ).toBe(200);
    const f = (await c.req('GET', '/api/v1/famille/messages', fam.P)).json();
    const vu = f.annonces.find((a: { id: string }) => a.id === id);
    expect(vu).toMatchObject({ retire: true, texte: null });
  });

  it('visio : lien https d’un service reconnu, lien donné 15 min avant, annulation, présence', async () => {
    const url = `/api/v1/ecole/classes/${cls.id}/visios`;
    const bad = await c.req('POST', url, T, {
      titre: 'Révision',
      debut: new Date(Date.now() + 86400_000).toISOString(),
      dureeMin: 45,
      url: 'http://meet.google.com/abc',
    });
    expect(bad.json().error.code).toBe('lien_visio_invalide');
    const plus = await c.req('POST', url, T, {
      titre: 'Demain',
      debut: new Date(Date.now() + 86400_000).toISOString(),
      dureeMin: 45,
      url: 'https://meet.google.com/abc-defg-hij',
    });
    expect(plus.statusCode, plus.body).toBe(201);
    expect(plus.json().visio.provider).toBe('google_meet');
    const now = await c.req('POST', url, T, {
      titre: 'Maintenant',
      debut: new Date(Date.now() - 5 * 60_000).toISOString(),
      dureeMin: 30,
      url: 'https://meet.jit.si/awzid-classe-21',
    });
    let v = (await c.req('GET', `/api/v1/profiles/${kid}/visios`, fam.P)).json().visios;
    expect(v.find((x: { titre: string }) => x.titre === 'Demain').url).toBeNull();
    expect(v.find((x: { titre: string }) => x.titre === 'Maintenant').url).toBe(
      'https://meet.jit.si/awzid-classe-21',
    );
    expect((await c.req('GET', `/api/v1/profiles/${kid}/visios`, autre.P)).statusCode).toBe(404);
    await c.req('POST', `/api/v1/ecole/visios/${plus.json().visio.id}/annuler`, T, {});
    v = (await c.req('GET', `/api/v1/profiles/${kid}/visios`, fam.P)).json().visios;
    expect(v.map((x: { titre: string }) => x.titre)).toEqual(['Maintenant']);
    const [pupil] = await c.h.db.select().from(t.classPupil).where(eq(t.classPupil.profileId, kid));
    const p = await c.req('PUT', `/api/v1/ecole/visios/${now.json().visio.id}/presence`, T, {
      presences: [{ pupilId: pupil!.id, present: true }],
    });
    expect(p.json()).toMatchObject({ ok: true, notees: 1 });
  });

  it('conservation : messages effacés 12 mois après la fin de l’année scolaire', async () => {
    const [m] = await c.h.db
      .insert(t.message)
      .values({
        classId: cls.id,
        kind: 'annonce',
        keyVersion: 1,
        iv: Buffer.alloc(12),
        body: Buffer.alloc(4),
        createdAt: new Date('2020-01-10T00:00:00Z'),
      })
      .returning({ id: t.message.id });
    const n = await purgeRetention(c.h.db, new Date());
    expect(n.messages).toBeGreaterThanOrEqual(1);
    expect(await c.h.db.select().from(t.message).where(eq(t.message.id, m!.id))).toEqual([]);
  });

  it('départ de la classe : la famille ne lit plus le fil', async () => {
    const [th] = await c.h.db
      .select()
      .from(t.messageThread)
      .where(eq(t.messageThread.profileId, kid));
    await c.h.db.delete(t.classMember).where(eq(t.classMember.profileId, kid));
    expect((await c.req('GET', `/api/v1/fils/${th!.id}`, fam.P)).statusCode).toBe(404);
  });
});
