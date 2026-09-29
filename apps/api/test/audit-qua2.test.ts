/**
 * Audit QUA-2 : tests de CONCURRENCE sur le chemin de production (API) — un même événement envoyé en même
 * temps par plusieurs onglets ou par le service worker n'est enregistré qu'une fois.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema as t } from '@awform/db';
import { adult, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const TODAY = new Date().toISOString().slice(0, 10);

describe.skipIf(!URL_)('audit QUA-2 — concurrence', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('même lot envoyé 6 fois en parallèle : chaque événement une seule fois, jamais d’erreur', async () => {
    const { A, profileId } = await adult(c, 'parallele-qua2@exemple.org');
    const deviceAt = new Date().toISOString();
    const events = [
      {
        id: randomUUID(),
        profileId,
        unitId: 'en1.l01',
        eventType: 'checklist',
        response: { checked: 2, total: 2 },
        deviceAt,
      },
      {
        id: randomUUID(),
        profileId,
        unitId: 'hifz',
        eventType: 'hifz',
        response: { day: TODAY, part: '112:1-4', kind: 'appris', source: 'auto' },
        deviceAt,
      },
      {
        id: randomUUID(),
        profileId,
        unitId: 'x',
        eventType: 'trace',
        response: { item: 'ب', ok: true, day: TODAY },
        deviceAt,
      },
    ];
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => c.req('POST', '/api/v1/attempts', A, { events })),
    );
    for (const r of rs) expect(r.statusCode, r.body).toBe(200);
    for (const e of events) {
      const acc = rs.filter((r) =>
        r.json().accepted.some((x: { id: string }) => x.id === e.id),
      ).length;
      const dup = rs.filter((r) => r.json().duplicates.includes(e.id)).length;
      expect([acc, dup], e.eventType).toEqual([1, 5]);
    }
    expect(
      await c.h.db.select().from(t.attempt).where(eq(t.attempt.id, events[0]!.id)),
    ).toHaveLength(1);
    expect(
      await c.h.db.select().from(t.hifzEvent).where(eq(t.hifzEvent.id, events[1]!.id)),
    ).toHaveLength(1);
    const [p] = await c.h.db.select().from(t.progress).where(eq(t.progress.profileId, profileId));
    expect(p?.unitId).toBe('en1.l01');
  });
});
