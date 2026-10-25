/**
 * « Mots du Coran » — état partagé du lecteur : ce que l'élève sait (rangs connus), les mots des sourates déjà chargées, le
 * réglage « souligner les mots que je reconnais ». Chargé à la demande avec la bande du lecteur (jamais dans la coquille).
 */
import { demoProfileFor } from '$lib/attempts';
import { drapeaux, rangsConnus, type Entree, type Rangs } from './calcul';
import { chargerConnus, chargerRangs, chargerSourate } from './donnees';

/** Fonction donnée aux composants du texte coranique : mots reconnus d'un verset (null : rien à souligner). */
export type ConnusFn = (s: number, a: number, ws: readonly string[]) => boolean[] | undefined;

let connus = $state.raw<Set<number> | null>(null);
let rangs = $state.raw<Rangs | null>(null);
let suras = $state.raw<Record<number, Entree[][]>>({});
let profil = $state.raw<string | null>(null);
let niveau = $state.raw<number | null>(null);
/** soulignement demandé : la bande est affichée, les données sont prêtes et le réglage de l'élève est allumé */
let actif = $state(false);
export const activer = (on: boolean): void => {
  actif = on;
};

export const etat = {
  get connus() {
    return connus;
  },
  get rangs() {
    return rangs;
  },
  get suras() {
    return suras;
  },
  get niveau() {
    return niveau;
  },
  get pret() {
    return connus !== null && rangs !== null;
  },
};

const CLE_SOULIGNE = 'awzid.cm.souligne';
/** Réglage de l'élève (par appareil) : mots reconnus soulignés ; allumé par défaut. */
export function lireSouligne(): boolean {
  try {
    return localStorage.getItem(CLE_SOULIGNE) !== '0';
  } catch {
    return true;
  }
}
export function ecrireSouligne(on: boolean): void {
  try {
    localStorage.setItem(CLE_SOULIGNE, on ? '1' : '0');
  } catch {
    /* stockage indisponible : le réglage vaut pour cette ouverture */
  }
}

let initialisation: Promise<boolean> | null = null;
let initialiseA = 0;
/**
 * Charge ce que l'élève sait. Faux si la fonction n'est pas disponible pour lui (interrupteur coupé, pas de profil, autre
 * filière que les livres Adultes, aucun niveau choisi, ou ni réseau ni copie gardée) : rien ne s'affiche alors.
 * Redemandé au plus une fois par minute : l'élève qui revient d'une leçon retrouve un chiffre à jour.
 */
export function initialiser(force = false): Promise<boolean> {
  if (force || !initialisation || Date.now() - initialiseA > 60_000) {
    initialiseA = Date.now();
    initialisation = (async () => {
      const p = await demoProfileFor('').catch(() => null);
      if (!p) return false;
      // la demande est déjà limitée à une par minute ci-dessus : la réponse gardée en mémoire ne sert pas ici
      const [c, r] = await Promise.all([chargerConnus(p.id, true), chargerRangs(p.id)]);
      if (!c || !c.disponible || !r) return false;
      profil = p.id;
      niveau = c.niveau;
      rangs = r;
      connus = rangsConnus(r, c);
      return true;
    })();
  }
  return initialisation!;
}

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- suivi interne des requêtes en cours, jamais lu par un affichage
const demandees = new Set<number>();
/** Charge en arrière-plan les mots d'une sourate (une fois). */
export function demander(s: number): void {
  if (suras[s] || demandees.has(s)) return;
  demandees.add(s);
  void chargerSourate(s, profil ?? undefined)
    .then((d) => {
      if (d) suras = { ...suras, [s]: d.v };
    })
    .finally(() => demandees.delete(s));
}

/** Mots reconnus d'un verset (pour souligner) ; les mots d'une sourate non chargée sont demandés. */
export const connusFn: ConnusFn = (s, a, ws) => {
  if (!actif) return undefined;
  const v = suras[s];
  if (!v || !connus) {
    // demandé HORS du rendu (modifier un état pendant l'affichage est interdit)
    if (!v) queueMicrotask(() => demander(s));
    return undefined;
  }
  return drapeaux(ws, v[a - 1], connus);
};

/** Pour les tests. */
export function _reinitialiser(): void {
  connus = null;
  rangs = null;
  suras = {};
  profil = null;
  niveau = null;
  actif = false;
  initialisation = null;
  initialiseA = 0;
  demandees.clear();
}
