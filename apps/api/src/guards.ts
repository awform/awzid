/**
 * Contrôles d'accès communs aux lots 18 et suivants (même logique que les lots 13 et 16) :
 *  - famille : le profil appartient au compte connecté (ni enseignant ni administrateur) ;
 *  - code parent : exigé pour un profil d'enfant quand le parent en a défini un ;
 *  - enseignant : compte enseignant avec second facteur vérifié.
 * Chaque fonction ENVOIE le refus et renvoie `false` ; l'appelant s'arrête (`if (!(await …)) return reply`),
 * car une réponse Fastify est « thenable » et un `await` seul ne l'arrêterait pas (correctif du lot 16).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { ownsProfile } from './auth/routes.js';
import { verifySecret } from './auth/crypto.js';
import { clearFailures, lockedUntil, recordFailure } from './auth/service.js';

export const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });

export const UUID = { type: 'string', format: 'uuid' } as const;

/** Profil de la famille connectée (id, genre de profil), ou refus envoyé et null. */
export async function familyProfile(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  profileId: string,
): Promise<{ id: string; kind: string } | null> {
  if (!req.auth) {
    err(reply, 401, 'non_connecte');
    return null;
  }
  if (req.auth.kind === 'enseignant' || req.auth.kind === 'admin') {
    err(reply, 403, 'reserve_aux_familles');
    return null;
  }
  if (!(await ownsProfile(db, req.auth.accountId, profileId))) {
    err(reply, 404, 'introuvable');
    return null;
  }
  const [p] = await db
    .select({ id: t.profile.id, kind: t.profile.kind })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  return p ?? null;
}

/** Pour un enfant : code parent exigé (s'il existe). Renvoie false si le refus a été envoyé. */
export async function parentGate(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  kind: string,
): Promise<boolean> {
  if (kind !== 'enfant') return true;
  const [a] = await db
    .select({ h: t.account.parentPinHash })
    .from(t.account)
    .where(eq(t.account.id, req.auth!.accountId));
  if (!a?.h) return true;
  const pin = String(req.headers['x-parent-pin'] ?? '');
  const lk = `pin:${req.auth!.accountId}`;
  if (await lockedUntil(db, lk)) {
    err(reply, 429, 'verrouille');
    return false;
  }
  if (!pin || !(await verifySecret(pin, a.h))) {
    await recordFailure(db, lk);
    err(reply, 401, 'code_parent_incorrect');
    return false;
  }
  await clearFailures(db, lk);
  return true;
}

/** preHandler : enseignant avec second facteur. */
export async function needTeacher(req: FastifyRequest, reply: FastifyReply) {
  if (!req.auth) return err(reply, 401, 'non_connecte');
  if (req.auth.kind !== 'enseignant') return err(reply, 403, 'reserve_aux_enseignants');
  if (!req.auth.mfaVerified)
    return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
}
