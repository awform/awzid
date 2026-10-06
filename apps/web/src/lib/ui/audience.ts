/**
 * Lot 26 — public de l'écran : thème graphique et navigation (3 à 5 entrées par public).
 * Fonctions pures (testées dans audience.test.ts), utilisées par la mise en page.
 */
import type { PaletteName, ThemeName } from '$lib/theme/tokens';

export type Audience = 'enfant' | 'ado' | 'adulte' | 'parent' | 'enseignant' | 'admin' | 'visiteur';

export interface Context {
  /** profil d'élève actif sur l'appareil */
  profileKind: 'enfant' | 'ado' | 'adulte' | null;
  /** compte connecté (null : visiteur) */
  accountKind: 'parent' | 'adulte' | 'enseignant' | 'admin' | null;
  /** profils du compte (adulte autonome : son unique profil) */
  profileKinds: Array<'enfant' | 'ado' | 'adulte'>;
  path: string;
}

/** Espaces des adultes responsables (parent qui gère la famille) : toujours « clair et minimal ». */
const PARENT_PATHS = [
  '/profils',
  '/compte',
  '/abonnement',
  '/offres',
  '/messages',
  '/ecole',
  // lot F2 : responsables d'un profil, second parent, rattachement, émancipation
  '/famille',
];
const STAFF_PATHS = ['/enseignant', '/admin'];
const under = (p: string, list: string[]) => list.some((x) => p === x || p.startsWith(`${x}/`));

export function audienceOf(c: Context): Audience {
  if (c.accountKind === 'admin') return 'admin';
  if (c.accountKind === 'enseignant' || under(c.path, STAFF_PATHS)) return 'enseignant';
  if (c.accountKind === 'parent' && (!c.profileKind || under(c.path, PARENT_PATHS)))
    return 'parent';
  const kind =
    c.profileKind ?? (c.accountKind === 'adulte' ? (c.profileKinds[0] ?? 'adulte') : null);
  if (kind) return kind;
  return c.accountKind === 'parent' ? 'parent' : 'visiteur';
}

export function themeOf(a: Audience): ThemeName {
  return a === 'enfant' ? 'jardin' : a === 'ado' ? 'nuit' : a === 'adulte' ? 'manuscrit' : 'clair';
}

/**
 * Coran épuré (06/10/2026) — palette « verdure » (vert, blanc, or) par-dessus le thème du public : dans
 * l'espace Coran (et le carnet de hifẓ) pour les élèves et les visiteurs. Mettre `VERDURE_PARTOUT` à vrai en
 * fait le thème clair PAR DÉFAUT de toute l'application élève (décision du client après validation).
 * Les adultes responsables (parent, enseignant, administration) gardent le thème « clair et minimal ».
 */
export const VERDURE_PARTOUT = false;
const ELEVES: Audience[] = ['enfant', 'ado', 'adulte', 'visiteur'];
export function paletteOf(
  a: Audience,
  path: string,
  partout = VERDURE_PARTOUT,
): PaletteName | null {
  if (!ELEVES.includes(a)) return null;
  if (partout) return 'verdure';
  return under(path, ['/coran', '/hifz']) ? 'verdure' : null;
}

export type NavId =
  | 'aujourdhui'
  | 'quotidien'
  | 'arabe'
  | 'coran'
  | 'sciences'
  | 'ecriture'
  | 'plus'
  | 'famille'
  | 'suivi'
  | 'messages'
  | 'compte'
  | 'classes'
  | 'ecole'
  | 'questions'
  | 'admin'
  | 'livres'
  | 'connexion'
  | 'aide';

export interface NavItem {
  id: NavId;
  href: string;
  icon: string;
}

const ITEMS: Record<NavId, Omit<NavItem, 'id'>> = {
  aujourdhui: { href: '/aujourdhui', icon: 'maison' },
  // A12 : horaires de prière, qibla, adhkār, verset à partager (sur l'appareil, hors ligne)
  quotidien: { href: '/quotidien', icon: 'quotidien' },
  arabe: { href: '/', icon: 'alif' },
  coran: { href: '/coran', icon: 'mushaf' },
  sciences: { href: '/sciences', icon: 'livres' },
  ecriture: { href: '/ecriture', icon: 'plume' },
  plus: { href: '/plus', icon: 'grille' },
  famille: { href: '/profils', icon: 'famille' },
  suivi: { href: '/suivi', icon: 'courbe' },
  messages: { href: '/messages', icon: 'message' },
  compte: { href: '/compte', icon: 'personne' },
  classes: { href: '/enseignant', icon: 'classe' },
  ecole: { href: '/enseignant/ecole', icon: 'ecole' },
  questions: { href: '/enseignant/questions', icon: 'question' },
  admin: { href: '/admin', icon: 'bouclier' },
  livres: { href: '/', icon: 'alif' },
  connexion: { href: '/connexion', icon: 'cle' },
  aide: { href: '/aide', icon: 'question' },
};

const NAV: Record<Audience, NavId[]> = {
  // enfant : une matière = une icône ; « Plus » serait trop abstrait pour un non-lecteur
  enfant: ['aujourdhui', 'arabe', 'coran', 'sciences', 'ecriture'],
  // A12 (décision du chef de projet, 05/10/2026) : cinq entrées au plus ; « Prières » (Au quotidien) entre dans la
  // barre et « Sciences » passe sous « Plus », en attendant la refonte de l'accueil par niveau (A27)
  ado: ['aujourdhui', 'arabe', 'coran', 'quotidien', 'plus'],
  adulte: ['aujourdhui', 'arabe', 'coran', 'quotidien', 'plus'],
  parent: ['famille', 'suivi', 'messages', 'quotidien', 'compte'],
  enseignant: ['classes', 'ecole', 'questions', 'compte'],
  admin: ['admin', 'compte', 'aide'],
  visiteur: ['livres', 'quotidien', 'connexion', 'aide'],
};

export function navFor(a: Audience): NavItem[] {
  return NAV[a].map((id) => ({ id, ...ITEMS[id] }));
}

/** Pages rangées sous « Plus » (ados et adultes). */
export const PLUS_PATHS = [
  '/plus',
  // A12 : « Sciences » sous « Plus » pour les ados et adultes
  '/sciences',
  '/ecriture',
  '/lectures',
  '/revisions',
  '/suivi',
  '/activites',
  '/hors-ligne',
  '/aide',
  '/carnet',
  '/sourates',
  '/recital',
  '/epreuves',
  // A27
  '/ma-classe',
];

/** Entrée active de la navigation pour un chemin donné. */
export function activeNav(items: NavItem[], path: string): NavId | '' {
  const ids = new Set(items.map((i) => i.id));
  const has = (id: NavId) => (ids.has(id) ? id : '');
  if (/^\/(niveaux|lecons)\/r[ea]\d/.test(path)) return has('sciences') || has('plus');
  // A27 : test de positionnement et épreuve de passage, dans la matière concernée ; « Ma classe » : accueil
  if (/^\/(positionnement|epreuve-passage)\/sciences/.test(path))
    return has('sciences') || has('plus');
  if (/^\/(positionnement|epreuve-passage)\//.test(path)) return has('arabe') || has('livres');
  if (path === '/ma-classe') return has('aujourdhui');
  if (/^\/(niveaux|lecons)\/qc\d/.test(path)) return has('coran');
  if (path === '/' || path.startsWith('/niveaux') || path.startsWith('/lecons'))
    return has('arabe') || has('livres');
  if (path.startsWith('/hifz') || path.startsWith('/coran')) return has('coran');
  // l'entrée la plus précise d'abord (/enseignant/ecole avant /enseignant)
  const direct = [...items]
    .filter((i) => i.href !== '/')
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => path === i.href || path.startsWith(`${i.href}/`));
  if (direct) return direct.id;
  if (ids.has('plus') && under(path, PLUS_PATHS)) return 'plus';
  return '';
}
