/**
 * F5 — interrupteurs de fonctions côté APPAREIL : la décision vient du serveur (`GET /api/v1/fonctions`, rôle,
 * âge, pays, école, canal) ; l'application MASQUE une fonction coupée (le serveur la refuse aussi).
 *  - copie COURTE : redemandée au plus toutes les 5 minutes, à la navigation ;
 *  - hors ligne : dernière décision gardée sur l'appareil (par profil) ;
 *  - rien de connu : valeurs par défaut SÛRES du registre (fonctions publiées ouvertes, essais fermés).
 */
import { fonctionsParDefaut, type Canal, type FonctionCle } from '@awform/school';
import { copieFraiche, decisionDe, ecrireCopie, lireCopie, type Copie } from './fonctions-copie';

export const fonctionsEtat = $state<{
  v: Record<FonctionCle, boolean>;
  canal: Canal;
  qui: string;
  /** V2-3 : session d'un enfant (identifiant) : les fonctions qui appellent des routes refusées sont fermées */
  restreint: boolean;
  /** session limitée d'un ado (profil d'âge ado) et accord parental « tuteur_ia » donné sur son profil */
  ado: boolean;
  tuteurIa: boolean;
}>({
  v: fonctionsParDefaut(),
  canal: 'production',
  qui: '',
  restreint: false,
  ado: false,
  tuteurIa: false,
});

/** fonctions fermées à une session d'enfant (écoute / récitation, tuteur, avis, khatma, hifz de classe) */
export const FERMEES_ENFANT: readonly FonctionCle[] = [
  'tuteur',
  'tuteur_ia',
  'avis',
  'cahier_parler',
  'khatma_wird',
  'shazam_coran',
  'hifz_classe',
];

/** La fonction est-elle ouverte pour la personne (et le profil) de cet appareil ? */
export function fn(cle: FonctionCle): boolean {
  if (fonctionsEtat.restreint && FERMEES_ENFANT.includes(cle)) {
    // tuteur IA : l'ado seulement, avec l'accord parental sur son profil ; le reste reste fermé
    const tuteur = cle === 'tuteur' || cle === 'tuteur_ia';
    if (!(tuteur && fonctionsEtat.ado && fonctionsEtat.tuteurIa)) return false;
  }
  return fonctionsEtat.v[cle] !== false;
}

function appliquer(qui: string, c: Copie | null) {
  fonctionsEtat.v = decisionDe(c);
  fonctionsEtat.canal = c?.canal ?? 'production';
  fonctionsEtat.qui = qui;
}

let enCours: Promise<void> | null = null;

/**
 * Charge la décision pour le profil actif (ou le compte seul) : copie gardée tout de suite, puis le serveur si la
 * copie a plus de 5 minutes (ou `force`).
 */
export function chargerFonctions(profileId: string | null, force = false): Promise<void> {
  const qui = profileId ?? 'compte';
  const copie = lireCopie(qui);
  if (fonctionsEtat.qui !== qui || copie) appliquer(qui, copie);
  if (!force && copieFraiche(copie)) return Promise.resolve();
  if (enCours) return enCours;
  enCours = (async () => {
    try {
      const r = await fetch(`/api/v1/fonctions${profileId ? `?profil=${profileId}` : ''}`, {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { fonctions: Record<string, boolean>; canal: Canal };
      const c: Copie = { at: Date.now(), fonctions: j.fonctions, canal: j.canal };
      ecrireCopie(qui, c);
      if (fonctionsEtat.qui === qui) appliquer(qui, c);
    } catch {
      /* hors ligne : dernière décision connue, sinon valeurs sûres */
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}
