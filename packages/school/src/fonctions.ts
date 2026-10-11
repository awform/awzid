/**
 * Lot F5 « penser large » : INTERRUPTEURS DE FONCTIONS administrables (sans redéploiement).
 *
 * Registre commun à l'API (qui décide et refuse) et à l'application (qui masque) : chaque fonction a un ÉTAT
 * DE BASE (« on » pour tous, « off » pour personne, « beta » pour le seul canal bêta) et des RÈGLES
 * d'exception par rôle, âge, pays, école ou canal. Valeur par défaut SÛRE : sans réglage en base (ou sans
 * réseau et sans copie gardée), l'état de base du registre s'applique — les fonctions déjà publiées restent
 * ouvertes (le hors ligne d'un élève ne perd rien), une fonction en essai reste réservée au canal bêta.
 *
 * Évaluation (pure, sans dépendance, utilisable dans le navigateur) :
 *  1. parmi les règles de la fonction qui CORRESPONDENT au contexte (tous leurs critères renseignés sont
 *     vrais), la plus PRÉCISE (le plus de critères) l'emporte ; à précision égale, « off » l'emporte ;
 *  2. sinon l'état de base : on → oui, off → non, beta → seulement pour le canal bêta.
 */

export const FONCTION_CLES = [
  'animations',
  'recitateurs_en_ligne',
  'mushaf_exact',
  'tuteur',
  'vivre_islam',
  'vivre_defi',
  'certificats',
  'mode_serein',
  'avis',
] as const;
export type FonctionCle = (typeof FONCTION_CLES)[number];

export type EtatFonction = 'on' | 'off' | 'beta';
export const ETATS_FONCTION: readonly EtatFonction[] = ['on', 'off', 'beta'];

/** Rôles reconnus par les règles (un compte peut en avoir plusieurs). */
export const ROLES_FONCTION = [
  'eleve',
  'parent',
  'enseignant',
  'direction',
  'admin',
  'visiteur',
] as const;
export type RoleFonction = (typeof ROLES_FONCTION)[number];
export const AGES_FONCTION = ['enfant', 'ado', 'adulte'] as const;
export type AgeFonction = (typeof AGES_FONCTION)[number];
export type Canal = 'beta' | 'production';

export interface DefFonction {
  /** état de base quand l'administrateur n'a rien réglé (valeur par défaut sûre) */
  defaut: EtatFonction;
}

/** Registre : ajouter une fonction = une ligne ici (+ ses libellés `fn.<clé>` en 5 langues). */
export const FONCTIONS: Record<FonctionCle, DefFonction> = {
  // leçons vivantes (A21, A21b) : générateurs et lecteur des animations
  animations: { defaut: 'on' },
  // récitateurs de Quran Foundation écoutés en ligne (A2)
  recitateurs_en_ligne: { defaut: 'on' },
  // Muṣḥaf de Médine « à l'identique » dans le lecteur (A34)
  mushaf_exact: { defaut: 'on' },
  // tuteur (lot 9) : panneau des leçons, questions à l'enseignant
  tuteur: { defaut: 'on' },
  // onglet « Vivre l'islam » (A37)
  vivre_islam: { defaut: 'on' },
  // défis des fiches « Vivre l'islam »
  vivre_defi: { defaut: 'on' },
  // certificats individuels de l'adulte autonome (A39) ; ceux des écoles restent délivrés par l'école
  certificats: { defaut: 'on' },
  // « Mode serein » proposé au choix (A39) ; un choix déjà fait reste enregistré
  mode_serein: { defaut: 'on' },
  // bouton « Donner mon avis » (F5)
  avis: { defaut: 'on' },
};

/** Règle d'exception (valeurs contrôlées à l'écriture : rôles, âges, canaux ci-dessus). */
export interface RegleFonction {
  effet: 'on' | 'off';
  role?: RoleFonction | string | null;
  age?: AgeFonction | string | null;
  /** code pays ISO 3166-1 alpha-2 */
  pays?: string | null;
  ecoleId?: string | null;
  canal?: Canal | string | null;
}

export interface ContexteFonction {
  roles: readonly string[];
  age: AgeFonction | null;
  pays: string | null;
  ecoles: readonly string[];
  canal: Canal;
}

const precision = (r: RegleFonction) =>
  [r.role, r.age, r.pays, r.ecoleId, r.canal].filter((x) => x != null && x !== '').length;

/** La règle s'applique-t-elle à ce contexte ? (critère vide = tous) */
export function regleCorrespond(r: RegleFonction, c: ContexteFonction): boolean {
  if (r.role && !c.roles.includes(r.role)) return false;
  if (r.age && c.age !== r.age) return false;
  if (r.pays && (c.pays ?? '').toUpperCase() !== r.pays.toUpperCase()) return false;
  if (r.ecoleId && !c.ecoles.includes(r.ecoleId)) return false;
  if (r.canal && c.canal !== r.canal) return false;
  return true;
}

/** Décision pour une fonction : état de base (ou celui du registre) et règles d'exception. */
export function fonctionActive(
  cle: FonctionCle,
  c: ContexteFonction,
  etat: EtatFonction | null | undefined,
  regles: readonly RegleFonction[] = [],
): boolean {
  let best: RegleFonction | null = null;
  for (const r of regles) {
    if (!regleCorrespond(r, c)) continue;
    if (
      !best ||
      precision(r) > precision(best) ||
      (precision(r) === precision(best) && r.effet === 'off')
    )
      best = r;
  }
  if (best) return best.effet === 'on';
  const base = etat ?? FONCTIONS[cle]?.defaut ?? 'off';
  return base === 'on' || (base === 'beta' && c.canal === 'beta');
}

/** Toutes les fonctions du registre pour un contexte. */
export function fonctionsPour(
  c: ContexteFonction,
  etats: Partial<Record<string, EtatFonction>>,
  regles: ReadonlyArray<RegleFonction & { cle: string }>,
): Record<FonctionCle, boolean> {
  const out = {} as Record<FonctionCle, boolean>;
  for (const k of FONCTION_CLES)
    out[k] = fonctionActive(
      k,
      c,
      etats[k],
      regles.filter((r) => r.cle === k),
    );
  return out;
}

/** Valeurs par défaut sûres (aucun réglage connu : ni réseau ni copie gardée). */
export function fonctionsParDefaut(canal: Canal = 'production'): Record<FonctionCle, boolean> {
  return fonctionsPour({ roles: [], age: null, pays: null, ecoles: [], canal }, {}, []);
}

// ------------------------------------------------------------------ usage (tableau de bord sans traceur)

/**
 * F5 : clés d'USAGE acceptées par le serveur (agrégats par jour, jamais d'événement individuel gardé) — les
 * fonctions du registre et les espaces de l'application. Toute autre clé est ignorée.
 */
export const USAGE_CLES = [
  ...FONCTION_CLES,
  'accueil',
  'arabe',
  'lecon',
  'revisions',
  'lectures',
  'ecriture',
  'coran',
  'coran_lecteur',
  'coran_ecouter',
  'hifz',
  'sciences',
  'quotidien',
  'quotidien_verset',
  'vivre',
  'famille',
  'ma_classe',
  'messages',
  'hors_ligne',
  'compte',
] as const;
export type UsageCle = (typeof USAGE_CLES)[number];

/** Seuil d'anonymat des tableaux d'usage : aucun chiffre montré sous 10 personnes distinctes. */
export const SEUIL_ANONYMAT = 10;
