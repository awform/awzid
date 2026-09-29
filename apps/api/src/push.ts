/**
 * Notifications web push (lot 16) : abonnement de l'appareil, préférences (TOUT désactivé par défaut ;
 * notifications concernant un enfant : accord du parent avec son code ; heures calmes). L'envoi est fait par
 * le travailleur (clé privée VAPID dans son seul périmètre) ; l'API ne connaît que la clé publique.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { verifySecret } from './auth/crypto.js';
import { audit, clearFailures, lockedUntil, recordFailure } from './auth/service.js';

const err = (reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code } });

export function vapidPublicKey(): string | null {
  const k = process.env.AWFORM_VAPID_PUBLIC?.trim();
  return k && /^[A-Za-z0-9_-]{80,100}$/.test(k) ? k : null;
}

const DEFAULTS = {
  devoirs: false,
  rapport: false,
  enfants: false,
  quietStart: 20,
  quietEnd: 8,
  tz: 'Africa/Dakar',
  locale: 'fr',
};

export function registerPush(app: FastifyInstance, db: Db): void {
  const needAccount = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
  };

  app.get('/api/v1/notifications', { preHandler: needAccount }, async (req) => {
    const [p] = await db
      .select()
      .from(t.notificationPref)
      .where(eq(t.notificationPref.accountId, req.auth!.accountId));
    const subs = await db
      .select({ endpoint: t.pushSubscription.endpoint })
      .from(t.pushSubscription)
      .where(eq(t.pushSubscription.accountId, req.auth!.accountId));
    return {
      disponible: !!vapidPublicKey(),
      preferences: p
        ? {
            devoirs: p.devoirs,
            rapport: p.rapport,
            enfants: p.enfants,
            quietStart: p.quietStart,
            quietEnd: p.quietEnd,
            tz: p.tz,
            locale: p.locale,
          }
        : DEFAULTS,
      appareils: subs.length,
      endpoints: subs.map((s) => s.endpoint),
    };
  });

  app.put<{ Body: typeof DEFAULTS }>(
    '/api/v1/notifications',
    {
      preHandler: needAccount,
      schema: {
        body: {
          type: 'object',
          required: ['devoirs', 'rapport', 'enfants', 'quietStart', 'quietEnd', 'tz'],
          additionalProperties: false,
          properties: {
            devoirs: { type: 'boolean' },
            rapport: { type: 'boolean' },
            enfants: { type: 'boolean' },
            quietStart: { type: 'integer', minimum: 0, maximum: 23 },
            quietEnd: { type: 'integer', minimum: 0, maximum: 23 },
            tz: { type: 'string', maxLength: 60, pattern: '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' },
            locale: { type: 'string', enum: ['fr', 'en'] },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      // heures calmes d'au moins 8 heures (le soir et la nuit restent libres)
      const span = (b.quietEnd - b.quietStart + 24) % 24;
      if (span < 8) return err(reply, 400, 'heures_calmes_trop_courtes');
      try {
        new Intl.DateTimeFormat('fr', { timeZone: b.tz });
      } catch {
        return err(reply, 400, 'fuseau_inconnu');
      }
      const accountId = req.auth!.accountId;
      // notifications concernant un enfant : accord du parent (code parent s'il existe)
      if (b.enfants) {
        const [a] = await db
          .select({ h: t.account.parentPinHash })
          .from(t.account)
          .where(eq(t.account.id, accountId));
        if (a?.h) {
          const pin = String(req.headers['x-parent-pin'] ?? '');
          const lk = `pin:${accountId}`;
          if (await lockedUntil(db, lk)) return err(reply, 429, 'verrouille');
          if (!pin || !(await verifySecret(pin, a.h))) {
            await recordFailure(db, lk);
            return err(reply, 401, 'code_parent_incorrect');
          }
          await clearFailures(db, lk);
        }
      }
      const v = { ...b, locale: b.locale ?? 'fr', updatedAt: new Date() };
      await db
        .insert(t.notificationPref)
        .values({ accountId, ...v })
        .onConflictDoUpdate({ target: t.notificationPref.accountId, set: v });
      await audit(db, accountId, 'notifications.preferences', accountId, {
        devoirs: b.devoirs,
        rapport: b.rapport,
        enfants: b.enfants,
      });
      return { ok: true };
    },
  );

  app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>(
    '/api/v1/notifications/abonnement',
    {
      preHandler: needAccount,
      schema: {
        body: {
          type: 'object',
          required: ['endpoint', 'keys'],
          properties: {
            endpoint: { type: 'string', maxLength: 1000, pattern: '^https://' },
            keys: {
              type: 'object',
              required: ['p256dh', 'auth'],
              properties: {
                p256dh: { type: 'string', maxLength: 200 },
                auth: { type: 'string', maxLength: 100 },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!vapidPublicKey()) return err(reply, 503, 'notifications_indisponibles');
      const { endpoint, keys } = req.body;
      await db
        .insert(t.pushSubscription)
        .values({ accountId: req.auth!.accountId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
        .onConflictDoUpdate({
          target: t.pushSubscription.endpoint,
          set: {
            accountId: req.auth!.accountId,
            p256dh: keys.p256dh,
            auth: keys.auth,
            failures: 0,
          },
        });
      return reply.code(201).send({ ok: true });
    },
  );

  app.delete<{ Body: { endpoint: string } }>(
    '/api/v1/notifications/abonnement',
    {
      preHandler: needAccount,
      schema: {
        body: {
          type: 'object',
          required: ['endpoint'],
          properties: { endpoint: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (req) => {
      await db
        .delete(t.pushSubscription)
        .where(
          and(
            eq(t.pushSubscription.endpoint, req.body.endpoint),
            eq(t.pushSubscription.accountId, req.auth!.accountId),
          ),
        );
      return { ok: true };
    },
  );
}
