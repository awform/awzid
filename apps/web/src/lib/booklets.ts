/**
 * Bibliothèque des livrets gradués (lot 8) : catalogue, livret, lecture HORS LIGNE (livrets gardés dans
 * IndexedDB, un par un ou tout un niveau), livrets lus (sur l'appareil).
 */
import { kvGet, kvSet } from './idb';

export interface BookletSummary {
  code: string;
  level: string;
  titreAr: string | null;
  titreFr: string | null;
  resumeFr: string | null;
  placeFr: string | null;
  genreFr: string | null;
  pages: number | null;
  mentionFr: string | null;
}

export interface BookletPack {
  code: string;
  level: string;
  catalogue: Record<string, unknown>;
  booklet: Record<string, unknown>;
  illustrations: Record<string, { viewBox: string; svg: string }>;
}

const KEY = (code: string) => `booklet:${code}`;

export async function listBooklets(): Promise<{ list: BookletSummary[]; offline: boolean }> {
  try {
    const r = await fetch('/api/v1/booklets');
    if (!r.ok) throw new Error(String(r.status));
    const list = ((await r.json()) as { booklets: BookletSummary[] }).booklets;
    await kvSet('bookletCatalogue', list).catch(() => {});
    return { list, offline: false };
  } catch {
    return {
      list: (await kvGet<BookletSummary[]>('bookletCatalogue').catch(() => undefined)) ?? [],
      offline: true,
    };
  }
}

/** Livret : copie de l'appareil d'abord (aucun octet sur le réseau), sinon le réseau. */
export async function loadBooklet(code: string): Promise<BookletPack | null> {
  const local = await kvGet<BookletPack>(KEY(code)).catch(() => undefined);
  if (local) return local;
  try {
    const r = await fetch(`/api/v1/booklets/${encodeURIComponent(code)}`);
    return r.ok ? ((await r.json()) as BookletPack) : null;
  } catch {
    return null;
  }
}

export async function keepBooklet(code: string): Promise<boolean> {
  const r = await fetch(`/api/v1/booklets/${encodeURIComponent(code)}`).catch(() => null);
  if (!r?.ok) return false;
  await kvSet(KEY(code), await r.json());
  return true;
}

export async function removeBooklet(code: string): Promise<void> {
  await kvSet(KEY(code), undefined);
}

/** Codes des livrets gardés sur l'appareil. */
export async function keptBooklets(list: readonly BookletSummary[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const b of list) if (await kvGet(KEY(b.code)).catch(() => undefined)) out.add(b.code);
  return out;
}

export async function readBooklets(): Promise<Set<string>> {
  return new Set((await kvGet<string[]>('bookletsRead').catch(() => undefined)) ?? []);
}

export async function markRead(code: string): Promise<void> {
  const s = await readBooklets();
  s.add(code);
  await kvSet('bookletsRead', [...s]);
}
