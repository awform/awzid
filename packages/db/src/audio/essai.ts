/**
 * FICHIERS D'ESSAI NON CORANIQUES pour les tests de l'audio : bips (sinusoïdes) et silences générés ici,
 * jamais une récitation, ni enregistrée ni synthétisée. Un « muṣḥaf d'essai » = un bip par verset, dont la
 * fréquence dépend du numéro (fichiers tous différents), nommés comme le zip « ayat » du Complexe (SSSVVV).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAFS_SURA_VERSES } from './suras.js';

/** WAV PCM 16 bits mono : bip de `ms` millisecondes à `freq` Hz (0 : silence), précédé de `silenceMs`. */
export function beepWav(o: {
  freq: number;
  ms: number;
  rate?: number;
  silenceMs?: number;
}): Buffer {
  const rate = o.rate ?? 8000;
  const pre = Math.round(((o.silenceMs ?? 0) / 1000) * rate);
  const n = pre + Math.round((o.ms / 1000) * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(n * 2, 40);
  for (let k = pre; k < n; k++)
    b.writeInt16LE(
      o.freq ? Math.round(12000 * Math.sin((2 * Math.PI * o.freq * k) / rate)) : 0,
      44 + k * 2,
    );
  return b;
}

/**
 * MP3 SYNTHÉTIQUE (structure seule) : `frames` trames MPEG-1 couche III 128 kbit/s 44,1 kHz mono au contenu
 * nul (silence), avec une étiquette ID3v2 et, si demandé, une trame d'en-tête « Info ». Sert à vérifier la
 * lecture des trames et des durées sans encodeur.
 */
export function syntheticMp3(frames: number, o: { info?: boolean; id3?: boolean } = {}): Buffer {
  const parts: Buffer[] = [];
  if (o.id3 !== false) {
    const tag = Buffer.alloc(10 + 20);
    tag.write('ID3', 0, 'latin1');
    tag[3] = 4;
    tag[9] = 20; // taille synchsafe
    parts.push(tag);
  }
  const frame = (info: boolean) => {
    const f = Buffer.alloc(417);
    f.writeUInt32BE(0xfffb90c0, 0);
    if (info) f.write('Info', 4 + 17, 'latin1');
    return f;
  };
  if (o.info) parts.push(frame(true));
  for (let i = 0; i < frames; i++) parts.push(frame(false));
  return Buffer.concat(parts);
}

/**
 * Écrit un muṣḥaf d'essai (un bip WAV par verset de Ḥafṣ pour les sourates données) dans `dir`, nommé
 * SSSVVV.wav ; renvoie la liste des fichiers. `counts` remplace le nombre de versets (autre riwāya).
 */
export function writeTestMushaf(
  dir: string,
  suras: readonly number[],
  o: { ms?: number; counts?: Record<number, number>; ext?: string } = {},
): string[] {
  mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const s of suras) {
    const n = o.counts?.[s] ?? HAFS_SURA_VERSES[s - 1] ?? 0;
    for (let v = 1; v <= n; v++) {
      const name = `${String(s).padStart(3, '0')}${String(v).padStart(3, '0')}.${o.ext ?? 'wav'}`;
      // fréquence par sourate, durée par verset : chaque fichier est différent
      writeFileSync(
        join(dir, name),
        beepWav({ freq: 150 + s * 20, ms: (o.ms ?? 300) + v, silenceMs: 40 }),
      );
      out.push(name);
    }
  }
  return out;
}
