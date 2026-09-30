/**
 * Droits d'accès (« entitlements ») : calculés à partir des abonnements ACTIFS, jamais du moyen de paiement.
 * L'application ne lit que le droit. Application au contenu : prête (canOpenUnit), activée quand le client
 * aura fixé l'offre gratuite (AWFORM_DROITS=on) — en attendant, tout le catalogue publié reste ouvert.
 */
import { planByCode, PLANS, type PlanCode, type Rights } from './plans.js';

export type SubStatus = 'essai' | 'active' | 'annulee' | 'expiree' | 'impayee';

export interface SubscriptionLike {
  planCode: string;
  status: SubStatus;
  /** null : sans fin (gratuit) */
  currentPeriodEnd: Date | null;
}

const RANK: Record<PlanCode, number> = {
  gratuit: 0,
  decouverte: 1,
  pass_1_mois: 2,
  pass_3_mois: 2,
  pass_12_mois: 2,
  adulte_mensuel: 3,
  adulte_annuel: 3,
  famille_mensuel: 4,
  famille_annuel: 4,
  licence_ecole: 4,
};

/** Un abonnement ouvre des droits tant que sa période n'est pas finie (annulé : jusqu'à la fin payée). */
export function isLive(s: SubscriptionLike, now = new Date()): boolean {
  if (s.status === 'expiree' || s.status === 'impayee') return false;
  return !s.currentPeriodEnd || s.currentPeriodEnd.getTime() > now.getTime();
}

export interface Entitlement {
  plan: PlanCode;
  droits: Rights;
  jusquAu: Date | null;
  /** source : abonnement du compte, ou licence de l'école (classe) */
  source: 'compte' | 'ecole' | 'gratuit';
  /** niveaux ouverts en entier par un code d'activation encore valable (lot 23) */
  packs?: string[];
}

export function entitlementOf(
  subs: readonly SubscriptionLike[],
  opts: { schoolLicence?: { until: Date | null } | null; now?: Date } = {},
): Entitlement {
  const now = opts.now ?? new Date();
  let best: Entitlement = {
    plan: 'gratuit',
    droits: planByCode('gratuit')!.droits,
    jusquAu: null,
    source: 'gratuit',
  };
  for (const s of subs) {
    const plan = planByCode(s.planCode);
    if (!plan || !isLive(s, now)) continue;
    if (RANK[plan.code] > RANK[best.plan])
      best = {
        plan: plan.code,
        droits: plan.droits,
        jusquAu: s.currentPeriodEnd,
        source: 'compte',
      };
  }
  if (opts.schoolLicence && RANK.licence_ecole > RANK[best.plan])
    best = {
      plan: 'licence_ecole',
      droits: planByCode('licence_ecole')!.droits,
      jusquAu: opts.schoolLicence.until,
      source: 'ecole',
    };
  return best;
}

/** Une leçon est-elle ouverte ? (n : rang de l'unité dans le livre, 1 = première) */
export function canOpenUnit(r: Rights, unit: { n: number }): boolean {
  return r.niveaux === 'tous' || unit.n <= r.leconsOuvertes;
}

/** Accès par niveau (code d'activation, lot 23) : la leçon est ouverte si son niveau a un accès en cours. */
export function canOpenWithPacks(e: Entitlement, unit: { n: number; levelCode?: string }): boolean {
  return canOpenUnit(e.droits, unit) || (!!unit.levelCode && !!e.packs?.includes(unit.levelCode));
}

/** L'essai « découverte » ne s'offre qu'une fois par compte. */
export function trialAvailable(subs: readonly SubscriptionLike[]): boolean {
  return !subs.some((s) => s.planCode === 'decouverte');
}

export { PLANS };
