/**
 * Hifẓ complet (12/10/2026) — logique PURE des outils du hifẓ (testée dans outils.test.ts) : passages mémorisés,
 * test qui démarre au hasard « comme un cheikh qui interroge », carte des erreurs et points faibles, fraîcheur de
 * chaque passage, deux passages pour la prière. Le texte coranique n'est JAMAIS modifié ici : seulement des
 * références (sourate, verset, rang du mot dans `texte.split(' ')`, comme l'IA d'écoute A5).
 */
import type { Quality } from '@awform/hifz';

export interface Plage {
  s: number;
  from: number;
  to: number;
}
export interface Ref {
  s: number;
  a: number;
}
/** Passage appris (part du carnet ou du parcours) et ses plages de versets. */
export interface Passage {
  key: string;
  ref: Plage[];
}

/** Parts apprises (texte déjà mémorisé), dans l'ordre du carnet. */
export function passagesMemorises(
  states: Iterable<{ key: string; learnedDay: number | null }>,
  refs: ReadonlyMap<string, { ref: Plage[] }>,
): Passage[] {
  const out: Passage[] = [];
  for (const p of states)
    if (p.learnedDay !== null) {
      const ref = refs.get(p.key)?.ref ?? [];
      if (ref.length) out.push({ key: p.key, ref });
    }
  return out;
}

/** Tous les versets de plages (sans doublon). */
export function versetsDe(plages: readonly Plage[]): Ref[] {
  const vus = new Set<string>();
  const out: Ref[] = [];
  for (const r of plages)
    for (let a = r.from; a <= r.to; a++)
      if (!vus.has(`${r.s}:${a}`)) {
        vus.add(`${r.s}:${a}`);
        out.push({ s: r.s, a });
      }
  return out;
}

// ---------------------------------------------------------------- test au hasard

/** Nombre de versets à réciter après le verset tiré (« la suite »), dans la même plage mémorisée. */
export const SUITE = 2;

export interface Tirage extends Ref {
  /** dernier verset à réciter (même sourate, dans la plage mémorisée) */
  to: number;
}

/**
 * Tire un verset au hasard dans les plages mémorisées ; évite les versets déjà tirés (`deja`) tant qu'il en
 * reste d'autres. `rand` : 0 ≤ x < 1 (Math.random par défaut, fixé dans les tests).
 */
export function tirer(
  plages: readonly Plage[],
  rand: () => number = Math.random,
  deja: ReadonlySet<string> = new Set(),
): Tirage | null {
  const tous = versetsDe(plages);
  if (!tous.length) return null;
  const libres = tous.filter((v) => !deja.has(`${v.s}:${v.a}`));
  const pool = libres.length ? libres : tous;
  const v = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
  const plage = plages.find((r) => r.s === v.s && r.from <= v.a && v.a <= r.to)!;
  return { ...v, to: Math.min(plage.to, v.a + SUITE) };
}

/** Verset imposé (« ?verset=112:2 ») s'il fait partie des plages mémorisées. */
export function tirageImpose(plages: readonly Plage[], code: string | null): Tirage | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(code ?? '');
  if (!m) return null;
  const s = Number(m[1]);
  const a = Number(m[2]);
  const plage = plages.find((r) => r.s === s && r.from <= a && a <= r.to);
  return plage ? { s, a, to: Math.min(plage.to, a + SUITE) } : null;
}

/**
 * Amorce montrée à l'élève : les premiers mots du verset (le premier tiers, 1 à 5 mots), jamais le verset entier
 * sauf s'il n'a qu'un mot (l'élève récite alors la suite à partir du verset suivant).
 */
export function amorce(nMots: number): number {
  if (nMots <= 1) return Math.max(0, nMots);
  return Math.max(1, Math.min(5, Math.ceil(nMots / 3), nMots - 1));
}

/** Auto-évaluation (sans IA, hors ligne ou refusée) : juste, hésitant, oublié. */
export type AutoEval = 'juste' | 'hesitant' | 'oublie';
export const AUTO_EVALS: readonly AutoEval[] = ['juste', 'hesitant', 'oublie'];
export const QUALITE: Record<AutoEval, Quality> = { juste: 3, hesitant: 2, oublie: 0 };

// ---------------------------------------------------------------- carte des erreurs

export type TypeMarque = 'erreur' | 'hesitation' | 'oubli' | 'juste';
/** Marque (serveur, file de l'appareil ou bilan de l'IA d'écoute) — k : rang du mot, -1 : le verset entier. */
export interface Marque {
  id?: string;
  day: string;
  s: number;
  a: number;
  k: number;
  t: TypeMarque;
  src?: string;
}

/** Bilans de l'IA d'écoute (A5, gardés sur l'appareil) → marques « erreur » sur les mots (le doute n'est rien). */
export function marquesDesBilans(
  bilans: ReadonlyArray<{ date: string; mots: ReadonlyArray<[number, number, number, string]> }>,
): Marque[] {
  const out: Marque[] = [];
  // les bilans sont gardés du plus récent au plus ancien : on les remet dans l'ordre du temps
  for (const b of [...bilans].reverse())
    for (const [s, a, k, type] of b.mots)
      if (type !== 'doute' && type !== 'non_recite')
        out.push({ day: b.date.slice(0, 10), s, a, k, t: 'erreur', src: 'ecoute' });
  return out;
}

export interface PointFaible extends Ref {
  erreurs: number;
  hesitations: number;
  oublis: number;
  /** marque la plus forte de chaque mot (rang → type) */
  mots: Map<number, 'erreur' | 'hesitation'>;
  /** jour de la dernière marque */
  dernier: string;
}

/**
 * Carte des erreurs : par verset, les marques ENCORE ACTIVES — celles posées après la dernière récitation
 * « juste » du verset (qui résout les précédentes). Ordre des marques : ordre du journal (jour, puis arrivée).
 */
export function carteErreurs(marques: readonly Marque[]): Map<string, PointFaible> {
  const carte = new Map<string, PointFaible>();
  const tri = marques
    .map((m, i) => ({ m, i }))
    .sort((x, y) => (x.m.day < y.m.day ? -1 : x.m.day > y.m.day ? 1 : x.i - y.i))
    .map((x) => x.m);
  for (const m of tri) {
    const cle = `${m.s}:${m.a}`;
    if (m.t === 'juste') {
      carte.delete(cle);
      continue;
    }
    let p = carte.get(cle);
    if (!p) {
      p = {
        s: m.s,
        a: m.a,
        erreurs: 0,
        hesitations: 0,
        oublis: 0,
        mots: new Map(),
        dernier: m.day,
      };
      carte.set(cle, p);
    }
    p.dernier = m.day;
    if (m.t === 'erreur') p.erreurs++;
    else if (m.t === 'hesitation') p.hesitations++;
    else p.oublis++;
    if (m.k >= 0 && m.t !== 'oubli') {
      const avant = p.mots.get(m.k);
      if (avant !== 'erreur') p.mots.set(m.k, m.t === 'erreur' ? 'erreur' : 'hesitation');
    }
  }
  return carte;
}

/** Poids d'un point faible : oubli et erreur comptent double, l'hésitation simple. */
export const poids = (p: PointFaible) => 2 * (p.erreurs + p.oublis) + p.hesitations;

/** « Mes points faibles » : du plus lourd au plus léger, puis du plus récent au plus ancien. */
export function pointsFaibles(carte: ReadonlyMap<string, PointFaible>): PointFaible[] {
  return [...carte.values()].sort(
    (x, y) =>
      poids(y) - poids(x) ||
      (x.dernier < y.dernier ? 1 : x.dernier > y.dernier ? -1 : 0) ||
      x.s - y.s ||
      x.a - y.a,
  );
}

// ---------------------------------------------------------------- fraîcheur

export type Niveau = 'frais' | 'a_revoir' | 'urgent';
/**
 * Seuils (jours depuis la dernière révision réussie) [À VALIDER par le référent pédagogique] : « à revoir » dès
 * 7 jours, « urgent » dès 30 jours (écart maximal de la roue de révision du moteur), ou dernière révision ratée.
 */
export const SEUILS = { aRevoir: 7, urgent: 30 } as const;
export const RANG: Record<Niveau, number> = { urgent: 0, a_revoir: 1, frais: 2 };

export interface EvenementHifz {
  day: string;
  part: string;
  kind: 'appris' | 'revision';
  q: number | null;
}
export interface Fraicheur extends Passage {
  /** jour de la dernière révision réussie (ou de l'apprentissage) ; null : inconnu */
  dernier: string | null;
  jours: number | null;
  /** résultat de la dernière révision (0 à 3) */
  dernierQ: number | null;
  niveau: Niveau;
}

const jour = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Fraîcheur de chaque passage appris d'après le journal (apprentissage, révisions réussies : q ≥ 2). */
export function fraicheur(
  passages: readonly Passage[],
  events: readonly EvenementHifz[],
  today: string,
): Fraicheur[] {
  const ok = new Map<string, string>();
  const lastQ = new Map<string, { day: string; q: number }>();
  for (const e of events) {
    if (e.kind === 'appris' || (e.kind === 'revision' && (e.q ?? 0) >= 2))
      if (!ok.has(e.part) || ok.get(e.part)! <= e.day) ok.set(e.part, e.day);
    if (
      e.kind === 'revision' &&
      e.q !== null &&
      (!lastQ.has(e.part) || lastQ.get(e.part)!.day <= e.day)
    )
      lastQ.set(e.part, { day: e.day, q: e.q });
  }
  return passages.map((p) => {
    const dernier = ok.get(p.key) ?? null;
    const jours = dernier ? Math.max(0, jour(today) - jour(dernier)) : null;
    const dernierQ = lastQ.get(p.key)?.q ?? null;
    const niveau: Niveau =
      (dernierQ !== null && dernierQ <= 1) || jours === null || jours >= SEUILS.urgent
        ? 'urgent'
        : jours >= SEUILS.aRevoir
          ? 'a_revoir'
          : 'frais';
    return { ...p, dernier, jours, dernierQ, niveau };
  });
}

export interface FraicheurSourate {
  s: number;
  niveau: Niveau;
  /** dernière révision réussie la PLUS ANCIENNE des passages de la sourate */
  dernier: string | null;
  jours: number | null;
  passages: Fraicheur[];
}

/** Regroupement par sourate : le niveau le plus urgent et la date la plus ancienne de ses passages. */
export function parSourate(etats: readonly Fraicheur[]): FraicheurSourate[] {
  const m = new Map<number, FraicheurSourate>();
  for (const e of etats)
    for (const s of new Set(e.ref.map((r) => r.s))) {
      const g = m.get(s) ?? {
        s,
        niveau: 'frais',
        dernier: e.dernier,
        jours: e.jours,
        passages: [],
      };
      if (!g.passages.includes(e)) g.passages.push(e);
      if (RANG[e.niveau] < RANG[g.niveau]) g.niveau = e.niveau;
      if ((e.jours ?? Infinity) > (g.jours ?? -1)) {
        g.jours = e.jours;
        g.dernier = e.dernier;
      }
      m.set(s, g);
    }
  return [...m.values()].sort((x, y) => RANG[x.niveau] - RANG[y.niveau] || x.s - y.s);
}

/**
 * Séance du jour (méthode des daaras : nouveau, puis récent, puis ancien) : DANS chaque piste, ce qui est urgent
 * vient d'abord (tri stable : à niveau égal, l'ordre du moteur est gardé).
 */
export function urgentsDabord<T extends { key: string }>(
  items: readonly T[],
  niveaux: ReadonlyMap<string, Niveau>,
): T[] {
  return items
    .map((it, i) => ({ it, i, r: RANG[niveaux.get(it.key) ?? 'frais'] }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.it);
}

// ---------------------------------------------------------------- deux rakʿa

/** Le passage choisi pour une rakʿa doit être un passage déjà mémorisé (ou une partie d'un passage mémorisé). */
export function dansMemorise(p: Plage, plages: readonly Plage[]): boolean {
  return (
    p.from >= 1 &&
    p.from <= p.to &&
    plages.some((r) => r.s === p.s && r.from <= p.from && p.to <= r.to)
  );
}
