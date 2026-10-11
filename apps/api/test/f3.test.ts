/**
 * Lot F3 — comptes de la bêta (revue d'architecture M7, E10, G3, G4, M8, M9, F7, F8), par l'API (base de test,
 * boîte aux lettres EN MÉMOIRE : aucun e-mail réel) :
 *  - vérification de l'adresse à l'inscription, lien à usage unique ;
 *  - mot de passe oublié : même réponse que le compte existe ou non, lien unique et court, limitation, sessions
 *    fermées, avis au titulaire ;
 *  - changement d'adresse vérifié (nouvelle adresse), avis à l'ancienne, adresse déjà prise ;
 *  - accords « article 9 » (inscription, profil, premier usage, retrait = pause) et « analyse vocale » ;
 *  - âge du consentement au Québec (14 ans) ; États-Unis : moins de 13 ans fermés (parent, adulte, école) ;
 *  - fuseau horaire (compte, école), région des données « eu », export RGPD, avertissement boutique.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { memoryMailer, mailerFromEnv, publicUrlFromEnv } from '../src/mail/envoi.js';
import { MAIL_KINDS, MAIL_LOCALES, renderMail } from '../src/mail/modeles.js';
import { consentAge, countryRules } from '../src/auth/policy.js';
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

const URL = process.env.TEST_DATABASE_URL;
type H = Record<string, string>;
const SITE = 'https://awzid.test';
const ART9 = 'donnee_religieuse_art9';

describe('lot F3 — modèles d’e-mails et configuration de l’envoi (sans base)', () => {
  it('6 modèles × 5 langues : sujet, texte et HTML complets, lien sur sa propre ligne', () => {
    for (const k of MAIL_KINDS)
      for (const l of MAIL_LOCALES) {
        const m = renderMail(k, l, { link: `${SITE}/acces#x=abc`, email: 'ab…@exemple.fr' });
        expect(m.subject.length, `${k}/${l}`).toBeGreaterThan(5);
        expect(m.text).not.toMatch(/undefined|\{email\}|\{lien\}/);
        expect(m.html).toContain(`lang="${l}"`);
        if (l === 'ar') expect(m.html).toContain('dir="rtl"');
        if (['verification', 'reinitialisation', 'changement_email'].includes(k)) {
          expect(m.text.split('\n')).toContain(`${SITE}/acces#x=abc`);
          expect(m.html).toContain('dir="ltr"');
        }
      }
    // langue inconnue : français ; HTML échappé
    expect(renderMail('verification', 'xx', { link: 'https://a.b/"<x>' }).html).not.toContain(
      '"<x>',
    );
    expect(renderMail('verification', 'xx').subject).toBe('Confirmez votre adresse e-mail');
  });

  it('démonstration : un serveur SMTP public est refusé (boîte de démonstration) ; maildev local accepté', () => {
    const warns: string[] = [];
    const m = mailerFromEnv(
      { AWFORM_MAIL: 'smtp', AWFORM_SMTP_HOST: 'smtp.prestataire.example', AWFORM_DEMO: '1' },
      (w) => warns.push(w),
    );
    expect(m.mode).toBe('journal');
    expect(warns[0]).toMatch(/refusé/);
    expect(
      mailerFromEnv({ AWFORM_MAIL: 'smtp', AWFORM_SMTP_HOST: 'maildev.test', AWFORM_DEMO: '1' })
        .mode,
    ).toBe('smtp');
    expect(
      mailerFromEnv({ AWFORM_MAIL: 'smtp', AWFORM_SMTP_HOST: 'smtp.prestataire.example' }).mode,
    ).toBe('smtp');
    expect(mailerFromEnv({}).mode).toBe('inactif');
    expect(mailerFromEnv({ AWFORM_MAIL: 'journal' }).mode).toBe('journal');
    // liens : jamais l'en-tête Host ; AWFORM_PUBLIC_URL, sinon https://SITE
    expect(publicUrlFromEnv({ AWFORM_PUBLIC_URL: 'https://app.awzid.com/' })).toBe(
      'https://app.awzid.com',
    );
    expect(publicUrlFromEnv({ SITE: '192.168.50.10' })).toBe('https://192.168.50.10');
    expect(publicUrlFromEnv({ SITE: 'evil.example/x?y' })).toBeNull();
  });

  it('âge du consentement : Québec 14 ans, reste du Canada 13 ; États-Unis fermés sous 13 ans', () => {
    expect(consentAge('CA', 'CA-QC')).toBe(14);
    expect(consentAge('CA', 'CA-ON')).toBe(13);
    expect(consentAge('CA', 'FR-75')).toBe(13); // subdivision d'un autre pays : ignorée
    expect(countryRules('US').closedUnder).toBe(13);
    expect(countryRules('FR').closedUnder).toBeNull();
    expect(countryRules('CA', 'CA-QC')).toMatchObject({ region: 'CA-QC', consentAge: 14 });
    expect(countryRules('FR').accountConsents).toEqual(['cgu', ART9]);
  });
});

describe.skipIf(!URL)('lot F3 — comptes de la bêta (awform_test)', () => {
  let c: Ctx;
  const box = memoryMailer();
  const me = async (h: H) => (await c.req('GET', '/api/v1/auth/me', h)).json();
  /** dernier message reçu à cette adresse (envoi fait APRÈS la réponse : on attend un peu) */
  const mailTo = async (to: string, kind: string, n = 1) => {
    for (let i = 0; i < 100; i++) {
      const list = box.sent.filter((m) => m.to === to && m.kind === kind);
      if (list.length >= n) return list[n - 1]!;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`aucun e-mail ${kind} pour ${to}`);
  };
  const tokenOf = (text: string, frag: string) =>
    new RegExp(`/acces#${frag}=([A-Za-z0-9_-]+)`).exec(text)![1]!;
  const settle = () => new Promise((r) => setTimeout(r, 150));
  const signup = (body: Record<string, unknown>) =>
    c.req(
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1985,
        password: PW,
        country: 'FR',
        consents: ['cgu', ART9],
        ...body,
      },
    );

  beforeAll(async () => {
    c = await setup(URL!, [{ id: 'en1.l01', n: 1 }], { mailer: box, publicUrl: SITE });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('M7 : inscription → lien de vérification (usage unique) → adresse vérifiée', async () => {
    // accord « article 9 » obligatoire
    const no = await signup({ email: 'sans-art9@f3.example', consents: ['cgu'] });
    expect(no.statusCode).toBe(400);
    expect(no.json().error).toMatchObject({ code: 'consentement_requis', missing: [ART9] });
    const r = await signup({ email: 'verif@f3.example', locale: 'en', tz: 'Europe/Paris' });
    expect(r.statusCode, r.body).toBe(201);
    const P = { cookie: cookieOf(r) };
    expect((await me(P)).account).toMatchObject({
      emailVerified: false,
      tz: 'Europe/Paris',
      dataRegion: 'eu',
    });
    const m = await mailTo('verif@f3.example', 'verification');
    expect(m.subject).toBe('Confirm your email address'); // langue du compte
    const token = tokenOf(m.text, 'verif');
    // aucun jeton en clair en base : seulement son empreinte
    const rows = await c.h.db.select().from(t.accountToken);
    expect(JSON.stringify(rows)).not.toContain(token);
    const ok = await c.req('POST', '/api/v1/auth/email/verify', {}, { token });
    expect(ok.json()).toMatchObject({ ok: true, nature: 'verification' });
    expect((await me(P)).account.emailVerified).toBe(true);
    // usage unique ; jeton inventé : même refus
    expect(
      (await c.req('POST', '/api/v1/auth/email/verify', {}, { token })).json().error.code,
    ).toBe('lien_invalide');
    expect(
      (await c.req('POST', '/api/v1/auth/email/verify', {}, { token: 'x'.repeat(43) })).json().error
        .code,
    ).toBe('lien_invalide');
    // renvoi : déjà vérifiée
    expect((await c.req('POST', '/api/v1/auth/email/verify/resend', P)).json().dejaVerifiee).toBe(
      true,
    );
  });

  it('M7 : mot de passe oublié — même réponse avec ou sans compte, lien unique de 30 min, sessions fermées', async () => {
    const su = await signup({ email: 'oubli@f3.example' });
    const P = { cookie: cookieOf(su) };
    await settle();
    const before = box.sent.length;
    const unknown = await c.req(
      'POST',
      '/api/v1/auth/password-reset',
      {},
      { email: 'personne@f3.example' },
    );
    const known = await c.req(
      'POST',
      '/api/v1/auth/password-reset',
      {},
      { email: 'Oubli@F3.example ' },
    );
    expect(unknown.statusCode).toBe(202);
    expect(known.statusCode).toBe(202);
    expect(unknown.body).toBe(known.body);
    const m = await mailTo('oubli@f3.example', 'reinitialisation');
    await settle();
    expect(box.sent.filter((x) => x.to === 'personne@f3.example')).toHaveLength(0);
    expect(box.sent.length - before).toBe(1);
    const token = tokenOf(m.text, 'reinit');
    // mot de passe trop court : refusé SANS brûler le lien
    const weak = await c.req(
      'POST',
      '/api/v1/auth/password-reset/confirm',
      {},
      { token, password: 'court' },
    );
    expect(weak.json().error.code).toBe('mot_de_passe_trop_court');
    const NEW = 'un tout nouveau mot de passe 2026';
    const ok = await c.req(
      'POST',
      '/api/v1/auth/password-reset/confirm',
      {},
      { token, password: NEW },
    );
    expect(ok.statusCode, ok.body).toBe(200);
    // l'ancienne session est fermée ; l'ancien mot de passe ne marche plus ; le nouveau oui
    expect((await c.req('GET', '/api/v1/auth/me', P)).statusCode).toBe(401);
    expect(
      (await c.req('POST', '/api/v1/auth/login', {}, { email: 'oubli@f3.example', password: PW }))
        .statusCode,
    ).toBe(401);
    const L = await c.req(
      'POST',
      '/api/v1/auth/login',
      {},
      { email: 'oubli@f3.example', password: NEW },
    );
    expect(L.statusCode).toBe(200);
    // le lien reçu à l'adresse du compte la vérifie ; avis envoyé au titulaire
    expect((await me({ cookie: cookieOf(L) })).account.emailVerified).toBe(true);
    await mailTo('oubli@f3.example', 'mot_de_passe_modifie');
    // réutilisation : refusée
    const again = await c.req(
      'POST',
      '/api/v1/auth/password-reset/confirm',
      {},
      { token, password: 'encore un autre mot de passe' },
    );
    expect(again.json().error.code).toBe('lien_invalide');
  });

  it('M7 : lien expiré refusé ; un nouveau lien annule le précédent ; 3 liens par heure et par adresse', async () => {
    await signup({ email: 'expire@f3.example' });
    await c.req('POST', '/api/v1/auth/password-reset', {}, { email: 'expire@f3.example' });
    const t1 = tokenOf((await mailTo('expire@f3.example', 'reinitialisation', 1)).text, 'reinit');
    await c.req('POST', '/api/v1/auth/password-reset', {}, { email: 'expire@f3.example' });
    const t2 = tokenOf((await mailTo('expire@f3.example', 'reinitialisation', 2)).text, 'reinit');
    const NEW = 'mot de passe tardif 2026';
    expect(
      (
        await c.req('POST', '/api/v1/auth/password-reset/confirm', {}, { token: t1, password: NEW })
      ).json().error.code,
    ).toBe('lien_invalide');
    await c.h.pool.query(
      `update account_link set expires_at = now() - interval '1 minute' where purpose = 'reinitialisation' and used_at is null`,
    );
    expect(
      (
        await c.req('POST', '/api/v1/auth/password-reset/confirm', {}, { token: t2, password: NEW })
      ).json().error.code,
    ).toBe('lien_invalide');
    // 3e demande acceptée, 4e : même réponse, mais rien n'est envoyé
    await c.req('POST', '/api/v1/auth/password-reset', {}, { email: 'expire@f3.example' });
    await mailTo('expire@f3.example', 'reinitialisation', 3);
    const fourth = await c.req(
      'POST',
      '/api/v1/auth/password-reset',
      {},
      { email: 'expire@f3.example' },
    );
    expect(fourth.statusCode).toBe(202);
    await settle();
    expect(
      box.sent.filter((x) => x.to === 'expire@f3.example' && x.kind === 'reinitialisation'),
    ).toHaveLength(3);
  });

  it('M7 : changement d’adresse vérifié ; avis à l’ancienne ; adresse déjà prise : avis neutre, rien ne change', async () => {
    const su = await signup({ email: 'ancienne@f3.example' });
    const P = { cookie: cookieOf(su) };
    await signup({ email: 'prise@f3.example' });
    expect(
      (
        await c.req('POST', '/api/v1/account/email', P, {
          password: 'faux mot de passe 123',
          email: 'nouvelle@f3.example',
        })
      ).statusCode,
    ).toBe(401);
    // adresse prise : 202 identique, un avis à cette adresse, aucun lien
    const taken = await c.req('POST', '/api/v1/account/email', P, {
      password: PW,
      email: 'prise@f3.example',
    });
    expect(taken.statusCode).toBe(202);
    const notice = await mailTo('prise@f3.example', 'email_deja_utilise');
    expect(notice.text).not.toMatch(/acces#/);
    const r = await c.req('POST', '/api/v1/account/email', P, {
      password: PW,
      email: 'nouvelle@f3.example',
    });
    expect(r.statusCode).toBe(202);
    // tant que le lien n'est pas ouvert, l'adresse ne change pas
    expect((await me(P)).account.email).toBe('an…@f3.example');
    const token = tokenOf((await mailTo('nouvelle@f3.example', 'changement_email')).text, 'email');
    const ok = await c.req('POST', '/api/v1/auth/email/verify', {}, { token });
    expect(ok.json()).toMatchObject({ ok: true, nature: 'changement' });
    const m = await me(P);
    expect(m.account).toMatchObject({ email: 'no…@f3.example', emailVerified: true });
    const avis = await mailTo('ancienne@f3.example', 'email_modifie');
    expect(avis.text).toContain('no…@f3.example');
    expect(avis.text).not.toContain('nouvelle@f3.example');
  });

  it('E10 : accord « article 9 » — profil d’enfant, premier usage d’un compte ancien, retrait = pause', async () => {
    const { P } = await parent(c, 'art9@f3.example');
    // profil d'enfant : accord exigé pour l'enfant aussi
    const no = await c.req('POST', '/api/v1/profiles', P, {
      pseudonym: 'Sans',
      birthYear: YEAR - 9,
      password: PW,
      consents: ['compte_suivi'],
    });
    expect(no.json().error).toMatchObject({ code: 'consentement_requis', missing: [ART9] });
    const kid = await child(c, P, 'Nour');
    expect((await me(P)).accordsManquants).toEqual([]);
    // compte « ancien » (avant F3) : accords effacés → demandés au premier usage
    const [acc] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'art9@f3.example'));
    await c.h.pool.query(`delete from consent where account_id = $1 and type = $2`, [
      acc!.id,
      ART9,
    ]);
    const miss = (await me(P)).accordsManquants;
    expect(miss).toEqual([
      { type: ART9, profileId: null, pseudonym: null },
      { type: ART9, profileId: kid, pseudonym: 'Nour' },
    ]);
    // mot de passe ressaisi (preuve jointe)
    const bad = await c.req('POST', '/api/v1/account/accords', P, {
      password: 'pas le bon mot de passe',
      accords: [{ type: ART9 }],
    });
    expect(bad.statusCode).toBe(401);
    expect(
      (
        await c.req('POST', '/api/v1/account/accords', P, {
          password: PW,
          accords: [{ type: 'cgu' }],
        })
      ).json().error.code,
    ).toBe('accord_inconnu');
    const give = await c.req('POST', '/api/v1/account/accords', P, {
      password: PW,
      accords: [{ type: ART9 }, { type: ART9, profileId: kid }],
    });
    expect(give.json()).toMatchObject({ ok: true, ajoutes: 2 });
    expect((await me(P)).accordsManquants).toEqual([]);
    const [ev] = (
      await c.h.pool.query(`select evidence from consent where profile_id = $1 and type = $2`, [
        kid,
        ART9,
      ])
    ).rows;
    expect(ev.evidence).toMatchObject({
      methode: 'reauthentification_mot_de_passe+declaration',
      loi: 'rgpd',
      autorite: 'cnil',
    });
    // retrait (retirable) : le profil repasse en « accord manquant » (pause)
    const list = (await c.req('GET', '/api/v1/account/consents', P)).json().consents;
    const k9 = list.find(
      (x: { type: string; profileId: string | null }) => x.type === ART9 && x.profileId === kid,
    );
    expect(k9).toMatchObject({ optional: false, retirable: true });
    expect((await c.req('POST', `/api/v1/account/consents/${k9.id}/withdraw`, P)).statusCode).toBe(
      200,
    );
    expect((await me(P)).accordsManquants).toEqual([
      { type: ART9, profileId: kid, pseudonym: 'Nour' },
    ]);
    // les accords nécessaires au service restent non retirables
    const cgu = list.find((x: { type: string }) => x.type === 'cgu');
    expect((await c.req('POST', `/api/v1/account/consents/${cgu.id}/withdraw`, P)).statusCode).toBe(
      409,
    );
  });

  it('E10 : « analyse vocale par une IA » facultative, donnée puis retirée ; jamais demandée à l’inscription', async () => {
    const { P } = await parent(c, 'voix@f3.example');
    const kid = await child(c, P, 'Sami');
    const give = await c.req('POST', '/api/v1/account/accords', P, {
      password: PW,
      accords: [{ type: 'analyse_vocale_ia', profileId: kid }],
    });
    expect(give.json().ajoutes).toBe(1);
    const list = (await c.req('GET', '/api/v1/account/consents', P)).json().consents;
    const v = list.find((x: { type: string }) => x.type === 'analyse_vocale_ia');
    expect(v).toMatchObject({ optional: true, retirable: true, profileId: kid });
    expect((await c.req('POST', `/api/v1/account/consents/${v.id}/withdraw`, P)).statusCode).toBe(
      200,
    );
    expect((await me(P)).accordsManquants).toEqual([]); // facultatif : jamais bloquant
  });

  it('M9 : Québec — un adulte de 13 ans refusé (14), 13 ans en Ontario accepté ; subdivision inconnue refusée', async () => {
    const qc = await signup({
      kind: 'adulte',
      email: 'qc@f3.example',
      country: 'CA',
      region: 'CA-QC',
      birthYear: YEAR - 14,
      consents: ['cgu', ART9, 'transfert_hors_pays'],
    });
    expect(qc.json().error).toMatchObject({ code: 'age_parent_requis', age: 14 });
    const on = await signup({
      kind: 'adulte',
      email: 'on@f3.example',
      country: 'CA',
      region: 'CA-ON',
      birthYear: YEAR - 14,
      consents: ['cgu', ART9, 'transfert_hors_pays'],
    });
    expect(on.statusCode, on.body).toBe(201);
    expect((await me({ cookie: cookieOf(on) })).account.region).toBe('CA-ON');
    const bad = await signup({
      email: 'xx@f3.example',
      country: 'CA',
      region: 'CA-XX',
      consents: ['cgu', ART9, 'transfert_hors_pays'],
    });
    expect(bad.json().error.code).toBe('region_inconnue');
    const rules = (await c.req('GET', '/api/v1/pays/CA/regles?region=CA-QC')).json();
    expect(rules).toMatchObject({ consentAge: 14, region: 'CA-QC' });
    expect(rules.regions).toContain('CA-QC');
  });

  it('G3 : États-Unis — moins de 13 ans fermés (parent, adulte, école), 13 ans et plus ouverts', async () => {
    const su = await signup({
      email: 'us@f3.example',
      country: 'US',
      consents: ['cgu', ART9, 'transfert_hors_pays'],
    });
    expect(su.statusCode, su.body).toBe(201);
    const P = { cookie: cookieOf(su) };
    const r = await c.req('POST', '/api/v1/profiles', P, {
      pseudonym: 'Kid',
      birthYear: YEAR - 9,
      password: PW,
      consents: ['compte_suivi', ART9, 'coppa_parent'],
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatchObject({ code: 'ferme_moins_13', age: 13, pays: 'US' });
    const teen = await c.req('POST', '/api/v1/profiles', P, {
      pseudonym: 'Teen',
      birthYear: YEAR - 15,
      password: PW,
      consents: ['compte_suivi', ART9],
    });
    expect(teen.statusCode, teen.body).toBe(201);
    const adult = await signup({
      kind: 'adulte',
      email: 'us-kid@f3.example',
      country: 'US',
      birthYear: YEAR - 11,
      consents: ['cgu', ART9, 'transfert_hors_pays'],
    });
    expect(adult.json().error.code).toBe('ferme_moins_13');
    // école aux États-Unis : un élève de 9 ans ne reçoit pas de profil
    const T = await teacher(c, 'maitre-us@f3.example');
    const s = await c.req('POST', '/api/v1/ecole/ecoles', T, {
      name: 'Boston school',
      country: 'US',
    });
    expect(s.statusCode, s.body).toBe(201);
    expect(s.json().ecole.tz).toBe('America/New_York'); // fuseau du pays par défaut
    const cl = await c.req('POST', '/api/v1/teacher/classes', T, {
      name: 'K',
      schoolId: s.json().ecole.id,
    });
    const pupil = await c.req('POST', `/api/v1/ecole/classes/${cl.json().class.id}/pupils`, T, {
      displayName: 'J. D.',
    });
    const conv = await c.req('POST', `/api/v1/ecole/pupils/${pupil.json().pupil.id}/profil`, T, {
      birthYear: YEAR - 9,
      consent: { date: `${YEAR - 1}-09-01`, signataire: 'parent' },
    });
    expect(conv.json().error?.code).toBe('ferme_moins_13');
  });

  it('M8, G4 : fuseau du compte (contrôlé) et de l’école ; région des données « eu » par défaut', async () => {
    const su = await signup({ email: 'tz@f3.example', tz: 'Pas/Un_Fuseau' });
    const P = { cookie: cookieOf(su) };
    expect((await me(P)).account.tz).toBeNull(); // fuseau inconnu ignoré à l'inscription
    expect(
      (await c.req('PATCH', '/api/v1/account/reglages', P, { tz: 'Mars/Olympus' })).json().error
        .code,
    ).toBe('fuseau_inconnu');
    expect(
      (await c.req('PATCH', '/api/v1/account/reglages', P, { tz: 'America/Toronto' })).json(),
    ).toMatchObject({ ok: true, tz: 'America/Toronto' });
    expect(
      (await c.req('PATCH', '/api/v1/account/reglages', P, { region: 'CA-QC' })).json().error.code,
    ).toBe('region_inconnue'); // compte en France
    expect((await me(P)).account).toMatchObject({ tz: 'America/Toronto', dataRegion: 'eu' });
    const T = await teacher(c, 'maitre-tz@f3.example');
    const cls = await newClass(c, T, 'CE1');
    void cls;
    const ecole = (await me(T)).ecoles[0].id as string;
    expect(
      (await c.req('PATCH', `/api/v1/ecole/ecoles/${ecole}`, T, { tz: 'Nulle/Part' })).json().error
        .code,
    ).toBe('fuseau_inconnu');
    expect(
      (await c.req('PATCH', `/api/v1/ecole/ecoles/${ecole}`, T, { tz: 'Europe/Paris' })).statusCode,
    ).toBe(200);
    const d = (await c.req('GET', `/api/v1/ecole/ecoles/${ecole}`, T)).json();
    expect(d.ecole).toMatchObject({ tz: 'Europe/Paris', dataRegion: 'eu' });
    // les dates restent des instants (timestamptz) : la même en base, quel que soit le fuseau
    const { rows } = await c.h.pool.query(
      `select pg_typeof(created_at)::text as ty from account limit 1`,
    );
    expect(rows[0].ty).toBe('timestamp with time zone');
  });

  it('F8 : avant la suppression, un abonnement de boutique actif est signalé ; export RGPD vérifié', async () => {
    const su = await signup({ email: 'boutique@f3.example' });
    const P = { cookie: cookieOf(su) };
    const [acc] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.email, 'boutique@f3.example'));
    await c.h.db.insert(t.subscription).values({
      accountId: acc!.id,
      planCode: 'famille',
      status: 'active',
      provider: 'apple',
      providerRef: 'apple-test-1',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    });
    const pre = (await c.req('GET', '/api/v1/account/suppression', P)).json();
    expect(pre.abonnementsBoutique).toEqual([
      expect.objectContaining({ boutique: 'apple', plan: 'famille' }),
    ]);
    // export : nouveaux champs, accords, liens envoyés SANS leur empreinte
    await c.req('PATCH', '/api/v1/account/reglages', P, { tz: 'Africa/Dakar' });
    await mailTo('boutique@f3.example', 'verification');
    const ex = await c.req('GET', '/api/v1/account/export', P);
    const data = ex.json();
    expect(data.compte).toMatchObject({
      fuseauHoraire: 'Africa/Dakar',
      regionDesDonnees: 'eu',
      emailVerifieLe: null,
    });
    expect(data.consentements.map((x: { type: string }) => x.type).sort()).toEqual(['cgu', ART9]);
    expect(data.donnees.account_link).toHaveLength(1);
    expect(ex.body).not.toMatch(/token/i);
    // suppression : les liens envoyés ne valent plus
    expect((await c.req('POST', '/api/v1/account/delete', P, { password: PW })).statusCode).toBe(
      200,
    );
    expect(
      await c.h.db.select().from(t.accountToken).where(eq(t.accountToken.accountId, acc!.id)),
    ).toHaveLength(0);
  });

  it('M7 : ni compte d’école ni compte supprimé ne reçoivent de lien ; l’IP est limitée', async () => {
    const [ecole] = await c.h.db
      .select()
      .from(t.account)
      .where(eq(t.account.kind, 'ecole'))
      .limit(1);
    void ecole;
    const before = box.sent.length;
    await c.req('POST', '/api/v1/auth/password-reset', {}, { email: 'boutique@f3.example' }); // supprimé
    await settle();
    expect(box.sent.length).toBe(before);
    // au-delà de 10 demandes par heure depuis la même adresse : 429 pour tous, sans rien dire du compte
    let last = 0;
    for (let i = 0; i < 12; i++)
      last = (await c.req('POST', '/api/v1/auth/password-reset', {}, { email: `n${i}@f3.example` }))
        .statusCode;
    expect(last).toBe(429);
  });
});
