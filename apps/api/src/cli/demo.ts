#!/usr/bin/env node
/**
 * Données de DÉMONSTRATION fictives (instance de démonstration seulement) :
 *   AWFORM_DEMO_PASSWORD=… node dist/cli/demo.js
 * Crée, par les VRAIES routes de l'API (consentements compris) : un parent et deux enfants, un adulte, un
 * enseignant (second facteur configuré), une classe, un carnet de hifẓ et un peu d'activité. Idempotent :
 * si le compte parent existe déjà, rien n'est recréé. Le mot de passe vient de l'environnement ; le secret
 * du second facteur de l'enseignant est écrit sur la sortie standard (JSON) pour être rangé HORS du dépôt.
 * Refusé si AWFORM_DEMO n'est pas « 1 » (jamais sur une base de production).
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connect, loadRootEnv, runMigrations, schema as t } from '@awform/db';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import { hashSecret, totpAt } from '../auth/crypto.js';
import { secretKeyFromEnv } from '../auth/key.js';

loadRootEnv();
if (process.env.AWFORM_DEMO !== '1')
  throw new Error('AWFORM_DEMO=1 requis (instance de démonstration)');
const PW = process.env.AWFORM_DEMO_PASSWORD ?? '';
if (PW.length < 12) throw new Error('AWFORM_DEMO_PASSWORD absent ou trop court');
// identifiants GÉNÉRÉS sur la machine (AWFORM_DEMO_TAG, AWFORM_DEMO_PIN) : jamais écrits dans le dépôt
const TAG = process.env.AWFORM_DEMO_TAG ?? '';
const PIN = process.env.AWFORM_DEMO_PIN ?? '';
if (!/^[a-z0-9]{4,12}$/.test(TAG) || !/^[0-9]{4}$/.test(PIN))
  throw new Error('AWFORM_DEMO_TAG (4 à 12 caractères) et AWFORM_DEMO_PIN (4 chiffres) requis');
const DOMAIN = 'demo.awform.test';
const E = {
  parent: `parent-${TAG}@${DOMAIN}`,
  adulte: `adulte-${TAG}@${DOMAIN}`,
  enseignant: `enseignant-${TAG}@${DOMAIN}`,
};

const h = connect(process.env.DATABASE_URL, 2);
await runMigrations(h.db);
const app = buildApp({ db: h.db, secretKey: secretKeyFromEnv(), cookieSecure: false });
await app.ready();

const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';
const call = async (method: 'GET' | 'POST' | 'PUT', url: string, cookie = '', payload?: object) => {
  const r = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    headers: { 'x-awform': '1', ...(cookie ? { cookie } : {}) },
  });
  if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
  return r;
};
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

try {
  const [exists] = await h.db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, E.parent));
  if (exists) {
    console.log(JSON.stringify({ demo: 'deja_presente' }));
  } else {
    const year = new Date().getFullYear();
    // parent et deux enfants (pseudonymes fictifs, année de naissance seulement)
    const parent = cookieOf(
      await call('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        email: E.parent,
        password: PW,
        country: 'FR',
        consents: ['cgu'],
      }),
    );
    await call('POST', '/api/v1/account/pin', parent, { pin: PIN, password: PW });
    const kids: string[] = [];
    for (const [pseudonym, avatar, age] of [
      ['Lina', 'etoile', 7],
      ['Bilal', 'soleil', 10],
    ] as const) {
      const r = await call('POST', '/api/v1/profiles', parent, {
        pseudonym,
        avatar,
        birthYear: year - 1 - age,
        levelCode: 'en1',
        password: PW,
        consents: ['compte_suivi'],
      });
      kids.push(r.json().id);
    }
    // adulte autonome
    const adult = await call('POST', '/api/v1/auth/signup', '', {
      kind: 'adulte',
      email: E.adulte,
      password: PW,
      country: 'FR',
      birthYear: 1990,
      pseudonym: 'Samir',
      consents: ['cgu'],
    });
    const adultCookie = cookieOf(adult);
    const adultProfile = adult.json().profiles[0].id as string;
    // enseignant : créé comme par la ligne de commande, second facteur configuré ici
    await h.db.insert(t.account).values({
      kind: 'enseignant',
      email: E.enseignant,
      passwordHash: await hashSecret(PW),
      passwordChangedAt: new Date(),
      country: 'FR',
    });
    const teacher = cookieOf(
      await call('POST', '/api/v1/auth/login', '', { email: E.enseignant, password: PW }),
    );
    const setup = (await call('POST', '/api/v1/auth/totp/setup', teacher, {})).json() as {
      secret: string;
      uri: string;
    };
    await call('POST', '/api/v1/auth/totp/confirm', teacher, {
      code: totpAt(setup.secret, Math.floor(Date.now() / 30_000)),
    });
    const cls = (
      await call('POST', '/api/v1/teacher/classes', teacher, {
        name: 'Hifẓ — groupe de démonstration',
      })
    ).json().class as { id: string; joinCode: string };
    // carnets de hifẓ : Lina (E1), Samir (Coran entier, rythme 7 ans, mois d'essai)
    await call('PUT', `/api/v1/hifz/profiles/${kids[0]}/plan`, parent, {
      mode: 'carnet',
      bookCode: 'en1',
      startDate: day(14),
    });
    await call('PUT', `/api/v1/hifz/profiles/${adultProfile}/plan`, adultCookie, {
      mode: 'rythme',
      rhythmYears: 7,
      suraOrder: 'juz30',
      trial: true,
      startDate: day(3),
    });
    await call('POST', `/api/v1/profiles/${kids[0]}/classes`, parent, {
      code: cls.joinCode,
      consent: true,
    });
    // un peu d'activité (journal du hifẓ, cartes, tracés) pour les tableaux de bord
    const ev = (profileId: string, eventType: string, response: object, n: number) => ({
      id: randomUUID(),
      profileId,
      unitId: 'entrainement',
      eventType,
      response,
      deviceAt: new Date(Date.now() - n * 86_400_000).toISOString(),
    });
    await call('POST', '/api/v1/attempts', parent, {
      events: [
        ev(
          kids[0]!,
          'hifz',
          { day: day(13), part: '112:1-4', kind: 'appris', source: 'auto', details: { v: '1-2' } },
          13,
        ),
        ev(
          kids[0]!,
          'hifz',
          { day: day(12), part: '112:1-4', kind: 'revision', q: 3, source: 'parent' },
          12,
        ),
        ev(
          kids[0]!,
          'hifz',
          { day: day(6), part: '112:1-4', kind: 'appris', source: 'auto', details: { v: '3-4' } },
          6,
        ),
        ev(
          kids[0]!,
          'hifz',
          { day: day(5), part: '112:1-4', kind: 'revision', q: 2, source: 'auto' },
          5,
        ),
        ...[5, 4, 2, 1].map((n) =>
          ev(
            kids[0]!,
            'trace',
            { item: 'ب:isolee', ok: n !== 4, day: day(n), details: { etape: 1 } },
            n,
          ),
        ),
        ...[3, 1].map((n) =>
          ev(kids[1]!, 'carte', { item: 'بَابٌ', ok: true, day: day(n), details: { boite: 1 } }, n),
        ),
      ],
    });
    await call('POST', '/api/v1/teacher/hifz/validations', teacher, {
      id: randomUUID(),
      profileId: kids[0],
      day: day(1),
      part: '112:1-4',
      counters: {
        aides: 1,
        hesitations: 1,
        sauts: 0,
        oublis: 0,
        claires: 0,
        discretes: 1,
        fluidite: 4,
      },
    });
    console.log(
      JSON.stringify({
        demo: 'creee',
        comptes: E,
        codeParent: PIN,
        classe: { nom: 'Hifẓ — groupe de démonstration', code: cls.joinCode },
        enseignantTotp: { secret: setup.secret, uri: setup.uri },
      }),
    );
  }
} finally {
  await app.close();
  await h.close();
}
