/**
 * Interface PRESTATAIRE de paiement (ARCHITECTURE_V2 § 8 ter.3) : créer un paiement / abonnement sur la
 * page HÉBERGÉE du prestataire (aucune donnée de carte chez nous : PCI DSS SAQ A), recevoir un événement
 * signé (webhook), annuler le renouvellement. Les clés sont créées par le CLIENT et lues dans l'environnement.
 */
import type { Currency, PlanCode, ProviderId } from '../plans.js';

export interface CheckoutInput {
  /** identifiant de NOTRE session de paiement (sert de référence chez le prestataire) */
  checkoutId: string;
  plan: PlanCode;
  montant: number;
  devise: Currency;
  renouvelable: boolean;
  /** durée d'une période (mois) : 1, 3 ou 12 */
  periodeMois: number;
  /** adresse de retour de l'application (succès / abandon) */
  retour: { succes: string; abandon: string };
  places?: number;
}

export interface CheckoutStart {
  /** page du prestataire (ou page simulée) où l'utilisateur paie */
  url: string;
  /** identifiant de la session chez le prestataire */
  reference: string;
}

/** Événement normalisé (après vérification de signature). */
export interface BillingEvent {
  provider: ProviderId;
  /** identifiant unique chez le prestataire (idempotence) */
  eventId: string;
  type: 'paiement_reussi' | 'paiement_echoue' | 'renouvellement' | 'annulation' | 'impaye';
  checkoutId: string | null;
  reference: string | null;
  /** mobile money : montant et devise NOTIFIÉS, comparés à la commande (unité mineure) */
  montant?: number;
  devise?: Currency;
}

export class NotConfiguredError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly missing: string[],
  ) {
    super(`prestataire ${provider} non configuré (${missing.join(', ')})`);
  }
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** moyens proposés à l'utilisateur (affichage) */
  readonly moyens: string[];
  /** vrai si les clés nécessaires sont présentes */
  readonly configured: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutStart>;
  /** vérifie la signature et normalise ; null si l'événement n'intéresse pas l'application */
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<BillingEvent | null>;
  cancel(reference: string): Promise<void>;
}

export const header = (h: Record<string, string | string[] | undefined>, k: string) => {
  const v = h[k] ?? h[k.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};
