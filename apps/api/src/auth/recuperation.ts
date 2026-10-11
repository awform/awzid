/**
 * Récupération du compte (lot F3, revue M7) — OWASP ASVS 5.0 V6.4 :
 *  - vérification de l'adresse e-mail à l'inscription (lien à usage unique, 24 h ; renvoi limité) ;
 *  - « mot de passe oublié » : lien à usage unique, 30 minutes, haché en base, limité (par adresse et par
 *    adresse IP) ; la réponse est TOUJOURS la même (202), que le compte existe ou non, et le travail (recherche,
 *    jeton, envoi) se fait APRÈS la réponse : ni le contenu ni la durée ne révèlent l'existence d'un compte ;
 *    un nouveau mot de passe ferme toutes les sessions et prévient le titulaire ;
 *  - changement d'adresse VÉRIFIÉ : mot de passe ressaisi, lien envoyé à la NOUVELLE adresse, l'ancienne est
 *    prévenue une fois le changement fait ; une adresse déjà prise reçoit un avis neutre (rien ne change).
 * Les liens portent le jeton dans le FRAGMENT (`/acces#reinit=…`) : jamais envoyé au serveur web, ni dans les
 * journaux, ni dans l'en-tête Referer ; la page le transmet par POST.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { hashSecret, randomToken, sha256 } from './crypto.js';
import { checkPassword, MAX_LENGTH } from './passwords.js';
import { audit, clearFailures, reserveAttempt, revokeAll } from './service.js';
import { EMAIL, emailKey, err, type AuthKit } from './common.js';
import type { Mailer } from '../mail/envoi.js';
import { maskEmail, renderMail, type MailKind } from '../mail/modeles.js';

type Purpose = 'verification_email' | 'reinitialisation' | 'changement_email';
/** durées de validité des liens */
export const TOKEN_TTL_MS: Record<Purpose, number> = {
  verification_email: 24 * 3600_000,
  reinitialisation: 30 * 60_000,
  changement_email: 24 * 3600_000,
};
/** fragment de la page /acces selon l'usage du lien */
const FRAGMENT: Record<Purpose, string> = {
  verification_email: 'verif',
  reinitialisation: 'reinit',
  changement_email: 'email',
};

export interface RecoveryOptions {
  mailer: Mailer;
  /** adresse publique du site (liens des e-mails) ; null : liens impossibles, e-mails non envoyés */
  publicUrl: string | null;
  log?: { warn: (o: object, m: string) => void };
}

/** Crée un lien à usage unique (les liens précédents du même usage sont annulés) ; renvoie le jeton. */
export async function issueToken(
  db: Db,
  accountId: string,
  purpose: Purpose,
  email: string,
): Promise<string> {
  const token = randomToken(32);
  await db
    .update(t.accountToken)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(t.accountToken.accountId, accountId),
        eq(t.accountToken.purpose, purpose),
        isNull(t.accountToken.usedAt),
      ),
    );
  await db.insert(t.accountToken).values({
    accountId,
    purpose,
    tokenHash: sha256(token),
    email,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/**
 * Consomme un lien : valable, non expiré, non utilisé, de l'usage attendu ; la consommation est ATOMIQUE (deux
 * ouvertures simultanées : une seule gagne). Renvoie la ligne, ou null (même réponse pour tous les cas).
 */
async function consume(db: Db, token: string, purposes: Purpose[]) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .update(t.accountToken)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(t.accountToken.tokenHash, sha256(token)),
        isNull(t.accountToken.usedAt),
        gt(t.accountToken.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row || !purposes.includes(row.purpose)) return null;
  return row;
}

export function registerRecovery(app: FastifyInstance, kit: AuthKit, opts: RecoveryOptions): void {
  const { db, needAuth, passwordOk } = kit;
  const warn = (e: unknown, what: string) =>
    (opts.log ?? app.log).warn({ err: String(e) }, `e-mail non envoyé (${what})`);

  /** Envoi d'un message ; jamais d'adresse ni de lien dans les journaux. */
  const send = async (
    to: string,
    kind: MailKind,
    locale: string,
    vars: { link?: string; email?: string } = {},
  ) => {
    if (opts.mailer.mode === 'inactif') return;
    if (
      vars.link === undefined &&
      ['verification', 'reinitialisation', 'changement_email'].includes(kind)
    )
      return;
    try {
      await opts.mailer.send({ to, kind, ...renderMail(kind, locale, vars) });
    } catch (e) {
      warn(e, kind);
    }
  };
  const linkFor = (purpose: Purpose, token: string) =>
    opts.publicUrl ? `${opts.publicUrl}/acces#${FRAGMENT[purpose]}=${token}` : undefined;

  /** lien de vérification de l'adresse actuelle du compte (inscription, renvoi) */
  const sendVerification = async (accountId: string, email: string, locale: string) => {
    if (opts.mailer.mode === 'inactif' || !opts.publicUrl) return;
    const token = await issueToken(db, accountId, 'verification_email', email);
    await send(email, 'verification', locale, { link: linkFor('verification_email', token) });
  };
  kit.sendVerification = (accountId, email, locale) =>
    void sendVerification(accountId, email, locale).catch((e) => warn(e, 'verification'));

  /** travail fait après la réponse (aucune différence de durée visible) */
  const later = (what: string, job: () => Promise<void>) =>
    setImmediate(() => void job().catch((e) => warn(e, what)));

  // ---------------------------------------------------------------- mot de passe oublié

  app.post<{ Body: { email: string } }>(
    '/api/v1/auth/password-reset',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', maxLength: 254 } },
        },
      },
    },
    async (req, reply) => {
      // limitation par adresse IP (même réponse « trop de demandes » pour tous, sans rien dire du compte)
      if (!(await reserveAttempt(db, `reset-ip:${req.ip}`, 10)))
        return err(reply, 429, 'trop_de_demandes');
      const email = req.body.email.trim().toLowerCase();
      const ok = new RegExp(EMAIL).test(email);
      // au plus 3 liens par heure et par adresse : au-delà, la réponse reste la même et rien n'est envoyé
      const allowed = ok && (await reserveAttempt(db, `reset:${emailKey(email)}`, 3));
      if (allowed)
        later('reinitialisation', async () => {
          const [a] = await db
            .select()
            .from(t.account)
            .where(and(eq(t.account.email, email), isNull(t.account.deletedAt)));
          // ni compte d'école (sans mot de passe), ni compte inconnu : rien n'est envoyé
          if (!a || a.kind === 'ecole' || !a.email) return;
          const token = await issueToken(db, a.id, 'reinitialisation', a.email);
          await send(a.email, 'reinitialisation', a.locale, {
            link: linkFor('reinitialisation', token),
          });
          await audit(db, a.id, 'mot_de_passe.lien_envoye', a.id);
        });
      return reply.code(202).send({ ok: true });
    },
  );

  app.post<{ Body: { token: string; password: string } }>(
    '/api/v1/auth/password-reset/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'password'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', maxLength: 120 },
            password: { type: 'string', maxLength: MAX_LENGTH * 4 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await reserveAttempt(db, `reset-confirm:${req.ip}`, 20)))
        return err(reply, 429, 'trop_de_demandes');
      // le mot de passe est contrôlé AVANT de consommer le lien (une faute de saisie ne le brûle pas)
      const [peek] = /^[A-Za-z0-9_-]{20,100}$/.test(req.body.token)
        ? await db
            .select({ accountId: t.accountToken.accountId, email: t.accountToken.email })
            .from(t.accountToken)
            .where(eq(t.accountToken.tokenHash, sha256(req.body.token)))
        : [];
      const pb = checkPassword(req.body.password, peek?.email ?? '');
      if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
      const row = await consume(db, req.body.token, ['reinitialisation']);
      if (!row) return err(reply, 400, 'lien_invalide');
      const [a] = await db
        .select()
        .from(t.account)
        .where(and(eq(t.account.id, row.accountId), isNull(t.account.deletedAt)));
      if (!a || !a.email) return err(reply, 400, 'lien_invalide');
      await db
        .update(t.account)
        .set({
          passwordHash: await hashSecret(req.body.password),
          passwordChangedAt: new Date(),
          // le lien a été reçu à l'adresse du compte : elle est vérifiée
          ...(row.email === a.email && !a.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
        })
        .where(eq(t.account.id, a.id));
      // tous les autres liens de réinitialisation du compte sont annulés ; toutes les sessions fermées
      await db
        .update(t.accountToken)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(t.accountToken.accountId, a.id),
            eq(t.accountToken.purpose, 'reinitialisation'),
            isNull(t.accountToken.usedAt),
          ),
        );
      await revokeAll(db, a.id);
      await clearFailures(db, `mdp:${a.id}`);
      await audit(db, a.id, 'mot_de_passe.reinitialisation', a.id);
      later('mot_de_passe_modifie', () => send(a.email!, 'mot_de_passe_modifie', a.locale));
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- vérification de l'adresse

  app.post<{ Body: { token: string } }>(
    '/api/v1/auth/email/verify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: { token: { type: 'string', maxLength: 120 } },
        },
      },
    },
    async (req, reply) => {
      if (!(await reserveAttempt(db, `verif-ip:${req.ip}`, 30)))
        return err(reply, 429, 'trop_de_demandes');
      const row = await consume(db, req.body.token, ['verification_email', 'changement_email']);
      if (!row || !row.email) return err(reply, 400, 'lien_invalide');
      const [a] = await db
        .select()
        .from(t.account)
        .where(and(eq(t.account.id, row.accountId), isNull(t.account.deletedAt)));
      if (!a) return err(reply, 400, 'lien_invalide');
      if (row.purpose === 'verification_email') {
        // l'adresse a changé depuis l'envoi : ce lien ne vaut plus
        if (row.email !== a.email) return err(reply, 400, 'lien_invalide');
        if (!a.emailVerifiedAt)
          await db
            .update(t.account)
            .set({ emailVerifiedAt: new Date() })
            .where(eq(t.account.id, a.id));
        await audit(db, a.id, 'email.verification', a.id);
        return { ok: true, nature: 'verification' };
      }
      // changement d'adresse : la nouvelle adresse doit être restée libre
      const [taken] = await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(and(eq(t.account.email, row.email), ne(t.account.id, a.id)));
      if (taken) return err(reply, 409, 'email_indisponible');
      const old = a.email;
      await db
        .update(t.account)
        .set({ email: row.email, emailVerifiedAt: new Date() })
        .where(eq(t.account.id, a.id));
      // les liens envoyés à l'ancienne adresse ne valent plus
      await db
        .update(t.accountToken)
        .set({ usedAt: new Date() })
        .where(and(eq(t.accountToken.accountId, a.id), isNull(t.accountToken.usedAt)));
      await audit(db, a.id, 'email.changement', a.id);
      if (old)
        later('email_modifie', () =>
          send(old, 'email_modifie', a.locale, { email: maskEmail(row.email!) }),
        );
      return { ok: true, nature: 'changement' };
    },
  );

  app.post('/api/v1/auth/email/verify/resend', { preHandler: needAuth }, async (req, reply) => {
    const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
    if (!a?.email) return err(reply, 400, 'email_absent');
    if (a.emailVerifiedAt) return { ok: true, dejaVerifiee: true };
    if (!(await reserveAttempt(db, `verif-renvoi:${a.id}`, 3)))
      return err(reply, 429, 'trop_de_demandes');
    later('verification', () => sendVerification(a.id, a.email!, a.locale));
    return reply.code(202).send({ ok: true });
  });

  // ---------------------------------------------------------------- changement d'adresse

  app.post<{ Body: { password: string; email: string } }>(
    '/api/v1/account/email',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          required: ['password', 'email'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', maxLength: 512 },
            email: { type: 'string', maxLength: 254, pattern: EMAIL },
          },
        },
      },
    },
    async (req, reply: FastifyReply) => {
      if (req.auth!.tablet || req.auth!.kind === 'ecole') return err(reply, 403, 'interdit');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      const email = req.body.email.trim().toLowerCase();
      if (email === a.email) return err(reply, 400, 'email_identique');
      if (!(await reserveAttempt(db, `email-change:${a.id}`, 5)))
        return err(reply, 429, 'trop_de_demandes');
      later('changement_email', async () => {
        const [taken] = await db
          .select({ id: t.account.id })
          .from(t.account)
          .where(eq(t.account.email, email));
        if (taken) return send(email, 'email_deja_utilise', a.locale);
        const token = await issueToken(db, a.id, 'changement_email', email);
        await send(email, 'changement_email', a.locale, {
          link: linkFor('changement_email', token),
        });
      });
      await audit(db, a.id, 'email.changement_demande', a.id);
      return reply.code(202).send({ ok: true });
    },
  );
}
