/**
 * JETONS DE THÈME — source unique de l'apparence (couleurs, polices, tailles, rayons, ombres, motifs).
 * La direction artistique choisie par le fondateur (W\application\styles\) s'appliquera EN UNE PASSE en
 * modifiant ce fichier puis `pnpm --filter @awform/web theme` (régénère src/lib/theme/tokens.css).
 * Deux publics : « enfants » et « adultes » (attribut data-theme posé selon le profil actif) ; pour
 * l'instant les deux thèmes sont IDENTIQUES à l'apparence actuelle (aucun changement visible).
 * Contrôles automatiques (tokens.test.ts) : CSS synchronisé, contraste WCAG AA des paires d'usage.
 * Fichier sans import (lisible par Node directement).
 */

export interface Theme {
  couleurs: Record<string, string>;
  polices: { ui: string; arabe: string; coran: string };
  tailles: { base: string; arabe: string; interligne: string };
  rayons: { petit: string; moyen: string; grand: string; pilule: string };
  ombres: { carte: string; flottante: string };
  /** motif de fond (image CSS) ; « none » : aucun */
  motifs: { fond: string; carte: string };
}

/** Couleurs : les noms historiques (--ink, --teal…) restent valables, les nouveaux sont sémantiques. */
const BASE: Theme = {
  couleurs: {
    ink: '#1b1b1b',
    ink2: '#4a5566',
    paper: '#fffdf8',
    card: '#ffffff',
    line: '#e6dcc8',
    teal: '#1f7a8c',
    navy: '#173b57',
    good: '#1f9d6b',
    soft: '#f6ddb5',
    /** couleurs fixes des lettres étudiées (moteur des livres) : rouge, bleu, vert, or */
    c0: '#e5484d',
    c1: '#2f6fdb',
    c2: '#1f9d6b',
    // or des livres (#c98a0b) assombri au lot 14 : contraste 4,7:1 sur blanc (WCAG AA, audit axe-core)
    c3: '#9a6a00',
    // sémantiques (valeurs reprises des composants, sans changement visible)
    primary: '#1f7a8c',
    'on-primary': '#ffffff',
    'ok-bg': '#eaf7f1',
    'ok-ink': '#1b7f4b',
    'bad-ink': '#b3261e',
    'bad-bg': '#fdecea',
    'warn-bg': '#fff8e1',
    'warn-ink': '#8a5a00',
    'soon-ink': '#9a6700',
    sand: '#f6f2e8',
    gold: '#f2b233',
    info: '#1f4e79',
  },
  polices: {
    ui: "'Nunito', system-ui, sans-serif",
    arabe: "'Noto Naskh Arabic', serif",
    coran: "'Amiri Quran', serif",
  },
  tailles: { base: '17px', arabe: '26px', interligne: '1.5' },
  rayons: { petit: '8px', moyen: '12px', grand: '16px', pilule: '99px' },
  ombres: { carte: 'none', flottante: '0 4px 16px rgba(23, 59, 87, 0.12)' },
  motifs: { fond: 'none', carte: 'none' },
};

export const THEMES: Record<'adultes' | 'enfants', Theme> = {
  adultes: BASE,
  // même apparence pour l'instant : la direction « enfants » viendra avec le choix du fondateur
  enfants: BASE,
};

/** Paires d'usage contrôlées (texte / fond) ; « grand » : texte ≥ 24 px ou ≥ 18,66 px gras (AA : 3:1). */
export const CONTRAST_PAIRS: Array<{ fg: string; bg: string; grand?: boolean; usage: string }> = [
  { fg: 'ink', bg: 'paper', usage: 'texte courant' },
  { fg: 'ink', bg: 'card', usage: 'texte des cartes' },
  { fg: 'ink2', bg: 'paper', usage: 'texte secondaire' },
  { fg: 'ink2', bg: 'card', usage: 'texte secondaire des cartes' },
  { fg: 'teal', bg: 'paper', usage: 'liens' },
  { fg: 'teal', bg: 'card', usage: 'liens dans les cartes' },
  { fg: 'on-primary', bg: 'primary', usage: 'bouton principal' },
  { fg: 'ok-ink', bg: 'ok-bg', usage: 'message de réussite' },
  { fg: 'bad-ink', bg: 'bad-bg', usage: 'message d’erreur' },
  { fg: 'bad-ink', bg: 'card', usage: 'erreur dans une carte' },
  { fg: 'warn-ink', bg: 'warn-bg', usage: 'avertissement' },
  { fg: 'soon-ink', bg: 'warn-bg', usage: 'pastille « bientôt »' },
  { fg: 'ink', bg: 'sand', usage: 'encadrés sable' },
  { fg: 'ink', bg: 'ok-bg', usage: 'encadrés verts' },
  { fg: 'c0', bg: 'card', grand: true, usage: 'lettre étudiée (rouge), arabe ≥ 26 px' },
  { fg: 'c1', bg: 'card', grand: true, usage: 'lettre étudiée (bleu), arabe ≥ 26 px' },
  { fg: 'c2', bg: 'card', grand: true, usage: 'lettre étudiée (vert), arabe ≥ 26 px' },
  { fg: 'c3', bg: 'card', grand: true, usage: 'lettre étudiée (or), arabe ≥ 26 px' },
];

/**
 * Écarts connus (aucun écart NOUVEAU n'est accepté). Lot 14 : l'or des lettres (#c98a0b, hérité des livres,
 * contraste < 3:1) a été assombri en #9a6a00 ; plus aucun écart. À revoir avec la direction artistique.
 */
export const KNOWN_CONTRAST_GAPS: string[] = [];

function varsOf(t: Theme): Array<[string, string]> {
  return [
    ...Object.entries(t.couleurs).map(([k, v]) => [`--${k}`, v] as [string, string]),
    ['--font-ui', t.polices.ui],
    ['--font-ar', t.polices.arabe],
    ['--font-quran', t.polices.coran],
    ['--font-size', t.tailles.base],
    ['--ar-size', t.tailles.arabe],
    ['--line-height', t.tailles.interligne],
    ['--radius-sm', t.rayons.petit],
    ['--radius-md', t.rayons.moyen],
    ['--radius-lg', t.rayons.grand],
    ['--radius-pill', t.rayons.pilule],
    ['--shadow-card', t.ombres.carte],
    ['--shadow-float', t.ombres.flottante],
    ['--pattern-bg', t.motifs.fond],
    ['--pattern-card', t.motifs.carte],
  ];
}

/** CSS généré : thème « adultes » par défaut, surcharges du thème « enfants », mouvement réduit. */
export function renderCss(themes: typeof THEMES = THEMES): string {
  const base = varsOf(themes.adultes);
  const kids = varsOf(themes.enfants);
  const baseMap = new Map(base);
  const diff = kids.filter(([k, v]) => baseMap.get(k) !== v);
  const block = (sel: string, vars: Array<[string, string]>) =>
    `${sel} {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
  return [
    '/* FICHIER GÉNÉRÉ par `pnpm --filter @awform/web theme` depuis src/lib/theme/tokens.ts — ne pas modifier à la main. */',
    block(":root,\n[data-theme='adultes']", base),
    diff.length
      ? block("[data-theme='enfants']", diff)
      : "/* [data-theme='enfants'] : identique au thème adultes pour l'instant */\n",
    '@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n    scroll-behavior: auto !important;\n  }\n}\n',
  ].join('\n');
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
