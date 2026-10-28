/**
 * Mise en service du tuteur de conversation (interrupteur AWFORM_TUTEUR, partagé avec le tuteur des leçons) :
 *   off      (défaut) rien ;
 *   local    étage 1 seul (dialogue guidé, écoute locale), aucun modèle de langage ;
 *   simule   étage 1 + étage 2 SIMULÉ (tests, démonstration), aucun appel ;
 *   vertex   étage 1 + étage 2 avec Gemini (Vertex AI, UE) — SEULEMENT si :
 *              AWFORM_VERTEX_PROJET est donné, AWFORM_VERTEX_LIEU est un lieu de l'UE (défaut « eu »),
 *              le modèle (AWFORM_TUTEUR_VERTEX_MODELE, défaut gemini-3.5-flash-lite ; prononciation :
 *              AWFORM_TUTEUR_VERTEX_MODELE_PRONONCIATION, défaut gemini-3.8-flash) a un tarif connu (plafonds),
 *              AWFORM_TUTEUR_VERTEX_CONTROLE vaut l'empreinte de l'invite (PROMPT_VERSION) validée par la batterie de
 *              contrôle (cli/batterie-conversation, TUTEUR_IA.md § 9) ; sinon repli sur « local » et motif visible.
 *   (claude) le tuteur des leçons seul ; la conversation reste à l'étage 1.
 * Aucun secret : le jeton vient du serveur de métadonnées de la VM (compte emprunté : AWFORM_VERTEX_COMPTE).
 */
import { tarifDe, type Tarif } from './budget.js';
import {
  GoogleTts,
  jetonGoogle,
  LIEUX_UE,
  VertexConversation,
  VertexPrononciation,
  type Fetch,
} from './google.js';
import { MODELES_DEFAUT, PROMPT_VERSION, REGLAGES_ECRIT } from './prompt.js';
import { PrononciationSimulee } from './prononciation.js';
import { ConversationSimulee, SyntheseSimulee } from './simule.js';
import type { ConvFournisseur, PrononFournisseur, Synthese } from './types.js';

export type ModeConversation = 'off' | 'local' | 'simule' | 'vertex';

export interface ConvSetup {
  mode: ModeConversation;
  /** null : pas d'étage 2. 28/10/2026 : fournisseur de l'ORAL (Flash-Lite) ; l'écrit a le sien (fournisseurEcrit) */
  fournisseur: ConvFournisseur | null;
  /** écrit : gemini-3.8-flash (qualité) ; absent : `fournisseur` */
  fournisseurEcrit?: ConvFournisseur | null;
  tarifEcrit?: Tarif | null;
  synthese: Synthese | null;
  modele: string;
  tarif: Tarif | null;
  /** appel de prononciation, en parallèle (oral seulement) ; null : coupé (AWFORM_TUTEUR_PRONONCIATION=off) */
  prononciation: PrononFournisseur | null;
  tarifPrononciation: Tarif | null;
  bloque?: string;
}

/**
 * 28/10/2026 : conversation avec gemini-3.5-flash-lite (rapide), prononciation avec gemini-3.8-flash (seul à entendre
 * les fautes), deux appels en parallèle (TUTEUR_IA.md § 14).
 */
export const MODELE_DEFAUT = MODELES_DEFAUT.oral;
export const MODELE_ECRIT_DEFAUT = MODELES_DEFAUT.ecrit;
export const MODELE_PRONONCIATION_DEFAUT = MODELES_DEFAUT.prononciation;

export function setupConversation(env: NodeJS.ProcessEnv = process.env, f?: Fetch): ConvSetup {
  const mode = env.AWFORM_TUTEUR ?? 'off';
  // oral : AWFORM_TUTEUR_VERTEX_MODELE_ORAL ; écrit : AWFORM_TUTEUR_VERTEX_MODELE (sens d'avant le 28/10, 3.8-flash)
  const modele = env.AWFORM_TUTEUR_VERTEX_MODELE_ORAL || MODELE_DEFAUT;
  const modeleE = env.AWFORM_TUTEUR_VERTEX_MODELE || MODELE_ECRIT_DEFAUT;
  const modeleP = env.AWFORM_TUTEUR_VERTEX_MODELE_PRONONCIATION || MODELE_PRONONCIATION_DEFAUT;
  const prononOff = env.AWFORM_TUTEUR_PRONONCIATION === 'off';
  const sans = { prononciation: null, tarifPrononciation: null };
  const local = (bloque?: string): ConvSetup => ({
    mode: 'local',
    fournisseur: null,
    synthese: null,
    modele,
    tarif: null,
    ...sans,
    ...(bloque ? { bloque } : {}),
  });
  if (mode === 'simule')
    return {
      mode,
      fournisseur: new ConversationSimulee(modele),
      fournisseurEcrit: new ConversationSimulee(modeleE),
      tarifEcrit: tarifDe(modeleE),
      synthese: new SyntheseSimulee(),
      modele,
      tarif: tarifDe(modele),
      ...(prononOff
        ? sans
        : {
            prononciation: new PrononciationSimulee(modeleP),
            tarifPrononciation: tarifDe(modeleP),
          }),
    };
  if (mode === 'local' || mode === 'claude') return local();
  if (mode !== 'vertex')
    return { mode: 'off', fournisseur: null, synthese: null, modele, tarif: null, ...sans };
  const projet = env.AWFORM_VERTEX_PROJET ?? '';
  const lieu = env.AWFORM_VERTEX_LIEU || 'eu';
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projet)) return local('vertex_bloque_projet_absent');
  if (!(LIEUX_UE as readonly string[]).includes(lieu)) return local('vertex_bloque_lieu_hors_ue');
  const tarif = tarifDe(modele);
  const tarifE = tarifDe(modeleE);
  if (!tarif || !tarifE) return local('vertex_bloque_modele_sans_tarif');
  const tarifP = prononOff ? null : tarifDe(modeleP);
  if (!prononOff && !tarifP) return local('vertex_bloque_modele_sans_tarif');
  if (env.AWFORM_TUTEUR_VERTEX_CONTROLE !== PROMPT_VERSION)
    return local('vertex_bloque_controle_absent');
  const jeton = jetonGoogle({
    ...(f ? { fetch: f } : {}),
    ...(env.AWFORM_VERTEX_COMPTE ? { compte: env.AWFORM_VERTEX_COMPTE } : {}),
  });
  return {
    mode,
    fournisseur: new VertexConversation({
      projet,
      lieu: lieu as (typeof LIEUX_UE)[number],
      modele,
      jeton,
      ...(f ? { fetch: f } : {}),
      // vide : REGLAGES_GENERATION.reflexion (« LOW », 21/10/2026 ; MINIMAL est refusé par gemini-3.8-flash)
      ...(env.AWFORM_TUTEUR_VERTEX_REFLEXION
        ? { reflexion: env.AWFORM_TUTEUR_VERTEX_REFLEXION }
        : {}),
    }),
    fournisseurEcrit: new VertexConversation({
      projet,
      lieu: lieu as (typeof LIEUX_UE)[number],
      modele: modeleE,
      jeton,
      reglages: REGLAGES_ECRIT,
      ...(f ? { fetch: f } : {}),
    }),
    tarifEcrit: tarifE,
    synthese:
      env.AWFORM_TUTEUR_VOIX === 'off'
        ? null
        : new GoogleTts({
            jeton,
            ...(f ? { fetch: f } : {}),
            voix: env.AWFORM_TUTEUR_VOIX || 'ar-XA-Wavenet-B',
          }),
    modele,
    tarif,
    ...(prononOff || !tarifP
      ? sans
      : {
          prononciation: new VertexPrononciation({
            projet,
            lieu: lieu as (typeof LIEUX_UE)[number],
            modele: modeleP,
            jeton,
            ...(f ? { fetch: f } : {}),
          }),
          tarifPrononciation: tarifP,
        }),
  };
}
