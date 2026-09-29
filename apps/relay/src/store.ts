/**
 * Stockage du relais (SQLite intégré à Node, un seul fichier, résistant aux coupures de courant : WAL) :
 *  - cache des CONTENUS publics (livres, paquets, Coran de référence…) pour servir l'école sans Internet ;
 *  - file des ENVOIS des élèves (réponses, récitations) en attente du serveur central, CHIFFRÉS
 *    (AES-256-GCM, clé propre au relais) : en-têtes (cookie de session compris) et corps ne sont jamais
 *    écrits en clair ; effacés dès que le central a répondu.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  fetchedAt: number;
}

export interface QueuedRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Buffer;
  createdAt: number;
  attempts: number;
}

export type QueueState = 'en_attente' | 'refuse';

export class RelayStore {
  readonly db: DatabaseSync;
  private readonly key: Buffer;

  constructor(dir: string, key: Buffer) {
    if (key.length !== 32) throw new Error('clé du relais : 32 octets attendus');
    mkdirSync(dir, { recursive: true });
    this.key = key;
    this.db = new DatabaseSync(join(dir, 'relais.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS cache (
        k TEXT PRIMARY KEY, status INTEGER NOT NULL, headers TEXT NOT NULL, body BLOB NOT NULL,
        fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL,
        iv BLOB, payload BLOB, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'en_attente', last_status INTEGER, last_error TEXT);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
  }

  close() {
    this.db.close();
  }

  // ------------------------------------------------------------ cache des contenus

  putCache(k: string, r: Omit<CachedResponse, 'fetchedAt'>) {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO cache (k, status, headers, body, fetched_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(k, r.status, JSON.stringify(r.headers), r.body, Date.now());
  }

  getCache(k: string): CachedResponse | null {
    const row = this.db.prepare('SELECT * FROM cache WHERE k = ?').get(k) as
      { status: number; headers: string; body: Uint8Array; fetched_at: number } | undefined;
    return row
      ? {
          status: row.status,
          headers: JSON.parse(row.headers) as Record<string, string>,
          body: Buffer.from(row.body),
          fetchedAt: row.fetched_at,
        }
      : null;
  }

  cacheCount(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM cache').get() as { n: number }).n;
  }

  // ------------------------------------------------------------ file des envois (chiffrée)

  private seal(o: { headers: Record<string, string>; body: string }) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(o), 'utf8'), c.final(), c.getAuthTag()]);
    return { iv, enc };
  }

  private open(iv: Uint8Array, enc: Uint8Array) {
    const buf = Buffer.from(enc);
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv));
    d.setAuthTag(buf.subarray(buf.length - 16));
    const plain = Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]);
    return JSON.parse(plain.toString('utf8')) as { headers: Record<string, string>; body: string };
  }

  enqueue(method: string, path: string, headers: Record<string, string>, body: Buffer): string {
    const id = randomUUID();
    const { iv, enc } = this.seal({ headers, body: body.toString('base64') });
    this.db
      .prepare(
        'INSERT INTO queue (id, created_at, method, path, iv, payload, next_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, Date.now(), method, path, iv, enc, 0);
    return id;
  }

  /** Prochain envoi à tenter (le plus ancien, échéance atteinte). */
  nextDue(now = Date.now()): QueuedRequest | null {
    const row = this.db
      .prepare(
        "SELECT * FROM queue WHERE state = 'en_attente' AND next_at <= ? ORDER BY created_at, id LIMIT 1",
      )
      .get(now) as
      | {
          id: string;
          method: string;
          path: string;
          iv: Uint8Array;
          payload: Uint8Array;
          created_at: number;
          attempts: number;
        }
      | undefined;
    if (!row) return null;
    const p = this.open(row.iv, row.payload);
    return {
      id: row.id,
      method: row.method,
      path: row.path,
      headers: p.headers,
      body: Buffer.from(p.body, 'base64'),
      createdAt: row.created_at,
      attempts: row.attempts,
    };
  }

  /** Accepté par le central : effacé (plus aucune trace des données de l'élève). */
  done(id: string) {
    this.db.prepare('DELETE FROM queue WHERE id = ?').run(id);
    this.bump('envoyes');
  }

  /** Refus définitif du central (4xx) : données effacées, seule la trace technique reste. */
  refused(id: string, status: number, error: string) {
    this.db
      .prepare(
        "UPDATE queue SET state = 'refuse', iv = NULL, payload = NULL, last_status = ?, last_error = ? WHERE id = ?",
      )
      .run(status, error.slice(0, 200), id);
  }

  /** Échec passager (réseau, 5xx) : nouvel essai plus tard (attente croissante, 5 min au plus). */
  retryLater(id: string, error: string, now = Date.now()) {
    const row = this.db.prepare('SELECT attempts FROM queue WHERE id = ?').get(id) as
      { attempts: number } | undefined;
    const n = (row?.attempts ?? 0) + 1;
    const wait = Math.min(300_000, 5_000 * 2 ** Math.min(n, 6));
    this.db
      .prepare('UPDATE queue SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?')
      .run(n, now + wait, error.slice(0, 200), id);
  }

  /** Internet revenu : tout ce qui attend peut repartir tout de suite. */
  wakeAll() {
    this.db.prepare("UPDATE queue SET next_at = 0 WHERE state = 'en_attente'").run();
  }

  counts(): { enAttente: number; refuses: number } {
    const n = (s: QueueState) =>
      (this.db.prepare('SELECT count(*) AS n FROM queue WHERE state = ?').get(s) as { n: number })
        .n;
    return { enAttente: n('en_attente'), refuses: n('refuse') };
  }

  /** Traces des refus gardées 7 jours. */
  purgeRefused(now = Date.now()) {
    this.db
      .prepare("DELETE FROM queue WHERE state = 'refuse' AND created_at < ?")
      .run(now - 7 * 86_400_000);
  }

  bump(k: string, by = 1) {
    const v = Number(this.getMeta(k) ?? 0) + by;
    this.setMeta(k, String(v));
  }
  getMeta(k: string): string | null {
    const r = this.db.prepare('SELECT v FROM meta WHERE k = ?').get(k) as { v: string } | undefined;
    return r?.v ?? null;
  }
  setMeta(k: string, v: string) {
    this.db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(k, v);
  }
}
