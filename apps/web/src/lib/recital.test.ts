/** Suite V1-b — récital de hifẓ : choix restants, compteurs par défaut, routes appelées. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as r from './recital';

const C = '00000000-0000-4000-8000-000000000001';
const R = '00000000-0000-4000-8000-000000000002';
const E = '00000000-0000-4000-8000-000000000003';
const P = '00000000-0000-4000-8000-000000000004';

describe('récital (fonctions pures)', () => {
  it('choicesLeft : passages du carnet non tirés', () => {
    const all = ['114:1-6', '113:1-5', '112:1-4'].map((passage) => ({ passage, libelle: passage }));
    expect(r.choicesLeft(all, { tires: [all[0]!, all[2]!] }).map((x) => x.passage)).toEqual([
      '113:1-5',
    ]);
  });
  it('emptyCounters : aucun relevé, fluidité pleine ; sept compteurs du barème', () => {
    expect(r.emptyCounters()).toEqual({
      aides: 0,
      hesitations: 0,
      sauts: 0,
      oublis: 0,
      claires: 0,
      discretes: 0,
      fluidite: 4,
    });
    expect(r.COMPTEURS).toHaveLength(7);
  });
});

describe('récital — appels', () => {
  afterEach(() => vi.unstubAllGlobals());
  const k = r.emptyCounters();
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    [
      'classRecitals',
      () => r.classRecitals(C),
      'GET',
      `/api/v1/ecole/classes/${C}/recitals`,
      undefined,
    ],
    [
      'planRecital',
      () => r.planRecital(C, { titre: 'Récital', jour: '2026-06-20' }),
      'POST',
      `/api/v1/ecole/classes/${C}/recitals`,
      { titre: 'Récital', jour: '2026-06-20' },
    ],
    [
      'drawFor',
      () => r.drawFor(R, P, 'renforce'),
      'POST',
      `/api/v1/ecole/recitals/${R}/tirages`,
      { pupilId: P, parcours: 'renforce' },
    ],
    [
      'scoreEntry',
      () => r.scoreEntry(R, E, { choix: null, compteurs: k, secondJury: false }),
      'PUT',
      `/api/v1/ecole/recitals/${R}/tirages/${E}`,
      { choix: null, compteurs: k, secondJury: false },
    ],
    [
      'publishRecital',
      () => r.publishRecital(R),
      'POST',
      `/api/v1/ecole/recitals/${R}/publier`,
      {},
    ],
    ['cancelRecital', () => r.cancelRecital(R), 'POST', `/api/v1/ecole/recitals/${R}/annuler`, {}],
    [
      'familyRecitals',
      () => r.familyRecitals(P),
      'GET',
      `/api/v1/profiles/${P}/recitals`,
      undefined,
    ],
  ];
  it.each(cases)('%s', async (_n, fn, method, url, body) => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await fn();
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe(url);
    expect(init.method).toBe(method);
    expect(init.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(body);
  });
});
