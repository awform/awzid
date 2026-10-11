/**
 * Comptes de démonstration « un par niveau » (demo-niveaux.ts) : table des niveaux, JAMAIS en production
 * (garde-fous statiques et à l'exécution), puis, sur la base de test, création idempotente, niveau de départ,
 * connexion par identifiant court, classes de l'enseignant et remise au début d'un niveau.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { subjectOf, trackOf } from '@awform/content';
import { currentLevels, profileEvalMode } from '@awform/db';
import { buildApp } from '../src/app.js';
import { DEMO_DOMAIN } from '../src/demo-mode.js';
import {
  assertDemo,
  CLASSES,
  DEMO_NIVEAUX,
  emailOf,
  PARENT_NIVEAUX_ROLE,
  roleOf,
  seedNiveaux,
  TABLE_ADOS,
  TABLE_ADULTES,
  type Call,
} from '../src/demo-niveaux.js';
import {
  cookieOf,
  parent,
  PW,
  setupEdition,
  teacherWithSecret,
  YEAR,
  type Ctx,
} from './helpers.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const URL_ = process.env.TEST_DATABASE_URL;
const run = promisify(execFile);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('table des comptes de niveau', () => {
  it('19 comptes : adulte1-10, ado1-4, enfant1-5, niveaux et religion de la filière', () => {
    expect(DEMO_NIVEAUX.map((n) => n.id)).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `adulte${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `ado${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `enfant${i + 1}`),
    ]);
    for (const n of DEMO_NIVEAUX) {
      expect(trackOf(n.arabe)).toBe(
        { adultes: 'adultes', ados: 'ados', enfants: 'enfants' }[n.filiere],
      );
      expect(subjectOf(n.arabe)).toBe('arabe');
      expect(subjectOf(n.sciences)).toBe('sciences');
      expect(n.arabe).toBe(`${{ adultes: 'ad', ados: 'ado', enfants: 'en' }[n.filiere]}${n.n}`);
    }
    expect(DEMO_NIVEAUX.find((n) => n.id === 'enfant4')!.sciences).toBe('re4');
    expect(DEMO_NIVEAUX.map((n) => n.sciences).slice(10, 14)).toEqual(['ra1', 'ra2', 'ra2', 'ra2']);
    expect(TABLE_ADOS).toEqual([1, 2, 2, 2]);
    expect(TABLE_ADULTES).toHaveLength(10);
    expect(Math.max(...TABLE_ADULTES)).toBeLessThanOrEqual(4);
  });
  it('adresses fictives : aucune collision avec les six comptes de démonstration ni entre elles', () => {
    const emails = [
      emailOf(PARENT_NIVEAUX_ROLE, 'essai1'),
      ...DEMO_NIVEAUX.filter((n) => n.filiere === 'adultes').map((n) =>
        emailOf(roleOf(n), 'essai1'),
      ),
    ];
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) {
      expect(e.endsWith(`@${DEMO_DOMAIN}`)).toBe(true);
      // motifs `<rôle>-%@domaine` de demo-mode.ts
      for (const r of ['parent', 'adulte', 'enseignant', 'admin'])
        expect(e.startsWith(`${r}-`)).toBe(false);
    }
    // adulte1 ne doit pas attraper adulte10 (`niveau-adulte1-%`)
    expect(emailOf('niveau-adulte10', 'x').startsWith('niveau-adulte1-')).toBe(false);
  });
});

describe('JAMAIS en production', () => {
  it('assertDemo refuse sans AWFORM_DEMO=1 ; seedNiveaux aussi (avant tout accès)', async () => {
    expect(() => assertDemo({})).toThrow(/AWFORM_DEMO=1/);
    expect(() => assertDemo({ AWFORM_DEMO: '0' })).toThrow();
    expect(() => assertDemo({ AWFORM_DEMO: '1' })).not.toThrow();
    await expect(
      seedNiveaux({
        db: undefined as never,
        call: undefined as never,
        cookieOf: undefined as never,
        env: {},
        password: '',
        pin: '',
        tag: 'x',
        teacherEmail: '',
      }),
    ).rejects.toThrow(/AWFORM_DEMO=1/);
  });
  it('deploy.sh : le service de démonstration n’est lancé que dans le bloc --demo', () => {
    const sh = read('infra/prod/deploy.sh');
    const start = sh.indexOf('if [ "$DEMO" = 1 ]; then');
    const end = sh.indexOf('\nfi\n', start);
    expect(start).toBeGreaterThan(0);
    const inside = sh.slice(start, end);
    const outside = sh.slice(0, start) + sh.slice(end);
    expect(inside).toMatch(/-e AWFORM_DEMO=1[^\n]* demo\b/);
    expect(outside).not.toMatch(/AWFORM_DEMO_|dist\/cli\/demo/);
    expect(outside).not.toMatch(/--profile outils run[^\n]* demo\b/);
    // sans --demo, les réglages de démonstration (AWFORM_DEMO=1) sont retirés
    expect(sh).toContain('"$PROD/demo-env.sh" "$ENVF" "$DEMO"');
    expect(read('infra/prod/demo-env.sh')).toMatch(/elif grep -qx "\$kv"/);
  });
  it('seuls demo-mode.ts et les deux scripts de démonstration importent demo-niveaux', () => {
    const users = walk(join(root, 'apps/api/src'))
      .filter((f) => /demo-niveaux/.test(readFileSync(f, 'utf8')) && !f.endsWith('demo-niveaux.ts'))
      .map((f) => f.slice(join(root, 'apps/api/src').length + 1).replaceAll('\\', '/'))
      .sort();
    expect(users).toEqual(['cli/demo-reset-niveau.ts', 'cli/demo.ts', 'demo-mode.ts']);
    for (const f of ['apps/api/src/cli/demo.ts', 'apps/api/src/cli/demo-reset-niveau.ts'])
      expect(read(f)).toMatch(/AWFORM_DEMO|assertDemo/);
    // le serveur n'appelle jamais le semis
    expect(read('apps/api/src/server.ts')).not.toMatch(/seedNiveaux|demo-niveaux/);
    expect(read('apps/api/src/app.ts')).not.toMatch(/seedNiveaux|demo-niveaux/);
  });
  it('remise à zéro : refusée si prod.env n’a pas AWFORM_DEMO=1, identifiants contrôlés', () => {
    const sh = read('infra/prod/demo-reset-niveau.sh');
    expect(sh).toMatch(/grep -qx 'AWFORM_DEMO=1' "\$ENVF"[^\n]*exit 1/);
    expect(sh).toMatch(/adulte\[1-9\] \| adulte10 \| ado\[1-4\] \| enfant\[1-5\]/);
  });
});

describe.skipIf(!URL_)('comptes par niveau sur la base de test', () => {
  let c: Ctx;
  let demo: FastifyInstance;
  const TAG = 'essai1';
  const PIN = '4821';
  const env = { AWFORM_DEMO: '1' } as NodeJS.ProcessEnv;
  const call: Call = async (method, url, cookie = '', payload) => {
    const r = await c.app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { 'x-awform': '1', 'x-parent-pin': PIN, ...(cookie ? { cookie } : {}) },
    });
    if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
    return r;
  };
  const seed = () =>
    seedNiveaux({
      db: c.h.db,
      call,
      cookieOf: (r) => cookieOf(r as LightMyRequestResponse),
      env,
      password: PW,
      pin: PIN,
      tag: TAG,
      teacherEmail: `enseignant-${TAG}@${DEMO_DOMAIN}`,
    });
  const login = (app: FastifyInstance, id: string, password = 'awzid') =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: id, password },
      headers: { 'x-awform': '1' },
    });
  const counts = async () => {
    const q = (s: string) => c.h.pool.query<{ n: string }>(s).then((r) => Number(r.rows[0]!.n));
    return {
      comptes: await q('select count(*) n from account'),
      profils: await q('select count(*) n from profile'),
      niveaux: await q('select count(*) n from profile_level'),
      classes: await q('select count(*) n from class_group'),
      membres: await q('select count(*) n from class_member'),
    };
  };
  const profileOf = async (id: string) => {
    const n = DEMO_NIVEAUX.find((x) => x.id === id)!;
    const { rows } = await c.h.pool.query<{ id: string }>(
      `select p.id from profile p join account a on a.id = p.owner_account_id
       where a.email = $1 and ($2::text is null or p.pseudonym = $2)`,
      [emailOf(roleOf(n), TAG), n.filiere === 'adultes' ? null : n.pseudonym],
    );
    return rows[0]!.id;
  };
  const levels = async (id: string) =>
    Object.fromEntries(
      (await currentLevels(c.h.db, await profileOf(id))).map((l) => [l.subject, l.levelCode]),
    );

  beforeAll(async () => {
    c = await setupEdition(URL_!);
    // tous les niveaux des livres (la base synthétique n'a que en1 et ad1)
    for (const n of DEMO_NIVEAUX)
      for (const code of [n.arabe, n.sciences])
        await c.h.pool.query(
          'insert into level (code, track, rank, subject_code) values ($1, $2, $3, $4) on conflict do nothing',
          [code, trackOf(code), Number(/\d+$/.exec(code)![0]), subjectOf(code)],
        );
    await teacherWithSecret(c, `enseignant-${TAG}@${DEMO_DOMAIN}`);
    // comptes d'origine de la démonstration : `parent` avec Lina (en1) et Yanis (ado1)
    const { P } = await parent(c, `parent-${TAG}@${DEMO_DOMAIN}`);
    for (const [pseudonym, age, levelCode] of [
      ['Lina', 7, 'en1'],
      ['Yanis', 15, 'ado1'],
    ] as const) {
      const r = await c.req('POST', '/api/v1/profiles', P, {
        pseudonym,
        birthYear: YEAR - 1 - age,
        levelCode,
        password: PW,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      });
      if (r.statusCode !== 201) throw new Error(r.body);
    }
    demo = buildApp({
      db: c.h.db,
      secretKey: randomBytes(32),
      relaisCertsDir: null,
      demoLogin: true,
    });
    await demo.ready();
  }, 90_000);
  afterAll(async () => {
    await demo?.close();
    await c?.app.close();
    await c?.h.close();
  });

  it('création : 19 comptes au début de leur niveau, réglages de leur âge', async () => {
    const r = await seed();
    // 19 identifiants - 2 alias (ado1 = Yanis, enfant1 = Lina) + parent-niveaux
    expect(r.crees).toHaveLength(18);
    expect(r.crees).not.toContain('ado1');
    expect(r.crees).not.toContain('enfant1');
    expect(r.absents).toEqual([]);
    for (const n of DEMO_NIVEAUX) {
      if (n.alias) {
        // alias : profil existant, niveau 1 d'origine, jamais modifié par le semis
        expect((await levels(n.id)).arabe, n.id).toBe(n.arabe);
        continue;
      }
      expect(await levels(n.id), n.id).toEqual({ arabe: n.arabe, sciences: n.sciences });
      const m = await profileEvalMode(c.h.db, await profileOf(n.id));
      expect(m?.mode, n.id).toBe(n.filiere === 'adultes' ? 'serein' : 'douce');
      expect(m?.decider, n.id).toBe(n.filiere === 'adultes' ? 'soi' : 'parent');
    }
    // leçon 1 : aucune progression
    const { rows } = await c.h.pool.query<{ n: string }>('select count(*) n from progress');
    expect(Number(rows[0]!.n)).toBe(0);
  }, 120_000);

  it('connexion par identifiant court : adulte2, ado3, enfant4 et parent-niveaux', async () => {
    const a = await login(demo, 'adulte2');
    expect(a.statusCode).toBe(200);
    expect(a.json().account.kind).toBe('adulte');
    expect(a.json().profiles[0].id).toBe(await profileOf('adulte2'));
    const d = await login(demo, 'ado3');
    expect(d.statusCode).toBe(200);
    expect(d.json().account.kind).toBe('parent');
    expect(d.json().profilDemo).toBe(await profileOf('ado3'));
    const e = await login(demo, 'enfant4');
    expect(e.statusCode).toBe(200);
    expect(e.json().profilDemo).toBe(await profileOf('enfant4'));
    expect((await levels('enfant4')).arabe).toBe('en4');
    const p = await login(demo, 'parent-niveaux');
    expect(p.json().profilDemo).toBeNull();
    expect(p.json().profiles).toHaveLength(7); // ado2-4 et enfant2-5 (ado1 et enfant1 : alias)
    // alias : même compte et même profil que `ado` (Yanis) et `enfant` (Lina), aucun doublon
    for (const [alias, orig] of [
      ['ado1', 'ado'],
      ['enfant1', 'enfant'],
    ] as const) {
      const a = await login(demo, alias);
      const o = await login(demo, orig);
      expect(a.statusCode).toBe(200);
      expect(a.json().account.id).toBe(o.json().account.id);
      expect(a.json().profilDemo).toBe(o.json().profilDemo);
      expect(a.json().profilDemo).toBe(await profileOf(alias));
    }
    const { rows: dup } = await c.h.pool.query<{ n: string }>(
      "select count(*) n from profile where pseudonym in ('Ado 1', 'Enfant 1')",
    );
    expect(Number(dup[0]!.n)).toBe(0);
    // mauvais mot de passe ; les six comptes d'origine restent distincts
    expect((await login(demo, 'adulte2', 'autre')).statusCode).toBe(401);
    expect((await login(demo, 'adulte', 'awzid')).statusCode).toBe(401); // pas de compte `adulte` ici
    expect((await login(demo, 'adulte11')).statusCode).toBe(401);
  });

  it('PRODUCTION : ces identifiants et « awzid » n’ouvrent rien', async () => {
    for (const n of DEMO_NIVEAUX) expect((await login(c.app, n.id)).statusCode, n.id).toBe(401);
    expect((await login(c.app, 'parent-niveaux')).statusCode).toBe(401);
  });

  it('un élève ne voit que son niveau (règle du parcours)', async () => {
    const A = { cookie: cookieOf(await login(demo, 'adulte1')) };
    const pid = await profileOf('adulte1');
    const r = await c.app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${pid}/espace/arabe`,
      headers: A,
    });
    expect(r.statusCode).toBe(200);
    // (édition synthétique : seul ad1 est publié) le niveau courant est celui du compte, rien d'autre n'est ouvert
    expect(r.json().courant.code).toBe('ad1');
    expect(r.json().suivant).toBeNull();
  });

  it('une classe par filière chez l’enseignant, avec tous les comptes', async () => {
    const { rows } = await c.h.pool.query<{ name: string; n: string }>(
      `select g.name, count(m.*) n from class_group g left join class_member m on m.class_id = g.id
       where g.name like 'Démonstration%' group by g.name`,
    );
    const by = Object.fromEntries(rows.map((x) => [x.name, Number(x.n)]));
    expect(by).toEqual({ [CLASSES.adultes]: 10, [CLASSES.ados]: 4, [CLASSES.enfants]: 5 });
  });

  it('idempotent : relancer ne recrée rien et ne touche pas la progression', async () => {
    // le client a avancé : adulte3 est passé à ad4 et a fait une leçon
    const { setProfileLevel } = await import('@awform/db');
    const pid = await profileOf('adulte3');
    await setProfileLevel(c.h.db, pid, 'ad4', 'epreuve');
    await c.h.pool.query(
      "insert into progress (profile_id, unit_id, status) select $1, id, 'terminee' from unit where id = 'ad1.l01'",
      [pid],
    );
    const before = await counts();
    const r = await seed();
    expect(r.crees).toEqual([]);
    expect(await counts()).toEqual({ ...before });
    expect((await levels('adulte3')).arabe).toBe('ad4');
    const { rows } = await c.h.pool.query<{ n: string }>(
      'select count(*) n from progress where profile_id = $1',
      [pid],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  }, 120_000);

  it('remise au début d’un niveau : ce compte seulement', async () => {
    const { setProfileLevel } = await import('@awform/db');
    await setProfileLevel(c.h.db, await profileOf('adulte5'), 'ad6', 'epreuve');
    const pid = await profileOf('adulte3');
    const cliEnv = {
      ...process.env,
      DATABASE_URL: URL_,
      AWFORM_DEMO: '1',
      AWFORM_DEMO_TAG: TAG,
    };
    // refusée hors démonstration
    await expect(
      run('npx', ['tsx', 'src/cli/demo-reset-niveau.ts', 'adulte3'], {
        env: { ...cliEnv, AWFORM_DEMO: '' },
        timeout: 120_000,
      }),
    ).rejects.toThrow();
    // identifiant inconnu : refusé
    await expect(
      run('npx', ['tsx', 'src/cli/demo-reset-niveau.ts', 'adulte11'], {
        env: cliEnv,
        timeout: 120_000,
      }),
    ).rejects.toThrow();
    await run('npx', ['tsx', 'src/cli/demo-reset-niveau.ts', 'adulte3'], {
      env: cliEnv,
      timeout: 120_000,
    });
    expect(await levels('adulte3')).toEqual({ arabe: 'ad3', sciences: 'ra2' });
    const { rows } = await c.h.pool.query<{ n: string }>(
      'select count(*) n from progress where profile_id = $1',
      [pid],
    );
    expect(Number(rows[0]!.n)).toBe(0);
    // un autre compte n'est pas touché
    expect((await levels('adulte5')).arabe).toBe('ad6');
    // les comptes existent toujours (rien de supprimé)
    expect((await login(demo, 'adulte3')).statusCode).toBe(200);
  }, 240_000);
});
