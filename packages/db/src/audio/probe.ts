/**
 * Lecture technique des fichiers audio, SANS dépendance : durée d'un MP3 (somme des trames MPEG, débit
 * variable compris, trame d'en-tête Xing/Info exclue) ou d'un WAV PCM ; silences d'un WAV PCM 16 bits
 * calculés ici, ceux des autres formats par ffmpeg (« silencedetect ») quand il est installé.
 */
import { spawn, spawnSync } from 'node:child_process';

export type AudioFormat = 'mp3' | 'wav';

export interface Probe {
  format: AudioFormat;
  durationMs: number;
  sampleRate: number;
  channels: number;
  /** trames MP3 lues (0 pour un WAV) */
  frames: number;
  /** octets ignorés entre des trames (resynchronisation) */
  junkBytes: number;
}

const MP3_BITRATES: Record<string, number[]> = {
  // MPEG-1 couche III ; MPEG-2 et 2.5 couche III (kbit/s, index 1 à 14)
  '1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

interface Frame {
  len: number;
  samples: number;
  rate: number;
  channels: number;
  sideInfo: number;
}

function frameAt(b: Buffer, i: number): Frame | null {
  if (i + 4 > b.length) return null;
  const h = b.readUInt32BE(i);
  if (h >>> 21 !== 0x7ff) return null;
  const version = (h >>> 19) & 3; // 0 : 2.5 ; 2 : MPEG-2 ; 3 : MPEG-1
  const layer = (h >>> 17) & 3; // 1 : couche III
  const bri = (h >>> 12) & 15;
  const sri = (h >>> 10) & 3;
  const pad = (h >>> 9) & 1;
  const mode = (h >>> 6) & 3;
  if (version === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null;
  const kbps = MP3_BITRATES[version === 3 ? '1' : '2']![bri]!;
  const rate = MP3_RATES[version]![sri]!;
  const samples = version === 3 ? 1152 : 576;
  const len = Math.floor(((samples / 8) * kbps * 1000) / rate) + pad;
  const channels = mode === 3 ? 1 : 2;
  const sideInfo = version === 3 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17;
  return { len, samples, rate, channels, sideInfo };
}

/** Durée d'un MP3 par lecture de toutes ses trames ; null si ce n'est pas un MP3 lisible. */
export function probeMp3(b: Buffer): Probe | null {
  let i = 0;
  // étiquette ID3v2 en tête (taille « synchsafe »)
  if (b.length >= 10 && b.toString('latin1', 0, 3) === 'ID3') {
    const size =
      ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
    i = 10 + size + (b[5]! & 0x10 ? 10 : 0);
  }
  let end = b.length;
  if (end >= 128 && b.toString('latin1', end - 128, end - 125) === 'TAG') end -= 128;
  let samples = 0;
  let frames = 0;
  let junk = 0;
  let rate = 0;
  let channels = 0;
  let first = true;
  let synced = false;
  while (i < end) {
    const f = frameAt(b, i);
    // une synchronisation n'est crue que dans une suite de trames, ou si la trame suivante (ou la fin)
    // suit exactement
    const ok =
      f && f.len > 4 && (synced || i + f.len === end || (i + f.len < end && frameAt(b, i + f.len)));
    if (!f || !ok) {
      synced = false;
      i++;
      junk++;
      if (frames === 0 && junk > 64 * 1024) return null;
      continue;
    }
    synced = true;
    const tagAt = i + 4 + f.sideInfo;
    const tag = b.toString('latin1', tagAt, tagAt + 4);
    if (!(first && (tag === 'Xing' || tag === 'Info'))) {
      samples += f.samples;
      frames++;
    }
    first = false;
    rate = f.rate;
    channels = f.channels;
    i += f.len;
  }
  if (frames === 0 || rate === 0) return null;
  return {
    format: 'mp3',
    durationMs: Math.round((samples / rate) * 1000),
    sampleRate: rate,
    channels,
    frames,
    junkBytes: junk,
  };
}

interface WavInfo {
  rate: number;
  channels: number;
  bits: number;
  dataStart: number;
  dataLen: number;
}

function wavInfo(b: Buffer): WavInfo | null {
  if (
    b.length < 12 ||
    b.toString('latin1', 0, 4) !== 'RIFF' ||
    b.toString('latin1', 8, 12) !== 'WAVE'
  )
    return null;
  let i = 12;
  let fmt: { rate: number; channels: number; bits: number; tag: number } | null = null;
  while (i + 8 <= b.length) {
    const id = b.toString('latin1', i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === 'fmt ' && i + 24 <= b.length)
      fmt = {
        tag: b.readUInt16LE(i + 8),
        channels: b.readUInt16LE(i + 10),
        rate: b.readUInt32LE(i + 12),
        bits: b.readUInt16LE(i + 22),
      };
    if (id === 'data') {
      if (!fmt || fmt.tag !== 1 || !fmt.rate || !fmt.channels || !fmt.bits) return null;
      return {
        rate: fmt.rate,
        channels: fmt.channels,
        bits: fmt.bits,
        dataStart: i + 8,
        dataLen: Math.min(size, b.length - i - 8),
      };
    }
    i += 8 + size + (size & 1);
  }
  return null;
}

export function probeWav(b: Buffer): Probe | null {
  const w = wavInfo(b);
  if (!w) return null;
  const frameBytes = (w.channels * w.bits) / 8;
  return {
    format: 'wav',
    durationMs: Math.round((w.dataLen / frameBytes / w.rate) * 1000),
    sampleRate: w.rate,
    channels: w.channels,
    frames: 0,
    junkBytes: 0,
  };
}

export function probeAudio(b: Buffer): Probe | null {
  return probeWav(b) ?? probeMp3(b);
}

export interface SilenceInfo {
  /** silence cumulé (ms) et plus long silence d'un seul tenant (ms) */
  totalMs: number;
  longestMs: number;
  /** méthode : calcul interne (WAV PCM 16 bits) ou ffmpeg */
  by: 'interne' | 'ffmpeg';
}

/** Silences d'un WAV PCM 16 bits : fenêtres de 50 ms sous −50 dBFS (moyenne quadratique). */
export function wavSilence(b: Buffer, thresholdDb = -50): SilenceInfo | null {
  const w = wavInfo(b);
  if (!w || w.bits !== 16) return null;
  const win = Math.max(1, Math.round(w.rate * 0.05));
  const n = Math.floor(w.dataLen / 2 / w.channels);
  const limit = 32768 * 10 ** (thresholdDb / 20);
  let total = 0;
  let run = 0;
  let longest = 0;
  for (let s = 0; s < n; s += win) {
    const e = Math.min(n, s + win);
    let acc = 0;
    for (let k = s; k < e; k++) {
      const v = b.readInt16LE(w.dataStart + k * 2 * w.channels);
      acc += v * v;
    }
    const ms = ((e - s) / w.rate) * 1000;
    if (Math.sqrt(acc / (e - s)) < limit) {
      total += ms;
      run += ms;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  return { totalMs: Math.round(total), longestMs: Math.round(longest), by: 'interne' };
}

/** ffmpeg est-il disponible ? (chemin, ou null) */
export function findFfmpeg(bin = process.env.AWFORM_FFMPEG || 'ffmpeg'): string | null {
  try {
    const r = spawnSync(bin, ['-hide_banner', '-version'], { stdio: 'ignore', timeout: 10_000 });
    return r.status === 0 ? bin : null;
  } catch {
    return null;
  }
}

/** Silences par ffmpeg (silencedetect, −50 dB, 0,3 s minimum) ; null si ffmpeg échoue. */
export function ffmpegSilence(
  bin: string,
  file: string,
  durationMs: number,
): Promise<SilenceInfo | null> {
  return new Promise((resolve) => {
    const p = spawn(
      bin,
      [
        '-hide_banner',
        '-nostats',
        '-i',
        file,
        '-af',
        'silencedetect=noise=-50dB:d=0.3',
        '-f',
        'null',
        '-',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let err = '';
    p.stderr.on('data', (d: Buffer) => {
      if (err.length < 2_000_000) err += d.toString('utf8');
    });
    const timer = setTimeout(() => p.kill('SIGKILL'), 120_000);
    p.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      let total = 0;
      let longest = 0;
      let open: number | null = null;
      for (const line of err.split('\n')) {
        const s = /silence_start: (-?[\d.]+)/.exec(line);
        if (s) open = Math.max(0, Number(s[1]) * 1000);
        const e = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/.exec(line);
        if (e) {
          const d = Number(e[2]) * 1000;
          total += d;
          longest = Math.max(longest, d);
          open = null;
        }
      }
      // silence qui court jusqu'à la fin du fichier (pas de « silence_end »)
      if (open !== null) {
        const d = Math.max(0, durationMs - open);
        total += d;
        longest = Math.max(longest, d);
      }
      resolve({ totalMs: Math.round(total), longestMs: Math.round(longest), by: 'ffmpeg' });
    });
  });
}
