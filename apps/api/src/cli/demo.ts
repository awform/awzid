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
import { and, eq } from 'drizzle-orm';
import {
  addPaperPupil,
  connect,
  createAssignment,
  currentLevels,
  currentEdition,
  listUnits,
  loadRootEnv,
  runMigrations,
  savePaperResult,
  setProfileLevel,
  schema as t,
  updateClassSettings,
} from '@awform/db';
import type { LightMyRequestResponse } from 'fastify';
import { setupTutor } from '@awform/tutor';
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
  admin: `admin-${TAG}@${DOMAIN}`,
};

const h = connect(process.env.DATABASE_URL, 2);
await runMigrations(h.db);
const app = buildApp({
  db: h.db,
  secretKey: secretKeyFromEnv(),
  cookieSecure: false,
  // tuteur SIMULÉ pour remplir la démonstration (jamais un vrai modèle)
  tutor: setupTutor({ AWFORM_TUTEUR: 'simule' }),
});
await app.ready();

const cookieOf = (r: LightMyRequestResponse) =>
  String([r.headers['set-cookie']].flat()[0] ?? '').split(';')[0] ?? '';
const call = async (method: 'GET' | 'POST' | 'PUT', url: string, cookie = '', payload?: object) => {
  const r = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    // code parent de démonstration toujours joint : exigé pour les accords donnés pour un enfant (audits
    // SEC-3, MIN-4), ignoré ailleurs
    headers: { 'x-awform': '1', 'x-parent-pin': PIN, ...(cookie ? { cookie } : {}) },
  });
  if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
  return r;
};
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** dernière ligne de la sortie standard (lue par deploy.sh) */
let result: Record<string, unknown> = { demo: 'deja_presente' };
try {
  const [exists] = await h.db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, E.parent));
  if (exists) {
    // déjà présente : rien n'est recréé (compléments idempotents plus bas)
  } else {
    const year = new Date().getFullYear();
    // parent et deux enfants (pseudonymes fictifs, année de naissance seulement)
    const parent = cookieOf(
      await call('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        birthYear: 1985,
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
    result = {
      demo: 'creee',
      comptes: E,
      codeParent: PIN,
      classe: { nom: 'Hifẓ — groupe de démonstration', code: cls.joinCode },
      enseignantTotp: { secret: setup.secret, uri: setup.uri },
    };
  }
  // ---- complément lot 9 (idempotent) : tuteur — accord du parent pour Lina, une question transmise à
  // l'enseignant par l'adulte (membre de la classe de démonstration), quelques réponses au journal
  const [qExists] = await h.db
    .select({ id: t.tutorQuestion.id })
    .from(t.tutorQuestion)
    .innerJoin(t.profile, eq(t.profile.id, t.tutorQuestion.profileId))
    .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
    .where(eq(t.account.email, E.adulte));
  if (!qExists) {
    const login = async (email: string) =>
      cookieOf(await call('POST', '/api/v1/auth/login', '', { email, password: PW }));
    const parentC = await login(E.parent);
    const adultC = await login(E.adulte);
    const pme = (await call('GET', '/api/v1/auth/me', parentC)).json() as {
      profiles: Array<{ id: string; pseudonym: string }>;
    };
    const lina = pme.profiles.find((p) => p.pseudonym === 'Lina');
    const ame = (await call('GET', '/api/v1/auth/me', adultC)).json() as {
      profiles: Array<{ id: string }>;
    };
    const adultId = ame.profiles[0]!.id;
    const [cls] = await h.db
      .select({ code: t.classGroup.joinCode, id: t.classGroup.id })
      .from(t.classGroup)
      .innerJoin(t.account, eq(t.account.id, t.classGroup.teacherAccountId))
      .where(eq(t.account.email, E.enseignant));
    if (lina) {
      await call('PUT', `/api/v1/profiles/${lina.id}/tuteur`, parentC, { actif: true });
      for (const action of ['indice', 'lecon'])
        await call('POST', `/api/v1/tutor/${lina.id}/ask`, parentC, {
          unitId: 'en1.l03',
          action,
          hour: 10,
        });
    }
    if (cls) {
      const [member] = await h.db
        .select({ p: t.classMember.profileId })
        .from(t.classMember)
        .where(eq(t.classMember.profileId, adultId));
      if (!member)
        await call('POST', `/api/v1/profiles/${adultId}/classes`, adultC, {
          code: cls.code,
          consent: true,
        });
      // leçon ad1.l05 des livres ; à défaut (contenu réduit), la dernière leçon d'ad1 de l'édition
      const edNow = await currentEdition(h.db);
      const ad1 = edNow
        ? (await listUnits(h.db, edNow.id, 'ad1')).filter((u) => u.kind === 'lecon')
        : [];
      const adLesson = ad1.find((u) => u.id === 'ad1.l05')?.id ?? ad1.at(-1)?.id ?? 'ad1.l05';
      await call('POST', `/api/v1/tutor/${adultId}/ask`, adultC, {
        unitId: adLesson,
        action: 'question',
        text: 'Est-ce que je peux faire mes ablutions avec des chaussettes ?',
      });
    }
    console.error(JSON.stringify({ tuteur: 'demo_completee' }));
  }
  // ---- complément (idempotent) : compte ADMINISTRATEUR (second facteur) et profil ADO (15 ans)
  const [adminExists] = await h.db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, E.admin));
  if (!adminExists) {
    await h.db
      .insert(t.account)
      .values({ kind: 'admin', email: E.admin, passwordHash: await hashSecret(PW), country: 'FR' });
    const adminC = cookieOf(
      await call('POST', '/api/v1/auth/login', '', { email: E.admin, password: PW }),
    );
    const s = (await call('POST', '/api/v1/auth/totp/setup', adminC, {})).json() as {
      secret: string;
      uri: string;
    };
    // pas de temps suivant : jamais le même code que celui de l'enseignant créé juste avant
    await call('POST', '/api/v1/auth/totp/confirm', adminC, {
      code: totpAt(s.secret, Math.floor(Date.now() / 30_000)),
    });
    result = {
      ...result,
      demo: result.demo === 'creee' ? 'creee' : 'complement',
      admin: { email: E.admin, totp: s },
    };
  }
  const parentC2 = cookieOf(
    await call('POST', '/api/v1/auth/login', '', { email: E.parent, password: PW }),
  );
  const pme2 = (await call('GET', '/api/v1/auth/me', parentC2)).json() as {
    profiles: Array<{ pseudonym: string }>;
  };
  if (!pme2.profiles.some((p) => p.pseudonym === 'Yanis')) {
    await call('POST', '/api/v1/profiles', parentC2, {
      pseudonym: 'Yanis',
      birthYear: new Date().getFullYear() - 15,
      // A27 : un ado suit les livres ADOS (ado1) et, en sciences, les livres Ados/Adultes (ra1)
      // (contenu réduit sans livres ados : ad1, comme avant)
      levelCode: (await h.db.select().from(t.level).where(eq(t.level.code, 'ado1'))).length
        ? 'ado1'
        : 'ad1',
      avatar: 'lune',
      password: PW,
      consents: ['compte_suivi'],
    });
    result = { ...result, ado: 'Yanis (15 ans)' };
  }
  // ---- complément (idempotent, A27) : Yanis (ado) placé dans les livres ADOS (ado1) et en sciences ra1 — une démo
  // créée avant A27 l'avait mis en ad1 (livres adultes) ; un niveau choisi ensuite (test, épreuve, maître) est gardé
  {
    const [yanis] = await h.db
      .select({ id: t.profile.id })
      .from(t.profile)
      .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
      .where(and(eq(t.account.email, E.parent), eq(t.profile.pseudonym, 'Yanis')));
    if (yanis) {
      const cur = await currentLevels(h.db, yanis.id);
      const ar = cur.find((c) => c.subject === 'arabe');
      if (!ar || (ar.levelCode === 'ad1' && ['reprise', 'inscription'].includes(ar.source)))
        await setProfileLevel(h.db, yanis.id, 'ado1', 'parent');
      if (!cur.some((c) => c.subject === 'sciences'))
        await setProfileLevel(h.db, yanis.id, 'ra1', 'parent');
    }
  }
  // ---- complément (idempotent) : espace école (lot 13) — classe de l'enseignant réglée pour Enfants N1,
  // trois élèves FICTIFS de « classe papier » avec leurs notes, deux devoirs
  const [schoolCls] = await h.db
    .select({
      id: t.classGroup.id,
      levelCode: t.classGroup.levelCode,
      schoolId: t.classGroup.schoolId,
    })
    .from(t.classGroup)
    .innerJoin(t.account, eq(t.account.id, t.classGroup.teacherAccountId))
    .where(eq(t.account.email, E.enseignant));
  const ed = await currentEdition(h.db);
  if (schoolCls && !schoolCls.levelCode && ed) {
    const [teacher] = await h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, E.enseignant));
    await updateClassSettings(h.db, schoolCls.id, {
      levelCode: 'en1',
      schoolName: 'École de démonstration Awzid',
      place: 'Dakar',
      placeAr: 'دَاكَار',
      schoolYear: '2026-2027',
    });
    // lot F2 : l'école (personnelle) de l'enseignant porte le nom de l'établissement de démonstration
    await h.db
      .update(t.school)
      .set({ name: 'École de démonstration Awzid', place: 'Dakar', placeAr: 'دَاكَار' })
      .where(eq(t.school.id, schoolCls.schoolId));
    const bilans = (await listUnits(h.db, ed.id, 'en1')).filter((u) => u.kind === 'bilan');
    const pupils: Array<[string, 'm' | 'f', number[], number | null]> = [
      ['Awa D.', 'f', [18, 17, 19, 18], 17],
      ['Moussa S.', 'm', [14, 15, 13, 16], 14],
      ['Fatou N.', 'f', [16, 12], null],
    ];
    for (const [name, gender, notes, exam] of pupils) {
      const p = await addPaperPupil(h.db, schoolCls.id, { displayName: name, gender });
      const rows = notes.map((s, i) => ({ item: `bilan:${bilans[i]?.id ?? ''}`, score: s }));
      if (exam !== null) rows.push({ item: 'examen', score: exam });
      for (const r of rows.filter((x) => !x.item.endsWith(':')))
        await savePaperResult(h.db, {
          pupilId: p.id,
          levelCode: 'en1',
          item: r.item,
          score: r.score,
          max: 20,
          day: day(3),
          enteredBy: teacher!.id,
        });
    }
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await createAssignment(h.db, {
      classId: schoolCls.id,
      kind: 'lecon',
      target: 'en1.l03',
      dueDay: soon,
    });
    await createAssignment(h.db, {
      classId: schoolCls.id,
      kind: 'hifz',
      target: '112:1-4',
      dueDay: soon,
      note: 'Réciter en classe',
    });
    result = { ...result, ecole: 'classe papier de démonstration (3 élèves fictifs)' };
  }
  console.log(JSON.stringify(result));
} finally {
  await app.close();
  await h.close();
}
