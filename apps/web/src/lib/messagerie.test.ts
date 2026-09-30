/** Lot 21 — messagerie encadrée et visio : chaque appel vise la bonne route de l'API, avec la bonne méthode. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as m from './messagerie';

const U = '00000000-0000-4000-8000-000000000001';
const P = '00000000-0000-4000-8000-000000000002';

describe('lot 21 — appels de la messagerie', () => {
  afterEach(() => vi.unstubAllGlobals());

  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    ['familyMessages', () => m.familyMessages(), 'GET', '/api/v1/famille/messages', undefined],
    [
      'classMessages',
      () => m.classMessages(U),
      'GET',
      `/api/v1/ecole/classes/${U}/messages`,
      undefined,
    ],
    ['readThread', () => m.readThread(U), 'GET', `/api/v1/fils/${U}`, undefined],
    [
      'replyThread',
      () => m.replyThread(U, 'a'),
      'POST',
      `/api/v1/fils/${U}/messages`,
      { texte: 'a' },
    ],
    [
      'announce',
      () => m.announce(U, 'b'),
      'POST',
      `/api/v1/ecole/classes/${U}/annonces`,
      { texte: 'b' },
    ],
    [
      'writeToFamily',
      () => m.writeToFamily(U, P, 'c'),
      'POST',
      `/api/v1/ecole/classes/${U}/eleves/${P}/messages`,
      { texte: 'c' },
    ],
    ['report', () => m.report(U, 'x'), 'POST', `/api/v1/messages/${U}/signaler`, { motif: 'x' }],
    ['profileVisios', () => m.profileVisios(P), 'GET', `/api/v1/profiles/${P}/visios`, undefined],
    ['classVisios', () => m.classVisios(U), 'GET', `/api/v1/ecole/classes/${U}/visios`, undefined],
    [
      'planVisio',
      () =>
        m.planVisio(U, {
          titre: 't',
          debut: '2026-10-01T10:00:00Z',
          dureeMin: 45,
          url: 'https://meet.jit.si/x',
        }),
      'POST',
      `/api/v1/ecole/classes/${U}/visios`,
      { titre: 't', debut: '2026-10-01T10:00:00Z', dureeMin: 45, url: 'https://meet.jit.si/x' },
    ],
    ['cancelVisio', () => m.cancelVisio(U), 'POST', `/api/v1/ecole/visios/${U}/annuler`, {}],
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
