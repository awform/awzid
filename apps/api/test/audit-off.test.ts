/**
 * Audit — hors ligne : OFF-2, OFF-5 (un bloc par constat). Chaque bloc échouait avant sa correction.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { adult, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const TODAY = new Date().toISOString().slice(0, 10);

describe.skipIf(!URL_)('audit — hors ligne', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('OFF-2 : un événement hors bornes est refusé seul, le reste du lot passe (plus de 500)', async () => {
    const { A, profileId } = await adult(c, 'poison-off2@exemple.org');
    const now = new Date().toISOString();
    const ev = (eventType: string, response: object, extra: object = {}) => ({
      id: randomUUID(),
      profileId,
      unitId: eventType === 'checklist' ? 'en1.l01' : 'hifz',
      eventType,
      response,
      deviceAt: now,
      ...extra,
    });
    const hifz = (r: object) =>
      ev('hifz', { day: TODAY, part: '112:1-4', kind: 'appris', source: 'auto', ...r });
    const trace = (r: object) => ev('trace', { item: 'ب', ok: true, day: TODAY, ...r });
    const bons = [
      ev('checklist', { checked: 1, total: 2 }),
      trace({}),
      hifz({}),
      // horloge absurde : l'heure du serveur est prise à la place (OFF-5), plus d'erreur 500
      ev('checklist', { checked: 1, total: 2 }, { deviceAt: '-010000-01-01T00:00:00.000Z' }),
    ];
    const poisons = [
      hifz({ q: 99999 }),
      hifz({ pos: 3e9 }),
      hifz({ details: { note: 'a\u0000b' } }),
      trace({ details: { x: '\u0000' } }),
      ev('checklist', { checked: 40000, total: 40000 }),
    ];
    const r = await c.req('POST', '/api/v1/attempts', A, { events: [...poisons, ...bons] });
    expect(r.statusCode, r.body).toBe(200);
    const b = r.json();
    const ok = new Set(b.accepted.map((x: { id: string }) => x.id));
    for (const e of bons) expect(ok.has(e.id), JSON.stringify(e)).toBe(true);
    const ko = new Set(b.rejected.map((x: { id: string }) => x.id));
    for (const e of poisons) expect(ko.has(e.id), JSON.stringify(e)).toBe(true);
  });

  it('OFF-5 : horodatage antidaté remplacé par l’heure du serveur ; jours et passages impossibles refusés', async () => {
    const { A, profileId } = await adult(c, 'antidate-off5@exemple.org');
    const base = { profileId, deviceAt: new Date().toISOString() };
    const old = {
      ...base,
      id: randomUUID(),
      unitId: 'en1.l01',
      eventType: 'checklist',
      response: { checked: 1, total: 2 },
      deviceAt: '2021-01-01T00:00:00.000Z',
    };
    const hifz = (r: object) => ({
      ...base,
      id: randomUUID(),
      unitId: 'hifz',
      eventType: 'hifz',
      response: { day: TODAY, part: '112:1-4', kind: 'appris', source: 'auto', ...r },
    });
    const trace = (day: string) => ({
      ...base,
      id: randomUUID(),
      unitId: 'x',
      eventType: 'trace',
      response: { item: 'ب', ok: true, day },
    });
    const bon = hifz({});
    const faux = [
      hifz({ day: '2026-99-99' }),
      hifz({ day: '2099-12-31' }),
      hifz({ day: '0001-01-01' }),
      hifz({ part: '999:999-999' }),
      hifz({ part: '115:1' }),
      hifz({ part: '112:4-1' }),
      hifz({ part: '112:0' }),
      trace('2026-02-30'),
    ];
    const r = await c.req('POST', '/api/v1/attempts', A, { events: [old, bon, ...faux] });
    expect(r.statusCode, r.body).toBe(200);
    const b = r.json();
    const ok = new Set(b.accepted.map((x: { id: string }) => x.id));
    expect(ok.has(old.id) && ok.has(bon.id)).toBe(true);
    const ko = new Set(b.rejected.map((x: { id: string }) => x.id));
    for (const e of faux) expect(ko.has(e.id), JSON.stringify(e.response)).toBe(true);
    const [row] = await c.h.db.select().from(t.attempt).where(eq(t.attempt.id, old.id));
    expect(Date.now() - row!.deviceAt.getTime()).toBeLessThan(60_000);
  });

  it('OFF-7 : identifiant déjà pris par un AUTRE profil → conflit (code stable), jamais « doublon »', async () => {
    const a = await adult(c, 'collision-a-off7@exemple.org');
    const b = await adult(c, 'collision-b-off7@exemple.org');
    const id = randomUUID();
    const ev = (profileId: string, eventType: string, response: object) => ({
      id,
      profileId,
      unitId: eventType === 'checklist' ? 'en1.l01' : 'hifz',
      eventType,
      response,
      deviceAt: new Date().toISOString(),
    });
    for (const [type, resp] of [
      ['hifz', { day: TODAY, part: '112:1-4', kind: 'appris', source: 'auto' }],
      ['checklist', { checked: 1, total: 2 }],
      ['trace', { item: 'ب', ok: true, day: TODAY }],
    ] as const) {
      const theirs = { ...ev(b.profileId, type, resp), id: randomUUID() };
      expect(
        (await c.req('POST', '/api/v1/attempts', b.A, { events: [theirs] })).json().accepted,
      ).toHaveLength(1);
      const mine = { ...ev(a.profileId, type, resp), id: theirs.id };
      const r = (await c.req('POST', '/api/v1/attempts', a.A, { events: [mine] })).json();
      expect(r.duplicates, type).toEqual([]);
      expect(r.rejected, type).toEqual([
        expect.objectContaining({ id: theirs.id, code: 'conflit_identifiant' }),
      ]);
      // le même événement renvoyé par son propre profil reste un doublon ordinaire
      expect(
        (await c.req('POST', '/api/v1/attempts', b.A, { events: [theirs] })).json().duplicates,
      ).toEqual([theirs.id]);
    }
  });
});
