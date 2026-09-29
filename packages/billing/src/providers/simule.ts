/**
 * Prestataire SIMULÉ (tests et démonstration) : aucune donnée de paiement, aucun réseau. La « page de
 * paiement » est une page de l'application qui dit clairement qu'aucun argent n'est prélevé ; le résultat
 * revient par un événement SIGNÉ (HMAC-SHA256), traité par le même code que les vrais webhooks.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  header,
  type BillingEvent,
  type CheckoutInput,
  type CheckoutStart,
  type PaymentProvider,
} from './types.js';

export class SimulatedPaymentProvider implements PaymentProvider {
  readonly id = 'simule' as const;
  readonly moyens = ['carte (simulée)', 'mobile money (simulé)'];
  readonly configured = true;
  private readonly secret: Buffer;

  constructor(secret?: string) {
    this.secret = secret ? Buffer.from(secret) : randomBytes(32);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutStart> {
    return {
      url: `/abonnement/paiement-simule/${input.checkoutId}`,
      reference: `sim_${input.checkoutId}`,
    };
  }

  /** Construit l'événement signé que « renverrait » le prestataire. */
  event(
    checkoutId: string,
    type: BillingEvent['type'],
  ): { headers: Record<string, string>; body: string } {
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type,
      checkoutId,
      reference: `sim_${checkoutId}`,
    });
    return { headers: { 'x-simule-signature': this.sign(body) }, body };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('hex');
  }

  async parseWebhook(
    h: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<BillingEvent | null> {
    const sig = header(h, 'x-simule-signature') ?? '';
    const want = Buffer.from(this.sign(rawBody));
    const got = Buffer.from(sig);
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new Error('signature_invalide');
    const e = JSON.parse(rawBody) as {
      id: string;
      type: BillingEvent['type'];
      checkoutId: string;
      reference: string;
    };
    return {
      provider: 'simule',
      eventId: e.id,
      type: e.type,
      checkoutId: e.checkoutId,
      reference: e.reference,
    };
  }

  async cancel(): Promise<void> {}
}
