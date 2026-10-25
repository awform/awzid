/**
 * Cahier de lecture (20/10/2026) — règles pures (testées) : atelier « je compose le mot », bilans à froid, minutes de
 * lecture. Les signes sont construits par leurs points de code : aucun texte arabe tapé ici.
 */
import type { AtelierMot, El, Page } from './donnees';

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

/**
 * Types de pages sans vidéo (25/10/2026) : le bilan à froid (l'élève lit seul des mots jamais vus), la minute
 * chronométrée et le guide. Copie VOLONTAIRE de `CAHIER_SANS_VIDEO` du générateur (`@awform/content/video-cahier-types`) :
 * le cahier ne doit pas partager de module avec le lecteur de vidéo (chargé à part, à la demande) ; un test garde les
 * deux listes identiques.
 */
export const SANS_VIDEO: readonly string[] = ['bilan', 'minute', 'guide'];
