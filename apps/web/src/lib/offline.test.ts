import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTests, count } from './idb';
import {
  addBytes,
  downloadPack,
  localPack,
  localUnit,
  localUnits,
  monthBytes,
  removePack,
  updatePack,
} from './offline';
import { flushQueue, pendingCount, queueEvent, uuidv7, BATCH } from './sync-core';

function unit(id: string, n: number, sha: string) {
  return {
    id,
    n,
    kind: 'lecon',
    numLecon: n,
    numBilan: null,
    titleAr: 'عنوان',
    titleFr: `Leçon ${n}`,
    levelCode: id.split('.')[0],
    sha256: sha,
    lesson: { titre_ar: 'عنوان', mots: [{ ar: 'بَابٌ', fr: 'porte', img: 'door' }] },
    exercises: [],
  };
}
const ILL = {
  door: { viewBox: '0 0 120 120', svg: '<rect/>' },
  youssouf: { viewBox: '0 0 100 130', svg: '<g/>' },
};

/** Faux serveur : paquets, manifeste, leçons à l'unité ; compte les requêtes. */
function server(state: {
  units: Record<string, ReturnType<typeof unit>[]>;
  hash: Record<string, string>;
}) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (url === '/api/v1/packs')
      return json({
        packs: Object.entries(state.units).map(([level, us]) => ({
          level,
          titleFr: level,
          codeFr: level.toUpperCase(),
          hash: state.hash[level],
          units: us.map((u) => ({ id: u.id, sha256: u.sha256, brotliBytes: 1000 })),
          illustrations: 2,
          rawBytes: 50_000,
          bytes: 10_000,
        })),
      });
    const pm = /\/api\/v1\/packs\/(\w+)$/.exec(url);
    if (pm)
      return json({
        edition: 'e1',
        level: pm[1],
        hash: state.hash[pm[1]!],
        units: state.units[pm[1]!],
        illustrations: ILL,
      });
    const um = /\/api\/v1\/units\/(.+)$/.exec(url);
    if (um) {
      const u = Object.values(state.units)
        .flat()
        .find((x) => x.id === decodeURIComponent(um[1]!));
      return json({ unit: u, illustrations: { door: ILL.door } });
    }
    return new Response('introuvable', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

beforeEach(async () => {
  // base IndexedDB neuve à chaque test
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('paquets de niveau', () => {
  it('téléchargement complet, lecture locale, liste dans l’ordre du livre', async () => {
    const s = server({
      units: { en1: [unit('en1.l02', 2, 'b'), unit('en1.l01', 1, 'a')] },
      hash: { en1: 'h1' },
    });
    await downloadPack('en1', s.fetchFn);
    expect((await localPack('en1'))?.hash).toBe('h1');
    const u = await localUnit('en1.l01');
    expect(u?.unit.titleFr).toBe('Leçon 1');
    expect(Object.keys(u?.illustrations ?? {}).sort()).toEqual(['door', 'youssouf']);
    expect((await localUnits('en1')).map((x) => x.id)).toEqual(['en1.l01', 'en1.l02']);
    expect(await monthBytes()).toBeGreaterThan(0);
  });

  it('mise à jour DIFFÉRENTIELLE : seules les leçons modifiées sont retéléchargées', async () => {
    const state = {
      units: { en1: [unit('en1.l01', 1, 'a'), unit('en1.l02', 2, 'b'), unit('en1.l03', 3, 'c')] },
      hash: { en1: 'h1' },
    };
    const s = server(state);
    await downloadPack('en1', s.fetchFn);
    expect((await updatePack('en1', s.fetchFn)).mode).toBe('a_jour');
    state.units.en1[1] = unit('en1.l02', 2, 'b2');
    state.hash.en1 = 'h2';
    s.calls.length = 0;
    const r = await updatePack('en1', s.fetchFn);
    expect(r).toEqual({ mode: 'partiel', changed: ['en1.l02'] });
    expect(s.calls.filter((c) => c.includes('/packs/en1'))).toEqual([]);
    expect(s.calls).toContain('/api/v1/units/en1.l02');
    expect((await localPack('en1'))?.hash).toBe('h2');
  });

  it('« libérer de la place » : supprime le niveau, garde les illustrations partagées', async () => {
    const s = server({
      units: { en1: [unit('en1.l01', 1, 'a')], ad1: [unit('ad1.l01', 1, 'x')] },
      hash: { en1: 'h', ad1: 'k' },
    });
    await downloadPack('en1', s.fetchFn);
    await downloadPack('ad1', s.fetchFn);
    await removePack('en1');
    expect(await localPack('en1')).toBeUndefined();
    expect(await localUnit('en1.l01')).toBeNull();
    expect((await localUnit('ad1.l01'))?.illustrations.door).toBeDefined();
    await removePack('ad1');
    expect(await count('illus')).toBe(0);
  });

  it('compteur de données du mois', async () => {
    await addBytes(1500);
    await addBytes(500);
    expect(await monthBytes()).toBe(2000);
  });
});

describe('synchronisation différée sans conflit', () => {
  const ev = {
    profileId: 'p',
    unitId: 'en1.l01',
    eventType: 'reponse' as const,
    response: { value: true },
  };

  it('UUIDv7 : version 7, ordonné dans le temps', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });

  it('hors ligne : rien ne se perd ; au retour du réseau, tout part et la file se vide', async () => {
    await queueEvent(ev);
    await queueEvent(ev);
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const r1 = await flushQueue(offline);
    expect(r1).toMatchObject({ offline: true, remaining: 2 });
    const seen: string[][] = [];
    const ok = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const { events } = JSON.parse(String(init?.body)) as { events: Array<{ id: string }> };
      seen.push(events.map((e) => e.id));
      return new Response(
        JSON.stringify({
          accepted: events.map((e) => ({ id: e.id, correct: true })),
          duplicates: [],
          rejected: [],
          progress: { 'en1.l01': { status: 'commencee', score: 1, bestScore: 1 } },
        }),
      );
    }) as typeof fetch;
    const r2 = await flushQueue(ok);
    expect(r2).toMatchObject({ sent: 2, remaining: 0, offline: false });
    expect(r2.progress['en1.l01']?.status).toBe('commencee');
    expect(seen[0]).toEqual([...seen[0]!].sort()); // ordre chronologique
  });

  it('doublons et refus définitifs retirés de la file ; envois par lots', async () => {
    for (let i = 0; i < BATCH + 5; i++) await queueEvent(ev);
    let posts = 0;
    const fetchFn = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      posts++;
      const { events } = JSON.parse(String(init?.body)) as { events: Array<{ id: string }> };
      const [first, ...rest] = events;
      return new Response(
        JSON.stringify({
          accepted: [],
          duplicates: rest.map((e) => e.id),
          rejected: first ? [{ id: first.id, reason: 'empreinte' }] : [],
        }),
      );
    }) as typeof fetch;
    const r = await flushQueue(fetchFn);
    expect(posts).toBe(2);
    expect(r).toMatchObject({ rejected: 2, remaining: 0 });
    expect(await pendingCount()).toBe(0);
  });

  it('erreur serveur : la file est gardée pour plus tard', async () => {
    await queueEvent(ev);
    const r = await flushQueue((async () => new Response('x', { status: 503 })) as typeof fetch);
    expect(r.remaining).toBe(1);
  });
});
