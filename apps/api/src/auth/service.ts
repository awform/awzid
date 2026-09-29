/**
 * Sessions, limitation des essais, journal d'audit (OWASP ASVS 5.0 V7 sessions, V6.3 authentification).
 *  - jeton aléatoire de 256 bits dans un cookie HttpOnly, Secure, SameSite=Lax ; seul son SHA-256 est en base ;
 *  - nouveau jeton à chaque connexion (pas de fixation), révocation d'une ou de toutes les sessions ;
 *  - expiration glissante (famille 30 j) ou courte (enseignant, administrateur 12 h) ;
 *  - verrouillage progressif après 5 échecs (par compte et par adresse IP), partagé en base.
 */
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { randomToken, sha256 } from './crypto.js';
import { sessionTtlMs } from './policy.js';

export const COOKIE = 'awform_session';

export interface AuthCtx {
  accountId: string;
  kind: 'parent' | 'adulte' | 'admin' | 'enseignant';
  tokenHash: string;
  mfaVerified: boolean;
  totpEnabled: boolean;
  country: string | null;
}

export function readCookie(header: string | undefined, name = COOKIE): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token: string, maxAgeMs: number, secure: boolean): string {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}

export async function createSession(db: Db, accountId: string, kind: string, mfaVerified: boolean) {
  const token = randomToken(32);
  const ttl = sessionTtlMs(kind);
  await db.insert(t.session).values({
    tokenHash: sha256(token),
    accountId,
    expiresAt: new Date(Date.now() + ttl),
    mfaVerified,
  });
  return { token, ttl };
}

/** Session valide (non expirée, non révoquée, compte non supprimé) ; prolonge l'expiration glissante. */
export async function lookupSession(db: Db, token: string | null): Promise<AuthCtx | null> {
  if (!token || token.length > 100) return null;
  const tokenHash = sha256(token);
  const rows = await db
    .select({
      accountId: t.session.accountId,
      mfaVerified: t.session.mfaVerified,
      expiresAt: t.session.expiresAt,
      kind: t.account.kind,
      totpEnabled: t.account.totpEnabled,
      country: t.account.country,
    })
    .from(t.session)
    .innerJoin(t.account, eq(t.account.id, t.session.accountId))
    .where(
      and(
        eq(t.session.tokenHash, tokenHash),
        isNull(t.session.revokedAt),
        gt(t.session.expiresAt, new Date()),
        isNull(t.account.deletedAt),
      ),
    )
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  // expiration glissante pour les comptes famille (au plus une écriture par heure)
  if (r.kind === 'parent' || r.kind === 'adulte') {
    const ttl = sessionTtlMs(r.kind);
    if (r.expiresAt.getTime() - Date.now() < ttl - 3600_000)
      await db
        .update(t.session)
        .set({ expiresAt: new Date(Date.now() + ttl), lastSeenAt: new Date() })
        .where(eq(t.session.tokenHash, tokenHash));
  }
  return { ...r, tokenHash };
}

export async function revokeSession(db: Db, tokenHash: string): Promise<void> {
  await db
    .update(t.session)
    .set({ revokedAt: new Date() })
    .where(eq(t.session.tokenHash, tokenHash));
}

export async function revokeAll(db: Db, accountId: string, exceptHash?: string): Promise<void> {
  await db
    .update(t.session)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(t.session.accountId, accountId),
        isNull(t.session.revokedAt),
        exceptHash ? sql`${t.session.tokenHash} <> ${exceptHash}` : sql`true`,
      ),
    );
}

// ------------------------------------------------------------------ limitation des essais

export const MAX_FAILURES = 5;

/** Date de fin de verrouillage si la clé est verrouillée, sinon null. */
export async function lockedUntil(db: Db, key: string): Promise<Date | null> {
  const [r] = await db.select().from(t.authThrottle).where(eq(t.authThrottle.key, key));
  return r?.lockedUntil && r.lockedUntil > new Date() ? r.lockedUntil : null;
}

/**
 * Enregistre un échec ; à partir du 5e, verrouillage de 1, 2, 4… minutes (60 au plus). Les échecs
 * anciens (plus d'une heure sans nouvel échec, hors verrouillage) sont oubliés.
 */
export async function recordFailure(db: Db, key: string, max = MAX_FAILURES): Promise<void> {
  const [r] = await db.select().from(t.authThrottle).where(eq(t.authThrottle.key, key));
  const stale =
    r &&
    !(r.lockedUntil && r.lockedUntil > new Date()) &&
    Date.now() - r.updatedAt.getTime() > 3600_000;
  const failures = (stale ? 0 : (r?.failures ?? 0)) + 1;
  const lock =
    failures >= max ? new Date(Date.now() + Math.min(60, 2 ** (failures - max)) * 60_000) : null;
  await db
    .insert(t.authThrottle)
    .values({ key, failures, lockedUntil: lock, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: t.authThrottle.key,
      set: { failures, lockedUntil: lock, updatedAt: new Date() },
    });
}

/**
 * Audit SEC-2 : RÉSERVE un essai AVANT la vérification, par un incrément atomique (plus de course entre la
 * lecture et l'écriture). Renvoie false si la clé est verrouillée ou si le seuil est déjà atteint : l'essai
 * n'est alors pas vérifié. Après un échec : `failAttempt` ; après un succès : `clearFailures`.
 */
export async function reserveAttempt(db: Db, key: string, max = MAX_FAILURES): Promise<boolean> {
  const r = await db.execute<{ failures: number; locked: boolean }>(sql`
    INSERT INTO auth_throttle (key, failures, locked_until, updated_at)
    VALUES (${key}, 1, NULL, now())
    ON CONFLICT (key) DO UPDATE SET
      failures = CASE
        WHEN (auth_throttle.locked_until IS NULL OR auth_throttle.locked_until <= now())
          AND auth_throttle.updated_at < now() - interval '1 hour' THEN 1
        ELSE auth_throttle.failures + 1 END,
      updated_at = now()
    RETURNING failures, (locked_until IS NOT NULL AND locked_until > now()) AS locked`);
  const row = r.rows[0]!;
  if (row.locked) return false;
  if (row.failures > max) {
    await lockKey(db, key, row.failures, max);
    return false;
  }
  return true;
}

/** Échec d'un essai réservé : verrouillage à partir du seuil (1, 2, 4… minutes, 60 au plus). */
export async function failAttempt(db: Db, key: string, max = MAX_FAILURES): Promise<void> {
  const [r] = await db.select().from(t.authThrottle).where(eq(t.authThrottle.key, key));
  if (r && r.failures >= max) await lockKey(db, key, r.failures, max);
}

async function lockKey(db: Db, key: string, failures: number, max: number) {
  const until = new Date(Date.now() + Math.min(60, 2 ** Math.max(0, failures - max)) * 60_000);
  await db.update(t.authThrottle).set({ lockedUntil: until }).where(eq(t.authThrottle.key, key));
}

export async function clearFailures(db: Db, key: string): Promise<void> {
  await db.delete(t.authThrottle).where(eq(t.authThrottle.key, key));
}

// ------------------------------------------------------------------ journal d'audit

export async function audit(
  db: Db,
  actor: string | null,
  action: string,
  target?: string | null,
  after?: unknown,
): Promise<void> {
  await db
    .insert(t.auditLog)
    .values({ actorAccountId: actor, action, target: target ?? null, after: after ?? null });
}
