/**
 * Audit OFF-3 — appareil partagé : à la déconnexion, les voix et les cartes de A sont effacées, ses réponses
 * non envoyées sont gardées ; la connexion de B ne détruit plus la file de A.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDbForTests, count, kvGet, kvSet, putRaw } from './idb';
import { logout } from './session';
import { flushQueue, pendingCount, queueEvent } from './sync-core';

const ev = {
  profileId: 'pA',
  unitId: 'en1.l01',
  eventType: 'reponse' as const,
  response: { value: true },
};

describe('audit OFF-3 — appareil partagé', () => {
  beforeEach(() => {
    // base IndexedDB neuve à chaque test
    globalThis.indexedDB = new IDBFactory();
    _resetDbForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('la session de B garde les réponses de A (refus « autre compte ») au lieu de les effacer', async () => {
    for (let i = 0; i < 5; i++) await queueEvent(ev);
    const b = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const { events } = JSON.parse(String(init?.body)) as { events: Array<{ id: string }> };
      return new Response(
        JSON.stringify({
          accepted: [],
          duplicates: [],
          rejected: events.map((e) => ({
            id: e.id,
            reason: 'profil non autorisé',
            code: 'autre_compte',
          })),
        }),
      );
    }) as typeof fetch;
    const r = await flushQueue(b);
    expect(r).toMatchObject({ sent: 0, rejected: 0, remaining: 5 });
    expect(await pendingCount()).toBe(5);
  });

  it('déconnexion : envoi tenté d’abord, voix et cartes effacées, réponses non envoyées gardées et comptées', async () => {
    await queueEvent(ev);
    await putRaw('recordings', {
      id: 'r1',
      profileId: 'pA',
      part: '112:1-4',
      createdAt: new Date().toISOString(),
      mime: 'audio/webm',
      blob: null,
    });
    await kvSet('cards:pA', { x: 1 });
    await kvSet('recLocal:pA', true);
    await kvSet('me', { account: { id: 'A' } });
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: RequestInfo | URL) => {
      urls.push(String(u));
      if (String(u).includes('/attempts')) throw new TypeError('Failed to fetch');
      return new Response('{}');
    });
    const r = await logout();
    expect(urls[0]).toContain('/api/v1/attempts'); // l'envoi est tenté avant la déconnexion
    expect(r.pending).toBe(1);
    expect(await count('recordings')).toBe(0);
    expect(await kvGet('cards:pA')).toBeUndefined();
    expect(await kvGet('recLocal:pA')).toBeUndefined();
    expect(await kvGet('me')).toBeNull();
    expect(await pendingCount()).toBe(1);
  });
});
