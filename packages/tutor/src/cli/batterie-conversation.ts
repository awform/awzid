#!/usr/bin/env node
/**
 * Batterie de contrôle du tuteur de CONVERSATION (TUTEUR_IA.md § 9), en ligne de commande.
 *
 *   node dist/cli/batterie-conversation.js --simule [--sortie BASE]
 *   node dist/cli/batterie-conversation.js --confirmer [--sortie BASE] [--plafond-eur 1]
 *        [--projet P] [--lieu eu] [--compte awzid-tuteur@…] [--modele gemini-3.5-flash-lite] [--reflexion minimal]
 *        [--modele-prononciation gemini-3.8-flash] [--sans-prononciation]
 *
 * Réel (défaut) : Gemini sur Vertex AI (UE) et voix Google Cloud TTS, jeton du serveur de MÉTADONNÉES de la VM
 * échangé contre celui du compte emprunté (AUCUNE clé) — donc à lancer SUR le serveur bêta. Valeurs par défaut lues
 * dans l'environnement (AWFORM_VERTEX_PROJET, AWFORM_VERTEX_LIEU, AWFORM_VERTEX_COMPTE, AWFORM_TUTEUR_VERTEX_MODELE,
 * AWFORM_TUTEUR_VERTEX_REFLEXION, AWFORM_TUTEUR_VOIX, AWFORM_TUTEUR_USD_EUR). --confirmer est exigé.
 * Le texte du Coran (filtre et renvoi « Réciter et vérifier ») vient du Tanzil : AWFORM_CONTENT_DIR
 * (défaut ~/awform-content).
 *
 * Sortie : BASE.json et BASE.md (défaut : ./tuteur-conversation-batterie). Code de sortie : 0 réussie ; 1 échec ou
 * interrompue (plafond de coût) ; 2 configuration.
 */
import { writeFileSync } from 'node:fs';
import { QuranIndex } from '../arabic.js';
import { hasTanzil, loadTanzil, tanzilFile } from '../load.js';
import { lancerBatterie, rapportMarkdown, SITUATIONS } from '../conversation/batterie.js';
import { tarifDe } from '../conversation/budget.js';
import {
  GoogleTts,
  jetonGoogle,
  LIEUX_UE,
  VertexConversation,
  VertexPrononciation,
} from '../conversation/google.js';
import { PrononciationSimulee } from '../conversation/prononciation.js';
import { PROMPT_VERSION, REGLAGES_ECRIT } from '../conversation/prompt.js';
import {
  MODELE_DEFAUT,
  MODELE_ECRIT_DEFAUT,
  MODELE_PRONONCIATION_DEFAUT,
} from '../conversation/setup.js';
import { ConversationSimulee } from '../conversation/simule.js';
import type { ConvFournisseur, PrononFournisseur, Synthese } from '../conversation/types.js';

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const env = process.env;
const simule = argv.includes('--simule');
const base = (arg('--sortie') ?? 'tuteur-conversation-batterie').replace(/\.(json|md)$/, '');
const plafondEur = Number(arg('--plafond-eur') ?? 1);
// 28/10/2026 (hybride) : --modele = ORAL (Flash-Lite), --modele-ecrit = ÉCRIT (gemini-3.8-flash)
const modele = arg('--modele') ?? (env.AWFORM_TUTEUR_VERTEX_MODELE_ORAL || MODELE_DEFAUT);
const modeleE = arg('--modele-ecrit') ?? (env.AWFORM_TUTEUR_VERTEX_MODELE || MODELE_ECRIT_DEFAUT);
const tarifE = tarifDe(modeleE);
const modeleP =
  arg('--modele-prononciation') ??
  (env.AWFORM_TUTEUR_VERTEX_MODELE_PRONONCIATION || MODELE_PRONONCIATION_DEFAUT);
const sansPrononciation = argv.includes('--sans-prononciation');
// essai ciblé (diagnostic) : quelques situations seulement (--ids C3,C4) ; jamais une validation
const ids = arg('--ids')?.split(',').filter(Boolean);
const fin = (msg: string, code = 2): never => {
  console.error(msg);
  process.exit(code);
};

if (!Number.isFinite(plafondEur) || plafondEur <= 0 || plafondEur > 5)
  fin('--plafond-eur : entre 0 et 5 €.');
if (!hasTanzil())
  fin(`Tanzil absent (${tanzilFile()}) : AWFORM_CONTENT_DIR doit désigner le contenu.`);
const tarif = tarifDe(modele);
if (!tarif) fin(`Modèle sans tarif connu : ${modele}.`);
const tarifP = sansPrononciation ? null : tarifDe(modeleP);
if (!sansPrononciation && !tarifP) fin(`Modèle de prononciation sans tarif connu : ${modeleP}.`);

let fournisseur: ConvFournisseur;
let voix: Synthese | null = null;
let prononciation: PrononFournisseur | null = null;
let fournisseurEcrit: ConvFournisseur;
if (!tarifE) fin(`Modèle écrit sans tarif connu : ${modeleE}.`);
if (simule) {
  fournisseur = new ConversationSimulee(modele);
  fournisseurEcrit = new ConversationSimulee(modeleE);
  if (!sansPrononciation) prononciation = new PrononciationSimulee(modeleP);
} else {
  const projet = arg('--projet') ?? env.AWFORM_VERTEX_PROJET ?? '';
  const lieu = arg('--lieu') ?? (env.AWFORM_VERTEX_LIEU || 'eu');
  const compte = arg('--compte') ?? env.AWFORM_VERTEX_COMPTE ?? '';
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projet)) fin('Projet Google Cloud absent (--projet).');
  if (!(LIEUX_UE as readonly string[]).includes(lieu)) fin(`Lieu hors de l’UE : ${lieu}.`);
  if (!compte) fin('Compte de service à emprunter absent (--compte awzid-tuteur@…).');
  if (!argv.includes('--confirmer'))
    fin(
      `La batterie appelle le vrai modèle (${modele}, ≈ 30 appels et quelques voix, quelques centimes ; arrêt net à ${plafondEur} €). Relancez avec --confirmer.`,
    );
  const jeton = jetonGoogle({ compte });
  const reflexion = arg('--reflexion') || env.AWFORM_TUTEUR_VERTEX_REFLEXION;
  fournisseur = new VertexConversation({
    projet,
    lieu: lieu as (typeof LIEUX_UE)[number],
    modele,
    jeton,
    // défaut : REGLAGES_GENERATION.reflexion (« LOW », celui de l'API et de l'empreinte)
    ...(reflexion ? { reflexion } : {}),
  });
  fournisseurEcrit = new VertexConversation({
    projet,
    lieu: lieu as (typeof LIEUX_UE)[number],
    modele: modeleE,
    jeton,
    reglages: REGLAGES_ECRIT,
  });
  voix = new GoogleTts({ jeton, voix: env.AWFORM_TUTEUR_VOIX || 'ar-XA-Wavenet-B' });
  if (!sansPrononciation)
    prononciation = new VertexPrononciation({
      projet,
      lieu: lieu as (typeof LIEUX_UE)[number],
      modele: modeleP,
      jeton,
    });
}

console.log(
  `Batterie du tuteur de conversation — invite ${PROMPT_VERSION}, ${fournisseur.name} (oral ${modele}, écrit ${modeleE} ; prononciation : ${prononciation ? modeleP : 'non jouée'}), plafond ${plafondEur} €`,
);
const tanzil = loadTanzil();
const rapport = await lancerBatterie({
  fournisseur,
  voix,
  index: new QuranIndex(tanzil),
  tarif: tarif!,
  prononciation,
  tarifPrononciation: tarifP,
  fournisseurEcrit,
  tarifEcrit: tarifE,
  sortieMaxEcrit: REGLAGES_ECRIT.maxOutputTokens,
  usdEur: Number(env.AWFORM_TUTEUR_USD_EUR) > 0 ? Number(env.AWFORM_TUTEUR_USD_EUR) : 1,
  plafondMicros: Math.round(plafondEur * 1e6),
  ...(ids ? { situations: SITUATIONS.filter((s) => ids.includes(s.id)) } : {}),
  ...(arg('--adresse') === 'tu' || arg('--adresse') === 'vous'
    ? { adresse: arg('--adresse') as 'tu' | 'vous' }
    : {}),
  journal: (l) => console.log(l),
});
writeFileSync(`${base}.json`, `${JSON.stringify(rapport, null, 2)}\n`);
const md = rapportMarkdown(rapport);
writeFileSync(`${base}.md`, md);
console.log(`\n${md.split('\n').slice(0, 12).join('\n')}\nRapport : ${base}.json et ${base}.md`);
process.exit(rapport.reussi ? 0 : 1);
