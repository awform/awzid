/**
 * PLAFONDS DE CONSOMMATION par utilisateur pour tout ce qui coûte, et estimation du coût du jour (tableau de bord).
 * Chaque plafond existe dans le code qui consomme ; ce fichier les REGROUPE (un seul endroit pour les voir) et ajoute
 * celui qui manquait (stockage des récitations).
 *   - tuteur IA : dépense du mois par élève (packages/tutor/src/roles.ts : 1 $ enfant, 3 $ ado et adulte), au-delà le
 *     tuteur local sans modèle ; interrupteur général AWFORM_TUTEUR ;
 *   - écoute IA de la récitation : analyses par heure et par personne (AWFORM_ECOUTE_PAR_HEURE), voix jamais gardée ;
 *   - synthèse vocale : audio des leçons PRÉ-GÉNÉRÉ (aucun appel par utilisateur) ; le plafond par utilisateur sera ajouté
 *     avec A26b phase 2 (voix en direct) ;
 *   - stockage : récitations envoyées, au plus AWFORM_STOCKAGE_PAR_ELEVE_MO Mo gardés par élève (30 Mo par défaut), chacune
 *     3 Mo au plus et effacée sous 30 jours ; avis et signalements : 5 par jour et par compte, captures 400 Ko, 90 jours.
 */
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { etatDepense, moisCle, schema as t, seuilsDuMois, type Db } from '@awform/db';
import { plafondsDepuisEnv } from '@awform/tutor';
import { coutsCoupes, ECOUTE_PAR_HEURE } from './ecoute-ia.js';

export const STOCKAGE_PAR_ELEVE_OCTETS =
  (Number(process.env.AWFORM_STOCKAGE_PAR_ELEVE_MO ?? 30) || 30) * 1_048_576;

/** Octets de récitations actuellement gardés pour un élève. */
export async function stockageRecitations(db: Db, profileId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<string>`coalesce(sum(${t.recitationUpload.size}), 0)` })
    .from(t.recitationUpload)
    .where(eq(t.recitationUpload.profileId, profileId));
  return Number(r?.n ?? 0);
}

export interface PlafondInfo {
  cle: string;
  valeur: string;
}
export function listePlafonds(): PlafondInfo[] {
  const mo = Math.round(STOCKAGE_PAR_ELEVE_OCTETS / 1_048_576);
  return [
    { cle: 'tuteur', valeur: '1 $ / mois (enfant), 3 $ / mois (ado, adulte)' },
    { cle: 'ecoute', valeur: `${ECOUTE_PAR_HEURE} analyses / heure / personne` },
    { cle: 'voix', valeur: 'audio pré-généré, aucun appel par utilisateur' },
    { cle: 'stockage', valeur: `${mo} Mo de récitations / élève, 3 Mo chacune, 30 jours` },
    { cle: 'avis', valeur: '5 avis et 5 signalements / jour / compte' },
  ];
}

/** Taux de change fixe de l'estimation (1 $ en euros) : ordre de grandeur, pas une facture. */
const USD_EUR = 0.92;
const DEBUT_JOUR = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export interface TableauComptes {
  total: number;
  parents: number;
  adultes: number;
  dernieres24h: number;
  septJours: number;
  nonVerifies: number;
  nonVerifiesEnRetard: number;
}
export async function tableauComptes(db: Db): Promise<TableauComptes> {
  const base = and(isNull(t.account.deletedAt), inArray(t.account.kind, ['parent', 'adulte']));
  const j = (ms: number) => new Date(Date.now() - ms);
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      parents: sql<number>`count(*) filter (where ${t.account.kind} = 'parent')::int`,
      adultes: sql<number>`count(*) filter (where ${t.account.kind} = 'adulte')::int`,
      h24: sql<number>`count(*) filter (where ${t.account.createdAt} >= ${j(86_400_000)})::int`,
      j7: sql<number>`count(*) filter (where ${t.account.createdAt} >= ${j(7 * 86_400_000)})::int`,
      // 18/10/2026 : un compte ouvert par numéro (sans adresse) est vérifié par son numéro
      nv: sql<number>`count(*) filter (where ${t.account.emailVerifiedAt} is null and not (${t.account.email} is null and ${t.account.phoneVerifiedAt} is not null))::int`,
      nvr: sql<number>`count(*) filter (where ${t.account.emailVerifiedAt} is null and not (${t.account.email} is null and ${t.account.phoneVerifiedAt} is not null) and ${t.account.createdAt} < ${j(86_400_000)})::int`,
    })
    .from(t.account)
    .where(base);
  return {
    total: r?.total ?? 0,
    parents: r?.parents ?? 0,
    adultes: r?.adultes ?? 0,
    dernieres24h: r?.h24 ?? 0,
    septJours: r?.j7 ?? 0,
    nonVerifies: r?.nv ?? 0,
    nonVerifiesEnRetard: r?.nvr ?? 0,
  };
}

export interface CoutsDuJour {
  tuteurUsd: number;
  tuteurQuestions: number;
  stockageOctets: number;
  recitationsAujourdhui: number;
  fixeJourEur: number;
  estimeJourEur: number;
  seuilAlerteEur: number;
  /** disjoncteur de coût : écoute IA coupée (AWFORM_COUTS_COUPES=1) ; la machine, jamais */
  fonctionsCoupees: boolean;
}
export async function coutsDuJour(db: Db): Promise<CoutsDuJour> {
  const debut = DEBUT_JOUR();
  const [tu] = await db
    .select({
      micros: sql<string>`coalesce(sum(${t.tutorLog.costMicros}), 0)`,
      n: sql<number>`count(*)::int`,
    })
    .from(t.tutorLog)
    .where(gte(t.tutorLog.createdAt, debut));
  const [st] = await db
    .select({
      octets: sql<string>`coalesce(sum(${t.recitationUpload.size}), 0)`,
      auj: sql<number>`count(*) filter (where ${t.recitationUpload.createdAt} >= ${debut})::int`,
    })
    .from(t.recitationUpload);
  const tuteurUsd = Number(tu?.micros ?? 0) / 1_000_000;
  // coût fixe du serveur par jour (machine, disque, adresse) : réglage de l'exploitation, ≈ 60 € / 30 j = 2 € par défaut
  // (COUTS_BETA.md) ; alerte du jour : ce coût fixe + 2 € de dépense variable (tuteur)
  const fixeJourEur = Number(process.env.AWFORM_COUT_FIXE_JOUR_EUR ?? 2) || 2;
  const seuilAlerteEur = Number(process.env.AWFORM_COUT_ALERTE_JOUR_EUR ?? 4) || 4;
  return {
    tuteurUsd,
    tuteurQuestions: tu?.n ?? 0,
    stockageOctets: Number(st?.octets ?? 0),
    recitationsAujourdhui: st?.auj ?? 0,
    fixeJourEur,
    estimeJourEur: Math.round((fixeJourEur + tuteurUsd * USD_EUR) * 100) / 100,
    seuilAlerteEur,
    fonctionsCoupees: coutsCoupes(),
  };
}

/**
 * Tuteur de CONVERSATION (19/10/2026) : dépense du mois et du jour, plafonds (réglables par l'environnement, avec
 * changement daté), seuils d'alerte franchis (50, 80, 100 % par défaut) — pour le tableau de bord de l'administrateur.
 * La coupure est automatique (l'API refuse avant l'appel) ; ces alertes s'ajoutent à celles du budget Google Cloud.
 */
export async function budgetTuteurIa(db: Db, now = new Date()) {
  const p = plafondsDepuisEnv(process.env, now);
  const fournisseur = process.env.AWFORM_TUTEUR === 'vertex' ? 'vertex' : 'simule';
  const d = await etatDepense(db, null, fournisseur, now);
  const seuils = (await seuilsDuMois(db, moisCle(now))).map((s) => s.seuil);
  const eur = (m: number) => Math.round(m / 10_000) / 100;
  const haut = Math.max(0, ...seuils);
  const alertes: Array<{ code: string; niveau: 'info' | 'attention' | 'critique' }> =
    haut >= 100
      ? [{ code: 'tuteur_ia_100', niveau: 'critique' }]
      : haut >= 80
        ? [{ code: 'tuteur_ia_80', niveau: 'attention' }]
        : haut >= 50
          ? [{ code: 'tuteur_ia_50', niveau: 'info' }]
          : [];
  return {
    resume: {
      fournisseur,
      moisEur: eur(d.moisMicros),
      jourEur: eur(d.jourMicros),
      plafondMoisEur: p.moisEur,
      plafondJourEur: eur(p.jourMicros),
      minutesEleveJour: Math.round(p.eleveSecondesJour / 60),
      changement: p.changement ?? null,
      seuils,
    },
    plafond: {
      cle: 'tuteur_ia',
      valeur: `${eur(d.moisMicros)} € / ${p.moisEur} € ce mois-ci, ${eur(p.jourMicros)} € / jour, ${Math.round(p.eleveSecondesJour / 60)} min / élève / jour${p.changement ? ` (${p.changement.eur} € / mois à partir du ${p.changement.date})` : ''}`,
    } satisfies PlafondInfo,
    alertes,
  };
}
