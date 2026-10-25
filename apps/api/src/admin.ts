/**
 * Espace ADMINISTRATEUR minimal, en LECTURE SEULE (demande du fondateur, tests multi-rôles) : utilisateurs
 * (comptes et profils par type, e-mails masqués), contenus importés et éditions, questions en attente du
 * tuteur, alertes de protection ouvertes, abonnements, journal d'audit récent. Second facteur obligatoire.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import {
  masquerTelephone,
  normaliserTelephone,
  ressembleTelephone,
} from '@awform/school/telephone';
import { audit, hasRole, revokeAll } from './auth/service.js';
import { dechiffrer, phoneHashOf } from './identites/cles.js';

const err = (reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code } });

/**
 * « parent-abc@demo.awform.test » → « p…c@demo.awform.test » (minimisation) ; une partie locale de moins de
 * 5 caractères est entièrement masquée (audit MIN-12 : « ab@… » ne se devine plus).
 */
export function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const [user = '', domain = ''] = e.split('@');
  if (user.length < 5) return `…@${domain}`;
  return `${user.slice(0, 1)}…${user.slice(-1)}@${domain}`;
}

export function registerAdmin(app: FastifyInstance, db: Db, secretKey: Buffer | null = null): void {
  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    // lot F2 (revue E2) : administrateur, ou support (lecture seule de la vue d'ensemble)
    if (!hasRole(req.auth, 'admin', 'support')) return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  // écriture : l'administrateur seulement (pas le support), second facteur obligatoire
  const needAdminEcriture = async (req: FastifyRequest, reply: FastifyReply) => {
    await needAdmin(req, reply);
    if (reply.sent) return;
    if (!hasRole(req.auth!, 'admin')) return err(reply, 403, 'reserve_admin');
  };

  /** Contact affichable d'un compte : e-mail masqué, ou numéro masqué (jamais en clair). */
  const contactMasque = (a: { email: string | null; phoneEnc: string | null }): string | null =>
    maskEmail(a.email) ?? masquerTelephone(dechiffrer(secretKey, a.phoneEnc));

  // ------------------------------------------------------------------ blocage d'un compte, un par un
  app.get('/api/v1/admin/comptes/bloques', { preHandler: needAdminEcriture }, async () => {
    const rows = await db
      .select({
        id: t.account.id,
        kind: t.account.kind,
        email: t.account.email,
        phoneEnc: t.account.phoneEnc,
        blockedAt: t.account.blockedAt,
      })
      .from(t.account)
      .where(and(isNotNull(t.account.blockedAt), isNull(t.account.deletedAt)))
      .orderBy(desc(t.account.blockedAt))
      .limit(200);
    return {
      comptes: rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        contact: contactMasque(a),
        bloqueLe: a.blockedAt,
      })),
    };
  });

  app.post<{ Body: { identifiant?: string; bloquer?: boolean; pays?: string } }>(
    '/api/v1/admin/comptes/blocage',
    { preHandler: needAdminEcriture },
    async (req, reply) => {
      const saisi = (req.body?.identifiant ?? '').trim();
      if (!saisi || saisi.length > 200 || typeof req.body?.bloquer !== 'boolean')
        return err(reply, 400, 'requete_invalide');
      let cible;
      if (ressembleTelephone(saisi)) {
        const n = normaliserTelephone(saisi, req.body.pays ?? 'SN');
        if (!n.ok || !secretKey) return err(reply, 404, 'introuvable');
        cible = eq(t.account.phoneHash, phoneHashOf(secretKey, n.e164));
      } else cible = eq(t.account.email, saisi.toLowerCase());
      const [a] = await db
        .select({ id: t.account.id, kind: t.account.kind, blockedAt: t.account.blockedAt })
        .from(t.account)
        .where(and(cible, isNull(t.account.deletedAt)));
      if (!a) return err(reply, 404, 'introuvable');
      if (a.id === req.auth!.accountId) return err(reply, 400, 'pas_soi_meme');
      const bloquer = req.body.bloquer;
      if (bloquer === !!a.blockedAt) return { ok: true, change: false, bloque: bloquer };
      await db
        .update(t.account)
        .set({ blockedAt: bloquer ? new Date() : null })
        .where(eq(t.account.id, a.id));
      // bloquer : toutes les sessions du compte sont fermées à l'instant
      if (bloquer) await revokeAll(db, a.id);
      await audit(db, req.auth!.accountId, bloquer ? 'compte.bloque' : 'compte.debloque', a.id, {
        kind: a.kind,
      });
      return { ok: true, change: true, bloque: bloquer };
    },
  );

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
      // audit MIN-12 : un compte en cours d'effacement n'est plus montré
      .where(isNull(t.account.deletedAt))
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
    // audit MIN-12 : motif, état et date seulement — jamais le texte libre d'un enfant ni son pseudonyme
    // (le texte est lu par l'enseignant de sa classe, pas par l'administrateur)
    const questions = await db
      .select({
        id: t.tutorQuestion.id,
        kind: t.profile.kind,
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
