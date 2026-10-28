/**
 * PLAFONDS du tuteur de conversation (étage 2) — RÉGLABLES par l'environnement, sans redéploiement de code.
 *
 *   AWFORM_TUTEUR_PLAFOND_MOIS     plafond global du mois, en euros (défaut 10)
 *   AWFORM_TUTEUR_PLAFOND_APRES    « AAAA-MM-JJ:valeur » : à partir de cette date (incluse, UTC), le plafond du mois
 *                                  devient « valeur » — ex. MOIS=30 et APRES=2027-01-02:10 (crédit Google Cloud
 *                                  jusqu'au 2/01/2027, puis 10 €/mois)
 *   AWFORM_TUTEUR_PLAFOND_JOUR     plafond global du jour, en euros (défaut : 10 % du plafond du mois)
 *   AWFORM_TUTEUR_ALERTES          seuils d'alerte en % du mois (défaut « 50,80,100 »)
 *   AWFORM_TUTEUR_MINUTES_JOUR     minutes de conversation par élève et par jour (défaut 20)
 *   AWFORM_TUTEUR_REQUETES_JOUR    échanges par élève et par jour (défaut 120)
 *   AWFORM_TUTEUR_USD_EUR          conversion des tarifs en dollars (défaut 1 : on compte 1 $ = 1 €, ce qui
 *                                  SURESTIME la dépense, le dollar valant moins qu'un euro)
 *
 * AUCUN DÉPASSEMENT POSSIBLE : avant chaque appel, l'API RÉSERVE le coût MAXIMAL du tour (jetons d'entrée et de
 * sortie bornés, voix bornée) sous un verrou global ; l'appel n'a lieu que si « dépensé + réservé + ce maximum »
 * reste sous les plafonds. Le coût réel (plus petit) remplace ensuite la réservation.
 * Les montants sont en MICRO-EUROS (1 € = 1 000 000).
 */
import { REGLAGES_GENERATION, REGLAGES_PRONONCIATION } from './prompt.js';

export interface Plafonds {
  moisMicros: number;
  jourMicros: number;
  alertes: number[];
  eleveSecondesJour: number;
  eleveRequetesJour: number;
  usdEur: number;
  /** pour l'affichage : valeur du mois et date du changement prévu */
  moisEur: number;
  changement?: { date: string; eur: number };
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d;
};

export function plafondsDepuisEnv(env: NodeJS.ProcessEnv, now = new Date()): Plafonds {
  let moisEur = num(env.AWFORM_TUTEUR_PLAFOND_MOIS, 10);
  let changement: Plafonds['changement'];
  const apres = /^(\d{4}-\d{2}-\d{2}):(\d+(?:\.\d+)?)$/.exec(
    (env.AWFORM_TUTEUR_PLAFOND_APRES ?? '').trim(),
  );
  if (apres) {
    const date = apres[1]!;
    const eur = Number(apres[2]);
    if (now.getTime() >= Date.parse(`${date}T00:00:00Z`)) moisEur = eur;
    else changement = { date, eur };
  }
  const jourEur = num(env.AWFORM_TUTEUR_PLAFOND_JOUR, Math.round(moisEur * 10) / 100);
  const alertes = (env.AWFORM_TUTEUR_ALERTES ?? '50,80,100')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x) && x > 0 && x <= 100)
    .sort((a, b) => a - b);
  return {
    moisMicros: Math.round(moisEur * 1e6),
    jourMicros: Math.round(Math.min(jourEur, moisEur) * 1e6),
    alertes: alertes.length ? alertes : [50, 80, 100],
    eleveSecondesJour: Math.round(num(env.AWFORM_TUTEUR_MINUTES_JOUR, 20) * 60),
    eleveRequetesJour: Math.round(num(env.AWFORM_TUTEUR_REQUETES_JOUR, 120)),
    usdEur: num(env.AWFORM_TUTEUR_USD_EUR, 1) || 1,
    moisEur,
    ...(changement ? { changement } : {}),
  };
}

// ------------------------------------------------------------------ tarifs (vérifiés le 19/10/2026, TUTEUR_IA.md § 6)

/**
 * Tarifs publics Vertex AI, en $ par million de jetons, point de terminaison NON MONDIAL (multirégion « eu » :
 * +10 % sur le tarif mondial). `jusquau` : tarif promotionnel jusqu'à cette date incluse, puis `apres`.
 */
export interface Tarif {
  texte: number;
  audio: number;
  sortie: number;
}
export const TARIFS: Record<string, { tarif: Tarif; jusquau?: string; apres?: Tarif }> = {
  'gemini-3.8-flash': {
    tarif: { texte: 0.825, audio: 0.825, sortie: 4.125 },
    jusquau: '2026-12-31',
    apres: { texte: 1.65, audio: 1.65, sortie: 8.25 },
  },
  'gemini-3.5-flash-lite': { tarif: { texte: 0.33, audio: 0.33, sortie: 2.75 } },
  'gemini-3.1-flash-lite': { tarif: { texte: 0.275, audio: 0.55, sortie: 1.65 } },
  'gemini-3.5-flash': { tarif: { texte: 1.65, audio: 1.65, sortie: 9.9 } },
};
/** Google Cloud TTS, voix WaveNet : 4 $ par million de caractères (franchise de 4 M/mois ignorée : prudence). */
export const TTS_USD_PAR_CARACTERE = 4 / 1e6;

export function tarifDe(modele: string, now = new Date()): Tarif | null {
  const t = TARIFS[modele];
  if (!t) return null;
  if (t.jusquau && t.apres && now.getTime() > Date.parse(`${t.jusquau}T23:59:59Z`)) return t.apres;
  return t.tarif;
}

/** Bornes d'un tour (l'appel les impose : maxOutputTokens, durée d'audio, longueur du contexte). */
export const BORNES = {
  texteMax: 7000,
  /** 20 s × 32 jetons/s, arrondi */
  audioMax: 700,
  /** réponse (maxOutputTokens, prompt.ts) : la réflexion est comptée DEDANS (rapport réel du 20/10/2026) */
  sortieMax: REGLAGES_GENERATION.maxOutputTokens,
  voixCaracteresMax: 400,
};

export function coutMicros(
  u: { texte: number; audio: number; sortie: number; caracteresVoix: number },
  tarif: Tarif,
  usdEur: number,
): number {
  const usd =
    (u.texte * tarif.texte + u.audio * tarif.audio + u.sortie * tarif.sortie) / 1e6 +
    u.caracteresVoix * TTS_USD_PAR_CARACTERE;
  return Math.ceil(usd * usdEur * 1e6);
}

/** Coût MAXIMAL d'un tour (réservation). */
export const coutMaxTour = (tarif: Tarif, usdEur: number) =>
  coutMicros(
    {
      texte: BORNES.texteMax,
      audio: BORNES.audioMax,
      sortie: BORNES.sortieMax,
      caracteresVoix: BORNES.voixCaracteresMax,
    },
    tarif,
    usdEur,
  );

/**
 * Bornes de l'appel de PRONONCIATION (28/10/2026, oral seulement) : invite courte (≈ 800 jetons mesurés le 21/10 ;
 * 2 500 par prudence : le dialogue de la leçon varie), audio du tour, sortie bornée par REGLAGES_PRONONCIATION
 * (réflexion comprise), voix du mot juste ou de la paire à écouter (60 caractères au plus).
 */
export const BORNES_PRONONCIATION = {
  texteMax: 2500,
  audioMax: BORNES.audioMax,
  sortieMax: REGLAGES_PRONONCIATION.maxOutputTokens,
  voixCaracteresMax: 60,
};

/** Coût MAXIMAL de l'appel de prononciation (réservé avec le tour, sous le même verrou). */
export const coutMaxPrononciation = (tarif: Tarif, usdEur: number) =>
  coutMicros(
    {
      texte: BORNES_PRONONCIATION.texteMax,
      audio: BORNES_PRONONCIATION.audioMax,
      sortie: BORNES_PRONONCIATION.sortieMax,
      caracteresVoix: BORNES_PRONONCIATION.voixCaracteresMax,
    },
    tarif,
    usdEur,
  );

export interface EtatDepense {
  moisMicros: number;
  jourMicros: number;
  eleveSecondes: number;
  eleveRequetes: number;
}
export type RefusPlafond = 'plafond_mois' | 'plafond_jour' | 'eleve_minutes' | 'eleve_requetes';

/** Décision AVANT l'appel : le pire cas du tour doit tenir sous tous les plafonds. */
export function decider(e: EtatDepense, p: Plafonds, reserve: number): RefusPlafond | null {
  if (e.eleveRequetes >= p.eleveRequetesJour) return 'eleve_requetes';
  if (e.eleveSecondes >= p.eleveSecondesJour) return 'eleve_minutes';
  if (e.moisMicros + reserve > p.moisMicros) return 'plafond_mois';
  if (e.jourMicros + reserve > p.jourMicros) return 'plafond_jour';
  return null;
}

/** Seuils d'alerte (en %) franchis en passant de `avant` à `apres` (micro-euros du mois). */
export function seuilsFranchis(avant: number, apres: number, p: Plafonds): number[] {
  if (p.moisMicros <= 0) return [];
  return p.alertes.filter((s) => {
    const lim = (p.moisMicros * s) / 100;
    return avant < lim && apres >= lim;
  });
}

/**
 * Durée d'un tour comptée pour l'élève : sa voix + la voix du tuteur (≈ 14 caractères arabes par seconde),
 * au moins 10 s (un échange écrit compte aussi).
 */
export const secondesTour = (audioEleve: number, caracteresReponse: number) =>
  Math.max(10, Math.round(audioEleve + caracteresReponse / 14));
