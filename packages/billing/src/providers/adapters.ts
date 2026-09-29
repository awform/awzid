/**
 * Adaptateurs des VRAIS prestataires — squelettes prêts à brancher, jamais actifs sans les clés du client
 * (lues dans l'environnement, jamais dans le dépôt). Tant qu'une clé manque : `configured = false` et toute
 * création de paiement lève NotConfiguredError (l'interface ne propose pas ce moyen).
 *
 * - Stripe : Checkout hébergé (cartes, Apple Pay / Google Pay sur le web, SEPA) ; webhooks signés
 *   (en-tête Stripe-Signature, HMAC-SHA256 de « t.corps » avec le secret du point de terminaison) —
 *   vérification implémentée et testée ; création de session à valider avec le compte de test du client.
 * - PayPal : Orders / Subscriptions API ; vérification des webhooks par l'API PayPal (appel sortant).
 * - Mobile money par AGRÉGATEUR (Wave, Orange Money, Free Money… via PayDunya, CinetPay ou PayTech) :
 *   redirection vers la page de l'agrégateur, notification signée ; NINEA/RCCM requis (Sénégal).
 * - Magasins (Apple, Google) : achats intégrés de l'enveloppe native ; vérification des reçus côté serveur
 *   (App Store Server API, Google Play Developer API) — à brancher avec l'enveloppe Capacitor.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderId } from '../plans.js';
import {
  header,
  NotConfiguredError,
  type BillingEvent,
  type CheckoutInput,
  type CheckoutStart,
  type PaymentProvider,
} from './types.js';

type Env = Record<string, string | undefined>;

abstract class Skeleton implements PaymentProvider {
  abstract readonly id: ProviderId;
  abstract readonly moyens: string[];
  protected abstract readonly required: string[];
  constructor(protected readonly env: Env) {}
  get configured(): boolean {
    return this.required.every((k) => !!this.env[k]);
  }
  protected missing(): string[] {
    return this.required.filter((k) => !this.env[k]);
  }
  async createCheckout(_input: CheckoutInput): Promise<CheckoutStart> {
    throw new NotConfiguredError(
      this.id,
      this.missing().length
        ? this.missing()
        : ['implémentation à valider avec le compte du client'],
    );
  }
  async parseWebhook(
    _h: Record<string, string | string[] | undefined>,
    _raw: string,
  ): Promise<BillingEvent | null> {
    throw new NotConfiguredError(this.id, this.missing());
  }
  async cancel(_reference: string): Promise<void> {
    throw new NotConfiguredError(this.id, this.missing());
  }
}

export class StripeProvider extends Skeleton {
  readonly id = 'stripe' as const;
  readonly moyens = ['carte bancaire', 'Apple Pay', 'Google Pay', 'prélèvement SEPA'];
  protected readonly required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  /** tolérance de rejeu (secondes) */
  static readonly TOLERANCE = 300;

  override async createCheckout(input: CheckoutInput): Promise<CheckoutStart> {
    if (!this.configured) return super.createCheckout(input);
    const form = new URLSearchParams({
      mode: input.renouvelable ? 'subscription' : 'payment',
      client_reference_id: input.checkoutId,
      success_url: input.retour.succes,
      cancel_url: input.retour.abandon,
      'line_items[0][quantity]': String(input.places ?? 1),
      'line_items[0][price_data][currency]': input.devise.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(input.montant),
      'line_items[0][price_data][product_data][name]': `AWFORM ${input.plan}`,
      ...(input.renouvelable
        ? input.periodeMois === 12
          ? { 'line_items[0][price_data][recurring][interval]': 'year' }
          : {
              'line_items[0][price_data][recurring][interval]': 'month',
              'line_items[0][price_data][recurring][interval_count]': String(input.periodeMois),
            }
        : {}),
    });
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.checkoutId,
      },
      body: form,
    });
    if (!r.ok) throw new Error(`stripe_${r.status}`);
    const s = (await r.json()) as { id: string; url: string };
    return { url: s.url, reference: s.id };
  }

  /** Vérification de la signature Stripe (sans SDK) : t=…,v1=… ; HMAC-SHA256(secret, `${t}.${corps}`). */
  static verify(
    sigHeader: string,
    rawBody: string,
    secret: string,
    nowSec = Math.floor(Date.now() / 1000),
  ): boolean {
    // audit PAY-7 : pendant une rotation du secret, Stripe envoie PLUSIEURS « v1= » — l'un doit correspondre
    let t = 0;
    const v1: string[] = [];
    for (const kv of sigHeader.split(',')) {
      const i = kv.indexOf('=');
      const k = kv.slice(0, i).trim();
      const v = kv.slice(i + 1).trim();
      if (k === 't') t = Number(v);
      else if (k === 'v1') v1.push(v);
    }
    if (!t || Math.abs(nowSec - t) > StripeProvider.TOLERANCE) return false;
    const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
    let ok = false;
    for (const sig of v1) {
      const got = Buffer.from(sig);
      // temps constant pour chaque signature (aucune sortie anticipée qui révélerait laquelle correspond)
      if (got.length === want.length && timingSafeEqual(got, want)) ok = true;
    }
    return ok;
  }

  override async parseWebhook(
    h: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<BillingEvent | null> {
    if (!this.configured) return super.parseWebhook(h, rawBody);
    if (
      !StripeProvider.verify(
        header(h, 'stripe-signature') ?? '',
        rawBody,
        this.env.STRIPE_WEBHOOK_SECRET!,
      )
    )
      throw new Error('signature_invalide');
    const e = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    const o = e.data.object;
    const map: Record<string, BillingEvent['type']> = {
      'checkout.session.completed': 'paiement_reussi',
      'checkout.session.async_payment_succeeded': 'paiement_reussi',
      'checkout.session.async_payment_failed': 'paiement_echoue',
      'invoice.paid': 'renouvellement',
      'invoice.payment_failed': 'impaye',
      'customer.subscription.deleted': 'annulation',
    };
    const type = map[e.type];
    if (!type) return null;
    // audit PAY-3 : droits seulement pour un paiement ENCAISSÉ (SEPA et autres moyens asynchrones : la session
    // se termine avant l'encaissement, qui arrive par « async_payment_succeeded »)
    if (type === 'paiement_reussi' && o.payment_status !== 'paid') return null;
    // la première facture de l'abonnement est déjà couverte par le paiement initial : pas de mois offert
    if (e.type === 'invoice.paid' && o.billing_reason === 'subscription_create') return null;
    return {
      provider: 'stripe',
      eventId: e.id,
      type,
      checkoutId: typeof o.client_reference_id === 'string' ? o.client_reference_id : null,
      reference:
        typeof o.subscription === 'string'
          ? o.subscription
          : typeof o.id === 'string'
            ? o.id
            : null,
    };
  }
}

export class PayPalProvider extends Skeleton {
  readonly id = 'paypal' as const;
  readonly moyens = ['PayPal'];
  protected readonly required = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'];
}

export class MobileMoneyProvider extends Skeleton {
  readonly id = 'mobile_money' as const;
  readonly moyens = ['Wave', 'Orange Money', 'Free Money'];
  /** agrégateur choisi par le client (PayDunya, CinetPay ou PayTech) et ses clés */
  protected readonly required = [
    'MOBILE_MONEY_AGREGATEUR',
    'MOBILE_MONEY_CLE',
    'MOBILE_MONEY_SECRET',
  ];
}

export class StoreProvider extends Skeleton {
  readonly moyens: string[];
  protected readonly required: string[];
  constructor(
    readonly id: 'apple' | 'google',
    env: Env,
  ) {
    super(env);
    this.moyens = [id === 'apple' ? 'App Store' : 'Google Play'];
    this.required =
      id === 'apple'
        ? ['APPLE_ISSUER_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']
        : ['GOOGLE_PLAY_SERVICE_ACCOUNT'];
  }
}
