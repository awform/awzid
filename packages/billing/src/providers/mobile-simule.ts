/**
 * Mobile money SIMULÉ (Sénégal : Wave, Orange Money) — complément E, V2 préparée, AUCUN compte réel ni clé.
 * Reproduit la forme d'un vrai parcours sans aucun réseau :
 *  - paiements en francs CFA seulement (XOF, sans décimales), pour les passes prépayés surtout ; jamais de
 *    prélèvement automatique ;
 *  - confirmation ASYNCHRONE par une notification signée de l'opérateur (webhook) ;
 *  - signature HMAC-SHA256 de « <horodatage>.<corps> », en-tête `x-mobile-signature: t=<s>,v1=<hex>`,
 *    horodatage vérifié (±5 min : une notification rejouée plus tard est refusée) ;
 *  - la notification porte le montant et la devise : le serveur les compare à la commande ;
 *  - identifiant de transaction unique (idempotence : une notification renvoyée n'est traitée qu'une fois).
 * Le vrai branchement (agrégateur ou API des opérateurs) remplacera cette classe derrière la même interface
 * `PaymentProvider` ; le choix du prestataire et les prix sont des décisions du client.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Currency } from '../plans.js';
import {
  header,
  type BillingEvent,
  type CheckoutInput,
  type CheckoutStart,
  type PaymentProvider,
} from './types.js';

export const MOBILE_OPERATORS = ['wave', 'orange_money'] as const;
export type MobileOperator = (typeof MOBILE_OPERATORS)[number];

/** tolérance d'horloge d'une notification (secondes) */
export const MOBILE_TOLERANCE_S = 300;

export function signMobile(secret: Buffer, t: number, body: string): string {
  return createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

export function mobileSignatureHeader(secret: Buffer, body: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${signMobile(secret, t, body)}`;
}

/** Vérifie l'en-tête ; lève `signature_invalide` ou `signature_perimee`. */
export function verifyMobileSignature(
  secret: Buffer,
  headerValue: string | undefined,
  body: string,
  now = Date.now(),
  toleranceS = MOBILE_TOLERANCE_S,
): void {
  const parts = Object.fromEntries(
    (headerValue ?? '').split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? '';
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(v1)) throw new Error('signature_invalide');
  const want = Buffer.from(signMobile(secret, t, body), 'hex');
  const got = Buffer.from(v1, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want))
    throw new Error('signature_invalide');
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceS) throw new Error('signature_perimee');
}

export class SimulatedMobileMoneyProvider implements PaymentProvider {
  readonly id = 'mobile_money' as const;
  readonly moyens = ['Wave (simulé)', 'Orange Money (simulé)'];
  readonly configured = true;
  private readonly secret: Buffer;

  /** secret dérivé de celui du prestataire simulé (aucune nouvelle variable) ; au hasard sinon */
  constructor(secret?: string) {
    this.secret = secret
      ? createHmac('sha256', secret).update('awzid-mobile-money-simule').digest()
      : randomBytes(32);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutStart> {
    // mobile money : francs CFA seulement, sans décimales. Aucun prélèvement automatique : une formule
    // « renouvelable » est payée période par période (nouvelle commande à chaque échéance — décision D19)
    if (input.devise !== 'XOF' || !Number.isInteger(input.montant) || input.montant <= 0)
      throw new Error('devise_non_prise_en_charge');
    return {
      url: `/abonnement/paiement-simule/${input.checkoutId}`,
      reference: `mm_sim_${input.checkoutId}`,
    };
  }

  /** Notification signée que « renverrait » l'opérateur (transaction unique, sauf `transactionId` donné). */
  notification(
    checkoutId: string,
    o: {
      type: 'paiement_reussi' | 'paiement_echoue';
      operateur: MobileOperator;
      montant: number;
      devise: Currency;
      transactionId?: string;
      now?: number;
    },
  ): { headers: Record<string, string>; body: string } {
    const body = JSON.stringify({
      transaction: o.transactionId ?? `txn_${randomUUID()}`,
      statut: o.type === 'paiement_reussi' ? 'succes' : 'echec',
      commande: checkoutId,
      reference: `mm_sim_${checkoutId}`,
      operateur: o.operateur,
      montant: o.montant,
      devise: o.devise,
    });
    return {
      headers: {
        'x-mobile-signature': mobileSignatureHeader(this.secret, body, o.now),
        'content-type': 'application/json',
      },
      body,
    };
  }

  async parseWebhook(
    h: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<BillingEvent | null> {
    verifyMobileSignature(this.secret, header(h, 'x-mobile-signature'), rawBody);
    const e = JSON.parse(rawBody) as {
      transaction: string;
      statut: string;
      commande: string;
      reference: string;
      operateur: string;
      montant: number;
      devise: Currency;
    };
    if (!(MOBILE_OPERATORS as readonly string[]).includes(e.operateur)) return null;
    if (e.statut !== 'succes' && e.statut !== 'echec') return null;
    return {
      provider: 'mobile_money',
      eventId: `${e.operateur}:${e.transaction}`,
      type: e.statut === 'succes' ? 'paiement_reussi' : 'paiement_echoue',
      checkoutId: e.commande,
      reference: e.reference,
      montant: e.montant,
      devise: e.devise,
    };
  }

  async cancel(): Promise<void> {}
}
