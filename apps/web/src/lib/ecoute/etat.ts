/**
 * A5 — « Réciter et vérifier » : état de la fonction pour un profil (seule partie de la coquille ; le panneau et
 * sa logique sont chargés À LA DEMANDE). Interrupteur « ecoute_ia » (canal bêta) décidé par le serveur ; à la
 * fusion du lot F5, `fn('ecoute_ia')` masquera aussi le bouton sans appel réseau.
 */
import { call } from '$lib/session';

export interface EtatEcoute {
  active: boolean;
  /** service d'écoute prêt */
  disponible?: boolean;
  /** suivi en direct ouvert */
  direct?: boolean;
  /** accord « analyse vocale par IA » donné pour ce profil */
  accord?: boolean;
  enfant?: boolean;
  maxSecondes?: number;
}

const cache = new Map<string, { at: number; v: EtatEcoute }>();

export async function etatEcoute(profileId: string, force = false): Promise<EtatEcoute> {
  const c = cache.get(profileId);
  if (!force && c && Date.now() - c.at < 5 * 60_000) return c.v;
  const r = await call<EtatEcoute>('GET', `/profiles/${profileId}/ecoute`).catch(() => null);
  const v: EtatEcoute = r?.ok && r.data ? r.data : { active: false };
  cache.set(profileId, { at: Date.now(), v });
  return v;
}
