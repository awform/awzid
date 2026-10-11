/**
 * JETONS DE THÈME — source unique de l'apparence (couleurs, polices, tailles, espacements, rayons, ombres,
 * motifs, mouvement). `pnpm --filter @awform/web theme` régénère src/lib/theme/tokens.css.
 *
 * UNE SEULE IDENTITÉ (décision du client et de la direction artistique, 11/10/2026) : la marque, en « clair »
 * et en « sombre ». Les anciens thèmes par public (« jardin », « nuit étoilée », « manuscrit ») et la palette
 * « verdure » sont supprimés ; il reste l'ergonomie enfant (ERGO_ENFANT : tailles seulement). Attribut
 * `data-mode` (« clair » | « sombre ») posé par le réglage de l'appareil, sinon `prefers-color-scheme`.
 * Lecteur du Coran : fonds Ivoire (défaut) et Sépia en mode clair (`data-fond`), fond sombre de la marque en mode
 * sombre, aucun décor derrière le texte.
 * Contrôles automatiques (tokens.test.ts) : CSS synchronisé, contraste WCAG AA des paires d'usage pour les
 * palettes (clair, sombre, clair + Sépia), couleurs de fonction ≥ 4,5:1, cibles ≥ 48 px, mouvement réduit.
 * Fichier sans import (lisible par Node directement).
 */
export type ThemeName = 'clair';
export const THEME_NAMES: ThemeName[] = ['clair'];

export interface Theme {
  /** palette du mode clair */
  couleurs: Record<string, string>;
  /** palette du mode sombre : mêmes clés */
  inverse: Record<string, string>;
  /** mode de la palette `couleurs` */
  naturel: 'clair';
  polices: { ui: string; titre: string; arabe: string; coran: string };
  tailles: { base: string; arabe: string; interligne: string; titre: string; cible: string };
  espaces: { xs: string; s: string; m: string; l: string; xl: string };
  rayons: { petit: string; moyen: string; grand: string; pilule: string };
  ombres: { carte: string; flottante: string };
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
  'tj-ikhfa': '#46700a',
  'tj-iqlab': '#0b6f8a',
  'tj-madd2': '#94600a',
  'tj-madd246': '#b54708',
  'tj-munfasil': '#c42b2b',
  'tj-muttasil': '#a3171f',
  'tj-madd6': '#7a1238',
  'tj-qalqala': '#1f56c9',
  'tj-assim': '#6b3fc0',
  'tj-muet': '#5b626c',
  'tjk-nez': '#1f7332',
  'tjk-long': '#9c4c00',
  'tjk-rebond': '#2860c2',
  'tjk-muet': '#5e656f',
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
  // décision 11/10/2026 : en mode sombre, le fond du lecteur est le fond sombre de la marque
  'mp-paper': '#14261f',
  'mp-mint': '#0d1a15',
  'mp-mint2': '#1a2f27',
  'mp-green': '#82d9a7',
  'mp-band': '#1c5139',
  'mp-on-band': '#eef8f1',
  'mp-gold': '#d8b45c',
  'mp-mark': '#23493a',
  'mp-ink': '#e8f2ec',
  'mp-ink2': '#a9c5b5',
};

/**
 * Coran épuré (06/10/2026) — OR des commandes actives (sélecteurs sourate / verset / page / juzʾ, préréglage
 * choisi) : fond doré très clair, texte or sombre, filet or. Commun à tous les thèmes (contrastes contrôlés).
 */
const OR_CLAIR = { 'or-soft': '#fbf1d3', 'or-ink': '#6e5000', 'or-line': '#c99a2e' };
const OR_SOMBRE = { 'or-soft': '#33290d', 'or-ink': '#f0d27e', 'or-line': '#c9a24a' };

// « ﷺ » et l'arabe cité dans une phrase française : glyphes pris dans Noto Naskh Arabic (pas de repli illisible)
const SANS = "'Nunito', 'Noto Naskh Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Police de la marque : le nom « Awzid » de l'en-tête (Lexend 600, auto-hébergée comme les autres polices). */
export const POLICE_MARQUE = "'Lexend', 'Nunito', system-ui, sans-serif";
const POLICES = {
  ui: SANS,
  // D1 : tous les titres en Lexend (police de la marque), jamais une police à empattements par défaut
  titre:
    "'Lexend', 'Nunito', 'Noto Naskh Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
  arabe: "'Noto Naskh Arabic', serif",
  coran: "'Amiri Quran', serif",
};
const ESPACES = { xs: '4px', s: '8px', m: '16px', l: '24px', xl: '40px' };
const MOUVEMENT = { court: '120ms', moyen: '220ms' };

/**
 * Couleurs de FONCTION (décision 11/10/2026) : succès (toujours avec l'icône ✓ et le mot), attention
 * (« presque, réessaie » : remplace tout rouge de correction dans le mode serein), information. Le rouge
 * `bad-ink` reste réservé aux erreurs du système. Contrastes ≥ 4,5:1 contrôlés (tokens.test.ts).
 */
export const FONCTION = {
  clair: { succes: '#1B7A50', attention: '#8A5A0B', info: '#2F5D7C' },
  sombre: { succes: '#5CC79C', attention: '#E0B060', info: '#8DB8D6' },
} as const;

/**
 * Fond de lecture « Sépia » du lecteur du Coran (mode clair seulement) : posé par `data-fond='sepia'` sur <html>.
 * L'« Ivoire » (défaut) est la page `mp-paper` de MUSHAF_CLAIR ; en mode sombre, le fond sombre de la marque.
 */
export const FOND_SEPIA = {
  'mp-paper': '#f8f0de',
  'mp-mint': '#efe4c9',
  'mp-mint2': '#e3d3ae',
  'mp-mark': '#ecdcae',
};

/** Clé : nom du jeton (variable CSS --nom). Les noms historiques (--ink, --teal…) restent valables. */
export const THEMES: Record<ThemeName, Theme> = {
  clair: {
    naturel: 'clair',
    couleurs: {
      ink: '#1e2b25',
      ink2: '#4a5a52',
      paper: '#fbf7ee',
      card: '#ffffff',
      surface: '#f2ebda',
      line: '#ddd3bd',
      teal: '#0b6e4f',
      navy: '#084c38',
      header: '#ffffff',
      'on-header': '#084c38',
      good: '#1f9d6b',
      soft: '#e4efe8',
      ...LETTRES_CLAIR,
      ...TAJWID_CLAIR,
      ...MUSHAF_CLAIR,
      ...OR_CLAIR,
      primary: '#0b6e4f',
      'on-primary': '#ffffff',
      'primary-soft': '#ddefe6',
      accent: '#c9a227',
      'ok-bg': '#e8f6ef',
      'ok-ink': FONCTION.clair.succes,
      'bad-ink': '#a3261e',
      'bad-bg': '#fdecea',
      'warn-bg': '#fff6dc',
      'warn-ink': FONCTION.clair.attention,
      'soon-ink': '#7a5c0c',
      succes: FONCTION.clair.succes,
      attention: FONCTION.clair.attention,
      sand: '#f8f3e6',
      gold: '#c9a227',
      info: FONCTION.clair.info,
      'info-bg': '#e7f0fa',
      focus: '#0b6e4f',
      illus: '#ffffff',
      mark: '#ffe38a',
    },
    inverse: {
      ink: '#e8dfc8',
      ink2: '#b4c2ba',
      paper: '#0d1a15',
      card: '#14261f',
      surface: '#14261f',
      line: '#28423a',
      teal: '#5cc79c',
      navy: '#e8dfc8',
      header: '#14261f',
      'on-header': '#e8dfc8',
      good: '#4fd39a',
      soft: '#1a2f27',
      ...LETTRES_SOMBRE,
      ...TAJWID_SOMBRE,
      ...MUSHAF_SOMBRE,
      ...OR_SOMBRE,
      primary: '#1f9c73',
      'on-primary': '#0d1a15',
      'primary-soft': '#10221b',
      accent: '#d9b54a',
      'ok-bg': '#163126',
      'ok-ink': FONCTION.sombre.succes,
      'bad-ink': '#f2b8b5',
      'bad-bg': '#3b1a17',
      'warn-bg': '#3a2e10',
      'warn-ink': FONCTION.sombre.attention,
      'soon-ink': '#f5d27a',
      succes: FONCTION.sombre.succes,
      attention: FONCTION.sombre.attention,
      sand: '#1a2f27',
      gold: '#d9b54a',
      info: FONCTION.sombre.info,
      'info-bg': '#16283a',
      focus: '#5cc79c',
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
    mouvement: MOUVEMENT,
  },
};

/**
 * Ergonomie ENFANT (seule trace restante de l'ancien thème « jardin ») : textes et cibles plus grands, espaces
 * plus larges. Posée par `[data-public='enfant']` ; mêmes couleurs, même identité que pour tout le monde.
 */
export const ERGO_ENFANT: Array<[string, string]> = [
  ['--font-size', '18px'],
  ['--ar-size', '30px'],
  ['--line-height', '1.6'],
  ['--title-size', '2rem'],
  ['--target', '56px'],
  ['--space-xs', '6px'],
  ['--space-s', '10px'],
  ['--space-m', '18px'],
  ['--space-l', '28px'],
  ['--space-xl', '44px'],
];

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
  // couleurs de fonction (11/10/2026) : succès, attention, info — texte ≥ 4,5:1 sur la page, la carte et leur fond
  { fg: 'succes', bg: 'paper', usage: 'succès (avec ✓ et le mot) sur la page' },
  { fg: 'succes', bg: 'card', usage: 'succès (avec ✓ et le mot) dans une carte' },
  { fg: 'succes', bg: 'ok-bg', usage: 'succès sur son fond' },
  { fg: 'attention', bg: 'paper', usage: 'attention (« presque, réessaie ») sur la page' },
  { fg: 'attention', bg: 'card', usage: 'attention dans une carte' },
  { fg: 'attention', bg: 'warn-bg', usage: 'attention sur son fond' },
  { fg: 'info', bg: 'paper', usage: 'information sur la page' },
  { fg: 'info', bg: 'card', usage: 'information dans une carte' },
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
  // Coran épuré : commandes actives dorées
  { fg: 'or-ink', bg: 'or-soft', usage: 'sélecteur actif (or)' },
  { fg: 'or-ink', bg: 'card', usage: 'libellé doré sur la barre' },
  { fg: 'ink', bg: 'or-soft', usage: 'texte sur fond doré' },
  { fg: 'mp-ink', bg: 'mp-mint', usage: 'barre claire du Coran' },
];

/** Écarts connus (aucun écart NOUVEAU n'est accepté). */
export const KNOWN_CONTRAST_GAPS: string[] = [];

/** Les palettes contrôlées : la marque en clair, en sombre, et en clair avec le fond Sépia du lecteur. */
export function palettes(): Array<{ nom: string; couleurs: Record<string, string> }> {
  return [
    { nom: 'clair', couleurs: THEMES.clair.couleurs },
    { nom: 'sombre', couleurs: THEMES.clair.inverse },
    { nom: 'clair + Sépia', couleurs: { ...THEMES.clair.couleurs, ...FOND_SEPIA } },
  ];
}

/**
 * Marque Awzid — couleur du nom et du slogan, symbole clair ou sombre, selon le fond réel du thème.
 * Calculé À LA GÉNÉRATION de tokens.css (jamais dans le navigateur) : le CSS reçoit, pour chaque thème et mode,
 * des variables `--mh-*` (marque posée sur l'en-tête) et `--mp-*` (marque posée sur le fond de la page) que
 * Brand.svelte lit sans une ligne de JavaScript. Nom : #084C38 (clair) / #E8DFC8 (sombre) ; slogan : #0B6E4F /
 * #D9B54A ; on retient la couleur lisible (≥ 4,5:1) sur le fond, sinon celle du texte du thème.
 */
export const NOM = { clair: '#084C38', sombre: '#E8DFC8' } as const;
/** Couleur du livre dans awzid-symbole.svg (version pour fond clair). */
const SYMBOLE_CLAIR = '#0B6E4F';
export const SLOGAN = { clair: '#0B6E4F', sombre: '#D9B54A' } as const;

type Rgb = [number, number, number];

function parseCouleur(css: string): Rgb | null {
  const h = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (!h) return null;
  const n = parseInt(h[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contraste(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Encre de marque lisible sur `fond` ; `null` si aucune des deux ne tient 4,5:1 (le thème garde sa couleur). */
export function choisirEncre(
  fond: string,
  paire: { clair: string; sombre: string },
): { encre: string | null; fondSombre: boolean } {
  const f = parseCouleur(fond) ?? [255, 255, 255];
  // fond foncé OU coloré (le livre #0B6E4F du symbole clair s'y perdrait, < 3:1) : version pour fond sombre
  const fondSombre = luminance(f) < 0.2 || contraste(parseCouleur(SYMBOLE_CLAIR)!, f) < 3;
  const prefere = fondSombre ? paire.sombre : paire.clair;
  const autre = fondSombre ? paire.clair : paire.sombre;
  for (const c of [prefere, autre]) {
    if (contraste(parseCouleur(c)!, f) >= 4.5) return { encre: c, fondSombre };
  }
  return { encre: null, fondSombre };
}

/** Variables CSS de la marque pour un jeu de couleurs (en-tête `header`, page `paper`). */
export function marqueVars(c: Record<string, string>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [p, cle] of [
    ['h', 'header'],
    ['p', 'paper'],
  ] as const) {
    const fond = c[cle];
    if (!fond) continue;
    const nom = choisirEncre(fond, NOM);
    out.push(
      [`--m${p}-clair`, nom.fondSombre ? 'none' : 'block'],
      [`--m${p}-sombre`, nom.fondSombre ? 'block' : 'none'],
      [`--m${p}-nom`, nom.encre ?? 'currentColor'],
      [`--m${p}-slogan`, choisirEncre(fond, SLOGAN).encre ?? 'currentColor'],
    );
  }
  return out;
}

function colorVars(c: Record<string, string>): Array<[string, string]> {
  // + variables de la marque (symbole clair/sombre, couleur du nom et du slogan) : 100 % CSS, voir Brand.svelte
  return [
    ...Object.entries(c).map(([k, v]) => [`--${k}`, v] as [string, string]),
    ...marqueVars(c),
  ];
}
function otherVars(t: Theme): Array<[string, string]> {
  return [
    ['--font-ui', t.polices.ui],
    ['--font-title', t.polices.titre],
    ['--font-brand', POLICE_MARQUE],
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
    ['--motion-fast', t.mouvement.court],
    ['--motion', t.mouvement.moyen],
  ];
}

const block = (sel: string, vars: Array<[string, string]>, scheme?: string) =>
  `${sel} {\n${scheme ? `  color-scheme: ${scheme};\n` : ''}${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

/**
 * CSS généré. « clair » par défaut (avant que le profil soit connu). Mode : `data-mode='sombre'|'clair'`
 * imposé par le réglage de l'appareil ; sans réglage, `prefers-color-scheme` décide. Ensuite : l'ergonomie
 * enfant (`data-public='enfant'`) et le fond Sépia du lecteur (`data-fond='sepia'`, mode clair seulement : les
 * blocs du mode sombre, plus spécifiques, l'emportent).
 */
export function renderCss(themes: Record<ThemeName, Theme> = THEMES): string {
  const out: string[] = [
    '/* FICHIER GÉNÉRÉ par `pnpm --filter @awform/web theme` depuis src/lib/theme/tokens.ts — ne pas modifier à la main. */',
  ];
  const t = themes.clair;
  out.push(
    block(":root,\n[data-theme='clair']", [...colorVars(t.couleurs), ...otherVars(t)], 'light'),
  );
  out.push(block("[data-theme='clair'][data-mode='sombre']", colorVars(t.inverse), 'dark'));
  out.push(block("[data-public='enfant']", ERGO_ENFANT));
  out.push(
    block(
      "[data-fond='sepia']",
      Object.entries(FOND_SEPIA).map(([k, v]) => [`--${k}`, v] as [string, string]),
    ),
  );
  // sans réglage de l'appareil, la préférence sombre du téléphone décide
  const auto = block(
    ":root:not([data-mode]):not([data-theme]),\n:root:not([data-mode])[data-theme='clair']",
    colorVars(t.inverse),
    'dark',
  )
    .split('\n')
    .map((l) => (l ? `  ${l}` : l))
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
