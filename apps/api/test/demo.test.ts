/**
 * Données de démonstration (outil `cli/demo.ts`, lancé par `deploy.sh --demo`) : le script tourne de bout en
 * bout sur la base de test et le contenu synthétique, puis une seconde fois sans rien recréer. Garde le
 * script à jour des règles de l'API (code parent exigé, second facteur de l'enseignant…).
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const run = promisify(execFile);

describe.skipIf(!URL_)('données de démonstration (awform_test)', () => {
  let c: Ctx;
  const env = {
    ...process.env,
    DATABASE_URL: URL_,
    AWFORM_DEMO: '1',
    AWFORM_DEMO_PASSWORD: `demo-${randomBytes(6).toString('hex')}`,
    AWFORM_DEMO_TAG: 'essai1',
    AWFORM_DEMO_PIN: '2468',
    AWFORM_SECRET_KEY: randomBytes(32).toString('hex'),
  };
  const demo = async () => {
    const r = await run('npx', ['tsx', 'src/cli/demo.ts'], { env, timeout: 120_000 });
    return JSON.parse(r.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
  };
  beforeAll(async () => {
    c = await setupEdition(URL_!);
    await c.app.close();
  }, 60_000);
  afterAll(async () => c?.h.close());

  it('première exécution : démonstration créée par les vraies routes', async () => {
    const out = await demo();
    expect(out.demo).toBe('creee');
    const { rows } = await c.h.pool.query<{ n: string }>(
      "select count(*) as n from account where email like '%@demo.awform.test'",
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(3);
  }, 150_000);

  it('seconde exécution : rien n’est recréé', async () => {
    const before = await c.h.pool.query<{ n: string }>('select count(*) as n from account');
    const out = await demo();
    expect(out.demo).not.toBe('creee');
    const after = await c.h.pool.query<{ n: string }>('select count(*) as n from account');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  }, 150_000);
});
