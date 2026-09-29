/**
 * Formules et prix (ARCHITECTURE_V2 § 8 ter.3). Les PRIX sont des propositions à valider par le client
 * [À DÉCIDER] : ils sont ici en un seul endroit, par zone et par devise (montants en unité mineure :
 * centimes ; le franc CFA n'a pas de décimales). Les droits d'accès ne dépendent JAMAIS du moyen de paiement.
 */

export type Zone = 'afrique_ouest' | 'europe' | 'amerique_nord' | 'monde';
export type Currency = 'XOF' | 'EUR' | 'USD';
export type ProviderId = 'simule' | 'stripe' | 'paypal' | 'mobile_money' | 'apple' | 'google';

export type PlanCode =
  | 'gratuit'
  | 'decouverte'
  | 'famille_mensuel'
  | 'famille_annuel'
  | 'adulte_mensuel'
  | 'adulte_annuel'
  | 'pass_3_mois'
  | 'licence_ecole';

export type PlanKind = 'gratuit' | 'essai' | 'abonnement' | 'pass' | 'licence';

export interface Rights {
  /** « decouverte » : les premières leçons de chaque livre ; « tous » : tout le catalogue publié */
  niveaux: 'decouverte' | 'tous';
  /** nombre de leçons ouvertes par livre en découverte */
  leconsOuvertes: number;
  horsLigne: boolean;
  hifz: 'carnet' | 'complet';
  /** tuteur IA (s'il est mis en service) ; le tuteur local reste pour tous */
  tuteurIA: boolean;
  bibliotheque: 'partielle' | 'complete';
  profilsMax: number;
}

export interface Plan {
  code: PlanCode;
  kind: PlanKind;
  /** pour qui : compte parent (famille), adulte, enseignant (licence) */
  pour: Array<'parent' | 'adulte' | 'enseignant'>;
  periode: { mois?: number; jours?: number } | null;
  renouvelable: boolean;
  droits: Rights;
  /** prix par zone (unité mineure) ; absent : formule non vendue dans la zone */
  prix: Partial<Record<Zone, { devise: Currency; montant: number }>>;
  /** licence école : prix PAR ÉLÈVE et par an ; nombre de places choisi à l'achat */
  parPlace?: boolean;
}

const FREE: Rights = {
  niveaux: 'decouverte',
  leconsOuvertes: 5,
  horsLigne: false,
  hifz: 'carnet',
  tuteurIA: false,
  bibliotheque: 'partielle',
  profilsMax: 1,
};
const FULL = (profilsMax: number): Rights => ({
  niveaux: 'tous',
  leconsOuvertes: Infinity,
  horsLigne: true,
  hifz: 'complet',
  tuteurIA: true,
  bibliotheque: 'complete',
  profilsMax,
});

export const PLANS: readonly Plan[] = [
  {
    code: 'gratuit',
    kind: 'gratuit',
    pour: ['parent', 'adulte'],
    periode: null,
    renouvelable: false,
    droits: FREE,
    prix: {},
  },
  {
    code: 'decouverte',
    kind: 'essai',
    pour: ['parent', 'adulte'],
    periode: { jours: 14 },
    renouvelable: false,
    droits: FULL(4),
    prix: {},
  },
  {
    code: 'famille_mensuel',
    kind: 'abonnement',
    pour: ['parent'],
    periode: { mois: 1 },
    renouvelable: true,
    droits: FULL(6),
    prix: {
      afrique_ouest: { devise: 'XOF', montant: 1500 },
      europe: { devise: 'EUR', montant: 599 },
      amerique_nord: { devise: 'USD', montant: 699 },
      monde: { devise: 'USD', montant: 499 },
    },
  },
  {
    code: 'famille_annuel',
    kind: 'abonnement',
    pour: ['parent'],
    periode: { mois: 12 },
    renouvelable: true,
    droits: FULL(6),
    prix: {
      afrique_ouest: { devise: 'XOF', montant: 12000 },
      europe: { devise: 'EUR', montant: 4900 },
      amerique_nord: { devise: 'USD', montant: 5900 },
      monde: { devise: 'USD', montant: 3900 },
    },
  },
  {
    code: 'adulte_mensuel',
    kind: 'abonnement',
    pour: ['adulte'],
    periode: { mois: 1 },
    renouvelable: true,
    droits: FULL(1),
    prix: {
      afrique_ouest: { devise: 'XOF', montant: 1000 },
      europe: { devise: 'EUR', montant: 499 },
      amerique_nord: { devise: 'USD', montant: 599 },
      monde: { devise: 'USD', montant: 399 },
    },
  },
  {
    code: 'adulte_annuel',
    kind: 'abonnement',
    pour: ['adulte'],
    periode: { mois: 12 },
    renouvelable: true,
    droits: FULL(1),
    prix: {
      afrique_ouest: { devise: 'XOF', montant: 9000 },
      europe: { devise: 'EUR', montant: 3900 },
      amerique_nord: { devise: 'USD', montant: 4900 },
      monde: { devise: 'USD', montant: 2900 },
    },
  },
  {
    // pass prépayé (mobile money, sans renouvellement automatique) : la forme courante au Sénégal
    code: 'pass_3_mois',
    kind: 'pass',
    pour: ['parent', 'adulte'],
    periode: { mois: 3 },
    renouvelable: false,
    droits: FULL(6),
    prix: { afrique_ouest: { devise: 'XOF', montant: 3500 } },
  },
  {
    code: 'licence_ecole',
    kind: 'licence',
    pour: ['enseignant'],
    periode: { mois: 12 },
    renouvelable: true,
    parPlace: true,
    droits: FULL(1),
    prix: {
      afrique_ouest: { devise: 'XOF', montant: 6000 },
      europe: { devise: 'EUR', montant: 1200 },
      amerique_nord: { devise: 'USD', montant: 1500 },
      monde: { devise: 'USD', montant: 900 },
    },
  },
];

export const planByCode = (code: string): Plan | undefined => PLANS.find((p) => p.code === code);

const WEST_AFRICA = new Set(['SN', 'CI', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GW']);
const EUROPE = new Set(
  'FR BE LU DE AT NL IT ES PT IE FI SE DK PL CZ SK SI HR HU RO BG GR CY MT EE LV LT CH GB NO IS MC AD'.split(
    ' ',
  ),
);

/** Zone de prix d'un pays (ISO 3166-1). */
export function zoneOf(country: string | null | undefined): Zone {
  const c = (country ?? '').toUpperCase();
  if (WEST_AFRICA.has(c)) return 'afrique_ouest';
  if (EUROPE.has(c)) return 'europe';
  if (c === 'US' || c === 'CA') return 'amerique_nord';
  return 'monde';
}

/** Prestataires proposés selon la zone et la formule (ordre = ordre d'affichage). */
export function providersFor(zone: Zone, plan: Plan): ProviderId[] {
  if (plan.kind === 'gratuit' || plan.kind === 'essai') return [];
  if (plan.kind === 'pass') return ['mobile_money'];
  if (zone === 'afrique_ouest') return ['mobile_money', 'stripe'];
  return ['stripe', 'paypal'];
}

/** Montant lisible (unité majeure) : 599 EUR → « 5,99 € » ; 1500 XOF → « 1 500 F CFA ». */
export function formatPrice(montant: number, devise: Currency, locale = 'fr-FR'): string {
  const minor = devise === 'XOF' ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: devise,
    minimumFractionDigits: minor,
    maximumFractionDigits: minor,
  }).format(montant / 10 ** minor);
}

/** Fin de période à partir d'une date de début. */
export function addPeriod(start: Date, periode: Plan['periode']): Date | null {
  if (!periode) return null;
  const d = new Date(start.getTime());
  if (periode.mois) d.setUTCMonth(d.getUTCMonth() + periode.mois);
  if (periode.jours) d.setUTCDate(d.getUTCDate() + periode.jours);
  return d;
}
