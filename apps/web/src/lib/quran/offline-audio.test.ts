import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Lot 27 : le service worker efface, à chaque mise à jour de l'application, les caches qui ne sont pas le
 * sien ; les sourates gardées par l'utilisateur (cache « awzid-coran-audio-… ») doivent y survivre.
 */
describe('audio hors ligne et mise à jour de l’application', () => {
  it('le service worker garde le cache audio du Coran', () => {
    const sw = readFileSync(new URL('../../service-worker.ts', import.meta.url), 'utf8');
    const audio = readFileSync(new URL('./offline-audio.ts', import.meta.url), 'utf8');
    const name = /const CACHE = '([^']+)'/.exec(audio)?.[1] ?? '';
    expect(name.startsWith('awzid-coran-audio')).toBe(true);
    expect(sw).toMatch(/startsWith\('awzid-coran-audio'\)/);
  });
});
