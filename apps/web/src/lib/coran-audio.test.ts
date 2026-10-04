/** Lot 27 — client typé de l'audio du Coran : routes appelées, code parent, quota hors ligne. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as a from './coran-audio';

const P = '00000000-0000-4000-8000-000000000004';
const C = '00000000-0000-4000-8000-000000000001';

describe('audio du Coran — appels', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    ['reciters', () => a.reciters(), 'GET', '/api/v1/quran/audio/reciters', undefined],
    [
      'packIndex',
      () => a.packIndex('ayyoub-hafs'),
      'GET',
      '/api/v1/quran/audio/reciters/ayyoub-hafs/packs',
      undefined,
    ],
    [
      'suraPack',
      () => a.suraPack('ayyoub-hafs', 112),
      'GET',
      '/api/v1/quran/audio/reciters/ayyoub-hafs/packs/112',
      undefined,
    ],
    [
      'profileReciters',
      () => a.profileReciters(P, 'memoriser'),
      'GET',
      `/api/v1/profiles/${P}/quran/reciters?mode=memoriser`,
      undefined,
    ],
    [
      'profileSuraTracks',
      () => a.profileSuraTracks(P, 1, 'huthify-qalun'),
      'GET',
      `/api/v1/profiles/${P}/quran/suras/1/tracks?recitateur=huthify-qalun&mode=ecouter`,
      undefined,
    ],
    [
      'setPreference',
      () => a.setPreference(P, 'ayyoub-hafs'),
      'PUT',
      `/api/v1/profiles/${P}/quran/reciter`,
      { reciterId: 'ayyoub-hafs' },
    ],
    [
      'parentAllowed',
      () => a.parentAllowed(P),
      'GET',
      `/api/v1/profiles/${P}/quran/allowed-reciters`,
      undefined,
    ],
    [
      'setParentAllowed',
      () => a.setParentAllowed(P, null, '4821'),
      'PUT',
      `/api/v1/profiles/${P}/quran/allowed-reciters`,
      { reciters: null },
    ],
    [
      'classAllowed',
      () => a.classAllowed(C),
      'GET',
      `/api/v1/teacher/classes/${C}/quran/allowed-reciters`,
      undefined,
    ],
    [
      'setClassAllowed',
      () => a.setClassAllowed(C, ['ayyoub-hafs']),
      'PUT',
      `/api/v1/teacher/classes/${C}/quran/allowed-reciters`,
      { reciters: ['ayyoub-hafs'] },
    ],
  ];
  it.each(cases)('%s', async (_n, fn, method, url, body) => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await fn();
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe(url);
    expect(init.method).toBe(method);
    if (body !== undefined) expect(JSON.parse(String(init.body))).toEqual(body);
  });
  it('code parent transmis pour la liste autorisée', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await a.setParentAllowed(P, ['ayyoub-hafs'], '4821');
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-parent-pin']).toBe('4821');
  });
});

describe('quota hors ligne', () => {
  const index = {
    suras: [
      { sura: 1, files: 7, bytes: 300, durationMs: 1, hash: 'h1', url: '' },
      { sura: 112, files: 4, bytes: 200, durationMs: 1, hash: 'h112', url: '' },
      { sura: 113, files: 5, bytes: 250, durationMs: 1, hash: 'h113', url: '' },
    ],
  };
  it('prend les sourates dans l’ordre tant qu’elles tiennent ; ignore celles déjà présentes', () => {
    expect(a.packsWithinQuota(index, [1, 112, 113], 600)).toEqual({
      take: [1, 112],
      bytes: 500,
      skipped: [113],
    });
    expect(a.packsWithinQuota(index, [1, 112, 113], 600, { 1: 'h1' })).toEqual({
      take: [112, 113],
      bytes: 450,
      skipped: [],
    });
    // empreinte changée : à retélécharger
    expect(a.packsWithinQuota(index, [1], 600, { 1: 'ancien' }).take).toEqual([1]);
  });
});
