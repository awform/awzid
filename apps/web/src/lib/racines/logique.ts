/**
 * « Famille de mots » — calculs purs (testés) : niveaux, coloration de la racine, extrait du verset, questions du mini-exercice,
 * pastille « X % des mots connus ». Aucun accès au réseau ni à l'écran.
 */

/** Une famille de l'index (liste) : racine, niveau 1…12, enfant ou non, mot d'accroche, [n, fréquence] des mots affichés. */
export interface EntreeIndex {
  i: number;
  r: string;
  s: string;
  n: number;
  e: 0 | 1;
  a: { f: string; s: string };
  w: Array<[number, number]>;
}
export interface Index {
  p: 'adulte' | 'enfant';
  total: number;
  f: EntreeIndex[];
}
export interface Mot {
  n: number;
  f: string;
  e: string;
  v?: string;
  m: string;
  ml: Array<[number, number]>;
  me: string;
  s: string;
  fr: number;
  na: number;
  rl: Array<[number, number, string]>;
  ln: string[];
  x: { t: string; r: string; i: number; l: number; x?: 1 };
  h?: number[];
  d?: Array<'DISC' | 'LOIN'>;
}
export interface Famille {
  i: number;
  r: string;
  w?: 1;
  s: string;
  n: number;
  a: number;
  o: number[];
  k?: number[];
  u?: number;
  l?: string[];
  mots: Mot[];
}
export interface Segment {
  t: string;
  r: boolean;
}

/** Découpe `forme` en morceaux, ceux des plages [index, fin[ (indices UTF-16, voyelles comprises) étant « en or ». */
export function segments(
  forme: string,
  plages: ReadonlyArray<readonly [number, number, ...unknown[]]>,
): Segment[] {
  const on = new Array<boolean>(forme.length).fill(false);
  for (const [a, b] of plages)
    for (let k = Math.max(0, a); k < Math.min(forme.length, b); k++) on[k] = true;
  const out: Segment[] = [];
  for (let k = 0; k < forme.length; k++) {
    const last = out[out.length - 1];
    if (last && last.r === on[k]) last.t += forme[k]!;
    else out.push({ t: forme[k]!, r: on[k]! });
  }
  return out;
}
/** Racine : seules les lettres « visibles » ou « transformées » ou « doublées » sont en or ; `absente` : rien. */
export const plagesRacine = (m: Mot) => m.rl.filter(([, , st]) => st !== 'absente');

/** Le verset coupé autour du mot étudié : texte Tanzil tel quel (`texte.slice(i, i + l)` vérifié par script). */
export function decoupeVerset(x: Mot['x']): { avant: string; mot: string; apres: string } {
  return { avant: x.t.slice(0, x.i), mot: x.t.slice(x.i, x.i + x.l), apres: x.t.slice(x.i + x.l) };
}
/** « 78:4 » → [78, 4] */
export const refVerset = (r: string): [number, number] => {
  const [s, a] = r.split(':').map(Number);
  return [s ?? 0, a ?? 0];
};

/** Niveau de l'élève (1…12) : `null` si inconnu (aucun niveau choisi). */
export const visible = (f: { n: number }, niveau: number | null, enfant: boolean): boolean =>
  enfant || niveau === null || f.n <= niveau;

/** Mot au-dessus du niveau : signalé, jamais caché. Sans niveau connu : au-dessus du niveau de la famille. */
export const auDessus = (m: Mot, niveau: number | null, fam: { n: number }): boolean =>
  m.na > (niveau ?? fam.n);

/** Racine « ع ل م » → lettres séparées pour la lecture d'écran. */
export const lettresRacine = (r: string): string[] => r.split(' ');

/** Pastille : % avant, gain en points, % après. `connus` : rangs que l'élève connaît déjà. */
export function pastille(idx: Index, fam: EntreeIndex, connus: ReadonlySet<number>) {
  const freq = new Map<number, number>();
  for (const f of idx.f) for (const [n, fr] of f.w) freq.set(n, fr);
  let deja = 0;
  for (const [n, fr] of freq) if (connus.has(n)) deja += fr;
  const gagne = fam.w.reduce((s, [n, fr]) => s + (connus.has(n) ? 0 : fr), 0);
  const avant = (100 * deja) / idx.total;
  const gain = (100 * gagne) / idx.total;
  return { avant, gain, apres: avant + gain };
}

export interface Question {
  genre: 'racine' | 'sens';
  /** mot posé (question « sens ») */
  mot?: Mot;
  choix: string[];
  /** indice de la bonne réponse */
  bon: number;
}

/**
 * Mini-exercice (2 questions, jamais d'échec) : « Retrouve la racine » (3 racines) et « Que veut dire ce mot ? » (3 sens).
 * Les mauvais choix viennent des autres familles de l'index, de façon DÉTERMINISTE (même famille, mêmes questions).
 */
export function questions(fam: Famille, idx: Index, mots: Mot[]): Question[] {
  const autres = idx.f.filter((f) => f.i !== fam.i && f.r !== fam.r);
  const pris = (k: number, champ: 'r' | 's', exclu: string[]) => {
    const sortie: string[] = [];
    for (let j = 0; sortie.length < 2 && j < autres.length; j++) {
      const v = autres[(fam.i * 7 + k * 13 + j * 5) % autres.length]![champ];
      if (v !== exclu[0] && !sortie.includes(v) && !exclu.includes(v)) sortie.push(v);
    }
    return sortie;
  };
  const place = (bon: string, faux: string[], k: number) => {
    const choix = [...faux];
    const pos = (fam.i + k) % 3;
    choix.splice(Math.min(pos, choix.length), 0, bon);
    return { choix, bon: choix.indexOf(bon) };
  };
  const mot = mots[Math.min(1, mots.length - 1)] ?? mots[0]!;
  const autresSens = [...new Set(autres.map((f) => f.a.s))].filter((x) => x !== mot.s);
  const fauxSens: string[] = [];
  for (let j = 0; fauxSens.length < 2 && j < autresSens.length; j++) {
    const v = autresSens[(fam.i * 11 + j * 17) % autresSens.length]!;
    if (!fauxSens.includes(v)) fauxSens.push(v);
  }
  return [
    { genre: 'racine', mot, ...place(fam.r, pris(1, 'r', [fam.r]), 1) },
    { genre: 'sens', mot, ...place(mot.s, fauxSens, 2) },
  ];
}
