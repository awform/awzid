/**
 * « Voir le tracé » (31/10/2026) — calculs PURS de l'animation du tracé d'une lettre : durées par vitesse, ordre des
 * traits, position de la plume, flèche de départ, statut affiché. Aucune donnée n'est écrite ici : les sens et l'ordre
 * des traits sont ceux de `/video/traits.json` (généré par scripts/video-traits.mjs depuis docs/ecriture, § 3P de
 * SENS_DES_TRAITS.md), repris TELS QUELS. Chargé à la demande avec le composant (groupe « vidéos vivantes »).
 */

/** vitesses proposées (1 = vitesse normale) */
export const VITESSES = [0.5, 0.75, 1, 1.5] as const;
export type Vitesse = (typeof VITESSES)[number];

export const FORMES = ['isolee', 'debut', 'milieu', 'fin'] as const;
export type Forme = (typeof FORMES)[number];

/** une forme du fichier servi : statut de la recherche et traits (listes plates x, y, x, y… en 0–100) */
export interface FormeTrace {
  s: string;
  t: number[][];
}
export type TraitsJson = Record<string, Array<FormeTrace | null>>;

/** pause entre deux traits et durée de l'apparition des points (ms à la vitesse 1×) */
export const PAUSE_TRAIT = 350;
export const DUREE_POINTS = 700;
/** durée d'un trait : proportionnelle à sa longueur (unités 0–100), au moins 900 ms à 1× */
export const MS_PAR_UNITE = 12;
export const DUREE_MIN_TRAIT = 900;

/** statuts affichés normalement ; tout autre statut (probable, divergent…) porte la mention « à confirmer » */
export const STATUTS_SURS = ['sur', 'sur (dérivé)'] as const;
export const aConfirmer = (statut: string) => !(STATUTS_SURS as readonly string[]).includes(statut);

/** vitesse valide la plus proche (jamais de valeur hors de la liste) */
export function vitesseValide(v: number): Vitesse {
  return VITESSES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/** étiquette d'une vitesse : « 0,5× », « 0,75× », « 1× », « 1,5× » (virgule décimale) */
export const etiquetteVitesse = (v: number) => `${String(v).replace('.', ',')}×`;

/** points [x, y] d'un trait plat */
export function points(p: readonly number[]): Array<[number, number]> {
  const r: Array<[number, number]> = [];
  for (let i = 0; i + 1 < p.length; i += 2) r.push([p[i]!, p[i + 1]!]);
  return r;
}

/** longueur d'un trait, en unités 0–100 (repère de la table) ; `echelle` corrige l'écart des deux axes */
export function longueur(
  p: readonly number[],
  echelle: readonly [number, number] = [1, 1],
): number {
  const q = points(p);
  let L = 0;
  for (let i = 1; i < q.length; i++)
    L += Math.hypot((q[i]![0] - q[i - 1]![0]) * echelle[0], (q[i]![1] - q[i - 1]![1]) * echelle[1]);
  return L;
}

/** durée d'un trait à 1× (ms) */
export const dureeTrait = (p: readonly number[]) =>
  Math.max(DUREE_MIN_TRAIT, Math.round(longueur(p) * MS_PAR_UNITE));

/** durée réelle (ms) d'une durée à 1× pour une vitesse donnée */
export const dureeReelle = (ms1x: number, vitesse: number) => Math.round(ms1x / vitesse);

export interface Segment {
  debut: number;
  fin: number;
}
export interface LigneDuTemps {
  /** un segment par trait, DANS L'ORDRE du fichier (le corps de la lettre) */
  traits: Segment[];
  /** les points et signes : après le dernier trait */
  points: Segment;
  /** durée totale à 1× (ms) */
  total: number;
}

/**
 * Ligne du temps à 1× : les traits l'un après l'autre (ordre du fichier, jamais réordonné), une pause entre deux,
 * puis les points et signes. Une forme sans trait donne seulement l'apparition de la lettre.
 */
export function ligneDuTemps(traits: readonly (readonly number[])[]): LigneDuTemps {
  const segs: Segment[] = [];
  let t = 0;
  for (const [i, p] of traits.entries()) {
    if (i > 0) t += PAUSE_TRAIT;
    const d = dureeTrait(p);
    segs.push({ debut: t, fin: t + d });
    t += d;
  }
  const debut = traits.length ? t + PAUSE_TRAIT : 0;
  return {
    traits: segs,
    points: { debut, fin: debut + DUREE_POINTS },
    total: debut + DUREE_POINTS,
  };
}

/** durée totale (ms) de l'animation à une vitesse donnée */
export const dureeTotale = (l: LigneDuTemps, vitesse: number) => dureeReelle(l.total, vitesse);

export interface Etat {
  /** avancement de chaque trait, de 0 à 1 */
  progres: number[];
  /** trait en cours de tracé (-1 : aucun) */
  courant: number;
  /** apparition des points et signes, de 0 à 1 */
  points: number;
  fini: boolean;
}

const borne = (x: number) => Math.min(1, Math.max(0, x));

/** état de l'animation à l'instant `t` (ms à 1× écoulées) */
export function etatA(l: LigneDuTemps, t: number): Etat {
  const progres = l.traits.map((s) => borne((t - s.debut) / (s.fin - s.debut)));
  const courant = l.traits.findIndex((s) => t >= s.debut && t < s.fin);
  return {
    progres,
    courant,
    points: borne((t - l.points.debut) / (l.points.fin - l.points.debut)),
    fini: t >= l.total,
  };
}

/** point du trait (polyligne) à la fraction `q` de sa longueur, repère `echelle` appliqué */
export function pointA(
  pts: ReadonlyArray<readonly [number, number]>,
  q: number,
): [number, number] | null {
  if (!pts.length) return null;
  if (pts.length === 1) return [pts[0]![0], pts[0]![1]];
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  let reste = borne(q) * L;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    if (reste <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(1, reste / seg) : 0;
      return [
        pts[i - 1]![0] + k * (pts[i]![0] - pts[i - 1]![0]),
        pts[i - 1]![1] + k * (pts[i]![1] - pts[i - 1]![1]),
      ];
    }
    reste -= seg;
  }
  return null;
}

/** angle (degrés, repère de l'écran) de la direction de départ d'un trait : premier segment non nul */
export function angleDepart(pts: ReadonlyArray<readonly [number, number]>): number {
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[0]![0];
    const dy = pts[i]![1] - pts[0]![1];
    if (dx || dy) return (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  return 0;
}

/** formes (indices 0–3) dont le tracé existe dans le fichier pour une lettre */
export function formesDisponibles(j: TraitsJson, l: string): number[] {
  return (j[l] ?? []).flatMap((f, i) => (f ? [i] : []));
}

/** lettres du fichier (sans la ligne de commentaire), dans l'ordre donné puis les autres */
export function lettresDuFichier(j: TraitsJson, ordre: readonly string[]): string[] {
  const toutes = Object.keys(j).filter((k) => k !== '_' && Array.isArray(j[k]));
  return [...ordre.filter((l) => toutes.includes(l)), ...toutes.filter((l) => !ordre.includes(l))];
}
