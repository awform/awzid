/** Complément E — paiement simulé : opérateur du mobile money transmis seulement s'il est choisi. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATEURS, simulate } from './billing';

const ID = '00000000-0000-4000-8000-000000000009';

describe('simulate', () => {
  afterEach(() => vi.unstubAllGlobals());
  const body = async (fn: () => Promise<unknown>) => {
    const f = vi.fn(async () => new Response('{"resultat":"traite"}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await fn();
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe(`/api/v1/billing/simulate/${ID}`);
    return JSON.parse(String(init.body));
  };
  it('carte (simulée) : résultat seul ; mobile money : opérateur choisi', async () => {
    expect(await body(() => simulate(ID, 'succes'))).toEqual({ resultat: 'succes' });
    expect(await body(() => simulate(ID, 'echec', 'orange_money'))).toEqual({
      resultat: 'echec',
      operateur: 'orange_money',
    });
    expect(OPERATEURS).toEqual(['wave', 'orange_money']);
  });
});
