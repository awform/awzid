/**
 * Hors ligne par niveau (CDC §2.15, §4.3 ; ARCHITECTURE_V2 §3.2-3.3) :
 *  - un PAQUET par niveau (leçons en projection élève + illustrations) téléchargé explicitement, poids
 *    affiché AVANT le téléchargement ;
 *  - mise à jour DIFFÉRENTIELLE : seules les leçons dont l'empreinte a changé sont retéléchargées ;
 *  - « libérer de la place » : suppression d'un niveau (et des illustrations devenues inutiles) ;
 *  - compteur des données téléchargées dans le mois ; stockage persistant demandé au navigateur ;
 *  - mode « données économes ».
 */
import type { UnitDetail } from './api';
import { delMany, get, getAll, getAllByIndex, kvGet, kvSet, put, putMany } from './idb';
import { t } from './i18n';

export type Illustrations = Record<string, { viewBox: string; svg: string }>;

export interface PackManifestEntry {
  level: string;
  titleFr: string | null;
  codeFr: string | null;
  hash: string;
  units: Array<{ id: string; sha256: string; brotliBytes: number }>;
  illustrations: number;
  rawBytes: number;
  /** poids compressé transféré */
  bytes: number;
}

export interface StoredPack {
  level: string;
  hash: string;
  edition: string;
  titleFr: string | null;
  codeFr: string | null;
  bytes: number;
  downloadedAt: string;
  units: Array<{ id: string; sha256: string }>;
  illusKeys: string[];
}

interface StoredUnit {
  id: string;
  level: string;
  sha256: string;
  unit: UnitDetail;
  illusKeys: string[];
}

// ------------------------------------------------------------------ données du mois

function monthKey(d = new Date()): string {
  return `data:${d.toISOString().slice(0, 7)}`;
}
export async function addBytes(n: number): Promise<void> {
  if (!Number.isFinite(n) || n <= 0) return;
  const k = monthKey();
  await kvSet(k, ((await kvGet<number>(k)) ?? 0) + n);
}
export async function monthBytes(): Promise<number> {
  return (await kvGet<number>(monthKey())) ?? 0;
}

/** Octets réellement transférés : en-tête Content-Length (corps compressé), sinon estimation. */
function transferred(r: Response, fallback: number): number {
  const n = Number(r.headers.get('content-length'));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ------------------------------------------------------------------ réglages

export interface Settings {
  /** données économes : aucun téléchargement automatique, confirmation au-delà de 200 Ko, pas de préchargement */
  econome: boolean;
  /** mode école (tablette partagée) */
  ecole: boolean;
  /** retour automatique à la grille des élèves après N minutes d'inactivité */
  idleMinutes: number;
  /** audio des leçons (A3) : téléchargé en Wi-Fi seulement (par défaut) */
  audioWifi: boolean;
}

export const LARGE_DOWNLOAD = 200 * 1024;

/** Réseau lent ou « économiseur de données » du navigateur → données économes par défaut. */
export function defaultEconome(): boolean {
  const c = (
    globalThis.navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  )?.connection;
  return !!c && (!!c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? ''));
}

export async function getSettings(): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>('settings').catch(() => undefined);
  return {
    econome: s?.econome ?? defaultEconome(),
    ecole: s?.ecole ?? false,
    idleMinutes: s?.idleMinutes ?? 10,
    audioWifi: s?.audioWifi ?? true,
  };
}
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch };
  await kvSet('settings', s);
  return s;
}

// ------------------------------------------------------------------ paquets

export async function fetchManifest(fetchFn: typeof fetch = fetch): Promise<PackManifestEntry[]> {
  const r = await fetchFn('/api/v1/packs', { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(t('horsligne.err_manifeste', { status: r.status }));
  const text = await r.text();
  await addBytes(transferred(r, text.length));
  return (JSON.parse(text) as { packs: PackManifestEntry[] }).packs;
}

export function localPacks(): Promise<StoredPack[]> {
  return getAll<StoredPack>('packs');
}
export function localPack(level: string): Promise<StoredPack | undefined> {
  return get<StoredPack>('packs', level);
}

/** Télécharge le paquet complet d'un niveau et le range localement (une seule transaction par magasin). */
export async function downloadPack(
  level: string,
  fetchFn: typeof fetch = fetch,
  knownBytes = 0,
): Promise<StoredPack> {
  const r = await fetchFn(`/api/v1/packs/${encodeURIComponent(level)}`, {
    headers: { accept: 'application/json' },
  });
  if (!r.ok) throw new Error(t('horsligne.err_paquet', { level, status: r.status }));
  const text = await r.text();
  await addBytes(transferred(r, knownBytes || text.length));
  const pack = JSON.parse(text) as {
    edition: string;
    level: string;
    hash: string;
    units: UnitDetail[];
    illustrations: Illustrations;
  };
  const manifest = await fetchManifest(fetchFn).catch(() => [] as PackManifestEntry[]);
  const meta = manifest.find((m) => m.level === level);
  await putMany(
    'illus',
    Object.entries(pack.illustrations).map(([key, v]) => ({ key, ...v })),
  );
  const units: StoredUnit[] = pack.units.map((u) => ({
    id: u.id,
    level,
    sha256: u.sha256,
    // lot F1 : édition du contenu gardée avec la leçon (accompagne chaque réponse donnée hors ligne)
    unit: { ...u, edition: pack.edition },
    illusKeys: Object.keys(pack.illustrations),
  }));
  // remplace les leçons du niveau (une leçon supprimée d'une édition disparaît aussi)
  const old = await getAllByIndex<StoredUnit>('units', 'level', level);
  await delMany(
    'units',
    old.map((u) => u.id).filter((id) => !units.some((x) => x.id === id)),
  );
  await putMany('units', units);
  const stored: StoredPack = {
    level,
    hash: pack.hash,
    edition: pack.edition,
    titleFr: meta?.titleFr ?? null,
    codeFr: meta?.codeFr ?? null,
    bytes: meta?.bytes ?? text.length,
    downloadedAt: new Date().toISOString(),
    units: pack.units.map((u) => ({ id: u.id, sha256: u.sha256 })),
    illusKeys: Object.keys(pack.illustrations),
  };
  await put('packs', stored);
  gardeVivante(level);
  return stored;
}

export interface UpdateResult {
  mode: 'a_jour' | 'partiel' | 'complet';
  changed: string[];
}

/**
 * Met à jour un niveau déjà téléchargé : compare les empreintes du manifeste aux empreintes locales et
 * ne retélécharge que les leçons modifiées (ou le paquet complet si plus de la moitié a changé).
 */
export async function updatePack(
  level: string,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateResult> {
  const local = await localPack(level);
  const manifest = await fetchManifest(fetchFn);
  const remote = manifest.find((m) => m.level === level);
  if (!remote) throw new Error(t('horsligne.err_niveau', { level }));
  if (!local) {
    await downloadPack(level, fetchFn, remote.bytes);
    return { mode: 'complet', changed: remote.units.map((u) => u.id) };
  }
  if (local.hash === remote.hash) return { mode: 'a_jour', changed: [] };
  const localSha = new Map(local.units.map((u) => [u.id, u.sha256]));
  const changed = remote.units.filter((u) => localSha.get(u.id) !== u.sha256).map((u) => u.id);
  const removed = local.units
    .filter((u) => !remote.units.some((r) => r.id === u.id))
    .map((u) => u.id);
  if (changed.length > remote.units.length / 2) {
    await downloadPack(level, fetchFn, remote.bytes);
    return { mode: 'complet', changed };
  }
  const newIllus = new Set(local.illusKeys);
  for (const id of changed) {
    const r = await fetchFn(`/api/v1/units/${encodeURIComponent(id)}`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) throw new Error(t('horsligne.err_lecon', { id, status: r.status }));
    const text = await r.text();
    await addBytes(transferred(r, text.length));
    const body = JSON.parse(text) as {
      edition?: string;
      unit: UnitDetail;
      illustrations: Illustrations;
    };
    await putMany(
      'illus',
      Object.entries(body.illustrations).map(([key, v]) => ({ key, ...v })),
    );
    Object.keys(body.illustrations).forEach((k) => newIllus.add(k));
    await putMany('units', [
      {
        id,
        level,
        sha256: body.unit.sha256,
        unit: { ...body.unit, edition: body.edition ?? local.edition },
        illusKeys: Object.keys(body.illustrations),
      },
    ]);
  }
  await delMany('units', removed);
  await put('packs', {
    ...local,
    hash: remote.hash,
    units: remote.units.map((u) => ({ id: u.id, sha256: u.sha256 })),
    illusKeys: [...newIllus],
    downloadedAt: new Date().toISOString(),
    bytes: remote.bytes,
  } satisfies StoredPack);
  return { mode: 'partiel', changed };
}

/** « Libérer de la place » : supprime un niveau et les illustrations qu'aucun autre niveau n'utilise. */
export async function removePack(level: string): Promise<void> {
  const local = await localPack(level);
  if (!local) return;
  await delMany(
    'units',
    local.units.map((u) => u.id),
  );
  await delMany('packs', [level]);
  const others = await localPacks();
  const keep = new Set(others.flatMap((p) => p.illusKeys));
  await delMany(
    'illus',
    local.illusKeys.filter((k) => !keep.has(k)),
  );
}

/** Leçon disponible sur l'appareil (avec ses illustrations), sinon null. */
export async function localUnit(
  id: string,
): Promise<{ unit: UnitDetail; illustrations: Illustrations } | null> {
  const u = await get<StoredUnit>('units', id).catch(() => undefined);
  if (!u) return null;
  const illustrations: Illustrations = {};
  for (const k of u.illusKeys) {
    const d = await get<{ key: string; viewBox: string; svg: string }>('illus', k);
    if (d) illustrations[k] = { viewBox: d.viewBox, svg: d.svg };
  }
  return { unit: u.unit, illustrations };
}

/** Leçons d'un niveau disponibles sur l'appareil (ordre du livre). */
export async function localUnits(level: string): Promise<UnitDetail[]> {
  const list = await getAllByIndex<StoredUnit>('units', 'level', level).catch(
    () => [] as StoredUnit[],
  );
  return list.map((u) => u.unit).sort((a, b) => a.n - b.n);
}

// ------------------------------------------------------------------ stockage

export async function storageInfo(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  const s = globalThis.navigator?.storage;
  const est = (await s?.estimate?.().catch(() => undefined)) ?? {};
  const persisted = (await s?.persisted?.().catch(() => false)) ?? false;
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
}

/** Demande au navigateur de ne pas effacer les paquets (stockage persistant). */
export async function requestPersistence(): Promise<boolean> {
  return (await globalThis.navigator?.storage?.persist?.().catch(() => false)) ?? false;
}

/** Poids lisible selon la langue de l'interface. */
export { fmtBytes as formatBytes } from './i18n';

/**
 * A21b — le code des leçons vivantes n'est pas préchargé avec la coquille : quand un niveau d'arabe est gardé
 * pour le hors ligne (et que ses animations ne sont pas désactivées, réglage `awzid.vivante`), ses fichiers
 * (liste `/_app/vivante.json`) sont demandés une fois pour que le service worker les garde.
 */
function gardeVivante(level: string): void {
  try {
    const r = JSON.parse(localStorage.getItem('awzid.vivante') ?? '{}') as {
      on?: boolean;
      off?: string[];
    };
    if (!/^(en|ado|ad)\d+$/.test(level) || r.on === false || r.off?.includes(level)) return;
  } catch {
    /* réglage illisible : par défaut, actives */
  }
  void fetch('/_app/vivante.json')
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
    .then((l) => Promise.all(l.map((f) => fetch(f))))
    .catch(() => undefined);
}
