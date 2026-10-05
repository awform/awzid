import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { audioFileId } from '@awform/content/audio-cle';
import { importLeconsAudio, readLeconsManifest } from '../src/lecons-audio.js';

/** MP3 d'essai : trames MPEG-1 couche III vides (128 kbit/s, 44,1 kHz), aucune voix */
function mp3(frames: number): Buffer {
  const f = Buffer.alloc(417);
  f.writeUInt32BE(0xfffb9064, 0);
  return Buffer.concat(Array.from({ length: frames }, () => f));
}

const root = mkdtempSync(join(tmpdir(), 'a3-lecons-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// versets FICTIFS (aucun texte coranique dans ce test)
const VERSES = ['قَالَ ٱلْوَلَدُ ذَهَبْتُ إِلَى ٱلْمَدْرَسَةِ'];
const T = {
  bab: 'بَابٌ',
  phrase: 'هٰذَا بَيْتٌ كَبِيرٌ',
  extrait: 'ذَهَبْتُ إِلَى الْمَدْرَسَةِ',
  absent: 'قَلَمٌ',
  vide: 'كِتَابٌ',
  ado: 'سَيَّارَةٌ',
};
const key = (s: string) => s.replace('ٰ', ''); // clés déjà normalisées (alif suscrit retiré)

function source(dir: string) {
  mkdirSync(dir, { recursive: true });
  const idx: Record<string, string> = {};
  const inf: Record<string, object> = {};
  const add = (s: string, niv: string, src = 'tts-google-wavenet-a') => {
    const k = key(s);
    idx[k] = `audio/${audioFileId(k)}.mp3`;
    inf[k] = { src, statut: 'provisoire', niv };
  };
  add(T.bab, 'ad1 ado1 en1');
  add(T.phrase, 'en1');
  add(T.extrait, 'en2');
  add(T.absent, 'en1');
  add(T.vide, 'en1');
  add(T.ado, 'ado1', 'tts-google-wavenet-b');
  const js = `window.AW=window.AW||{};\nAW.audioIndex=${JSON.stringify(idx, null, 0).replace(/,"/g, ',\n"')}\n;\nAW.audioInfo=${JSON.stringify(inf).replace(/,"/g, ',\n"')}\n;\n`;
  writeFileSync(join(dir, 'index.js'), js.replace(/}\n;/g, '\n};'));
  for (const s of [T.bab, T.phrase, T.extrait, T.ado])
    writeFileSync(join(dir, `${audioFileId(s)}.mp3`), mp3(40));
  writeFileSync(join(dir, `${audioFileId(T.vide)}.mp3`), Buffer.alloc(0));
}

describe('A3 — import de l’audio des leçons', () => {
  const src = join(root, 'src');
  const dest = join(root, 'dest');
  source(src);

  it('contrôle (présent, durée non nulle), garde coranique, crédit, niveaux', () => {
    const r = importLeconsAudio({ source: src, dest, verses: VERSES });
    expect(r.index).toBe(6);
    expect(r.importes).toBe(3);
    expect(r.coraniques).toBe(1);
    expect(r.absents.sort()).toEqual([audioFileId(T.absent)!, audioFileId(T.vide)!].sort());
    expect(r.parNiveau.en1).toEqual({ fichiers: 2, octets: 2 * 40 * 417 });
    const m = readLeconsManifest(dest)!;
    expect(m.mention).toBe('voix de synthèse (provisoire)');
    expect(m.credits).toEqual(['Voix : Google Cloud Text-to-Speech']);
    const f = m.fichiers[audioFileId(T.bab)!]!;
    expect(f.d).toBeGreaterThan(0);
    expect(f.v).toBe('wavenet-a');
    expect(f.n).toEqual(['ad1', 'ado1', 'en1']);
    expect(m.fichiers[audioFileId(T.ado)!]!.v).toBe('wavenet-b');
    // l'extrait coranique n'est jamais copié
    expect(readdirSync(dest)).not.toContain(`${audioFileId(T.extrait)}.mp3`);
    expect(m.coraniques).toEqual([audioFileId(key(T.extrait))]);
  });

  it('idempotent : un second import ne recopie rien', () => {
    const mtime = statSync(join(dest, `${audioFileId(T.bab)}.mp3`)).mtimeMs;
    const r = importLeconsAudio({ source: src, dest, verses: VERSES });
    expect(r.copies).toBe(0);
    expect(r.inchanges).toBe(3);
    expect(r.retires).toBe(0);
    expect(statSync(join(dest, `${audioFileId(T.bab)}.mp3`)).mtimeMs).toBe(mtime);
  });

  it('import limité à des niveaux : les autres fichiers sont retirés du stockage', () => {
    const r = importLeconsAudio({ source: src, dest, verses: VERSES, niveaux: ['ado1'] });
    expect(r.importes).toBe(2);
    expect(r.retires).toBe(1);
    expect(Object.keys(readLeconsManifest(dest)!.fichiers).sort()).toEqual(
      [audioFileId(T.bab)!, audioFileId(T.ado)!].sort(),
    );
  });

  it('refuse d’importer sans le texte du Coran (garde impossible)', () => {
    expect(() => importLeconsAudio({ source: src, dest, verses: [] })).toThrow(/garde/);
  });
});
