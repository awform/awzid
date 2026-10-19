/**
 * Refonte « manuscrit enluminé moderne » (19/10/2026), étape 1 — règles PURES des écrans Aujourd'hui et Mes
 * activités (testées dans donnees.test.ts). Tout vient des données de l'application : leçon du jour et espace du
 * niveau (titres arabes du livre), régularité de la semaine, dernière lecture du Coran, progression des Madjaliss.
 */
import type { Unite } from '$lib/parcours/parcours';
import type { Progres } from '$lib/madjaliss/progression';

/** Héros : unité de la leçon du jour dans l'espace du niveau, son numéro dans le livre et le nombre de leçons. */
export function heroLecon(
  unites: readonly Unite[],
  leconId: string | null | undefined,
): { unite: Unite; numero: number; total: number } | null {
  const unite = unites.find((u) => u.id === leconId);
  if (!unite) return null;
  const lecons = unites.filter((u) => u.kind === 'lecon');
  return { unite, numero: unite.numLecon ?? unite.n, total: lecons.length || unites.length };
}

/** Prochain jalon : le premier bilan ou la première épreuve APRÈS la leçon du jour (sinon après la dernière faite). */
export function prochainJalon(
  unites: readonly Unite[],
  leconId: string | null | undefined,
): Unite | null {
  let i = unites.findIndex((u) => u.id === leconId);
  if (i < 0) i = unites.findIndex((u) => u.statut !== 'terminee' && u.statut !== 'maitrisee');
  if (i < 0) return null;
  return unites.slice(i).find((u) => u.kind === 'bilan' || u.kind === 'examen') ?? null;
}

/** Moment de la journée (adhkār du matin jusqu'à 14 h, du soir ensuite) et salutation (« Bonsoir » dès 18 h). */
export const moment = (heure: number): 'matin' | 'soir' => (heure < 14 ? 'matin' : 'soir');
export const salutation = (heure: number): 'bonjour' | 'bonsoir' =>
  heure >= 18 || heure < 4 ? 'bonsoir' : 'bonjour';

/** Anneau doré : longueur du trait sur un cercle de rayon r (jamais plus d'un tour). */
export function anneau(n: number, objectif: number, r = 48): { trait: number; tour: number } {
  const tour = 2 * Math.PI * r;
  const part = objectif > 0 ? Math.min(1, Math.max(0, n / objectif)) : 0;
  return { trait: Math.round(part * tour * 10) / 10, tour: Math.round(tour * 10) / 10 };
}

/**
 * Dernière lecture du Coran gardée par le lecteur (`$lib/quran/lecture`, `writeLast`, même clé), lue ici SANS importer
 * le module du lecteur (il resterait sinon partagé avec la page du lecteur : poids de sa première ouverture).
 */
export const CLE_DERNIERE_LECTURE = 'awzid.coran.derniere-lecture.v1';
export function derniereLecture(
  store: Pick<Storage, 'getItem'> | null,
): { s: number; a: number } | null {
  try {
    const x = JSON.parse(store?.getItem(CLE_DERNIERE_LECTURE) ?? 'null') as {
      s?: unknown;
      a?: unknown;
    } | null;
    const s = Number(x?.s);
    const a = Number(x?.a);
    return Number.isInteger(s) && s >= 1 && s <= 114 && Number.isInteger(a) && a >= 1 && a <= 286
      ? { s, a }
      : null;
  } catch {
    return null;
  }
}

export interface RepriseMadjaliss {
  id: string;
  /** séance ouverte et pas encore faite (sinon null : on montre le nombre de séances faites) */
  seance: number | null;
  faites: number;
}

/**
 * Madjaliss à reprendre : un texte dont une séance est ouverte et pas encore faite, sinon le dernier texte travaillé
 * (jour de la dernière séance faite) ; null si aucun texte n'a été commencé.
 */
export function repriseMadjaliss(
  progres: Readonly<Record<string, Progres>>,
  ordre: readonly string[],
): RepriseMadjaliss | null {
  const vus = ordre
    .map((id) => ({ id, p: progres[id] }))
    .filter((x): x is { id: string; p: Progres } => !!x.p)
    .map(({ id, p }) => ({
      id,
      seance: p.ouverte !== null && !p.faites.includes(p.ouverte) ? p.ouverte : null,
      faites: p.faites.length,
      fini: p.fini ?? '',
    }))
    .filter((x) => x.seance !== null || x.faites > 0);
  if (!vus.length) return null;
  const ouverte = vus.find((x) => x.seance !== null);
  const r =
    ouverte ?? [...vus].sort((a, b) => (a.fini < b.fini ? 1 : a.fini > b.fini ? -1 : 0))[0]!;
  return { id: r.id, seance: r.seance, faites: r.faites };
}

// ------------------------------------------------------------------ contraste (WCAG 2.1)

const canal = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * canal(r!) + 0.7152 * canal(g!) + 0.0722 * canal(b!);
};
/** Rapport de contraste entre deux couleurs « #rrggbb ». */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
