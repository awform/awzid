/**
 * Mise en service des paiements :
 *   AWFORM_PAIEMENT=off     (défaut) aucune vente : offres affichées pour information seulement ;
 *   AWFORM_PAIEMENT=simule  prestataires SIMULÉS pour TOUS les moyens (tests, démonstration) ; le mobile
 *                           money (Wave, Orange Money) a son simulateur propre (SimulatedMobileMoneyProvider) ;
 *   AWFORM_PAIEMENT=reel    vrais prestataires, seulement ceux dont les clés sont présentes.
 * AWFORM_DROITS=on applique les droits au contenu (défaut : off, tout le catalogue publié reste ouvert).
 */
import type { ProviderId } from './plans.js';
import {
  MobileMoneyProvider,
  PayPalProvider,
  StoreProvider,
  StripeProvider,
} from './providers/adapters.js';
import { SimulatedMobileMoneyProvider } from './providers/mobile-simule.js';
import { SimulatedPaymentProvider } from './providers/simule.js';
import type { PaymentProvider } from './providers/types.js';

export type BillingMode = 'off' | 'simule' | 'reel';

export interface BillingSetup {
  mode: BillingMode;
  droitsAppliques: boolean;
  simulated: SimulatedPaymentProvider;
  /** mobile money SIMULÉ (Wave, Orange Money) : notifications signées et horodatées */
  simulatedMobile: SimulatedMobileMoneyProvider;
  /** prestataire qui traite un moyen donné (en simulé : toujours le simulé) */
  provider(id: ProviderId): PaymentProvider | null;
  /** moyens réellement disponibles */
  available(ids: ProviderId[]): ProviderId[];
}

export function setupBilling(env: Record<string, string | undefined> = process.env): BillingSetup {
  const mode = (
    ['simule', 'reel'].includes(env.AWFORM_PAIEMENT ?? '') ? env.AWFORM_PAIEMENT : 'off'
  ) as BillingMode;
  const simulated = new SimulatedPaymentProvider(env.AWFORM_PAIEMENT_SIM_SECRET);
  const simulatedMobile = new SimulatedMobileMoneyProvider(env.AWFORM_PAIEMENT_SIM_SECRET);
  const real: Record<string, PaymentProvider> = {
    stripe: new StripeProvider(env),
    paypal: new PayPalProvider(env),
    mobile_money: new MobileMoneyProvider(env),
    apple: new StoreProvider('apple', env),
    google: new StoreProvider('google', env),
  };
  const provider = (id: ProviderId): PaymentProvider | null => {
    if (mode === 'off') return null;
    // simulation : le mobile money a son propre parcours simulé (passes en francs CFA)
    if (mode === 'simule') return id === 'mobile_money' ? simulatedMobile : simulated;
    const p = id === 'simule' ? null : real[id];
    return p?.configured ? p : null;
  };
  return {
    mode,
    droitsAppliques: env.AWFORM_DROITS === 'on',
    simulated,
    simulatedMobile,
    provider,
    available: (ids) => ids.filter((id) => provider(id) !== null),
  };
}
