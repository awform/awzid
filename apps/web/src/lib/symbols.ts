/** Symboles des codes image et des avatars (aucun visage, aucun émoji-visage : CDC §3.4). */
export const SYMBOLS = [
  {
    id: 'etoile',
    label: 'étoile',
    d: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.6 6.6 19.4l1.3-6L3.4 9.3l6-.7z',
    fill: '#F2B233',
  },
  { id: 'lune', label: 'lune', d: 'M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z', fill: '#2F6FDB' },
  {
    id: 'soleil',
    label: 'soleil',
    d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3',
    fill: '#F07F2E',
  },
  {
    id: 'feuille',
    label: 'feuille',
    d: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l8-8',
    fill: '#1F9D6B',
  },
  {
    id: 'goutte',
    label: 'goutte',
    d: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
    fill: '#9FD3F5',
  },
  { id: 'livre', label: 'livre', d: 'M4 5h7v14H4zM13 5h7v14h-7z', fill: '#E5484D' },
] as const;

export type SymbolId = (typeof SYMBOLS)[number]['id'];

export async function hashCode(profileId: string, code: string[]): Promise<string> {
  const data = new TextEncoder().encode(`${profileId}:${code.join('-')}`);
  // crypto.subtle n'existe qu'en contexte sécurisé (HTTPS, localhost) : sinon, même calcul en JavaScript
  const h = globalThis.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    : sha256(data);
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (FIPS 180-4) en JavaScript pur, pour les pages servies en HTTP simple. */
export function sha256(msg: Uint8Array): Uint8Array {
  const len = msg.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, len * 8);
  dv.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32));
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 = r(w15, 7) ^ r(w15, 18) ^ (w15 >>> 3);
      const s1 = r(w2, 17) ^ r(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const S1 = r(e!, 6) ^ r(e!, 11) ^ r(e!, 25);
      const t1 = (h! + S1 + ((e! & f!) ^ (~e! & g!)) + K[i]! + W[i]!) >>> 0;
      const S0 = r(a!, 2) ^ r(a!, 13) ^ r(a!, 22);
      const t2 = (S0 + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a!) >>> 0;
    H[1] = (H[1]! + b!) >>> 0;
    H[2] = (H[2]! + c!) >>> 0;
    H[3] = (H[3]! + d!) >>> 0;
    H[4] = (H[4]! + e!) >>> 0;
    H[5] = (H[5]! + f!) >>> 0;
    H[6] = (H[6]! + g!) >>> 0;
    H[7] = (H[7]! + h!) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}
