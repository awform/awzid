// A34 — lecture minimale de la table `cmap` d'une police TrueType (formats 4 et 12), SANS dépendance : sert à
// vérifier que chaque glyphe des données de lignes existe dans la police de sa page (QCF_Pnnn du Complexe).
// La police n'est jamais modifiée ni réécrite : lecture seule.
import { readFileSync } from 'node:fs';

/** Ensemble des points de code qui mènent à un glyphe (≠ .notdef) dans la police. */
export function cmapCodePoints(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numTables = dv.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...buf.subarray(rec, rec + 4));
    if (tag === 'cmap') cmap = dv.getUint32(rec + 8);
  }
  if (cmap < 0) throw new Error('table cmap absente');
  const n = dv.getUint16(cmap + 2);
  const subs = [];
  for (let i = 0; i < n; i++) {
    const r = cmap + 4 + i * 8;
    subs.push({ pid: dv.getUint16(r), eid: dv.getUint16(r + 2), off: cmap + dv.getUint32(r + 4) });
  }
  const out = new Set();
  for (const s of subs) {
    const format = dv.getUint16(s.off);
    if (format === 4) {
      const segX2 = dv.getUint16(s.off + 6);
      const ends = s.off + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let k = 0; k < segX2 / 2; k++) {
        const end = dv.getUint16(ends + 2 * k);
        const start = dv.getUint16(starts + 2 * k);
        const delta = dv.getInt16(deltas + 2 * k);
        const ro = dv.getUint16(ranges + 2 * k);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const at = ranges + 2 * k + ro + 2 * (c - start);
            g = dv.getUint16(at);
            if (g !== 0) g = (g + delta) & 0xffff;
          }
          if (g !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = dv.getUint32(s.off + 12);
      for (let k = 0; k < groups; k++) {
        const g = s.off + 16 + k * 12;
        const a = dv.getUint32(g);
        const b = dv.getUint32(g + 4);
        const gid = dv.getUint32(g + 8);
        for (let c = a; c <= b; c++) if (gid + (c - a) !== 0) out.add(c);
      }
    }
  }
  return out;
}

export const cmapOfFile = (path) => cmapCodePoints(readFileSync(path));
