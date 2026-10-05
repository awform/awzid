/**
 * Chantier A3 : le relais d'école garde l'audio des leçons au premier passage, puis le sert sans Internet ;
 * la liste des fichiers d'un niveau est mise en copie comme les autres contenus publics.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRelay, CACHEABLE, type Relay } from '../src/relay.js';
import { RelayStore } from '../src/store.js';

const SHA = 'a'.repeat(40);
const MP3 = Buffer.alloc(2000, 7);

describe('A3 — relais : audio des leçons', () => {
  let central: FastifyInstance;
  let relay: Relay;
  let store: RelayStore;
  let dir: string;
  let hits = 0;
  beforeAll(async () => {
    central = Fastify();
    central.get('/api/v1/health', async () => ({ ok: true }));
    central.get('/api/v1/lecons-audio/fichiers/:f', async (_q, r) => {
      hits++;
      return r.header('content-type', 'audio/mpeg').send(MP3);
    });
    await central.listen({ port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${(central.server.address() as { port: number }).port}`;
    dir = mkdtempSync(join(tmpdir(), 'relais-lecons-'));
    store = new RelayStore(dir, randomBytes(32));
    relay = buildRelay({
      upstream: url,
      token: null,
      store,
      leconsAudioDir: join(dir, 'lecons-audio'),
      timeoutMs: 2000,
    });
    await relay.app.ready();
    await relay.checkOnline();
  });
  afterAll(async () => {
    await relay?.app.close();
    store?.close();
    await central?.close();
  });

  it('liste d’un niveau mise en copie (contenu public)', () => {
    expect(CACHEABLE.test('/api/v1/lecons-audio/niveaux/en1')).toBe(true);
    expect(CACHEABLE.test('/api/v1/lecons-audio/niveaux')).toBe(true);
  });

  it('premier passage : relayé et gardé ; ensuite servi par la copie (Range compris), sans Internet', async () => {
    const url = `/api/v1/lecons-audio/fichiers/${SHA}.mp3`;
    const a = await relay.app.inject(url);
    expect(a.statusCode).toBe(200);
    expect(a.rawPayload.equals(MP3)).toBe(true);
    expect(existsSync(join(dir, 'lecons-audio', `${SHA}.mp3`))).toBe(true);
    await central.close();
    const b = await relay.app.inject({ url, headers: { range: 'bytes=0-9' } });
    expect(b.statusCode).toBe(206);
    expect(b.headers['x-awform-relais']).toBe('copie-audio');
    expect(hits).toBe(1);
  });

  it('nom de fichier invalide : jamais écrit sur le disque', async () => {
    const r = await relay.app.inject('/api/v1/lecons-audio/fichiers/..%2F..%2Fx.mp3');
    expect(r.statusCode).not.toBe(200);
    expect(existsSync(join(dir, 'x.mp3'))).toBe(false);
  });
});
