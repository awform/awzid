/**
 * Lot 23 (V1-g) — codes d'activation imprimés dans les livres (CDC § 5.3) : l'administrateur génère un lot
 * pour un niveau (12 mois par défaut) ; les codes en clair ne sont montrés qu'une fois (fichier pour
 * l'imprimeur), le serveur n'en garde que l'empreinte. Une famille ou un adulte saisit le code : accès au
 * niveau entier pendant la durée du lot, ajoutée à la fin d'un accès en cours. Aucun paiement réel ici.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { generateCode, hashCode, normalizeCode, passEnd } from '@awform/billing';
import { audit, clearFailures, failAttempt, lockedUntil, reserveAttempt } from './auth/service.js';
import { err, minorHolder, UUID } from './guards.js';

export function registerActivation(app: FastifyInstance, db: Db): void {
  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (req.auth.kind !== 'admin') return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  /** nouveau lot : codes en clair renvoyés UNE seule fois */
  app.post<{
    Body: {
      niveau: string;
      quantite: number;
      mois?: number;
      libelle: string;
      valableJusquau?: string;
    };
  }>(
    '/api/v1/admin/activation/lots',
    {
      preHandler: needAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['niveau', 'quantite', 'libelle'],
          additionalProperties: false,
          properties: {
            niveau: { type: 'string', pattern: '^[a-z]{2,4}\\d{1,2}$' },
            quantite: { type: 'integer', minimum: 1, maximum: 5000 },
            mois: { type: 'integer', minimum: 1, maximum: 24 },
            libelle: { type: 'string', minLength: 1, maxLength: 120 },
            valableJusquau: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const [lv] = await db
        .select({ c: t.level.code })
        .from(t.level)
        .where(eq(t.level.code, b.niveau));
      if (!lv) return err(reply, 400, 'niveau_inconnu');
      const codes = new Set<string>();
      while (codes.size < b.quantite) codes.add(generateCode());
      const list = [...codes];
      const lot = await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(t.activationBatch)
          .values({
            levelCode: b.niveau,
            label: b.libelle,
            months: b.mois ?? 12,
            quantity: b.quantite,
            redeemBy: b.valableJusquau ? new Date(`${b.valableJusquau}T23:59:59Z`) : null,
            createdBy: req.auth!.accountId,
          })
          .returning();
        for (let i = 0; i < list.length; i += 500)
          await tx.insert(t.activationCode).values(
            list.slice(i, i + 500).map((c) => {
              const n = normalizeCode(c)!;
              return { batchId: batch!.id, codeHash: hashCode(n), last4: n.slice(-4) };
            }),
          );
        return batch!;
      });
      await audit(db, req.auth!.accountId, 'activation.lot', lot.id, {
        niveau: b.niveau,
        quantite: b.quantite,
      });
      return reply.code(201).send({ lot, codes: list });
    },
  );

  app.get('/api/v1/admin/activation/lots', { preHandler: needAdmin }, async () => {
    const lots = await db
      .select({
        id: t.activationBatch.id,
        niveau: t.activationBatch.levelCode,
        libelle: t.activationBatch.label,
        mois: t.activationBatch.months,
        quantite: t.activationBatch.quantity,
        valableJusquau: t.activationBatch.redeemBy,
        creeLe: t.activationBatch.createdAt,
        utilises: sql<number>`(select count(*)::int from activation_code c where c.batch_id = activation_batch.id and c.redeemed_at is not null)`,
        revoques: sql<number>`(select count(*)::int from activation_code c where c.batch_id = activation_batch.id and c.revoked_at is not null)`,
      })
      .from(t.activationBatch)
      .orderBy(desc(t.activationBatch.createdAt))
      .limit(200);
    return { lots };
  });

  /** lot perdu ou volé : les codes non utilisés sont révoqués (les accès déjà ouverts restent) */
  app.post<{ Params: { id: string } }>(
    '/api/v1/admin/activation/lots/:id/revoquer',
    {
      preHandler: needAdmin,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const r = await db
        .update(t.activationCode)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(t.activationCode.batchId, req.params.id),
            isNull(t.activationCode.redeemedAt),
            isNull(t.activationCode.revokedAt),
          ),
        )
        .returning({ id: t.activationCode.id });
      await audit(db, req.auth!.accountId, 'activation.revocation', req.params.id, { n: r.length });
      if (!r.length) return err(reply, 404, 'introuvable');
      return { revoques: r.length };
    },
  );

  // ------------------------------------------------------------------ côté famille

  const holder = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return void err(reply, 401, 'non_connecte');
    if (req.auth.kind !== 'parent' && req.auth.kind !== 'adulte')
      return void err(reply, 403, 'reserve_aux_familles');
    // audit MIN-1 : un titulaire mineur passe par son parent
    if (await minorHolder(db, req.auth.accountId)) return void err(reply, 403, 'parent_requis');
    return req.auth.accountId;
  };

  app.get('/api/v1/activation', async (req, reply) => {
    const me = await holder(req, reply);
    if (!me) return reply;
    const acces = await db
      .select({
        niveau: t.levelPass.levelCode,
        debut: t.levelPass.startsAt,
        fin: t.levelPass.endsAt,
      })
      .from(t.levelPass)
      .where(and(eq(t.levelPass.accountId, me), gt(t.levelPass.endsAt, new Date())))
      .orderBy(t.levelPass.levelCode, t.levelPass.endsAt);
    return { acces };
  });

  app.post<{ Body: { code: string } }>(
    '/api/v1/activation',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: { code: { type: 'string', minLength: 1, maxLength: 40 } },
        },
      },
    },
    async (req, reply) => {
      const me = await holder(req, reply);
      if (!me) return reply;
      // faute de frappe : détectée par le caractère de contrôle, sans consulter la base ni compter d'essai
      const n = normalizeCode(req.body.code);
      if (!n) return err(reply, 400, 'code_mal_saisi');
      const lk = `act:${me}`;
      if ((await lockedUntil(db, lk)) || !(await reserveAttempt(db, lk)))
        return err(reply, 429, 'verrouille');
      const res = await db.transaction(async (tx) => {
        // usage unique, atomique : seul le premier qui pose redeemed_at gagne
        const [c] = await tx
          .update(t.activationCode)
          .set({ redeemedAt: new Date(), redeemedBy: me })
          .where(
            and(
              eq(t.activationCode.codeHash, hashCode(n)),
              isNull(t.activationCode.redeemedAt),
              isNull(t.activationCode.revokedAt),
              sql`exists (select 1 from activation_batch b where b.id = activation_code.batch_id
                and (b.redeem_by is null or b.redeem_by > now()))`,
            ),
          )
          .returning({ id: t.activationCode.id, batchId: t.activationCode.batchId });
        if (!c) return null;
        const [b] = await tx
          .select()
          .from(t.activationBatch)
          .where(eq(t.activationBatch.id, c.batchId));
        // verrou sur les accès de ce compte à ce niveau (deux codes saisis en même temps)
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`pass:${me}:${b!.levelCode}`}))`,
        );
        const [cur] = await tx
          .select({ end: t.levelPass.endsAt })
          .from(t.levelPass)
          .where(and(eq(t.levelPass.accountId, me), eq(t.levelPass.levelCode, b!.levelCode)))
          .orderBy(desc(t.levelPass.endsAt))
          .limit(1);
        const { start, end } = passEnd(cur?.end ?? null, b!.months);
        await tx.insert(t.levelPass).values({
          accountId: me,
          levelCode: b!.levelCode,
          codeId: c.id,
          startsAt: start,
          endsAt: end,
        });
        return { niveau: b!.levelCode, jusquAu: end };
      });
      if (!res) {
        await failAttempt(db, lk);
        return err(reply, 404, 'code_inconnu_ou_utilise');
      }
      await clearFailures(db, lk);
      await audit(db, me, 'activation.code', null, { niveau: res.niveau });
      return res;
    },
  );
}
