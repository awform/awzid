/**
 * Audit QUA-2 : le travailleur a ses tests — planification (chaque file a sa tâche, cron valide, purge la
 * nuit) et purge de la nuit sur une vraie base (toutes les purges appelées, sans erreur de droits).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, resetTestDatabase, runMigrations, type DbHandle } from '@awform/db';
import { nightlyPurge, SCHEDULES } from '../src/tasks.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe('planification du travailleur', () => {
  it('chaque file planifiée a sa tâche, cron à 5 champs, purge la nuit', () => {
    const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    for (const s of SCHEDULES) {
      expect(s.cron.split(' ')).toHaveLength(5);
      expect(src, s.queue).toContain(`boss.work('${s.queue}'`);
    }
    const purge = SCHEDULES.find((s) => s.queue === 'purge-comptes');
    expect(purge?.nightly).toBe(true);
    expect(Number(purge?.cron.split(' ')[1])).toBeLessThan(6);
  });
});

describe.skipIf(!URL_)('purge de la nuit', () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = connect(URL_!, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
  });
  afterAll(async () => h?.close());

  it('toutes les purges tournent et rendent leurs nombres', async () => {
    const n = await nightlyPurge(h.db, new Date());
    expect(Object.keys(n).sort()).toEqual(
      [
        'certificatsReduits',
        'comptes',
        'conservation',
        'f5',
        'journalTuteur',
        'recitationsEffacees',
        'verrous',
      ].sort(),
    );
    expect(n.conservation).toMatchObject({ journal: 0, sessions: 0 });
    expect(n.f5).toMatchObject({ empreintes: 0, captures: 0, avis: 0 });
  });
});
