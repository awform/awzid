/**
 * Mise en service du tuteur de conversation (interrupteur AWFORM_TUTEUR, partagé avec le tuteur des leçons) :
 *   off      (défaut) rien ;
 *   local    étage 1 seul (dialogue guidé, écoute locale), aucun modèle de langage ;
 *   simule   étage 1 + étage 2 SIMULÉ (tests, démonstration), aucun appel ;
 *   vertex   étage 1 + étage 2 avec Gemini (Vertex AI, UE) — SEULEMENT si :
 *              AWFORM_VERTEX_PROJET est donné, AWFORM_VERTEX_LIEU est un lieu de l'UE (défaut « eu »),
 *              le modèle (AWFORM_TUTEUR_VERTEX_MODELE, défaut gemini-3.8-flash) a un tarif connu (plafonds),
 *              AWFORM_TUTEUR_VERTEX_CONTROLE vaut l'empreinte de l'invite (PROMPT_VERSION) validée par la batterie de
 *              contrôle (cli/batterie-conversation, TUTEUR_IA.md § 9) ; sinon repli sur « local » et motif visible.
 *   (claude) le tuteur des leçons seul ; la conversation reste à l'étage 1.
 * Aucun secret : le jeton vient du serveur de métadonnées de la VM (compte emprunté : AWFORM_VERTEX_COMPTE).
 */
import { tarifDe, type Tarif } from './budget.js';
import { GoogleTts, jetonGoogle, LIEUX_UE, VertexConversation, type Fetch } from './google.js';
import { PROMPT_VERSION } from './prompt.js';
import { ConversationSimulee, SyntheseSimulee } from './simule.js';
import type { ConvFournisseur, Synthese } from './types.js';

export type ModeConversation = 'off' | 'local' | 'simule' | 'vertex';

export interface ConvSetup {
  mode: ModeConversation;
  /** null : pas d'étage 2 */
  fournisseur: ConvFournisseur | null;
  synthese: Synthese | null;
  modele: string;
  tarif: Tarif | null;
  bloque?: string;
}

export const MODELE_DEFAUT = 'gemini-3.8-flash';

export function setupConversation(env: NodeJS.ProcessEnv = process.env, f?: Fetch): ConvSetup {
  const mode = env.AWFORM_TUTEUR ?? 'off';
  const modele = env.AWFORM_TUTEUR_VERTEX_MODELE || MODELE_DEFAUT;
  const local = (bloque?: string): ConvSetup => ({
    mode: 'local',
    fournisseur: null,
    synthese: null,
    modele,
    tarif: null,
    ...(bloque ? { bloque } : {}),
  });
  if (mode === 'simule')
    return {
      mode,
      fournisseur: new ConversationSimulee(modele),
      synthese: new SyntheseSimulee(),
      modele,
      tarif: tarifDe(modele),
    };
  if (mode === 'local' || mode === 'claude') return local();
  if (mode !== 'vertex')
    return { mode: 'off', fournisseur: null, synthese: null, modele, tarif: null };
  const projet = env.AWFORM_VERTEX_PROJET ?? '';
  const lieu = env.AWFORM_VERTEX_LIEU || 'eu';
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projet)) return local('vertex_bloque_projet_absent');
  if (!(LIEUX_UE as readonly string[]).includes(lieu)) return local('vertex_bloque_lieu_hors_ue');
  const tarif = tarifDe(modele);
  if (!tarif) return local('vertex_bloque_modele_sans_tarif');
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
  };
}
