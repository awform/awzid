/** Suite V1-b — tableau de bord « école » : route appelée. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSynthese } from './ecole';

describe('synthèse école — appel', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loadSynthese : GET /ecole/synthese', async () => {
    const f = vi.fn(async () => new Response('{"classes":[],"totaux":{}}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    const r = await loadSynthese();
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe('/api/v1/ecole/synthese');
    expect(init.method).toBe('GET');
    expect(r.ok).toBe(true);
  });
});
