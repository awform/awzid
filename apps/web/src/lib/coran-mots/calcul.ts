/**
 * « Mots du Coran » — calcul de « Je reconnais X % des mots » SUR L'APPAREIL (fonctions pures, testées contre la couverture
 * calculée à part par l'étude, sourate par sourate et niveau par niveau).
 *
 * Entrées : les mots d'une sourate (`/api/v1/coran-mots/sourates/:n`) et ce que l'élève a réellement appris
 * (`/profiles/:id/coran-mots/connus` : son niveau, ses leçons faites, ses mots validés). Un mot de Tanzil est reconnu si
 * TOUS ses lemmes sont connus ; les préfixes et suffixes (wa, fa, bi, li, ka, sa, al-, pronoms) sont supposés acquis.
 * Le calcul mesure la RECONNAISSANCE du mot, pas la compréhension du verset (voir ETUDE.md § 5).
 *
 * Le texte du Coran n'est jamais touché : on ne fait que dire quels mots du texte sont connus.
 */

/** Un mot : `rang × 2 + (1 si nom, verbe ou adjectif)`, une liste pour un mot à plusieurs lemmes, -1 hors décompte. */
export type Entree = number | number[];
/** Pour chaque rang de la liste des 1 000 : [lemme en arabe, leçon qui l'enseigne en premier (« ad3.l12 »)]. */
export type Rangs = Array<[string, string | null] | null>;

export interface Connaissance {
  /** niveau (1…10) de l'élève dans la filière Adultes */
  niveau: number;
  /** leçons faites du niveau courant (« ad2.l01 ») */
  unites: readonly string[];
  /** rangs validés par le petit jeu du niveau */
  valides: readonly number[];
}

export interface Mesure {
  /** mots comptés (hors lettres isolées) */
  mots: number;
  compris: number;
  /** noms, noms propres, adjectifs et verbes seulement */
  pleins: number;
  pleinsCompris: number;
}

/** Signes de pause et ornements isolés (ۖ…ۜ, ۞, ۩) : ne sont pas des mots (comme dans les données). */
const PAUSE = /^[\u{6D6}-\u{6DC}\u{6DE}\u{6E9}]+$/u;

/** Niveau (1…10) d'une leçon « ad3.l12 ». */
export const niveauDe = (unite: string): number => Number(/^ad(\d+)\./.exec(unite)?.[1] ?? 0);
/** Numéro de la leçon dans « ad3.l12 » (12). */
export const numeroDe = (unite: string): number => Number(/\.l(\d+)$/.exec(unite)?.[1] ?? 0);

/**
 * Rangs connus de l'élève : un mot validé, ou enseigné par une leçon FAITE, ou enseigné dans un niveau déjà dépassé.
 * Un rang qu'aucune leçon n'enseigne n'est jamais connu (sauf s'il a été validé).
 */
export function rangsConnus(rangs: Rangs, c: Connaissance): Set<number> {
  const faites = new Set(c.unites);
  const valides = new Set(c.valides);
  const connus = new Set<number>();
  rangs.forEach((e, r) => {
    const u = e?.[1];
    if (e && (valides.has(r) || (u && (faites.has(u) || niveauDe(u) < c.niveau)))) connus.add(r);
  });
  return connus;
}

const rangsDe = (e: Entree): number[] => (Array.isArray(e) ? e : [e]).map((n) => n >> 1);
const estPlein = (e: Entree): boolean => ((Array.isArray(e) ? e[0]! : e) & 1) === 1;

/** Le mot est reconnu : tous ses lemmes sont connus (un lemme absent de la liste, rang 0, ne l'est jamais). */
export const estReconnu = (e: Entree, connus: ReadonlySet<number>): boolean =>
  e !== -1 && rangsDe(e).every((r) => r > 0 && connus.has(r));

/** Mesure d'une liste de versets (ou d'une sourate entière) pour un ensemble de rangs connus. */
export function mesurer(
  versets: ReadonlyArray<readonly Entree[]>,
  connus: ReadonlySet<number>,
): Mesure {
  const m: Mesure = { mots: 0, compris: 0, pleins: 0, pleinsCompris: 0 };
  for (const v of versets)
    for (const e of v) {
      if (e === -1) continue;
      const ok = estReconnu(e, connus);
      m.mots++;
      if (ok) m.compris++;
      if (estPlein(e)) {
        m.pleins++;
        if (ok) m.pleinsCompris++;
      }
    }
  return m;
}

/** Pourcentage (0 à 100, non arrondi) ; 0 si la sourate n'a aucun mot compté. */
export const pourcent = (compris: number, total: number): number =>
  total > 0 ? (100 * compris) / total : 0;

export interface Etape {
  /** rangs à apprendre, du plus utile au moins utile */
  rangs: number[];
  /** mesure de la sourate une fois ces mots connus */
  apres: Mesure;
}

/**
 * « Prochaine étape » : les (au plus `max`) mots enseignés par les livres qui feraient gagner le plus de mots à cette
 * sourate, choisis un à un (chaque choix compte les mots que les précédents ont déjà rendus presque connus). Seuls les mots
 * qu'une leçon enseigne sont proposés ; on s'arrête quand plus aucun mot n'apporte rien.
 */
export function prochaineEtape(
  versets: ReadonlyArray<readonly Entree[]>,
  connus: ReadonlySet<number>,
  rangs: Rangs,
  max = 5,
): Etape {
  // mots de la sourate qui ne sont pas encore reconnus, avec leurs rangs inconnus
  const manquants: number[][] = [];
  const parRang = new Map<number, number[]>();
  for (const v of versets)
    for (const e of v) {
      if (e === -1 || estReconnu(e, connus)) continue;
      const inconnus = [...new Set(rangsDe(e).filter((r) => !connus.has(r)))];
      if (inconnus.some((r) => r === 0 || !rangs[r]?.[1])) continue; // un lemme qu'aucune leçon n'enseigne : hors d'atteinte
      const id = manquants.push(inconnus) - 1;
      for (const r of inconnus) parRang.set(r, [...(parRang.get(r) ?? []), id]);
    }
  const acquis = new Set(connus);
  const choisis: number[] = [];
  const faits = new Set<number>();
  while (choisis.length < max) {
    // meilleur choix : le plus de mots gagnés, puis le plus fréquent dans la sourate, puis le rang le plus bas
    let meilleur = 0;
    let gain = 0;
    let occ = 0;
    for (const [r, ids] of parRang) {
      if (acquis.has(r)) continue;
      const g = ids.reduce(
        (n, id) =>
          n + (!faits.has(id) && manquants[id]!.every((x) => x === r || acquis.has(x)) ? 1 : 0),
        0,
      );
      if (g === 0) continue;
      if (g > gain || (g === gain && (ids.length > occ || (ids.length === occ && r < meilleur)))) {
        meilleur = r;
        gain = g;
        occ = ids.length;
      }
    }
    if (!meilleur) break;
    acquis.add(meilleur);
    choisis.push(meilleur);
    for (const id of parRang.get(meilleur)!)
      if (manquants[id]!.every((x) => acquis.has(x))) faits.add(id);
  }
  return { rangs: choisis, apres: mesurer(versets, acquis) };
}

/**
 * Pour chaque jeton de `ws` (le texte d'un verset découpé aux espaces, tel que l'affiche le lecteur, basmala d'en-tête déjà
 * retirée), vrai si c'est un mot reconnu. Les signes de pause isolés ne sont pas des mots : ils ne prennent pas de rang.
 * Si le nombre de mots ne correspond pas aux données, RIEN n'est souligné (jamais un soulignement décalé).
 */
export function drapeaux(
  ws: readonly string[],
  entrees: readonly Entree[] | undefined,
  connus: ReadonlySet<number>,
): boolean[] | undefined {
  if (!entrees) return undefined;
  const mots = ws.filter((w) => !PAUSE.test(w)).length;
  if (mots !== entrees.length) return undefined;
  let k = 0;
  return ws.map((w) => !PAUSE.test(w) && estReconnu(entrees[k++]!, connus));
}
