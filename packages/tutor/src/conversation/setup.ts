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
import { CorrectionSimulee } from './correction.js';
import {
  GoogleTts,
  jetonGoogle,
  LIEUX_UE,
  VertexConversation,
  VertexCorrection,
  VertexPrononciation,
  type Fetch,
} from './google.js';
import { MODELES_DEFAUT, PROMPT_VERSION } from './prompt.js';
import { PrononciationSimulee } from './prononciation.js';
import { ConversationSimulee, SyntheseSimulee } from './simule.js';
import type { ConvFournisseur, CorrFournisseur, PrononFournisseur, Synthese } from './types.js';

export type ModeConversation = 'off' | 'local' | 'simule' | 'vertex';

export interface ConvSetup {
  mode: ModeConversation;
  /** null : pas d'étage 2. Conversation (oral et écrit) : Flash-Lite */
  fournisseur: ConvFournisseur | null;
  synthese: Synthese | null;
  modele: string;
  tarif: Tarif | null;
  /** appel de prononciation, en parallèle (oral seulement) ; null : coupé (AWFORM_TUTEUR_PRONONCIATION=off) */
  prononciation: PrononFournisseur | null;
  tarifPrononciation: Tarif | null;
  /** 29/10/2026 : correction de grammaire, en parallèle (écrit seulement) ; absent ou null : coupée */
  correction?: CorrFournisseur | null;
  tarifCorrection?: Tarif | null;
  bloque?: string;
}

/**
 * 29/10/2026 : Flash-Lite répond (oral et écrit) ; gemini-3.8-flash, en parallèle, fait la prononciation (oral) ou la
 * correction de grammaire (écrit), coupé à 6 s (TUTEUR_IA.md § 15).
 * Variables : AWFORM_TUTEUR_VERTEX_MODELE_CONVERSATION, …_CORRECTION, …_PRONONCIATION. L'ancienne
 * AWFORM_TUTEUR_VERTEX_MODELE (gemini-3.8-flash dans prod.env) n'est plus lue.
 */
export const MODELE_DEFAUT = MODELES_DEFAUT.conversation;
export const MODELE_CORRECTION_DEFAUT = MODELES_DEFAUT.correction;
export const MODELE_PRONONCIATION_DEFAUT = MODELES_DEFAUT.prononciation;

export function setupConversation(env: NodeJS.ProcessEnv = process.env, f?: Fetch): ConvSetup {
  const mode = env.AWFORM_TUTEUR ?? 'off';
  const modele = env.AWFORM_TUTEUR_VERTEX_MODELE_CONVERSATION || MODELE_DEFAUT;
  const modeleC = env.AWFORM_TUTEUR_VERTEX_MODELE_CORRECTION || MODELE_CORRECTION_DEFAUT;
  const modeleP = env.AWFORM_TUTEUR_VERTEX_MODELE_PRONONCIATION || MODELE_PRONONCIATION_DEFAUT;
  const prononOff = env.AWFORM_TUTEUR_PRONONCIATION === 'off';
  const corrOff = env.AWFORM_TUTEUR_CORRECTION === 'off';
  const sans = {
    prononciation: null,
    tarifPrononciation: null,
    correction: null,
    tarifCorrection: null,
  };
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
      synthese: new SyntheseSimulee(),
      modele,
      tarif: tarifDe(modele),
      ...sans,
      ...(prononOff
        ? {}
        : {
            prononciation: new PrononciationSimulee(modeleP),
            tarifPrononciation: tarifDe(modeleP),
          }),
      ...(corrOff
        ? {}
        : { correction: new CorrectionSimulee(modeleC), tarifCorrection: tarifDe(modeleC) }),
    };
  if (mode === 'local' || mode === 'claude') return local();
  if (mode !== 'vertex')
    return { mode: 'off', fournisseur: null, synthese: null, modele, tarif: null, ...sans };
  const projet = env.AWFORM_VERTEX_PROJET ?? '';
  const lieu = env.AWFORM_VERTEX_LIEU || 'eu';
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projet)) return local('vertex_bloque_projet_absent');
  if (!(LIEUX_UE as readonly string[]).includes(lieu)) return local('vertex_bloque_lieu_hors_ue');
  const tarif = tarifDe(modele);
  const tarifP = prononOff ? null : tarifDe(modeleP);
  const tarifC = corrOff ? null : tarifDe(modeleC);
  if (!tarif || (!prononOff && !tarifP) || (!corrOff && !tarifC))
    return local('vertex_bloque_modele_sans_tarif');
  if (env.AWFORM_TUTEUR_VERTEX_CONTROLE !== PROMPT_VERSION)
    return local('vertex_bloque_controle_absent');
  const jeton = jetonGoogle({
    ...(f ? { fetch: f } : {}),
    ...(env.AWFORM_VERTEX_COMPTE ? { compte: env.AWFORM_VERTEX_COMPTE } : {}),
  });
  const base = {
    projet,
    lieu: lieu as (typeof LIEUX_UE)[number],
    jeton,
    ...(f ? { fetch: f } : {}),
  };
  return {
    mode,
    fournisseur: new VertexConversation({
      ...base,
      modele,
      // vide : REGLAGES_GENERATION.reflexion (« LOW »)
      ...(env.AWFORM_TUTEUR_VERTEX_REFLEXION
        ? { reflexion: env.AWFORM_TUTEUR_VERTEX_REFLEXION }
        : {}),
    }),
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
    ...sans,
    ...(tarifP
      ? {
          prononciation: new VertexPrononciation({ ...base, modele: modeleP }),
          tarifPrononciation: tarifP,
        }
      : {}),
    ...(tarifC
      ? { correction: new VertexCorrection({ ...base, modele: modeleC }), tarifCorrection: tarifC }
      : {}),
  };
}
