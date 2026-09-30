/** Lot 23 — codes d'activation : routes appelées et fichier pour l'imprimeur. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as a from './activation';

describe('lot 23 — activation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('printerCsv : une ligne par code, en-tête, fins de ligne CRLF', () => {
    expect(a.printerCsv('en1', 12, ['AWZ-1', 'AWZ-2'])).toBe(
      'niveau;mois;code\r\nen1;12;AWZ-1\r\nen1;12;AWZ-2\r\n',
    );
  });
  const L = '00000000-0000-4000-8000-000000000009';
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    ['myAccess', () => a.myAccess(), 'GET', '/api/v1/activation', undefined],
    ['redeem', () => a.redeem('AWZ-X'), 'POST', '/api/v1/activation', { code: 'AWZ-X' }],
    ['listLots', () => a.listLots(), 'GET', '/api/v1/admin/activation/lots', undefined],
    [
      'createLot',
      () => a.createLot({ niveau: 'en1', quantite: 2, mois: 12, libelle: 'x' }),
      'POST',
      '/api/v1/admin/activation/lots',
      { niveau: 'en1', quantite: 2, mois: 12, libelle: 'x' },
    ],
    ['revokeLot', () => a.revokeLot(L), 'POST', `/api/v1/admin/activation/lots/${L}/revoquer`, {}],
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
