/**
 * Lot 27 — paquets audio hors ligne PAR SOURATE : fichiers gardés dans le cache du navigateur (Cache API),
 * index sur l'appareil (IndexedDB) ; option « Wi-Fi seulement », quota de l'appareil, suppression.
 * Les fichiers servis par le relais de l'école (même adresse) passent aussi par ce cache.
 */
import type { SuraPack } from '$lib/coran-audio';
import { kvGet, kvSet } from '$lib/idb';

const CACHE = 'awzid-coran-audio-v1';
const INDEX = 'coranAudio.index.v1';
const WIFI = 'coranAudio.wifiOnly';

export interface SavedSura {
  reciter: string;
  sura: number;
  hash: string;
  bytes: number;
  files: string[];
  savedAt: string;
}
type Index = Record<string, SavedSura>;
const key = (reciter: string, sura: number) => `${reciter}:${sura}`;

async function index(): Promise<Index> {
  return (await kvGet<Index>(INDEX).catch(() => undefined)) ?? {};
}

export async function savedSuras(reciter?: string): Promise<SavedSura[]> {
  return Object.values(await index())
    .filter((x) => !reciter || x.reciter === reciter)
    .sort((a, b) => a.reciter.localeCompare(b.reciter) || a.sura - b.sura);
}

/** Empreintes des sourates présentes pour un récitateur (calcul du quota : `packsWithinQuota`). */
export async function presentHashes(reciter: string): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (const s of await savedSuras(reciter)) out[s.sura] = s.hash;
  return out;
}

export async function wifiOnly(): Promise<boolean> {
  return (await kvGet<boolean>(WIFI).catch(() => undefined)) ?? true;
}
export async function setWifiOnly(v: boolean): Promise<void> {
  await kvSet(WIFI, v);
}

/**
 * Type de connexion quand le navigateur le dit (Network Information API, surtout Android) :
 * « wifi », « cellular »… ; null : inconnu (le choix revient alors à l'utilisateur, averti).
 */
export function connectionType(): string | null {
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection;
  return c?.type ?? null;
}

/** Octets encore libres pour l'application (estimation du navigateur), ou null si inconnue. */
export async function freeBytes(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e?.quota) return null;
    return Math.max(0, e.quota - (e.usage ?? 0));
  } catch {
    return null;
  }
}

export type SaveRefus = 'pas_de_wifi' | 'quota' | 'reseau' | 'indisponible';

/** Cache du navigateur : seulement en contexte sécurisé (https, localhost). */
export const cacheAvailable = () => typeof caches !== 'undefined';

/** Garde une sourate sur l'appareil ; `onProgress(n, total)` après chaque fichier. */
export async function saveSura(
  pack: SuraPack,
  onProgress?: (n: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; refus: SaveRefus }> {
  if (!cacheAvailable()) return { ok: false, refus: 'indisponible' };
  if ((pack.wifiSeulement || (await wifiOnly())) && connectionType() === 'cellular')
    return { ok: false, refus: 'pas_de_wifi' };
  const free = await freeBytes();
  if (free !== null && pack.bytes > free) return { ok: false, refus: 'quota' };
  const cache = await caches.open(CACHE);
  let n = 0;
  try {
    for (const f of pack.files) {
      if (!(await cache.match(f.url, { ignoreVary: true }))) {
        const r = await fetch(f.url, { credentials: 'same-origin' });
        if (!r.ok) throw new Error(String(r.status));
        await cache.put(f.url, r);
      }
      onProgress?.(++n, pack.files.length);
    }
  } catch {
    return { ok: false, refus: 'reseau' };
  }
  const idx = await index();
  idx[key(pack.reciter, pack.sura)] = {
    reciter: pack.reciter,
    sura: pack.sura,
    hash: pack.hash,
    bytes: pack.bytes,
    files: pack.files.map((f) => f.url),
    savedAt: new Date().toISOString(),
  };
  await kvSet(INDEX, idx);
  return { ok: true };
}

export async function removeSura(reciter: string, sura: number): Promise<void> {
  const idx = await index();
  const e = idx[key(reciter, sura)];
  if (e) {
    if (!cacheAvailable()) return;
    const cache = await caches.open(CACHE);
    for (const u of e.files) await cache.delete(u, { ignoreVary: true });
    delete idx[key(reciter, sura)];
    await kvSet(INDEX, idx);
  }
}

/** Récitateur retiré (ou absent du serveur) : ses fichiers sont effacés de l'appareil. */
export async function purgeReciters(active: string[]): Promise<number> {
  let n = 0;
  for (const s of await savedSuras())
    if (!active.includes(s.reciter)) {
      await removeSura(s.reciter, s.sura);
      n++;
    }
  return n;
}

/** Adresse à donner au lecteur : le fichier gardé sur l'appareil s'il existe, sinon le réseau. */
export async function playableUrl(url: string): Promise<string> {
  try {
    // ignoreVary : l'API répond « Vary » (encodage), le fichier gardé doit être retrouvé quand même
    const hit = await (await caches.open(CACHE)).match(url, { ignoreVary: true });
    if (hit) return URL.createObjectURL(await hit.blob());
  } catch {
    /* cache indisponible : réseau */
  }
  return url;
}
