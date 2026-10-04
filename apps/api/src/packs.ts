/**
 * Paquets de niveau (CDC §4.3, ARCHITECTURE_V2 §3.2) : TOUT ce qu'il faut pour travailler un niveau hors
 * ligne — leçons en projection ÉLÈVE (jamais le guide), identifiants et empreintes des exercices,
 * illustrations utilisées (SVG validé). Un paquet est identifié par l'empreinte de son contenu ; le
 * manifeste donne, pour chaque leçon, son empreinte : l'appareil ne retélécharge que ce qui a changé.
 */
import { promisify } from 'node:util';
import { brotliCompress, brotliCompressSync, constants } from 'node:zlib';
import { contentHash, type Lesson } from '@awform/content';
import { getUnitForStudent, illustrationsFor, listUnits, type Db } from '@awform/db';
import { neededIllustrations } from './needed.js';

export interface PackUnit {
  id: string;
  sha256: string;
}

export interface Pack {
  format: 1;
  edition: string;
  level: string;
  hash: string;
  units: Array<NonNullable<Awaited<ReturnType<typeof getUnitForStudent>>>>;
  illustrations: Record<string, { viewBox: string; svg: string }>;
}

export interface PackEntry {
  pack: Pack;
  json: string;
  /** taille brute (octets UTF-8) et compressée Brotli (ce qui transite réellement) */
  rawBytes: number;
  brotliBytes: number;
  /** paquet compressé (envoyé tel quel si le navigateur accepte Brotli) */
  brotli: Buffer;
  perUnit: Array<{ id: string; sha256: string; brotliBytes: number }>;
}

const cache = new Map<string, PackEntry>();
/** paquets en cours de construction : deux demandes simultanées attendent la même construction (lot 28) */
const building = new Map<string, Promise<PackEntry | null>>();
const BROTLI_11 = { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } };
const brotliCompressAsync = promisify(brotliCompress);

export function brotli(s: string): Buffer {
  return brotliCompressSync(Buffer.from(s, 'utf8'), BROTLI_11);
}

/**
 * Lot 28 : compression HORS du fil principal (réserve de fils de libuv). Avec 31 livres, le premier manifeste
 * compressait ~800 leçons en Brotli 11 de façon synchrone : le serveur ne répondait plus (connexions en
 * erreur) pendant de longues secondes.
 */
async function brotliAsync(s: string): Promise<Buffer> {
  return brotliCompressAsync(Buffer.from(s, 'utf8'), BROTLI_11);
}

export function brotliSize(s: string): number {
  return brotli(s).length;
}

export async function getPack(
  db: Db,
  editionId: string,
  editionCode: string,
  level: string,
): Promise<PackEntry | null> {
  const key = `${editionId}|${level}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let pending = building.get(key);
  if (!pending) {
    pending = buildPack(db, editionId, editionCode, level, key).finally(() => building.delete(key));
    building.set(key, pending);
  }
  return pending;
}

async function buildPack(
  db: Db,
  editionId: string,
  editionCode: string,
  level: string,
  key: string,
): Promise<PackEntry | null> {
  const list = await listUnits(db, editionId, level);
  if (list.length === 0) return null;
  const units = [];
  const keys = new Set<string>();
  for (const u of list) {
    const d = await getUnitForStudent(db, editionId, u.id);
    if (!d) continue;
    units.push(d);
    for (const k of neededIllustrations(d.lesson as Lesson)) keys.add(k);
  }
  const illustrations = await illustrationsFor(db, editionId, [...keys].sort());
  const hash = contentHash({
    units: units.map((u) => [u.id, u.sha256]),
    ill: Object.keys(illustrations),
  });
  const pack: Pack = { format: 1, edition: editionCode, level, hash, units, illustrations };
  const json = JSON.stringify(pack);
  const compressed = await brotliAsync(json);
  const unitBytes = await Promise.all(
    units.map(async (u) => (await brotliAsync(JSON.stringify(u))).length),
  );
  const entry: PackEntry = {
    pack,
    json,
    rawBytes: Buffer.byteLength(json, 'utf8'),
    brotliBytes: compressed.length,
    brotli: compressed,
    perUnit: units.map((u, i) => ({
      id: u.id,
      sha256: u.sha256,
      brotliBytes: unitBytes[i]!,
    })),
  };
  cache.set(key, entry);
  return entry;
}

export function clearPackCache(): void {
  cache.clear();
}
