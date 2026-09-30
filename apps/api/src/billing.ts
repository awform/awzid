/**
 * Paiements (lot 10) — couche abstraite multi-prestataires (@awform/billing). Aucune clé réelle, aucune
 * donnée de carte : le paiement se fait sur la page du prestataire (ou la page SIMULÉE en démonstration),
 * le résultat arrive par un événement signé, traité de façon IDEMPOTENTE ; l'application ne lit que les
 * droits (table subscription). Achat depuis l'espace adulte seulement : code parent exigé s'il existe.
 * AWFORM_PAIEMENT=off (défaut) : offres affichées, aucune vente.
 */
import { minorHolder } from './guards.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import {
  addPeriod,
  canOpenWithPacks,
  entitlementOf,
  planByCode,
  PLANS,
  providersFor,
  setupBilling,
  trialAvailable,
  zoneOf,
  NotConfiguredError,
  MOBILE_OPERATORS,
  type BillingEvent,
  type BillingSetup,
  type MobileOperator,
  type Entitlement,
  type ProviderId,
  type SubStatus,
} from '@awform/billing';
import { clearFailures, failAttempt, lockedUntil, reserveAttempt } from './auth/service.js';
import { verifySecret } from './auth/crypto.js';

const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });
const UUID = { type: 'string', format: 'uuid' } as const;

/** Contrôle des droits sur le contenu (audit PAY-4) ; `null` : droits non appliqués (AWFORM_DROITS=off). */
export interface ContentRights {
  /** droit du compte (abonnements, licence d'école d'une classe d'un de ses profils) ; anonyme : gratuit */
  of(auth: { accountId: string; kind: string } | undefined | null): Promise<Entitlement | null>;
  canOpen(e: Entitlement | null, unit: { n: number; levelCode?: string }): boolean;
}

export function registerBilling(app: FastifyInstance, db: Db, setup?: BillingSetup): ContentRights {
  const billing = setup ?? setupBilling(process.env);

  const account = async (id: string) =>
    (await db.select().from(t.account).where(eq(t.account.id, id)))[0];
  const subsOf = (accountId: string) =>
    db
      .select()
      .from(t.subscription)
      .where(eq(t.subscription.accountId, accountId))
      .orderBy(desc(t.subscription.createdAt));
  const like = (s: typeof t.subscription.$inferSelect) => ({
    planCode: s.planCode,
    status: s.status as SubStatus,
    currentPeriodEnd: s.currentPeriodEnd,
  });

  /** licence d'école couvrant un profil : licence active d'un enseignant d'une de ses classes, places suffisantes */
  async function schoolLicenceFor(profileId: string) {
    const rows = await db
      .select({ teacher: t.classGroup.teacherAccountId })
      .from(t.classMember)
      .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
      .where(eq(t.classMember.profileId, profileId));
    for (const { teacher } of rows) {
      const lic = (await subsOf(teacher)).find(
        (s) => s.planCode === 'licence_ecole' && entitlementOf([like(s)]).plan === 'licence_ecole',
      );
      if (!lic) continue;
      const classes = await db
        .select({ id: t.classGroup.id })
        .from(t.classGroup)
        .where(eq(t.classGroup.teacherAccountId, teacher));
      const members = classes.length
        ? new Set(
            (
              await db
                .select({ p: t.classMember.profileId })
                .from(t.classMember)
                .where(
                  inArray(
                    t.classMember.classId,
                    classes.map((c) => c.id),
                  ),
                )
            ).map((m) => m.p),
          ).size
        : 0;
      if (members <= (lic.seats ?? 0)) return { until: lic.currentPeriodEnd };
    }
    return null;
  }

  /** Traitement UNIQUE des événements (webhook réel ou simulé) — idempotent. */
  async function applyEvent(
    ev: BillingEvent,
  ): Promise<'traite' | 'doublon' | 'ignore' | 'montant_incorrect'> {
    return db.transaction(async (tx) => {
      const ins = await tx
        .insert(t.billingEvent)
        .values({
          provider: ev.provider,
          eventId: ev.eventId,
          type: ev.type,
          checkoutId: ev.checkoutId,
        })
        .onConflictDoNothing()
        .returning({ id: t.billingEvent.eventId });
      if (!ins.length) return 'doublon';
      const now = new Date();
      if (ev.type === 'paiement_reussi' || ev.type === 'paiement_echoue') {
        if (!ev.checkoutId) return 'ignore';
        // mobile money (complément E) : le montant et la devise NOTIFIÉS doivent être ceux de la commande
        // (sinon : notification falsifiée ou erreur de l'opérateur — rien n'est accordé, la commande reste ouverte)
        if (
          ev.type === 'paiement_reussi' &&
          (ev.montant !== undefined || ev.devise !== undefined)
        ) {
          const [o] = await tx
            .select({ amount: t.billingCheckout.amount, currency: t.billingCheckout.currency })
            .from(t.billingCheckout)
            .where(eq(t.billingCheckout.id, ev.checkoutId));
          if (o && (o.amount !== ev.montant || o.currency !== ev.devise))
            return 'montant_incorrect';
        }
        // audit PAY-1 : transition ATOMIQUE « ouverte » → payée / échouée ; un seul événement gagne, les
        // suivants (même paiement, autre identifiant d'événement) ne créent rien
        const [c] = await tx
          .update(t.billingCheckout)
          .set(
            ev.type === 'paiement_echoue'
              ? { status: 'echouee', completedAt: now }
              : { status: 'payee', completedAt: now, providerRef: ev.reference },
          )
          .where(
            and(eq(t.billingCheckout.id, ev.checkoutId), eq(t.billingCheckout.status, 'ouverte')),
          )
          .returning();
        if (!c) return 'ignore';
        if (ev.type === 'paiement_echoue') return 'traite';
        const plan = planByCode(c.planCode)!;
        await tx.insert(t.subscription).values({
          accountId: c.accountId,
          planCode: c.planCode,
          status: 'active',
          provider: c.provider,
          providerRef: ev.reference,
          seats: c.seats,
          currentPeriodStart: now,
          currentPeriodEnd: addPeriod(now, plan.periode),
        });
        return 'traite';
      }
      if (!ev.reference) return 'ignore';
      const [s] = await tx
        .select()
        .from(t.subscription)
        .where(eq(t.subscription.providerRef, ev.reference));
      if (!s) return 'ignore';
      const plan = planByCode(s.planCode)!;
      const set =
        ev.type === 'renouvellement'
          ? {
              status: 'active',
              currentPeriodStart: s.currentPeriodEnd ?? now,
              currentPeriodEnd: addPeriod(s.currentPeriodEnd ?? now, plan.periode),
            }
          : ev.type === 'annulation'
            ? { status: 'annulee', cancelAtPeriodEnd: true }
            : { status: 'impayee' };
      await tx
        .update(t.subscription)
        .set({ ...set, updatedAt: now })
        .where(eq(t.subscription.id, s.id));
      return 'traite';
    });
  }

  // ---------------------------------------------------------------- offres
  app.get<{ Querystring: { pays?: string } }>('/api/v1/billing/plans', async (req) => {
    const a = req.auth ? await account(req.auth.accountId) : null;
    const zone = zoneOf(req.query.pays ?? a?.country ?? null);
    return {
      mode: billing.mode,
      droitsAppliques: billing.droitsAppliques,
      zone,
      plans: PLANS.map((p) => ({
        code: p.code,
        kind: p.kind,
        pour: p.pour,
        periode: p.periode,
        renouvelable: p.renouvelable,
        parPlace: !!p.parPlace,
        droits: {
          ...p.droits,
          leconsOuvertes: Number.isFinite(p.droits.leconsOuvertes) ? p.droits.leconsOuvertes : null,
        },
        prix: p.prix[zone] ?? null,
        prestataires: billing.available(providersFor(zone, p)),
      })).filter((p) => p.kind === 'gratuit' || p.kind === 'essai' || p.prix),
    };
  });

  // ---------------------------------------------------------------- mon abonnement
  app.get('/api/v1/billing/me', async (req, reply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    const subs = await subsOf(req.auth.accountId);
    const e = entitlementOf(subs.map(like));
    const profiles = await db
      .select({ id: t.profile.id, pseudonym: t.profile.pseudonym })
      .from(t.profile)
      .where(eq(t.profile.ownerAccountId, req.auth.accountId));
    const perProfile = [];
    for (const p of profiles) {
      const lic = await schoolLicenceFor(p.id);
      perProfile.push({ ...p, plan: entitlementOf(subs.map(like), { schoolLicence: lic }).plan });
    }
    const checkouts = await db
      .select()
      .from(t.billingCheckout)
      .where(eq(t.billingCheckout.accountId, req.auth.accountId))
      .orderBy(desc(t.billingCheckout.createdAt))
      .limit(10);
    return {
      mode: billing.mode,
      droits: {
        ...e,
        droits: {
          ...e.droits,
          leconsOuvertes: Number.isFinite(e.droits.leconsOuvertes) ? e.droits.leconsOuvertes : null,
        },
      },
      essaiDisponible: trialAvailable(subs.map(like)),
      abonnements: subs.map((s) => ({
        id: s.id,
        plan: s.planCode,
        status: s.status,
        provider: s.provider,
        seats: s.seats,
        debut: s.currentPeriodStart,
        fin: s.currentPeriodEnd,
        annulationFinPeriode: s.cancelAtPeriodEnd,
      })),
      profils: perProfile,
      paiements: checkouts.map((c) => ({
        id: c.id,
        plan: c.planCode,
        montant: c.amount,
        devise: c.currency,
        prestataire: c.provider,
        status: c.status,
        date: c.createdAt,
      })),
    };
  });

  // ---------------------------------------------------------------- souscription
  app.post<{
    Body: {
      plan: string;
      prestataire?: ProviderId;
      places?: number;
      pin?: string;
      motDePasse?: string;
    };
  }>(
    '/api/v1/billing/checkout',
    {
      schema: {
        body: {
          type: 'object',
          required: ['plan'],
          additionalProperties: false,
          properties: {
            plan: { type: 'string', maxLength: 30 },
            prestataire: {
              type: 'string',
              enum: ['simule', 'stripe', 'paypal', 'mobile_money', 'apple', 'google'],
            },
            places: { type: 'integer', minimum: 1, maximum: 2000 },
            pin: { type: 'string', maxLength: 8 },
            motDePasse: { type: 'string', maxLength: 512 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (billing.mode === 'off') return err(reply, 404, 'paiement_desactive');
      const a = await account(req.auth.accountId);
      if (!a) return err(reply, 401, 'non_connecte');
      // audit MIN-1 : un mineur inscrit seul n'achète pas (un parent le fait depuis son compte)
      if (await minorHolder(db, a.id)) return err(reply, 403, 'parent_requis');
      const plan = planByCode(req.body.plan);
      if (!plan || plan.kind === 'gratuit') return err(reply, 400, 'formule_inconnue');
      if (!plan.pour.includes(a.kind as 'parent' | 'adulte' | 'enseignant'))
        return err(reply, 403, 'formule_non_disponible');
      // barrière parentale : l'achat se fait depuis l'espace adulte (code parent s'il est défini)
      if (a.parentPinHash) {
        const key = `pin:${a.id}`;
        if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
        if (!req.body.pin) return err(reply, 403, 'code_parent_requis');
        // audit SEC-2 : essai réservé atomiquement avant la vérification (pas de salve)
        if (!(await reserveAttempt(db, key))) return err(reply, 429, 'verrouille');
        if (!(await verifySecret(req.body.pin, a.parentPinHash))) {
          await failAttempt(db, key);
          return err(reply, 403, 'code_parent_requis');
        }
        await clearFailures(db, key);
      } else if (plan.kind !== 'essai') {
        // audit PAY-6 : sans code parent, un ACHAT exige le mot de passe du compte (un enfant sur la session
        // d'un parent ne peut pas acheter seul)
        const key = `mdp:${a.id}`;
        if (!req.body.motDePasse) return err(reply, 403, 'mot_de_passe_requis');
        if (!(await reserveAttempt(db, key, 10))) return err(reply, 429, 'verrouille');
        if (!(await verifySecret(req.body.motDePasse, a.passwordHash))) {
          await failAttempt(db, key, 10);
          return err(reply, 403, 'mot_de_passe_requis');
        }
        await clearFailures(db, key);
      }
      const subs = await subsOf(a.id);
      if (plan.kind === 'essai') {
        if (!trialAvailable(subs.map(like))) return err(reply, 409, 'essai_deja_utilise');
        const now = new Date();
        // audit PAY-5 : l'index unique partiel garantit un seul essai, même en parallèle
        const ins = await db
          .insert(t.subscription)
          .values({
            accountId: a.id,
            planCode: plan.code,
            status: 'essai',
            provider: 'aucun',
            currentPeriodStart: now,
            currentPeriodEnd: addPeriod(now, plan.periode),
          })
          .onConflictDoNothing()
          .returning({ id: t.subscription.id });
        if (!ins.length) return err(reply, 409, 'essai_deja_utilise');
        return { essai: true, url: '/abonnement' };
      }
      const zone = zoneOf(a.country);
      const price = plan.prix[zone];
      if (!price) return err(reply, 400, 'formule_non_vendue_dans_la_zone');
      const allowed = billing.available(providersFor(zone, plan));
      const pid = req.body.prestataire ?? allowed[0];
      if (!pid || !allowed.includes(pid)) return err(reply, 400, 'prestataire_indisponible');
      const provider = billing.provider(pid)!;
      const seats = plan.parPlace ? (req.body.places ?? 1) : null;
      const amount = price.montant * (seats ?? 1);
      const [c] = await db
        .insert(t.billingCheckout)
        .values({
          accountId: a.id,
          planCode: plan.code,
          zone,
          currency: price.devise,
          amount,
          seats,
          provider: pid,
        })
        .returning({ id: t.billingCheckout.id });
      try {
        const start = await provider.createCheckout({
          checkoutId: c!.id,
          plan: plan.code,
          montant: price.montant,
          devise: price.devise,
          renouvelable: plan.renouvelable,
          periodeMois: plan.periode?.mois ?? 1,
          retour: { succes: '/abonnement?paiement=ok', abandon: '/offres?paiement=abandon' },
          ...(seats ? { places: seats } : {}),
        });
        await db
          .update(t.billingCheckout)
          .set({ providerRef: start.reference })
          .where(eq(t.billingCheckout.id, c!.id));
        return { checkoutId: c!.id, url: start.url, simule: billing.mode === 'simule' };
      } catch (e) {
        await db
          .update(t.billingCheckout)
          .set({ status: 'expiree' })
          .where(eq(t.billingCheckout.id, c!.id));
        if (e instanceof NotConfiguredError) return err(reply, 503, 'prestataire_non_configure');
        throw e;
      }
    },
  );

  /** Page de paiement SIMULÉE : ce que l'utilisateur va « payer » (démonstration). */
  app.get<{ Params: { id: string } }>(
    '/api/v1/billing/checkout/:id',
    { schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } } },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const [c] = await db
        .select()
        .from(t.billingCheckout)
        .where(
          and(
            eq(t.billingCheckout.id, req.params.id),
            eq(t.billingCheckout.accountId, req.auth.accountId),
          ),
        );
      if (!c) return err(reply, 404, 'introuvable');
      return {
        id: c.id,
        plan: c.planCode,
        montant: c.amount,
        devise: c.currency,
        places: c.seats,
        prestataire: c.provider,
        status: c.status,
      };
    },
  );

  /** Résultat du paiement SIMULÉ : produit un événement signé, traité comme un vrai webhook. */
  app.post<{
    Params: { id: string };
    Body: { resultat: 'succes' | 'echec'; operateur?: MobileOperator };
  }>(
    '/api/v1/billing/simulate/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        body: {
          type: 'object',
          required: ['resultat'],
          additionalProperties: false,
          properties: {
            resultat: { type: 'string', enum: ['succes', 'echec'] },
            // mobile money simulé : opérateur choisi sur la page de paiement
            operateur: { type: 'string', enum: [...MOBILE_OPERATORS] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (billing.mode !== 'simule') return err(reply, 404, 'simulation_indisponible');
      const [c] = await db
        .select()
        .from(t.billingCheckout)
        .where(
          and(
            eq(t.billingCheckout.id, req.params.id),
            eq(t.billingCheckout.accountId, req.auth.accountId),
          ),
        );
      if (!c) return err(reply, 404, 'introuvable');
      const type = req.body.resultat === 'succes' ? 'paiement_reussi' : 'paiement_echoue';
      // mobile money : notification signée et horodatée de l'opérateur, avec le montant de la commande
      const mm = c.provider === 'mobile_money';
      const e = mm
        ? billing.simulatedMobile.notification(c.id, {
            type,
            operateur: req.body.operateur ?? 'wave',
            montant: c.amount,
            devise: c.currency as 'XOF',
          })
        : billing.simulated.event(c.id, type);
      const ev = await (mm ? billing.simulatedMobile : billing.simulated).parseWebhook(
        e.headers,
        e.body,
      );
      return { resultat: await applyEvent(ev!) };
    },
  );

  /** Webhooks signés des prestataires (corps BRUT pour vérifier la signature ; sans en-tête CSRF). */
  app.register(async (w) => {
    w.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );
    w.post<{ Params: { provider: ProviderId } }>(
      '/api/v1/billing/webhook/:provider',
      async (req: FastifyRequest<{ Params: { provider: ProviderId } }>, reply) => {
        const p = billing.provider(req.params.provider);
        // simulation : le prestataire simulé général et le mobile money simulé seulement
        if (
          !p ||
          (billing.mode === 'simule' &&
            req.params.provider !== 'simule' &&
            req.params.provider !== 'mobile_money')
        )
          return err(reply, 404, 'prestataire_inconnu');
        let ev: BillingEvent | null;
        try {
          ev = await p.parseWebhook(req.headers, String(req.body ?? ''));
        } catch {
          return err(reply, 400, 'signature_invalide');
        }
        if (!ev) return { resultat: 'ignore' };
        return { resultat: await applyEvent(ev) };
      },
    );
  });

  /** Annuler le renouvellement : les droits restent jusqu'à la fin de la période payée. */
  app.post<{ Params: { id: string } }>(
    '/api/v1/billing/subscriptions/:id/cancel',
    { schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } } },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const [s] = await db
        .select()
        .from(t.subscription)
        .where(
          and(
            eq(t.subscription.id, req.params.id),
            eq(t.subscription.accountId, req.auth.accountId),
          ),
        );
      if (!s) return err(reply, 404, 'introuvable');
      // audit PAY-2 : seul un abonnement en cours (actif ou essai) s'annule ; un impayé, un essai terminé ou
      // un abonnement déjà annulé ne retrouve jamais de droits
      if (s.status !== 'active' && s.status !== 'essai')
        return err(reply, 409, 'abonnement_inactif');
      const p = s.provider === 'aucun' ? null : billing.provider(s.provider as ProviderId);
      if (p && s.providerRef) await p.cancel(s.providerRef);
      const done = await db
        .update(t.subscription)
        .set({
          status: s.status === 'essai' ? 'expiree' : 'annulee',
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(and(eq(t.subscription.id, s.id), eq(t.subscription.status, s.status)))
        .returning({ id: t.subscription.id });
      if (!done.length) return err(reply, 409, 'abonnement_inactif');
      return { ok: true };
    },
  );

  return {
    async of(auth) {
      if (!billing.droitsAppliques) return null;
      // enseignants et administrateurs : tout le contenu (préparation des cours, contrôle éditorial)
      if (auth && (auth.kind === 'enseignant' || auth.kind === 'admin'))
        return entitlementOf([
          { planCode: 'licence_ecole', status: 'active', currentPeriodEnd: null },
        ]);
      if (!auth) return entitlementOf([]);
      const subs = (await subsOf(auth.accountId)).map(like);
      const profiles = await db
        .select({ id: t.profile.id })
        .from(t.profile)
        .where(eq(t.profile.ownerAccountId, auth.accountId));
      let schoolLicence: { until: Date | null } | null = null;
      for (const p of profiles) schoolLicence ??= await schoolLicenceFor(p.id);
      // lot 23 : niveaux ouverts par un code d'activation encore valable
      const packs = await db
        .selectDistinct({ level: t.levelPass.levelCode })
        .from(t.levelPass)
        .where(and(eq(t.levelPass.accountId, auth.accountId), gt(t.levelPass.endsAt, new Date())));
      return { ...entitlementOf(subs, { schoolLicence }), packs: packs.map((p) => p.level) };
    },
    canOpen(e, unit) {
      return !e || canOpenWithPacks(e, unit);
    },
  };
}
