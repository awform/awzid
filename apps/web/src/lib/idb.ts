/**
 * Stockage local IndexedDB (fenêtre ET service worker) : paquets de niveau, leçons, illustrations,
 * file des événements d'apprentissage, réglages. Aucune dépendance : API IndexedDB standard.
 * Tout ce qui est stocké ici est la projection ÉLÈVE (jamais le guide) ou des événements de l'élève.
 */
export const DB_NAME = 'awform';
export const DB_VERSION = 1;
export type StoreName = 'packs' | 'units' | 'illus' | 'events' | 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('packs'))
        db.createObjectStore('packs', { keyPath: 'level' });
      if (!db.objectStoreNames.contains('units')) {
        const s = db.createObjectStore('units', { keyPath: 'id' });
        s.createIndex('level', 'level');
      }
      if (!db.objectStoreNames.contains('illus')) db.createObjectStore('illus', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('events'))
        db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Réinitialise la connexion (tests). */
export function _resetDbForTests(): void {
  dbPromise = null;
}

/**
 * Copie en données pures : les objets réactifs de Svelte (proxies) ne peuvent pas être clonés par
 * IndexedDB ; toutes nos valeurs sont du JSON.
 */
function plainCopy<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function getAllByIndex<T>(
  store: StoreName,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(value)) as Promise<T[]>;
}

export async function count(store: StoreName): Promise<number> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).count());
}

/** Écrit plusieurs valeurs dans UNE transaction (tout ou rien). */
export async function putMany(store: StoreName, values: unknown[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  for (const v of values) s.put(plainCopy(v));
  await done(tx);
}

export async function put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(plainCopy(value), key);
  await done(tx);
}

export async function delMany(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  for (const k of keys) s.delete(k);
  await done(tx);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return get<T>('kv', key);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  return put('kv', value, key);
}
