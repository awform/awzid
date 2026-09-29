/** Paiements (lot 10) : offres, abonnement, paiement (simulé en démonstration). Aucune donnée de carte ici. */
import { call } from './session';

export type Currency = 'XOF' | 'EUR' | 'USD';

export interface PlanView {
  code: string;
  kind: 'gratuit' | 'essai' | 'abonnement' | 'pass' | 'licence';
  pour: Array<'parent' | 'adulte' | 'enseignant'>;
  periode: { mois?: number; jours?: number } | null;
  renouvelable: boolean;
  parPlace: boolean;
  droits: {
    niveaux: 'decouverte' | 'tous';
    leconsOuvertes: number | null;
    horsLigne: boolean;
    hifz: 'carnet' | 'complet';
    tuteurIA: boolean;
    bibliotheque: 'partielle' | 'complete';
    profilsMax: number;
  };
  prix: { devise: Currency; montant: number } | null;
  prestataires: string[];
}

export interface Plans {
  mode: 'off' | 'simule' | 'reel';
  droitsAppliques: boolean;
  zone: string;
  plans: PlanView[];
}

export interface MyBilling {
  mode: 'off' | 'simule' | 'reel';
  droits: { plan: string; droits: PlanView['droits']; jusquAu: string | null; source: string };
  essaiDisponible: boolean;
  abonnements: Array<{
    id: string;
    plan: string;
    status: string;
    provider: string;
    seats: number | null;
    debut: string;
    fin: string | null;
    annulationFinPeriode: boolean;
  }>;
  profils: Array<{ id: string; pseudonym: string; plan: string }>;
  paiements: Array<{
    id: string;
    plan: string;
    montant: number;
    devise: Currency;
    prestataire: string;
    status: string;
    date: string;
  }>;
}

export const plans = () => call<Plans>('GET', '/billing/plans');
export const myBilling = () => call<MyBilling>('GET', '/billing/me');
export const checkout = (body: {
  plan: string;
  prestataire?: string;
  places?: number;
  pin?: string;
  /** audit PAY-6 : mot de passe du compte quand aucun code parent n'est défini */
  motDePasse?: string;
}) =>
  call<{ checkoutId?: string; url: string; essai?: boolean; simule?: boolean }>(
    'POST',
    '/billing/checkout',
    body,
  );
export const checkoutDetail = (id: string) =>
  call<{
    id: string;
    plan: string;
    montant: number;
    devise: Currency;
    places: number | null;
    prestataire: string;
    status: string;
  }>('GET', `/billing/checkout/${id}`);
export const simulate = (id: string, resultat: 'succes' | 'echec') =>
  call<{ resultat: string }>('POST', `/billing/simulate/${id}`, { resultat });
export const cancel = (id: string) =>
  call<{ ok: boolean }>('POST', `/billing/subscriptions/${id}/cancel`, {});

/** Prix lisible (unité mineure → majeure ; franc CFA sans décimales). */
export function price(montant: number, devise: Currency, locale = 'fr-FR'): string {
  const minor = devise === 'XOF' ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: devise,
    minimumFractionDigits: minor,
    maximumFractionDigits: minor,
  }).format(montant / 10 ** minor);
}
