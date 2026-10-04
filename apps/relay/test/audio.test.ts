/**
 * Lot 27 — relais d'école et audio du Coran : préchargement des récitateurs choisis par l'école (empreintes
 * vérifiées), lecture sur le Wi-Fi SANS Internet (Range), coupure d'un récitateur propagée (fichiers effacés),
 * listes et manifestes mis en copie. Fichiers d'essai : octets quelconques, aucun son, aucune récitation.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioCache } from '../src/audio.js';
import { buildRelay, type Relay } from '../src/relay.js';
import { RelayStore } from '../src/store.js';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const FILES = new Map<string, Buffer>();
for (let v = 1; v <= 3; v++) {
  const b = randomBytes(1000 + v);
  FILES.set(`essai-hafs/112${String(v).padStart(3, '0')}-${sha(b).slice(0, 16)}.wav`, b);
}
const bad = randomBytes(500);
const BAD = `essai-qalun/001001-${sha(bad).slice(0, 16)}.wav`;

describe('relais d’école : audio du Coran', () => {
  let central: FastifyInstance;
  let url = '';
  let down = false;
  let chosen = ['essai-hafs', 'essai-qalun'];
  let relay: Relay;
  let audio: AudioCache;
  let store: RelayStore;

  beforeAll(async () => {
    central = Fastify();
    central.addHook('onRequest', async (_req, reply) => {
      if (down) {
        reply.raw.destroy();
        return reply;
      }
    });
    central.get('/api/v1/health', async () => ({ status: 'ok' }));
    central.get('/api/v1/relais/quran-audio', async (req, reply) => {
      if (req.headers['x-relais-jeton'] !== 'rel_essai') return reply.code(401).send({});
      const reciters = [];
      if (chosen.includes('essai-hafs'))
        reciters.push({
          id: 'essai-hafs',
          files: [...FILES].map(([path, b]) => ({
            path,
            url: `/api/v1/quran/audio/file/${path}`,
            bytes: b.length,
            sha256: sha(b),
          })),
        });
      if (chosen.includes('essai-qalun'))
        // empreinte annoncée fausse : le fichier reçu doit être refusé
        reciters.push({
          id: 'essai-qalun',
          files: [
            {
              path: BAD,
              url: `/api/v1/quran/audio/file/${BAD}`,
              bytes: 500,
              sha256: 'f'.repeat(64),
            },
          ],
        });
      return { reciters };
    });
    central.get<{ Params: { id: string; file: string } }>(
      '/api/v1/quran/audio/file/:id/:file',
      async (req, reply) => {
        const p = `${req.params.id}/${req.params.file}`;
        const b = FILES.get(p) ?? (p === BAD ? bad : null);
        if (!b) return reply.code(404).send({});
        return reply.header('content-type', 'audio/wav').send(b);
      },
    );
    central.get('/api/v1/quran/audio/reciters', async (_q, r) =>
      r.header('cache-control', 'public, max-age=300').send({ reciters: [{ id: 'essai-hafs' }] }),
    );
    await central.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(central.server.address() as { port: number }).port}`;
    const dir = mkdtempSync(join(tmpdir(), 'relais-audio-'));
    store = new RelayStore(dir, randomBytes(32));
    audio = new AudioCache(join(dir, 'audio'));
    relay = buildRelay({ upstream: url, token: 'rel_essai', store, audio, timeoutMs: 2000 });
    await relay.app.ready();
  });
  afterAll(async () => {
    await relay?.app.close();
    store?.close();
    await central?.close();
  });

  it('préchargement : fichiers téléchargés et vérifiés ; empreinte fausse refusée', async () => {
    await relay.checkOnline();
    const r = (await relay.syncAudio())!;
    expect(r).toMatchObject({ telecharges: 3, erreurs: 1, fichiers: 3 });
    expect(r.octets).toBe([...FILES.values()].reduce((n, b) => n + b.length, 0));
    expect(audio.file(BAD)).toBeNull();
    // deuxième passage : rien à refaire (sauf le fichier refusé)
    expect(await relay.syncAudio()).toMatchObject({ telecharges: 0, erreurs: 1 });
    const etat = (await relay.app.inject({ method: 'GET', url: '/relais/etat.json' })).json();
    expect(etat.audio).toMatchObject({ fichiers: 3 });
  });

  it('liste des récitateurs mise en copie ; fichiers servis SANS Internet, lecture partielle', async () => {
    await relay.app.inject({ method: 'GET', url: '/api/v1/quran/audio/reciters' });
    down = true;
    await relay.checkOnline();
    const l = await relay.app.inject({ method: 'GET', url: '/api/v1/quran/audio/reciters' });
    expect(l.headers['x-awform-relais']).toBe('copie');
    expect(l.json().reciters[0].id).toBe('essai-hafs');
    const [path, b] = [...FILES][0]!;
    const full = await relay.app.inject({ method: 'GET', url: `/api/v1/quran/audio/file/${path}` });
    expect(full.statusCode).toBe(200);
    expect(full.headers['x-awform-relais']).toBe('copie-audio');
    expect(full.rawPayload.equals(b)).toBe(true);
    const part = await relay.app.inject({
      method: 'GET',
      url: `/api/v1/quran/audio/file/${path}`,
      headers: { range: 'bytes=10-19' },
    });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 10-19/${b.length}`);
    expect(part.rawPayload.equals(b.subarray(10, 20))).toBe(true);
    // fichier absent de la copie, sans Internet : « hors ligne »
    const miss = await relay.app.inject({ method: 'GET', url: `/api/v1/quran/audio/file/${BAD}` });
    expect(miss.statusCode).toBe(503);
    down = false;
  });

  it('coupure : un récitateur retiré du choix (ou retiré par l’équipe) est effacé de la copie', async () => {
    chosen = [];
    await relay.checkOnline();
    const r = (await relay.syncAudio())!;
    expect(r).toMatchObject({ effaces: 3, fichiers: 0, octets: 0 });
    const [path] = [...FILES][0]!;
    expect(existsSync(join(audio.dir, path))).toBe(false);
    expect(existsSync(join(audio.dir, 'essai-hafs'))).toBe(false);
  });

  it('sans jeton : pas de préchargement', async () => {
    const r2 = buildRelay({ upstream: url, token: null, store, audio });
    await r2.checkOnline();
    expect(await r2.syncAudio()).toBeNull();
    await r2.app.close();
  });
});
