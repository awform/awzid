/**
 * NIVEAU (29/10/2026, décision du chef de projet) : la réponse de Flash-Lite est vérifiée PAR SCRIPT contre le
 * vocabulaire autorisé du niveau (mots vus). Si au moins 10 % de ses mots sont hors de la liste (seuil de la
 * batterie ; en dessous, l'approximation des racines donne trop de faux « hors liste » pour justifier une seconde
 * attente), UNE relance avec la consigne rappelée. Si le mot reste, la réponse PASSE, marquée au journal : c'est le
 * choix le plus sûr, car (1) elle a déjà franchi tous les filtres de sortie (un mot hors niveau n'est pas un risque de
 * sécurité), (2) la remplacer par une réplique du livre casserait l'échange sans rapport avec ce que l'élève a dit, et
 * (3) une reformulation automatique serait un texte non vérifié.
 */
import { partHorsNiveau, validerBrouillon } from './garde.js';
import { RAPPEL_NIVEAU } from './prompt.js';
import type { ConvEntree, ConvFournisseur, ConvSortieFournisseur, MotNiveau } from './types.js';

export const SEUIL_RELANCE_NIVEAU = 0.1;

export type RelanceNiveau = 'aucune' | 'corrigee' | 'restee';

function horsNiveauDe(out: ConvSortieFournisseur, mots: readonly MotNiveau[]): string[] | null {
  if (out.status !== 'ok') return null;
  const b = validerBrouillon(out.brouillon);
  if (!b || b.sujet !== 'langue') return null;
  const p = partHorsNiveau(b.reponse_ar, mots);
  return p.part >= SEUIL_RELANCE_NIVEAU ? p.hors : null;
}

export async function repondreAuNiveau(
  conv: ConvFournisseur,
  systeme: string,
  e: ConvEntree,
): Promise<{ out: ConvSortieFournisseur; relance: RelanceNiveau; hors: string[] }> {
  // même liste que le contrôle du journal et de la batterie (issueDuTour)
  const mots = e.contexte.mots;
  const out = await conv.repondre(systeme, e);
  // sans liste de mots (contexte incomplet), aucun contrôle possible : pas de relance
  const hors = mots.length ? horsNiveauDe(out, mots) : null;
  if (!hors) return { out, relance: 'aucune', hors: [] };
  const out2 = await conv.repondre(`${systeme}\n\n${RAPPEL_NIVEAU(hors)}`, e);
  const usage = {
    texte: out.usage.texte + out2.usage.texte,
    audio: out.usage.audio + out2.usage.audio,
    sortie: out.usage.sortie + out2.usage.sortie,
  };
  // la relance a échoué (panne, refus, hors schéma) : on garde la première réponse, marquée
  if (out2.status !== 'ok' || !validerBrouillon(out2.brouillon))
    return { out: { ...out, usage }, relance: 'restee', hors };
  const hors2 = horsNiveauDe(out2, mots);
  return { out: { ...out2, usage }, relance: hors2 ? 'restee' : 'corrigee', hors: hors2 ?? [] };
}
