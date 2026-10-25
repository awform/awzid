/**
 * Cahier de lecture (20/10/2026) — règles pures (testées) : atelier « je compose le mot », bilans à froid, minutes de
 * lecture. Les signes sont construits par leurs points de code : aucun texte arabe tapé ici.
 */
import type { AtelierMot, El, Page, Rang } from './donnees';

const c = (...cs: number[]) => String.fromCharCode(...cs);
/** les 7 signes de l'atelier (touches 1 à 7), dans l'ordre du prototype validé par le client */
export const SIGNES = [
  { k: 'fatha', m: c(0x64e) },
  { k: 'kasra', m: c(0x650) },
  { k: 'damma', m: c(0x64f) },
  { k: 'soukoun', m: c(0x652) },
  { k: 'shadda+fatha', m: c(0x651, 0x64e) },
  { k: 'shadda+kasra', m: c(0x651, 0x650) },
  { k: 'shadda+damma', m: c(0x651, 0x64f) },
] as const;
/** cercle pointillé (U+25CC) : porte le signe montré seul sur un bouton */
export const CERCLE = c(0x25cc);
export const marques = (k: string) => SIGNES.find((s) => s.k === k)?.m ?? '';
/** clé de texte d'un signe (`cahier.signe.shadda_fatha`) */
export const cleSigne = (k: string) => `cahier.signe.${k.replace('+', '_')}`;

/** choix initiaux : vides pour les lettres à composer, signe de la solution pour les lettres fixes (prolongation) */
export const choixInitiaux = (m: AtelierMot) => m.cases.map((x) => (x.choix ? '' : x.signe));
/** lettre affichée avec le signe choisi (rien si la case est encore vide) */
export const lettreComposee = (m: AtelierMot, i: number, choix: readonly string[]) =>
  m.cases[i]!.lettre + (m.cases[i]!.choix ? marques(choix[i] ?? '') : '');
export const atelierJuste = (m: AtelierMot, choix: readonly string[]) =>
  m.cases.every((x, i) => !x.choix || choix[i] === x.signe);
/** case à composer suivante (ou précédente), en sautant les lettres fixes ; -1 s'il n'y en a pas */
export function caseVoisine(m: AtelierMot, i: number, sens: 1 | -1): number {
  for (let j = i + sens; j >= 0 && j < m.cases.length; j += sens) if (m.cases[j]!.choix) return j;
  return -1;
}
export const premiereCase = (m: AtelierMot) =>
  Math.max(
    0,
    m.cases.findIndex((x) => x.choix),
  );

/** Bilan à froid : réussite (seuil du cahier, 90 % du premier coup) et pages de rattrapage des mots manqués. */
export function resultatBilan(
  mots: readonly El[],
  manques: readonly number[],
  seuil?: number,
): {
  justes: number;
  total: number;
  reussi: boolean;
  rattrapages: Array<{ page: string; mots: string[]; difficulte: string }>;
} {
  const total = mots.length;
  const justes = total - new Set(manques.filter((i) => i >= 0 && i < total)).size;
  const s = seuil ?? Math.ceil(total * 0.9);
  const par = new Map<string, { page: string; mots: string[]; difficulte: string }>();
  for (const i of [...new Set(manques)].sort((a, b) => a - b)) {
    const m = mots[i];
    if (!m?.r) continue;
    const r = par.get(m.r) ?? { page: m.r, mots: [], difficulte: m.d ?? '' };
    r.mots.push(m.ar);
    par.set(m.r, r);
  }
  return { justes, total, reussi: justes >= s, rattrapages: [...par.values()] };
}

/** mots justes (ou éléments) par minute */
export const parMinute = (justes: number, secondes: number) =>
  secondes > 0 ? Math.round((Math.max(0, justes) * 60) / secondes) : 0;

/** Mots du bilan d'une page (tous les blocs de mots, dans l'ordre). */
export const motsDuBilan = (p: Page): El[] =>
  p.blocs.filter((b) => b.type === 'mots').flatMap((b) => b.el as El[]);

/** Élément ouvert : sans `n`, ou leçon atteinte (leçon atteinte inconnue : tout est ouvert, comme les pages du parcours). */
export const ouvert = (n: number | undefined, atteinte: number | null): boolean =>
  n === undefined || atteinte === null || n <= atteinte;

/**
 * Grilles des cahiers des enfants et des ados (25/10/2026) : une grille se débloque DÈS QUE SES LETTRES SONT ENSEIGNÉES,
 * case par case (chaque case porte la leçon `n` où ses lettres et ses signes sont enseignés). Cette page ne garde que les
 * cases et les mots ouverts : lecture guidée et vidéo n'ont jamais une case que l'élève ne sait pas encore lire. Une page
 * sans case verrouillée est rendue telle quelle (même objet).
 */
export function filtrerPage(p: Page, atteinte: number | null): Page {
  if (atteinte === null || !p.jeu) return p;
  let retire = false;
  const blocs = p.blocs.map((b) => {
    if (b.type === 'grille') {
      return {
        ...b,
        el: b.el.map((r) => {
          const rang = r as Rang;
          const el = rang.el.filter((e) => ouvert(e.n, atteinte));
          if (el.length !== rang.el.length) retire = true;
          return { ...rang, el };
        }),
      };
    }
    if (b.type === 'ligne_mots') {
      const el = (b.el as El[]).filter((e) => ouvert(e.n, atteinte));
      if (el.length !== b.el.length) retire = true;
      return { ...b, el };
    }
    return b;
  });
  return retire ? { ...p, blocs } : p;
}

/** Plus petite leçon (> atteinte) qui ouvre une case encore fermée de la page ; null s'il n'en reste aucune. */
export function prochaineLecon(p: Page, atteinte: number | null): number | null {
  if (atteinte === null || !p.jeu) return null;
  let m: number | null = null;
  for (const b of p.blocs) {
    if (b.type !== 'grille' && b.type !== 'ligne_mots') continue;
    const els = b.type === 'grille' ? b.el.flatMap((r) => (r as Rang).el) : (b.el as El[]);
    for (const e of els)
      if (e.n !== undefined && e.n > atteinte && (m === null || e.n < m)) m = e.n;
  }
  return m;
}

/**
 * Types de pages sans vidéo (25/10/2026) : le bilan à froid (l'élève lit seul des mots jamais vus), la minute
 * chronométrée et le guide. Copie VOLONTAIRE de `CAHIER_SANS_VIDEO` du générateur (`@awform/content/video-cahier-types`) :
 * le cahier ne doit pas partager de module avec le lecteur de vidéo (chargé à part, à la demande) ; un test garde les
 * deux listes identiques.
 */
export const SANS_VIDEO: readonly string[] = ['bilan', 'minute', 'guide'];
