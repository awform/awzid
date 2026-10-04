/**
 * JETONS DE THÈME — source unique de l'apparence (couleurs, polices, tailles, espacements, rayons, ombres,
 * motifs, mouvement). `pnpm --filter @awform/web theme` régénère src/lib/theme/tokens.css.
 *
 * Lot 26 — DESIGN V2 : système hybride PAR PUBLIC sur une base commune (direction du chef de projet) :
 *  - « jardin »    : enfants — couleurs douces et gaies, formes arrondies, grandes cibles ;
 *  - « nuit »      : adolescents — sombre élégant, accents lumineux, sobre ;
 *  - « manuscrit » : adultes — papier chaud, typographie soignée, ornements géométriques discrets ;
 *  - « clair »     : parents, enseignants, administration — clair et minimal, tableaux lisibles.
 * Chaque thème a sa variante sombre (« nuit » a une variante claire, « aube ») : attribut `data-mode`
 * (« clair » | « sombre ») posé par le réglage de l'appareil, sinon `prefers-color-scheme`.
 * Contrôles automatiques (tokens.test.ts) : CSS synchronisé, contraste WCAG AA des paires d'usage pour les
 * HUIT palettes, cibles ≥ 48 px, mouvement réduit.
 * Fichier sans import (lisible par Node directement).
 */

export type ThemeName = 'jardin' | 'nuit' | 'manuscrit' | 'clair';
export const THEME_NAMES: ThemeName[] = ['clair', 'jardin', 'nuit', 'manuscrit'];

export interface Theme {
  /** palette du thème dans son mode naturel (clair, sauf « nuit ») */
  couleurs: Record<string, string>;
  /** palette de l'autre mode (sombre, ou clair pour « nuit ») : mêmes clés */
  inverse: Record<string, string>;
  /** mode naturel de la palette `couleurs` */
  naturel: 'clair' | 'sombre';
  polices: { ui: string; titre: string; arabe: string; coran: string };
  tailles: { base: string; arabe: string; interligne: string; titre: string; cible: string };
  espaces: { xs: string; s: string; m: string; l: string; xl: string };
  rayons: { petit: string; moyen: string; grand: string; pilule: string };
  ombres: { carte: string; flottante: string };
  /** motif de fond (image CSS) ; « none » : aucun */
  motifs: { fond: string; carte: string };
  /** durée des transitions (mouvement réduit : neutralisé) */
  mouvement: { court: string; moyen: string };
}

/** Couleurs FIXES des lettres étudiées (moteur des livres) en mode clair, et leur version pour fond sombre. */
const LETTRES_CLAIR = { c0: '#e5484d', c1: '#2f6fdb', c2: '#1f9d6b', c3: '#9a6a00' };
const LETTRES_SOMBRE = { c0: '#ff8a8e', c1: '#86aefc', c2: '#4fd39a', c3: '#e9b949' };

/**
 * Lot 29 — TAJWID EN COULEURS (palette inspirée des Muṣḥaf de tajwid et de l'application Ayat : le nasal en
 * verts, les allongements de l'ocre au rouge sombre selon la durée, le rebond en bleu, les lettres non
 * prononcées en gris). `tj-*` : palette complète (ados, adultes) ; `tjk-*` : palette ENFANT à quatre familles
 * (chant du nez en vert, son long, rebond, lettres non prononcées), couleurs plus douces du Jardin.
 * Contrastes contrôlés dans les huit palettes (≥ 4,5:1 sur les cartes, ≥ 3:1 sur sable et surlignage).
 */
const TAJWID_CLAIR = {
  'tj-ghunna': '#167a3a',
  'tj-idgham': '#0b7066',
  'tj-ikhfa': '#4f7a0c',
  'tj-iqlab': '#0b6f8a',
  'tj-madd2': '#94600a',
  'tj-madd246': '#b54708',
  'tj-munfasil': '#c42b2b',
  'tj-muttasil': '#a3171f',
  'tj-madd6': '#7a1238',
  'tj-qalqala': '#1f56c9',
  'tj-assim': '#6b3fc0',
  'tj-muet': '#69707a',
  'tjk-nez': '#24803a',
  'tjk-long': '#b05600',
  'tjk-rebond': '#2f6fdb',
  'tjk-muet': '#6c737d',
};
const TAJWID_SOMBRE = {
  'tj-ghunna': '#5fd38a',
  'tj-idgham': '#45d1c0',
  'tj-ikhfa': '#b5dd5a',
  'tj-iqlab': '#5cc8e8',
  'tj-madd2': '#e8be5a',
  'tj-madd246': '#ff9a52',
  'tj-munfasil': '#ff7b7b',
  'tj-muttasil': '#ff6b81',
  'tj-madd6': '#f59bd8',
  'tj-qalqala': '#86aefc',
  'tj-assim': '#b8a6ff',
  'tj-muet': '#a3abb6',
  'tjk-nez': '#6fdc8f',
  'tjk-long': '#ffb066',
  'tjk-rebond': '#8fb5ff',
  'tjk-muet': '#aab1bb',
};
/** clés des couleurs du tajwid (contrôle de contraste) */
export const TAJWID_TOKENS = Object.keys(TAJWID_CLAIR);

/**
 * Muṣḥaf page par page — PALETTE VERTE (demande du client, 04/10/2026 : « en vert, plus joli, plus clair ») :
 * verts profonds pour le cadre et les cartouches de sourate, menthe douce pour les fonds, or discret pour les
 * ornements, papier clair légèrement chaud pour la page ; variante « vert nuit » en mode sombre. Commune aux
 * quatre thèmes (le Muṣḥaf garde son identité quel que soit le public). Contrastes contrôlés (CONTRAST_PAIRS).
 */
const MUSHAF_CLAIR = {
  'mp-paper': '#fffdf5',
  'mp-mint': '#ebf6ef',
  'mp-mint2': '#d4ecdd',
  'mp-green': '#16653f',
  'mp-band': '#14563a',
  'mp-on-band': '#f7fbf3',
  'mp-gold': '#b8892c',
  'mp-mark': '#d9f0e1',
  'mp-ink': '#132319',
  'mp-ink2': '#46604f',
};
const MUSHAF_SOMBRE = {
  'mp-paper': '#10201a',
  'mp-mint': '#0b1712',
  'mp-mint2': '#1b3a2b',
  'mp-green': '#82d9a7',
  'mp-band': '#1c5139',
  'mp-on-band': '#eef8f1',
  'mp-gold': '#d8b45c',
  'mp-mark': '#23493a',
  'mp-ink': '#e8f2ec',
  'mp-ink2': '#a9c5b5',
};

// « ﷺ » et l'arabe cité dans une phrase française : glyphes pris dans Noto Naskh Arabic (pas de repli illisible)
const SANS = "'Nunito', 'Noto Naskh Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif";
/** titres « manuscrit » : serif du système (aucun téléchargement de police supplémentaire) */
const SERIF =
  "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Noto Naskh Arabic', serif";
const POLICES = {
  ui: SANS,
  titre: SANS,
  arabe: "'Noto Naskh Arabic', serif",
  coran: "'Amiri Quran', serif",
};
const ESPACES = { xs: '4px', s: '8px', m: '16px', l: '24px', xl: '40px' };
const MOUVEMENT = { court: '120ms', moyen: '220ms' };

/** motif géométrique discret (étoile à huit branches, traits seulement, sans figuration) */
const etoile = (stroke: string, op: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cg fill='none' stroke='${encodeURIComponent(stroke)}' stroke-opacity='${op}' stroke-width='1'%3E%3Cpath d='M48 20l8 20 20 8-20 8-8 20-8-20-20-8 20-8z'/%3E%3Cpath d='M28 28h40v40H28z' transform='rotate(45 48 48)'/%3E%3Ccircle cx='48' cy='48' r='6'/%3E%3C/g%3E%3C/svg%3E")`;

/** Clé : nom du jeton (variable CSS --nom). Les noms historiques (--ink, --teal…) restent valables. */
export const THEMES: Record<ThemeName, Theme> = {
  clair: {
    naturel: 'clair',
    couleurs: {
      ink: '#16202b',
      ink2: '#4b5868',
      paper: '#f6f7f9',
      card: '#ffffff',
      surface: '#eef1f5',
      line: '#dfe3ea',
      teal: '#1b6a85',
      navy: '#15324a',
      header: '#ffffff',
      'on-header': '#15324a',
      good: '#1f9d6b',
      soft: '#e3edf5',
      ...LETTRES_CLAIR,
      ...TAJWID_CLAIR,
      ...MUSHAF_CLAIR,
      primary: '#1b6a85',
      'on-primary': '#ffffff',
      'primary-soft': '#e2f0f5',
      accent: '#c98a0b',
      'ok-bg': '#e8f6ef',
      'ok-ink': '#17703f',
      'bad-ink': '#b3261e',
      'bad-bg': '#fdecea',
      'warn-bg': '#fff6dc',
      'warn-ink': '#7d5100',
      'soon-ink': '#8a5c00',
      sand: '#f1f3f6',
      gold: '#f2b233',
      info: '#1f4e79',
      'info-bg': '#e7f0fa',
      focus: '#1b6a85',
      illus: '#ffffff',
      mark: '#ffe38a',
    },
    inverse: {
      ink: '#e6ebf1',
      ink2: '#a9b5c4',
      paper: '#0f141a',
      card: '#171e27',
      surface: '#1e2732',
      line: '#2c3846',
      teal: '#72c6e0',
      navy: '#b9d7ea',
      header: '#171e27',
      'on-header': '#e6ebf1',
      good: '#4fd39a',
      soft: '#22303d',
      ...LETTRES_SOMBRE,
      ...TAJWID_SOMBRE,
      ...MUSHAF_SOMBRE,
      primary: '#72c6e0',
      'on-primary': '#07141b',
      'primary-soft': '#1b3340',
      accent: '#e9b949',
      'ok-bg': '#163126',
      'ok-ink': '#8fe3b8',
      'bad-ink': '#ffb4ab',
      'bad-bg': '#3b1a17',
      'warn-bg': '#3a2e10',
      'warn-ink': '#f5d27a',
      'soon-ink': '#f5d27a',
      sand: '#1e2732',
      gold: '#e9b949',
      info: '#a9cdf2',
      'info-bg': '#16283a',
      focus: '#72c6e0',
      illus: '#f4f1ea',
      mark: '#5c4a10',
    },
    polices: POLICES,
    tailles: { base: '17px', arabe: '26px', interligne: '1.55', titre: '1.75rem', cible: '48px' },
    espaces: ESPACES,
    rayons: { petit: '8px', moyen: '10px', grand: '14px', pilule: '999px' },
    ombres: {
      carte: '0 1px 2px rgba(16, 24, 40, 0.06)',
      flottante: '0 8px 24px rgba(16, 24, 40, 0.12)',
    },
    motifs: { fond: 'none', carte: 'none' },
    mouvement: MOUVEMENT,
  },

  jardin: {
    naturel: 'clair',
    couleurs: {
      ink: '#1f2a24',
      ink2: '#4c5a52',
      paper: '#fff8ec',
      card: '#ffffff',
      surface: '#fff1d6',
      line: '#f0dfbf',
      teal: '#1d6f8a',
      navy: '#145a46',
      header: '#22764f',
      'on-header': '#ffffff',
      good: '#1f9d6b',
      soft: '#ffe3b8',
      ...LETTRES_CLAIR,
      ...TAJWID_CLAIR,
      ...MUSHAF_CLAIR,
      primary: '#1f7a52',
      'on-primary': '#ffffff',
      'primary-soft': '#ddf3e6',
      accent: '#f4a52b',
      'ok-bg': '#e3f6ea',
      'ok-ink': '#17703f',
      'bad-ink': '#b3261e',
      'bad-bg': '#ffeceb',
      'warn-bg': '#fff3d6',
      'warn-ink': '#7d5100',
      'soon-ink': '#8a5c00',
      sand: '#fff1d6',
      gold: '#f6b73c',
      info: '#1f4e79',
      'info-bg': '#e3f1fb',
      focus: '#1d6f8a',
      illus: '#ffffff',
      mark: '#ffe38a',
    },
    inverse: {
      ink: '#eef6f0',
      ink2: '#b4c8bc',
      paper: '#111a16',
      card: '#19251f',
      surface: '#21302a',
      line: '#2f433a',
      teal: '#7fd0e6',
      navy: '#bfe8d3',
      header: '#19251f',
      'on-header': '#eef6f0',
      good: '#4fd39a',
      soft: '#2b3a32',
      ...LETTRES_SOMBRE,
      ...TAJWID_SOMBRE,
      ...MUSHAF_SOMBRE,
      primary: '#7fd6a6',
      'on-primary': '#0b1f15',
      'primary-soft': '#1d3a2c',
      accent: '#f6b73c',
      'ok-bg': '#163126',
      'ok-ink': '#8fe3b8',
      'bad-ink': '#ffb4ab',
      'bad-bg': '#3b1a17',
      'warn-bg': '#3a2e10',
      'warn-ink': '#f5d27a',
      'soon-ink': '#f5d27a',
      sand: '#21302a',
      gold: '#f6b73c',
      info: '#a9cdf2',
      'info-bg': '#16283a',
      focus: '#7fd6a6',
      illus: '#f4f1ea',
      mark: '#5c4a10',
    },
    polices: { ...POLICES, titre: SANS },
    tailles: { base: '18px', arabe: '30px', interligne: '1.6', titre: '2rem', cible: '56px' },
    espaces: { xs: '6px', s: '10px', m: '18px', l: '28px', xl: '44px' },
    rayons: { petit: '12px', moyen: '18px', grand: '26px', pilule: '999px' },
    ombres: {
      carte: '0 3px 0 rgba(31, 42, 36, 0.06)',
      flottante: '0 10px 28px rgba(31, 42, 36, 0.14)',
    },
    motifs: {
      fond: 'radial-gradient(circle at 12% 8%, rgba(246, 183, 60, 0.16) 0 90px, transparent 91px), radial-gradient(circle at 92% 30%, rgba(47, 143, 98, 0.10) 0 120px, transparent 121px)',
      carte: 'none',
    },
    mouvement: MOUVEMENT,
  },

  nuit: {
    naturel: 'sombre',
    couleurs: {
      ink: '#e9edf7',
      ink2: '#a9b3c9',
      paper: '#0d1324',
      card: '#151d33',
      surface: '#1b2540',
      line: '#29355a',
      teal: '#8fd0ff',
      navy: '#c9d6ff',
      header: '#0d1324',
      'on-header': '#e9edf7',
      good: '#4fd39a',
      soft: '#232f52',
      ...LETTRES_SOMBRE,
      ...TAJWID_SOMBRE,
      ...MUSHAF_SOMBRE,
      primary: '#8fd0ff',
      'on-primary': '#081325',
      'primary-soft': '#1c2d4f',
      accent: '#f5c76b',
      'ok-bg': '#143026',
      'ok-ink': '#8fe3b8',
      'bad-ink': '#ffb4ab',
      'bad-bg': '#3a1a22',
      'warn-bg': '#3a2e14',
      'warn-ink': '#f5d27a',
      'soon-ink': '#f5d27a',
      sand: '#1b2540',
      gold: '#f5c76b',
      info: '#a9cdf2',
      'info-bg': '#17284a',
      focus: '#f5c76b',
      illus: '#f1efe9',
      mark: '#5c4a10',
    },
    // « aube » : variante claire de la nuit étoilée (réglage « clair » de l'appareil)
    inverse: {
      ink: '#141b2d',
      ink2: '#4a5570',
      paper: '#f3f5fb',
      card: '#ffffff',
      surface: '#e9edf8',
      line: '#d9dfee',
      teal: '#2f45a8',
      navy: '#1a2550',
      header: '#141b2d',
      'on-header': '#e9edf7',
      good: '#1f9d6b',
      soft: '#e3e8f8',
      ...LETTRES_CLAIR,
      ...TAJWID_CLAIR,
      ...MUSHAF_CLAIR,
      primary: '#3346a8',
      'on-primary': '#ffffff',
      'primary-soft': '#e6eafb',
      accent: '#b07a10',
      'ok-bg': '#e8f6ef',
      'ok-ink': '#17703f',
      'bad-ink': '#b3261e',
      'bad-bg': '#fdecea',
      'warn-bg': '#fff6dc',
      'warn-ink': '#7d5100',
      'soon-ink': '#8a5c00',
      sand: '#eef1f8',
      gold: '#f2b233',
      info: '#1f4e79',
      'info-bg': '#e7f0fa',
      focus: '#3346a8',
      illus: '#ffffff',
      mark: '#ffe38a',
    },
    polices: POLICES,
    tailles: { base: '17px', arabe: '26px', interligne: '1.55', titre: '1.8rem', cible: '48px' },
    espaces: ESPACES,
    rayons: { petit: '8px', moyen: '12px', grand: '16px', pilule: '999px' },
    ombres: {
      carte: '0 1px 0 rgba(255, 255, 255, 0.04) inset',
      flottante: '0 12px 32px rgba(0, 0, 0, 0.45)',
    },
    motifs: {
      fond: 'radial-gradient(1px 1px at 20% 12%, rgba(255,255,255,0.55) 50%, transparent 51%), radial-gradient(1px 1px at 72% 22%, rgba(255,255,255,0.4) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 44% 6%, rgba(245,199,107,0.6) 50%, transparent 51%), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.35) 50%, transparent 51%)',
      carte: 'none',
    },
    mouvement: MOUVEMENT,
  },

  manuscrit: {
    naturel: 'clair',
    couleurs: {
      ink: '#2a2118',
      ink2: '#5e4f3d',
      paper: '#f7f1e3',
      card: '#fffcf4',
      surface: '#f1e8d3',
      line: '#e3d5b8',
      teal: '#1d5f57',
      navy: '#2c2a3f',
      header: '#2b2620',
      'on-header': '#f7f1e3',
      good: '#1f9d6b',
      soft: '#f3dfb6',
      ...LETTRES_CLAIR,
      ...TAJWID_CLAIR,
      ...MUSHAF_CLAIR,
      primary: '#1d5f57',
      'on-primary': '#ffffff',
      'primary-soft': '#e3efe9',
      accent: '#a8792a',
      'ok-bg': '#e8f3e8',
      'ok-ink': '#2d6a32',
      'bad-ink': '#a3241c',
      'bad-bg': '#fbe9e4',
      'warn-bg': '#fbf0d6',
      'warn-ink': '#77500a',
      'soon-ink': '#7f560a',
      sand: '#f8f3e6',
      gold: '#d9a94e',
      info: '#2b4a6b',
      'info-bg': '#e9eef3',
      focus: '#1d5f57',
      illus: '#fffcf4',
      mark: '#ffe38a',
    },
    inverse: {
      ink: '#f1e8d8',
      ink2: '#c7b89f',
      paper: '#15120e',
      card: '#1f1a14',
      surface: '#28221a',
      line: '#3b3226',
      teal: '#8fd1bd',
      navy: '#e3d6bd',
      header: '#1f1a14',
      'on-header': '#f1e8d8',
      good: '#4fd39a',
      soft: '#33291c',
      ...LETTRES_SOMBRE,
      ...TAJWID_SOMBRE,
      ...MUSHAF_SOMBRE,
      primary: '#8fd1bd',
      'on-primary': '#0f241e',
      'primary-soft': '#1d332c',
      accent: '#d9a94e',
      'ok-bg': '#1a2e1c',
      'ok-ink': '#a6e3a9',
      'bad-ink': '#ffb4ab',
      'bad-bg': '#3b1a17',
      'warn-bg': '#3a2e10',
      'warn-ink': '#f5d27a',
      'soon-ink': '#f5d27a',
      sand: '#28221a',
      gold: '#d9a94e',
      info: '#b7cfe6',
      'info-bg': '#1d2834',
      focus: '#d9a94e',
      illus: '#f4ecdc',
      mark: '#5c4a10',
    },
    polices: { ...POLICES, titre: SERIF },
    tailles: { base: '17px', arabe: '28px', interligne: '1.6', titre: '2rem', cible: '48px' },
    espaces: ESPACES,
    rayons: { petit: '6px', moyen: '10px', grand: '14px', pilule: '999px' },
    ombres: {
      carte: '0 1px 0 rgba(42, 33, 24, 0.05), 0 6px 18px -12px rgba(42, 33, 24, 0.25)',
      flottante: '0 12px 30px rgba(42, 33, 24, 0.18)',
    },
    motifs: { fond: etoile('#a8792a', 0.08), carte: 'none' },
    mouvement: MOUVEMENT,
  },
};

/** Paires d'usage contrôlées (texte / fond) ; « grand » : texte ≥ 24 px ou ≥ 18,66 px gras (AA : 3:1). */
export const CONTRAST_PAIRS: Array<{ fg: string; bg: string; grand?: boolean; usage: string }> = [
  { fg: 'ink', bg: 'paper', usage: 'texte courant' },
  { fg: 'ink', bg: 'card', usage: 'texte des cartes' },
  { fg: 'ink', bg: 'surface', usage: 'texte sur surface secondaire' },
  { fg: 'ink2', bg: 'paper', usage: 'texte secondaire' },
  { fg: 'ink2', bg: 'card', usage: 'texte secondaire des cartes' },
  { fg: 'teal', bg: 'paper', usage: 'liens' },
  { fg: 'teal', bg: 'card', usage: 'liens dans les cartes' },
  { fg: 'primary', bg: 'card', usage: 'texte d’action (bouton secondaire)' },
  { fg: 'primary', bg: 'primary-soft', usage: 'onglet actif, pastille' },
  { fg: 'on-primary', bg: 'primary', usage: 'bouton principal' },
  { fg: 'on-header', bg: 'header', usage: 'en-tête' },
  { fg: 'navy', bg: 'card', usage: 'titres accentués' },
  { fg: 'ok-ink', bg: 'ok-bg', usage: 'message de réussite' },
  { fg: 'bad-ink', bg: 'bad-bg', usage: 'message d’erreur' },
  { fg: 'bad-ink', bg: 'card', usage: 'erreur dans une carte' },
  { fg: 'warn-ink', bg: 'warn-bg', usage: 'avertissement' },
  { fg: 'soon-ink', bg: 'warn-bg', usage: 'pastille « bientôt »' },
  { fg: 'info', bg: 'info-bg', usage: 'information' },
  { fg: 'ink', bg: 'sand', usage: 'encadrés sable' },
  { fg: 'ink', bg: 'mark', usage: 'mot surligné (lecteur coranique)' },
  { fg: 'ink', bg: 'ok-bg', usage: 'encadrés verts' },
  { fg: 'c0', bg: 'card', grand: true, usage: 'lettre étudiée (rouge), arabe ≥ 26 px' },
  { fg: 'c1', bg: 'card', grand: true, usage: 'lettre étudiée (bleu), arabe ≥ 26 px' },
  { fg: 'c2', bg: 'card', grand: true, usage: 'lettre étudiée (vert), arabe ≥ 26 px' },
  { fg: 'c3', bg: 'card', grand: true, usage: 'lettre étudiée (or), arabe ≥ 26 px' },
  { fg: 'c0', bg: 'sand', grand: true, usage: 'lettre étudiée dans un encadré (rouge)' },
  { fg: 'c1', bg: 'sand', grand: true, usage: 'lettre étudiée dans un encadré (bleu)' },
  { fg: 'c2', bg: 'sand', grand: true, usage: 'lettre étudiée dans un encadré (vert)' },
  { fg: 'c3', bg: 'sand', grand: true, usage: 'lettre étudiée dans un encadré (or)' },
  { fg: 'focus', bg: 'paper', grand: true, usage: 'contour de focus (3:1, WCAG 1.4.11)' },
  // lot 29 : tajwid en couleurs — texte coranique sur la carte (4,5:1 même à 320 px), sur le sable de la
  // plage choisie et sur le surlignage du verset entendu (arabe ≥ 23 px : 3:1)
  ...TAJWID_TOKENS.flatMap((fg) => [
    { fg, bg: 'card', usage: `tajwid ${fg} sur la carte` },
    { fg, bg: 'sand', grand: true, usage: `tajwid ${fg} dans la plage choisie` },
    { fg, bg: 'mark', grand: true, usage: `tajwid ${fg} sur le verset entendu` },
  ]),
  // Muṣḥaf vert (04/10/2026) : texte coranique et interface sur le papier, la menthe et le surlignage doux
  { fg: 'mp-ink', bg: 'mp-paper', usage: 'texte coranique sur la page du Muṣḥaf' },
  { fg: 'mp-ink', bg: 'mp-mark', usage: 'verset choisi (surlignage doux)' },
  { fg: 'mp-ink', bg: 'mp-mint', usage: 'barre de commandes du Muṣḥaf' },
  { fg: 'mp-ink', bg: 'mp-mint2', usage: 'bouton actif de la barre' },
  { fg: 'mp-ink2', bg: 'mp-paper', usage: 'en-tête courant, folio' },
  { fg: 'mp-ink2', bg: 'mp-mint', usage: 'texte secondaire de la barre' },
  { fg: 'mp-green', bg: 'mp-paper', usage: 'numéros de verset, titres verts' },
  { fg: 'mp-green', bg: 'mp-mint', usage: 'libellés verts de la barre' },
  { fg: 'mp-green', bg: 'mp-mint2', usage: 'bouton actif (vert sur menthe)' },
  { fg: 'mp-on-band', bg: 'mp-band', usage: 'titre de sourate dans le cartouche' },
  ...TAJWID_TOKENS.flatMap((fg) => [
    { fg, bg: 'mp-paper', usage: `tajwid ${fg} sur la page du Muṣḥaf` },
    { fg, bg: 'mp-mark', grand: true, usage: `tajwid ${fg} sur le verset choisi` },
  ]),
];

/** Écarts connus (aucun écart NOUVEAU n'est accepté). */
export const KNOWN_CONTRAST_GAPS: string[] = [];

/** Les huit palettes contrôlées : chaque thème dans ses deux modes. */
export function palettes(): Array<{ nom: string; couleurs: Record<string, string> }> {
  return THEME_NAMES.flatMap((n) => [
    { nom: `${n}/${THEMES[n].naturel}`, couleurs: THEMES[n].couleurs },
    {
      nom: `${n}/${THEMES[n].naturel === 'clair' ? 'sombre' : 'clair'}`,
      couleurs: THEMES[n].inverse,
    },
  ]);
}

function colorVars(c: Record<string, string>): Array<[string, string]> {
  return Object.entries(c).map(([k, v]) => [`--${k}`, v] as [string, string]);
}
function otherVars(t: Theme): Array<[string, string]> {
  return [
    ['--font-ui', t.polices.ui],
    ['--font-title', t.polices.titre],
    ['--font-ar', t.polices.arabe],
    ['--font-quran', t.polices.coran],
    ['--font-size', t.tailles.base],
    ['--ar-size', t.tailles.arabe],
    ['--line-height', t.tailles.interligne],
    ['--title-size', t.tailles.titre],
    ['--target', t.tailles.cible],
    ['--space-xs', t.espaces.xs],
    ['--space-s', t.espaces.s],
    ['--space-m', t.espaces.m],
    ['--space-l', t.espaces.l],
    ['--space-xl', t.espaces.xl],
    ['--radius-sm', t.rayons.petit],
    ['--radius-md', t.rayons.moyen],
    ['--radius-lg', t.rayons.grand],
    ['--radius-pill', t.rayons.pilule],
    ['--shadow-card', t.ombres.carte],
    ['--shadow-float', t.ombres.flottante],
    ['--pattern-bg', t.motifs.fond],
    ['--pattern-card', t.motifs.carte],
    ['--motion-fast', t.mouvement.court],
    ['--motion', t.mouvement.moyen],
  ];
}

const block = (sel: string, vars: Array<[string, string]>, scheme?: string) =>
  `${sel} {\n${scheme ? `  color-scheme: ${scheme};\n` : ''}${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

/**
 * CSS généré. « clair » par défaut (avant que le profil soit connu). Mode : `data-mode='sombre'|'clair'`
 * imposé par le réglage de l'appareil ; sans réglage, `prefers-color-scheme` décide.
 */
export function renderCss(themes: Record<ThemeName, Theme> = THEMES): string {
  const out: string[] = [
    '/* FICHIER GÉNÉRÉ par `pnpm --filter @awform/web theme` depuis src/lib/theme/tokens.ts — ne pas modifier à la main. */',
  ];
  for (const n of THEME_NAMES) {
    const t = themes[n];
    const nat = t.naturel === 'clair' ? 'light' : 'dark';
    const inv = t.naturel === 'clair' ? 'dark' : 'light';
    const invMode = t.naturel === 'clair' ? 'sombre' : 'clair';
    const sel = n === 'clair' ? ":root,\n[data-theme='clair']" : `[data-theme='${n}']`;
    out.push(block(sel, [...colorVars(t.couleurs), ...otherVars(t)], nat));
    out.push(block(`[data-theme='${n}'][data-mode='${invMode}']`, colorVars(t.inverse), inv));
  }
  // sans réglage de l'appareil, les thèmes clairs suivent la préférence sombre du système ; la « nuit »
  // reste sombre (c'est son identité) sauf réglage « clair » explicite
  const auto = THEME_NAMES.filter((n) => themes[n].naturel === 'clair')
    .map((n) => {
      const sel =
        n === 'clair'
          ? ":root:not([data-mode]):not([data-theme]),\n:root:not([data-mode])[data-theme='clair']"
          : `:root:not([data-mode])[data-theme='${n}']`;
      return block(sel, colorVars(themes[n].inverse), 'dark')
        .split('\n')
        .map((l) => (l ? `  ${l}` : l))
        .join('\n');
    })
    .join('\n');
  out.push(`@media (prefers-color-scheme: dark) {\n${auto}}\n`);
  out.push(
    '@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n    scroll-behavior: auto !important;\n  }\n}\n',
  );
  return out.join('\n');
}

/** Rapport de contraste WCAG 2.x entre deux couleurs hexadécimales. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
