/**
 * Lot F1 (revue E5) : une réponse refusée par le serveur n'est plus jamais jetée — mise de côté sur
 * l'appareil avec le motif, renvoyée plus tard, signalable (résumé sans contenu) ; chaque événement porte
 * l'édition du contenu et la version de son format.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDbForTests, kvSet } from './idb';
import {
  ASIDE_RETRY_MS,
  EVENT_FORMAT,
  flushQueue,
  pendingCount,
  queueEvent,
  reportSetAside,
  retrySetAside,
  setAside,
  type SetAside,
} from './sync-core';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

const ev = {
  profileId: 'p',
  unitId: 'en1.l01',
  eventType: 'reponse' as const,
  exerciseId: 'en1.l01.ex1',
  exerciseHash: 'h',
  itemIndex: 0,
  response: { value: true },
  edition: 'prod-123',
};

/** faux serveur : refuse les événements dont l'id est dans `refuse`, accepte les autres */
function server(refuse: Set<string>, calls: Array<{ url: string; body: unknown }> = []) {
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { events?: Array<{ id: string }> };
    calls.push({ url: String(u), body });
    if (String(u).endsWith('/sync/rejets')) return new Response('{"ok":true}', { status: 202 });
    const events = body.events ?? [];
    return new Response(
      JSON.stringify({
        accepted: events.filter((e) => !refuse.has(e.id)).map((e) => ({ id: e.id, correct: true })),
        duplicates: [],
        rejected: events
          .filter((e) => refuse.has(e.id))
          .map((e) => ({ id: e.id, reason: 'empreinte différente', code: 'version_inconnue' })),
      }),
    );
  }) as typeof fetch;
}

describe('lot F1 — réponses refusées mises de côté', () => {
  it('l’événement porte l’édition et la version du format', async () => {
    const e = await queueEvent(ev);
    expect(e).toMatchObject({ edition: 'prod-123', v: EVENT_FORMAT });
  });

  it('refusé hors ligne puis au retour du réseau : gardé sur l’appareil avec le motif, la file continue', async () => {
    const bad = await queueEvent(ev);
    await queueEvent(ev);
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await flushQueue(offline)).toMatchObject({ offline: true, remaining: 2, setAside: 0 });
    const r = await flushQueue(server(new Set([bad.id])));
    expect(r).toMatchObject({ sent: 1, rejected: 1, remaining: 0, setAside: 1 });
    expect(await pendingCount()).toBe(0);
    const [s] = await setAside();
    expect(s).toMatchObject({ reason: 'empreinte différente', code: 'version_inconnue', tries: 1 });
    expect(s?.ev).toEqual(bad); // l'événement complet, intact
  });

  it('nouvel essai automatique après le délai, accepté → retiré ; « Réessayer » force l’envoi', async () => {
    const bad = await queueEvent(ev);
    await flushQueue(server(new Set([bad.id])));
    // avant le délai : pas de nouvel essai
    const calls: Array<{ url: string; body: unknown }> = [];
    await flushQueue(server(new Set(), calls));
    expect(calls).toHaveLength(0);
    // délai passé : renvoyé ; le serveur l'accepte maintenant (édition publiée entre-temps)
    const old = new Date(Date.now() - ASIDE_RETRY_MS - 1000).toISOString();
    await kvSet(
      'syncSetAside',
      (await setAside()).map((s) => ({ ...s, lastTry: old })),
    );
    await flushQueue(server(new Set(), calls));
    expect(calls).toHaveLength(1);
    expect(await setAside()).toEqual([]);
    // « Réessayer » (forcé) : refusé encore → gardé, essai compté
    const bad2 = await queueEvent(ev);
    await flushQueue(server(new Set([bad2.id])));
    expect(await retrySetAside(server(new Set([bad2.id])), '', true)).toBe(1);
    expect((await setAside())[0]?.tries).toBe(2);
  });

  it('« Signaler » : résumé (nombre, motifs, édition) sans le contenu des réponses ; événements gardés', async () => {
    const bad = await queueEvent(ev);
    await flushQueue(server(new Set([bad.id])));
    const calls: Array<{ url: string; body: unknown }> = [];
    expect(await reportSetAside(server(new Set(), calls))).toBe(true);
    expect(calls[0]?.url).toContain('/api/v1/sync/rejets');
    expect(calls[0]?.body).toEqual({
      count: 1,
      reasons: { 'empreinte différente': 1 },
      edition: 'prod-123',
    });
    expect(JSON.stringify(calls[0]?.body)).not.toContain('value');
    const kept: SetAside[] = await setAside();
    expect(kept).toHaveLength(1);
    expect(kept[0]?.reported).toBe(true);
  });

  it('réponses d’un autre compte de l’appareil : jamais mises de côté ni effacées (audit OFF-3 inchangé)', async () => {
    await queueEvent(ev);
    const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const { events } = JSON.parse(String(init?.body)) as { events: Array<{ id: string }> };
      return new Response(
        JSON.stringify({
          accepted: [],
          duplicates: [],
          rejected: events.map((e) => ({ id: e.id, reason: 'profil', code: 'autre_compte' })),
        }),
      );
    });
    const r = await flushQueue(f as unknown as typeof fetch);
    expect(r).toMatchObject({ remaining: 1, setAside: 0 });
  });
});
