/** Lot 22 — carnet de pratique et suivi des sourates : semaines, routes appelées, code parent en en-tête. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as c from './carnet';

const P = '00000000-0000-4000-8000-000000000002';
const K = '00000000-0000-4000-8000-000000000003';

describe('lot 22 — carnet (fonctions pures)', () => {
  it('mondayLocal : lundi de la semaine, et semaines précédentes', () => {
    expect(c.mondayLocal(new Date(2026, 8, 30, 10))).toBe('2026-09-28'); // mercredi
    expect(c.mondayLocal(new Date(2026, 9, 4, 10))).toBe('2026-09-28'); // dimanche
    expect(c.mondayLocal(new Date(2026, 8, 28, 10), 1)).toBe('2026-09-21');
  });
  it('unitOfExercise', () => {
    expect(c.unitOfExercise('re1.l04.ex12')).toBe('re1.l04');
  });
});

describe('lot 22 — appels', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    [
      'loadCarnets',
      () => c.loadCarnets(P, 're1.l04', '2026-09-28'),
      'GET',
      `/api/v1/profiles/${P}/carnet?unit=re1.l04&week=2026-09-28`,
      undefined,
    ],
    [
      'checkBox',
      () => c.checkBox(P, 're1.l04.ex2', { week: '2026-09-28', line: 1, day: 2, checked: true }),
      'PUT',
      `/api/v1/profiles/${P}/carnet/re1.l04.ex2`,
      { week: '2026-09-28', line: 1, day: 2, checked: true },
    ],
    [
      'signWeek',
      () => c.signWeek(P, 're1.l04.ex2', '2026-09-28', '4821'),
      'POST',
      `/api/v1/profiles/${P}/carnet/re1.l04.ex2/signer`,
      { week: '2026-09-28' },
    ],
    ['loadSuras', () => c.loadSuras(P), 'GET', `/api/v1/profiles/${P}/sourates`, undefined],
    [
      'setSuraStep',
      () => c.setSuraStep(P, 112, 'repete'),
      'PUT',
      `/api/v1/profiles/${P}/sourates/112`,
      { etape: 'repete' },
    ],
    ['classSuras', () => c.classSuras(K), 'GET', `/api/v1/ecole/classes/${K}/sourates`, undefined],
    [
      'validateSura',
      () => c.validateSura(K, P, 112),
      'POST',
      `/api/v1/ecole/classes/${K}/eleves/${P}/sourates/112/valider`,
      {},
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
    if (_n === 'signWeek')
      expect((init.headers as Record<string, string>)['x-parent-pin']).toBe('4821');
  });
});
