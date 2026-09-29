/**
 * Espace ADMINISTRATEUR minimal, en LECTURE SEULE (demande du fondateur, tests multi-rôles) : utilisateurs
 * (comptes et profils par type, e-mails masqués), contenus importés et éditions, questions en attente du
 * tuteur, alertes de protection ouvertes, abonnements, journal d'audit récent. Second facteur obligatoire.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';

const err = (reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code } });

/** « parent-abc@demo.awform.test » → « p…c@demo.awform.test » (minimisation) */
export function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const [user = '', domain = ''] = e.split('@');
  return `${user.slice(0, 1)}…${user.length > 1 ? user.slice(-1) : ''}@${domain}`;
}

export function registerAdmin(app: FastifyInstance, db: Db): void {
  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (req.auth.kind !== 'admin') return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  app.get('/api/v1/admin/overview', { preHandler: needAdmin }, async () => {
    const count = (col: unknown) => sql<number>`count(${col})::int`;
    const accounts = await db
      .select({ kind: t.account.kind, n: count(t.account.id) })
      .from(t.account)
      .where(isNull(t.account.deletedAt))
      .groupBy(t.account.kind);
    const profiles = await db
      .select({ kind: t.profile.kind, n: count(t.profile.id) })
      .from(t.profile)
      .groupBy(t.profile.kind);
    const recent = await db
      .select({
        id: t.account.id,
        kind: t.account.kind,
        email: t.account.email,
        country: t.account.country,
        createdAt: t.account.createdAt,
        totp: t.account.totpEnabled,
      })
      .from(t.account)
      .orderBy(desc(t.account.createdAt))
      .limit(30);
    const editions = await db
      .select({
        code: t.edition.code,
        status: t.edition.status,
        publishedAt: t.edition.publishedAt,
        createdAt: t.edition.createdAt,
        report: t.edition.report,
      })
      .from(t.edition)
      .orderBy(desc(t.edition.createdAt))
      .limit(10);
    const levels = await db
      .select({ level: t.unit.levelCode, n: count(t.unit.id) })
      .from(t.unit)
      .groupBy(t.unit.levelCode)
      .orderBy(t.unit.levelCode);
    const questions = await db
      .select({
        id: t.tutorQuestion.id,
        pseudonym: t.profile.pseudonym,
        text: t.tutorQuestion.text,
        motif: t.tutorQuestion.motif,
        status: t.tutorQuestion.status,
        createdAt: t.tutorQuestion.createdAt,
      })
      .from(t.tutorQuestion)
      .innerJoin(t.profile, eq(t.profile.id, t.tutorQuestion.profileId))
      .orderBy(desc(t.tutorQuestion.createdAt))
      .limit(20);
    const alerts = await db
      .select({ id: t.tutorAlert.id, motif: t.tutorAlert.motif, createdAt: t.tutorAlert.createdAt })
      .from(t.tutorAlert)
      .where(isNull(t.tutorAlert.handledAt))
      .orderBy(desc(t.tutorAlert.createdAt))
      .limit(20);
    const subs = await db
      .select({
        plan: t.subscription.planCode,
        status: t.subscription.status,
        n: count(t.subscription.id),
      })
      .from(t.subscription)
      .groupBy(t.subscription.planCode, t.subscription.status);
    const audit = await db
      .select({
        action: t.auditLog.action,
        target: t.auditLog.target,
        at: t.auditLog.at,
        actorKind: t.account.kind,
      })
      .from(t.auditLog)
      .leftJoin(t.account, eq(t.account.id, t.auditLog.actorAccountId))
      .orderBy(desc(t.auditLog.at))
      .limit(50);
    return {
      comptes: accounts,
      profils: profiles,
      derniersComptes: recent.map((a) => ({ ...a, email: maskEmail(a.email) })),
      editions: editions.map((e) => {
        const r = (e.report ?? {}) as Record<string, unknown>;
        return {
          code: e.code,
          statut: e.status,
          publiee: e.publishedAt,
          creee: e.createdAt,
          unites: r.units ?? r.unites ?? null,
          avertissements: Array.isArray(r.warnings)
            ? r.warnings.length
            : (r.avertissements ?? null),
          hadithsMasques: r.numerosHadithsMasques ?? null,
        };
      }),
      niveaux: levels,
      questions,
      alertes: alerts,
      abonnements: subs,
      audit,
    };
  });
}
