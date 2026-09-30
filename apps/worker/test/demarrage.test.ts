/**
 * Démarrage du travailleur sous SON compte PostgreSQL (droits minimaux, lot 14) : pg-boss démarre, crée ses
 * files et ses planifications dans le schéma « pgboss » préparé par l'outil des rôles. Témoin : avec la
 * création de schéma par pg-boss (réglage par défaut), le démarrage est refusé faute du droit CREATE.
 */
import { randomBytes } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyRoles,
  connect,
  resetTestDatabase,
  roleNames,
  runMigrations,
  type DbHandle,
} from '@awform/db';
import { bossOptions, SCHEDULES } from '../src/tasks.js';

const URL_ = process.env.TEST_DATABASE_URL;
const as = (url: string, user: string, password: string) => {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
};

describe('options de pg-boss', () => {
  it('schéma pgboss, jamais créé par le travailleur', () => {
    expect(bossOptions('postgres://x')).toEqual({
      connectionString: 'postgres://x',
      schema: 'pgboss',
      createSchema: false,
    });
  });
});

describe.skipIf(!URL_)('démarrage sous le compte du travailleur (awform_test)', () => {
  const names = roleNames('awform_w');
  const pw = { api: randomBytes(24).toString('hex'), worker: randomBytes(24).toString('hex') };
  let owner: DbHandle;
  let url = '';
  beforeAll(async () => {
    owner = connect(URL_, 2);
    await resetTestDatabase(owner.pool);
    await runMigrations(owner.db);
    await owner.pool.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
    await applyRoles(owner.pool, names, pw);
    url = as(URL_!, names.worker, pw.worker);
  });
  afterAll(async () => owner?.close());

  it('témoin : sans createSchema: false, pg-boss est refusé (pas de droit CREATE)', async () => {
    const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
    boss.on('error', () => {});
    await expect(boss.start()).rejects.toThrow(/permission denied/);
    await boss.stop({ graceful: false }).catch(() => {});
  });

  it('avec bossOptions : démarre, crée les files et les planifications', async () => {
    const boss = new PgBoss(bossOptions(url));
    boss.on('error', () => {});
    await boss.start();
    for (const s of SCHEDULES) {
      await boss.createQueue(s.queue);
      await boss.schedule(s.queue, s.cron, {});
    }
    const sch = await boss.getSchedules();
    expect(sch.map((x) => x.name).sort()).toEqual(SCHEDULES.map((s) => s.queue).sort());
    await boss.stop({ graceful: false });
  }, 30_000);
});
