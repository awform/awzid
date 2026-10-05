import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { audioFileId } from '@awform/content/audio-cle';
import { importLeconsAudio } from '@awform/db';
import { registerLeconsAudio } from '../src/lecons-audio.js';

/** Chantier A3 : service de l'audio des leçons (Range, ETag, 304, cache), niveaux, aucun fichier inventé. */
const root = mkdtempSync(join(tmpdir(), 'a3-api-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const src = join(root, 'src');
const dest = join(root, 'dest');
const frame = Buffer.alloc(417);
frame.writeUInt32BE(0xfffb9064, 0);
const mp3 = Buffer.concat(Array.from({ length: 30 }, () => frame));
const T = 'بَابٌ';
const sha = audioFileId(T)!;
{
  const { mkdirSync } = await import('node:fs');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, 'index.js'),
    `AW.audioIndex={\n${JSON.stringify(T)}:"audio/${sha}.mp3"\n};\nAW.audioInfo={\n${JSON.stringify(T)}:{"src":"tts-google-wavenet-a","statut":"provisoire","niv":"en1 ad1"}\n};\n`,
  );
  writeFileSync(join(src, `${sha}.mp3`), mp3);
  importLeconsAudio({ source: src, dest, verses: ['آيَةٌ تَجْرِيبِيَّةٌ'] });
}
const app = Fastify();
registerLeconsAudio(app, dest);
const none = Fastify();
registerLeconsAudio(none, null);

describe('A3 — API de l’audio des leçons', () => {
  it('niveau : fichiers, taille, mention et crédit', async () => {
    const r = await app.inject(`/api/v1/lecons-audio/niveaux/en1`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      niveau: 'en1',
      fichiers: [sha],
      octets: mp3.length,
      mention: 'voix de synthèse (provisoire)',
      credits: ['Voix : Google Cloud Text-to-Speech'],
    });
    expect((await app.inject('/api/v1/lecons-audio/niveaux')).json()).toEqual({
      niveaux: [
        { niveau: 'ad1', fichiers: 1, octets: mp3.length },
        { niveau: 'en1', fichiers: 1, octets: mp3.length },
      ],
    });
    // niveau sans audio, ou stockage absent : liste vide (aucun bouton), jamais une erreur
    expect((await app.inject('/api/v1/lecons-audio/niveaux/en5')).json().fichiers).toEqual([]);
    expect((await none.inject('/api/v1/lecons-audio/niveaux/en1')).json().fichiers).toEqual([]);
  });

  it('fichier : ETag, 304, Range 206, 416, 404', async () => {
    const url = `/api/v1/lecons-audio/fichiers/${sha}.mp3`;
    const r = await app.inject(url);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('audio/mpeg');
    expect(r.headers['accept-ranges']).toBe('bytes');
    expect(r.headers['cache-control']).toMatch(/public/);
    expect(r.rawPayload.length).toBe(mp3.length);
    const etag = String(r.headers.etag);
    expect((await app.inject({ url, headers: { 'if-none-match': etag } })).statusCode).toBe(304);
    const p = await app.inject({ url, headers: { range: 'bytes=0-99' } });
    expect(p.statusCode).toBe(206);
    expect(p.headers['content-range']).toBe(`bytes 0-99/${mp3.length}`);
    expect(p.rawPayload.length).toBe(100);
    expect((await app.inject({ url, headers: { range: 'bytes=999999-' } })).statusCode).toBe(416);
    expect(
      (await app.inject(`/api/v1/lecons-audio/fichiers/${'0'.repeat(40)}.mp3`)).statusCode,
    ).toBe(404);
    expect((await app.inject('/api/v1/lecons-audio/fichiers/..%2Fmanifeste.json')).statusCode).toBe(
      404,
    );
    expect((await none.inject(url)).statusCode).toBe(404);
  });
});
