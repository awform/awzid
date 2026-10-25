/**
 * Mutashābihāt dans le hifẓ (25/10/2026) — accès PUR aux paires de versets jumeaux (données du référent, voir
 * scripts/mutashabihat-donnees.mjs). Seules les paires au statut « reconnu par la source » existent ici (le script ne
 * laisse sortir aucune autre) ; aucune donnée n'est écrite par l'équipe ; aucun texte coranique : des références de versets
 * et des RANGS de mots (index de `texte.split(' ')`, basmala préfixée comprise).
 */
import donnees from './donnees.json';

export type Rang = number | null;
type Segment = readonly [number, number] | null;
/** [a, b, segment a, segment b, [[rang a, rang b]…], repère « proposé par Awzid », [[ouvrage, sourate, masʾala, page]…], groupe] */
type Paire = readonly [
  string,
  string,
  Segment,
  Segment,
  ReadonlyArray<readonly [Rang, Rang]>,
  string,
  ReadonlyArray<readonly [number, number, number, string]>,
  string,
];
interface Donnees {
  v: number;
  version: string;
  statut: string;
  ouvrages: readonly string[];
  paires: readonly Paire[];
}
const D = donnees as unknown as Donnees;

export interface RefVerset {
  s: number;
  a: number;
}
export interface Source {
  ouvrage: string;
  sourate: number;
  masala: number;
  page: string;
}
/** Un verset jumeau, vu du verset de départ (« moi ») : rangs des mots qui changent, dans chacun des deux versets. */
export interface Jumeau {
  /** identifiant stable de la paire (« 2:35|7:19 ») */
  id: string;
  groupe: string;
  moi: RefVerset;
  autre: RefVerset;
  /** rangs des mots qui changent : [dans mon verset, dans le jumeau] (null : le mot n'existe pas de ce côté) */
  diffs: ReadonlyArray<readonly [Rang, Rang]>;
  /** passage commun [premier, dernier rang] dans mon verset et dans le jumeau (formule commune : pas de différence chiffrée) */
  commun: readonly [Segment, Segment];
  /** repère PROPOSÉ PAR AWZID (aide-mémoire factuel, sans explication) */
  repere: string;
  sources: readonly Source[];
}

export const VERSION_DONNEES = D.version;
export const NB_PAIRES = D.paires.length;
/** statut des paires gardées : « reconnu par la source » (jamais un autre) */
export const STATUT = D.statut;

const parse = (ref: string): RefVerset => {
  const [s, a] = ref.split(':').map(Number);
  return { s: s!, a: a! };
};
export const cle = (r: RefVerset) => `${r.s}:${r.a}`;

let index: Map<string, Jumeau[]> | null = null;
function construire(): Map<string, Jumeau[]> {
  const m = new Map<string, Jumeau[]>();
  const poser = (j: Jumeau) => {
    const k = cle(j.moi);
    const l = m.get(k);
    if (l) l.push(j);
    else m.set(k, [j]);
  };
  for (const [a, b, sa, sb, diffs, repere, src, groupe] of D.paires) {
    const sources = src.map(([o, s, ma, page]) => ({
      ouvrage: D.ouvrages[o] ?? '',
      sourate: s,
      masala: ma,
      page,
    }));
    const id = `${a}|${b}`;
    poser({ id, groupe, moi: parse(a), autre: parse(b), diffs, commun: [sa, sb], repere, sources });
    poser({
      id,
      groupe,
      moi: parse(b),
      autre: parse(a),
      diffs: diffs.map(([x, y]) => [y, x] as const),
      commun: [sb, sa],
      repere,
      sources,
    });
  }
  // du plus net (peu de mots qui changent) au plus large, puis par ordre du Muṣḥaf : l'ordre est stable
  for (const l of m.values())
    l.sort(
      (x, y) =>
        (x.diffs.length || 99) - (y.diffs.length || 99) ||
        x.autre.s - y.autre.s ||
        x.autre.a - y.autre.a,
    );
  return m;
}

/** Versets jumeaux d'un verset (dans les deux sens de chaque paire), du plus net au plus large. */
export function jumeauxDe(s: number, a: number): readonly Jumeau[] {
  index ??= construire();
  return index.get(`${s}:${a}`) ?? [];
}

/** Tous les versets qui ont au moins un jumeau. */
export function versetsAvecJumeaux(): RefVerset[] {
  index ??= construire();
  return [...index.keys()].map(parse);
}

/** Toutes les paires, vues du verset « a » (pour les tests et le test au hasard). */
export function toutesLesPaires(): Jumeau[] {
  index ??= construire();
  const vus = new Set<string>();
  const out: Jumeau[] = [];
  for (const l of index.values())
    for (const j of l)
      if (!vus.has(j.id)) {
        vus.add(j.id);
        out.push(j);
      }
  return out;
}

/** Rangs à surligner dans « mon » verset (0) ou dans le jumeau (1). */
export function rangsSurlignes(j: Jumeau, cote: 0 | 1): number[] {
  return j.diffs.map((d) => d[cote]).filter((x): x is number => x !== null);
}
