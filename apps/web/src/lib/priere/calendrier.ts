/**
 * « La prière de A à Z » — calendrier des mots d'une parole : quand chaque mot est-il prononcé ?
 * Le son utile = [début, fin] moins les silences mesurés dans le fichier (`calage.json`, mesuré une fois par
 * scripts/priere-calage.mjs). Si le nombre de segments égale le nombre de membres de phrase (séparés par la virgule
 * arabe), on cale membre par membre ; sinon on répartit au prorata des lettres. Sans mesure (fichier nouveau), le
 * son utile est tout le fichier. Fonctions pures : le texte n'est jamais modifié.
 */

/** mesure d'un fichier : début et fin du son utile, silences [début, fin] (secondes) */
export interface Calage {
  a: number;
  b: number;
  s: Array<[number, number]>;
}
export type Plage = [number, number];

/** poids d'un mot : ses lettres, sans voyelles ni signes de ponctuation (au moins 1) */
export const poids = (w: string): number =>
  Math.max(1, w.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u060C.,:!?«»]/g, '').length);

/** mots d'un texte arabe : découpe exacte sur les espaces, aucun caractère modifié */
export const mots = (ar: string): string[] => ar.split(/\s+/).filter(Boolean);

/** durée estimée (s) d'un texte sans son : ~0,09 s par lettre, plus un souffle */
export const dureeEstimee = (ar: string): number =>
  0.4 + 0.09 * mots(ar).reduce((a, w) => a + poids(w), 0);

/** Plages [début, fin] de chaque mot, en secondes, entre `debut` et `fin`. */
export function calendrier(
  liste: readonly string[],
  cal: Calage,
  debut: number = cal.a,
  fin: number = cal.b,
): Plage[] {
  const segs: Plage[] = [];
  let d = debut;
  for (const [x, y] of cal.s)
    if (x > debut && y < fin) {
      segs.push([d, x]);
      d = y;
    }
  segs.push([d, fin]);
  // membres de phrase : coupés après la virgule arabe
  const groupes: number[][] = [[]];
  liste.forEach((w, i) => {
    groupes[groupes.length - 1]!.push(i);
    if (/\u060C$/.test(w) && i < liste.length - 1) groupes.push([]);
  });
  const res: Plage[] = new Array<Plage>(liste.length);
  const repartir = (idx: number[], s: Plage) => {
    const tot = idx.reduce((a, i) => a + poids(liste[i]!), 0);
    let t = s[0];
    for (const i of idx) {
      const dt = ((s[1] - s[0]) * poids(liste[i]!)) / tot;
      res[i] = [t, t + dt];
      t += dt;
    }
  };
  if (groupes.length === segs.length) groupes.forEach((g, k) => repartir(g, segs[k]!));
  else {
    const total = segs.reduce((a, s) => a + s[1] - s[0], 0);
    const wt = liste.reduce((a, w) => a + poids(w), 0);
    const aTemps = (x: number): number => {
      let r = x * total;
      for (const s of segs) {
        const l = s[1] - s[0];
        if (r <= l) return s[0] + r;
        r -= l;
      }
      return fin;
    };
    let acc = 0;
    liste.forEach((w, i) => {
      const a = acc / wt;
      acc += poids(w);
      res[i] = [aTemps(a), aTemps(acc / wt)];
    });
  }
  return res;
}

/** Mot entendu à l'instant t : indice, ou -1 (silence, avant ou après). */
export function motActif(plan: readonly Plage[], t: number): number {
  return plan.findIndex((p) => t >= p[0] && t < p[1]);
}

/** Calage par défaut d'un fichier non mesuré : tout le son, sans silence. */
export const calageParDefaut = (duree: number): Calage => ({
  a: Math.min(0.08, duree / 10),
  b: Math.max(duree - 0.12, duree * 0.9),
  s: [],
});

/**
 * Passages d'un texte : un par membre de phrase (virgule arabe) ; les bornes sont des indices de mots
 * [premier, dernier]. Sert à l'entraînement (attestation) : un passage = une respiration.
 */
export function passages(liste: readonly string[]): Array<[number, number]> {
  const r: Array<[number, number]> = [];
  let a = 0;
  liste.forEach((w, i) => {
    if (/\u060C$/.test(w) || i === liste.length - 1) {
      r.push([a, i]);
      a = i + 1;
    }
  });
  return r;
}
