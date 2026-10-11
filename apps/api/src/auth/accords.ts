/**
 * Accords et réglages du compte (lot F3, revues E10, G3, M8, M9, F8) :
 *  - accord « article 9 » (RGPD : donnée révélant une conviction religieuse) — demandé à l'inscription et à la
 *    création d'un profil ; pour les comptes plus anciens, AU PREMIER USAGE (`accordsManquants` de /auth/me,
 *    page « Accords » de l'application). Retirable : le compte (ou le profil) est alors mis en pause jusqu'à un
 *    nouvel accord, ou la suppression ;
 *  - accord « analyse vocale par une IA » : facultatif, séparé, retirable, demandé au premier usage d'une telle
 *    fonction (aucune n'existe encore) — `hasActiveConsent` sera la garde de cette fonction ;
 *  - fuseau horaire et subdivision du pays (réglages du compte) ;
 *  - avant la suppression : abonnement d'une boutique d'applications encore actif (à résilier dans la boutique).
 */
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { canActForProfile, schema as t, type Db } from '@awform/db';
import { ART9, lawEvidence, normRegion, normTz, TEXT_VERSION } from './policy.js';
import { audit } from './service.js';
import { err, REGION, TZ, type AuthKit } from './common.js';

/** Types qu'on peut donner depuis la page « Accords » ou « Mon compte » (mot de passe ressaisi). */
const GIVABLE = new Set<string>([ART9, 'analyse_vocale_ia', 'rappels']);
/** Prestataires d'abonnement des boutiques d'applications (achats intégrés, à venir). */
export const STORE_PROVIDERS = ['apple', 'google'] as const;

/** Un accord de ce type est-il en vigueur (non retiré) pour ce compte ou ce profil ? */
export async function hasActiveConsent(
  db: Db,
  type: string,
  who: { accountId?: string; profileId?: string },
): Promise<boolean> {
  const conds = [eq(t.consent.type, type), isNull(t.consent.withdrawnAt)];
  if (who.profileId) conds.push(eq(t.consent.profileId, who.profileId));
  else if (who.accountId)
    conds.push(eq(t.consent.accountId, who.accountId), isNull(t.consent.profileId));
  else return false;
  const [r] = await db
    .select({ id: t.consent.id })
    .from(t.consent)
    .where(and(...conds))
    .limit(1);
  return !!r;
}

export interface MissingConsent {
  type: string;
  profileId: string | null;
  pseudonym: string | null;
}

/**
 * Accords NÉCESSAIRES qui manquent (ou ont été retirés) : celui du titulaire, puis celui de chaque profil
 * d'enfant ou d'ado dont il est titulaire. Les comptes d'école et de personnel seul n'en ont pas (le
 * consentement des élèves inscrits par une école est recueilli sur la fiche papier).
 */
export async function missingConsents(
  db: Db,
  accountId: string,
  kind: string,
): Promise<MissingConsent[]> {
  if (kind !== 'parent' && kind !== 'adulte') return [];
  const out: MissingConsent[] = [];
  if (!(await hasActiveConsent(db, ART9, { accountId })))
    out.push({ type: ART9, profileId: null, pseudonym: null });
  const kids = await db
    .select({ id: t.profile.id, pseudonym: t.profile.pseudonym })
    .from(t.profile)
    .where(
      and(eq(t.profile.ownerAccountId, accountId), inArray(t.profile.kind, ['enfant', 'ado'])),
    );
  if (kind === 'parent' || kids.length) {
    const given = new Set(
      kids.length
        ? (
            await db
              .select({ p: t.consent.profileId })
              .from(t.consent)
              .where(
                and(
                  eq(t.consent.type, ART9),
                  isNull(t.consent.withdrawnAt),
                  inArray(
                    t.consent.profileId,
                    kids.map((k) => k.id),
                  ),
                ),
              )
          ).map((r) => r.p)
        : [],
    );
    // adulte : son propre profil « ado » (titulaire mineur) est couvert par l'accord du compte
    if (kind === 'parent')
      for (const k of kids)
        if (!given.has(k.id)) out.push({ type: ART9, profileId: k.id, pseudonym: k.pseudonym });
  }
  return out;
}

export function registerConsents(app: FastifyInstance, kit: AuthKit): void {
  const { db, needAuth, passwordOk } = kit;

  // ------------------------------------------------ donner un accord (mot de passe ressaisi : preuve jointe)
  app.post<{
    Body: { password: string; accords: Array<{ type: string; profileId?: string | null }> };
  }>(
    '/api/v1/account/accords',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          required: ['password', 'accords'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', maxLength: 512 },
            accords: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                required: ['type'],
                additionalProperties: false,
                properties: {
                  type: { type: 'string', maxLength: 40 },
                  profileId: { type: ['string', 'null'], format: 'uuid' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.auth!.tablet || req.auth!.kind === 'ecole') return err(reply, 403, 'interdit');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'mot_de_passe_incorrect');
      for (const x of req.body.accords) {
        if (!GIVABLE.has(x.type)) return err(reply, 400, 'accord_inconnu');
        if (x.profileId && !(await canActForProfile(db, a.id, x.profileId)))
          return err(reply, 404, 'introuvable');
      }
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      const evidence = {
        methode: 'reauthentification_mot_de_passe+declaration',
        date: new Date().toISOString(),
        ...lawEvidence(a.country),
      };
      let added = 0;
      for (const x of req.body.accords) {
        const pid = x.profileId ?? null;
        const who = pid ? { profileId: pid } : { accountId: a.id };
        if (await hasActiveConsent(db, x.type, who)) continue;
        await db.insert(t.consent).values({
          accountId: a.id,
          profileId: pid,
          type: x.type,
          textVersion: TEXT_VERSION,
          country: a.country,
          evidence,
        });
        added++;
        await audit(db, a.id, 'consentement.accord', pid ?? a.id, { type: x.type });
      }
      return { ok: true, ajoutes: added };
    },
  );

  // ------------------------------------------------ réglages du compte : fuseau horaire, subdivision
  app.patch<{ Body: { tz?: string | null; region?: string | null } }>(
    '/api/v1/account/reglages',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { tz: { anyOf: [TZ, { type: 'null' }] }, region: REGION },
        },
      },
    },
    async (req, reply) => {
      if (req.auth!.tablet || req.auth!.kind === 'ecole') return err(reply, 403, 'interdit');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a) return err(reply, 401, 'non_connecte');
      const set: { tz?: string | null; region?: string | null } = {};
      if (req.body.tz !== undefined) {
        const tz = req.body.tz === null ? null : normTz(req.body.tz);
        if (req.body.tz !== null && !tz) return err(reply, 400, 'fuseau_inconnu');
        set.tz = tz;
      }
      if (req.body.region !== undefined) {
        const region = req.body.region === null ? null : normRegion(a.country, req.body.region);
        if (req.body.region !== null && !region) return err(reply, 400, 'region_inconnue');
        set.region = region;
      }
      if (!Object.keys(set).length) return { ok: true };
      await db.update(t.account).set(set).where(eq(t.account.id, a.id));
      // les rappels (heures calmes) suivent le fuseau du compte
      if (set.tz)
        await db
          .update(t.notificationPref)
          .set({ tz: set.tz, updatedAt: new Date() })
          .where(eq(t.notificationPref.accountId, a.id));
      await audit(db, a.id, 'compte.reglages', a.id, Object.keys(set));
      return { ok: true, ...set };
    },
  );

  // ------------------------------------------------ avant la suppression : abonnements encore actifs
  app.get('/api/v1/account/suppression', { preHandler: needAuth }, async (req) => {
    const subs = await db
      .select({
        provider: t.subscription.provider,
        plan: t.subscription.planCode,
        status: t.subscription.status,
        fin: t.subscription.currentPeriodEnd,
        annuleeFinPeriode: t.subscription.cancelAtPeriodEnd,
      })
      .from(t.subscription)
      .where(
        and(
          eq(t.subscription.accountId, req.auth!.accountId),
          inArray(t.subscription.status, ['essai', 'active', 'impayee']),
        ),
      );
    const store = subs.filter(
      (s) => (STORE_PROVIDERS as readonly string[]).includes(s.provider) && !s.annuleeFinPeriode,
    );
    return {
      // Apple et Google : la suppression du compte N'ARRÊTE PAS l'abonnement — à résilier dans la boutique
      abonnementsBoutique: store.map((s) => ({ boutique: s.provider, plan: s.plan, fin: s.fin })),
      autresAbonnements: subs.length - store.length,
    };
  });
}
