/**
 * Relais d'école (lot 17) : enregistrement par l'équipe (jeton montré UNE fois, seul son hachage est gardé),
 * révocation, battement (état remonté : envois en attente, version), autorisation du certificat de l'école.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const RELAY_HOST =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export async function createRelay(db: Db, name: string, host: string) {
  if (!RELAY_HOST.test(host)) throw new Error(`sous-domaine invalide : ${host}`);
  const token = `rel_${randomBytes(32).toString('base64url')}`;
  const [r] = await db
    .insert(t.relay)
    .values({ name, host: host.toLowerCase(), tokenHash: hash(token) })
    .returning({ id: t.relay.id, host: t.relay.host });
  return { ...r!, token };
}

export async function revokeRelay(db: Db, host: string): Promise<boolean> {
  const r = await db
    .update(t.relay)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.relay.host, host), isNull(t.relay.revokedAt)))
    .returning({ id: t.relay.id });
  return r.length > 0;
}

/** Relais actif correspondant au jeton (null : inconnu ou révoqué). */
export async function relayByToken(db: Db, token: string | undefined) {
  if (!token || !token.startsWith('rel_')) return null;
  const [r] = await db
    .select()
    .from(t.relay)
    .where(and(eq(t.relay.tokenHash, hash(token)), isNull(t.relay.revokedAt)));
  return r ?? null;
}

export async function relayHeartbeat(db: Db, id: string, report: object) {
  await db
    .update(t.relay)
    .set({ lastSeenAt: new Date(), lastReport: report })
    .where(eq(t.relay.id, id));
}

/** Un certificat peut-il être délivré pour ce nom ? (relais enregistré et actif) */
export async function relayHostAllowed(db: Db, host: string): Promise<boolean> {
  const [r] = await db
    .select({ id: t.relay.id })
    .from(t.relay)
    .where(and(eq(t.relay.host, host.toLowerCase()), isNull(t.relay.revokedAt)));
  return !!r;
}

export async function listRelays(db: Db) {
  return db
    .select({
      name: t.relay.name,
      host: t.relay.host,
      createdAt: t.relay.createdAt,
      lastSeenAt: t.relay.lastSeenAt,
      lastReport: t.relay.lastReport,
      revokedAt: t.relay.revokedAt,
    })
    .from(t.relay);
}
