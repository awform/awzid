/**
 * Audit MIN-16 : les enregistrements locaux de plus de 7 jours sont effacés même si l'écran de récitation
 * n'est jamais rouvert (démarrage de l'application, activation du service worker).
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTests, getAll, putRaw } from './idb';
import { KEEP_DAYS, purgeOldRecordings } from './recordings';

const rec = (id: string, profileId: string, days: number, now: number) => ({
  id,
  profileId,
  part: '112:1-4',
  createdAt: new Date(now - days * 86_400_000).toISOString(),
  mime: 'audio/webm',
  blob: null,
});

describe('audit MIN-16 — enregistrements locaux', () => {
  beforeEach(() => {
    // base IndexedDB neuve à chaque test
    globalThis.indexedDB = new IDBFactory();
    _resetDbForTests();
  });

  it('efface les enregistrements échus de TOUS les profils, sans ouvrir l’écran', async () => {
    const now = Date.now();
    await putRaw('recordings', rec('a', 'p1', KEEP_DAYS + 1, now));
    await putRaw('recordings', rec('b', 'p2', KEEP_DAYS + 3, now));
    await putRaw('recordings', rec('c', 'p1', 1, now));
    expect(await purgeOldRecordings(now)).toBe(2);
    const left = await getAll<{ id: string }>('recordings');
    expect(left.map((r) => r.id)).toEqual(['c']);
  });

  it('la purge tourne au démarrage de l’application et à l’activation du service worker', () => {
    const layout = readFileSync(new URL('../routes/+layout.svelte', import.meta.url), 'utf8');
    const sw = readFileSync(new URL('../service-worker.ts', import.meta.url), 'utf8');
    expect(layout).toMatch(/purgeOldRecordings\(/);
    expect(sw).toMatch(/activate[\s\S]*purgeOldRecordings\(/);
  });
});
