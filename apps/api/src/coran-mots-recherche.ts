/**
 * « Mots du Coran » — recherche par MOT arabe et par RACINE, sur les données `@awform/coran-mots-data` (Quranic Arabic
 * Corpus 0.4, GPL v3, séparées du code). Fonctions pures (aucune base, aucun réseau), testées sans serveur.
 *
 * RÈGLE : le texte du Coran n'est jamais modifié. Les « clés » ci-dessous ne servent QU'À COMPARER la recherche de
 * l'élève à l'index ; ce qui s'affiche vient toujours de Tanzil (`texte`, jeton par jeton), jamais d'une clé.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Les lettres sont écrites par leur point de code (\u{…}) : aucun caractère arabe invisible ou combinant dans le source.

/** signes de pause et ornements isolés (U+06D6 à U+06DC, U+06DE, U+06E9) : ne sont pas des mots */
export const PAUSE = /^[\u{6D6}-\u{6DC}\u{6DE}\u{6E9}]+$/u;

/**
 * voyelles et signes (U+0610 à U+061A, U+064B à U+065F), signes coraniques (U+06D6 à U+06ED), tatwīl (U+0640), BOM
 * (U+FEFF), marques invisibles (U+200B à U+200F) et signes étendus (U+08D3 à U+08FF) : ignorés pour comparer
 */
const MARQUES = /[\u{610}-\u{61A}\u{64B}-\u{65F}\u{6D6}-\u{6ED}\u{8D3}-\u{8FF}]/gu;
const INVISIBLES = /\u{640}|\u{FEFF}|\u{200B}|\u{200C}|\u{200D}|\u{200E}|\u{200F}/gu;

/**
 * Clé de comparaison STRICTE : sans voyelles ni signes, alif de prolongation (U+0670) écrit en alif, hamzas ramenées à
 * hamza seule (U+0621), variantes de clavier (kāf et yā persans, alif maqṣūra, tā marbūṭa, alif waṣla) unifiées.
 * Ainsi « كِتَٰب », « كتاب » et « ٱلْكِتَٰبِ » donnent كتاب, كتاب et الكتاب.
 */
export function cleStricte(s: string): string {
  return s
    .replace(MARQUES, '')
    .replace(INVISIBLES, '')
    .replace(/\u{670}/gu, '\u{627}')
    .replace(/\u{622}/gu, '\u{621}\u{627}')
    .replace(/[\u{623}\u{625}\u{624}\u{626}]/gu, '\u{621}')
    .replace(/\u{671}/gu, '\u{627}')
    .replace(/[\u{649}\u{6CC}]/gu, '\u{64A}')
    .replace(/\u{629}/gu, '\u{647}')
    .replace(/\u{6A9}/gu, '\u{643}')
    .replace(/[^\u{621}-\u{64A}]/gu, '');
}

/** Clé LARGE (recours quand rien ne correspond à la clé stricte) : sans alif ni hamza (orthographe moderne ≠ Muṣḥaf). */
const SANS_ALIF = /[\u{621}\u{627}]/gu;
export const cleLache = (s: string): string => cleStricte(s).replace(SANS_ALIF, '');

/** Clé d'une racine tapée (« ك ت ب », « كتب », « أمن ») : les racines à hamza sont écrites avec alif dans les données. */
export const cleRacine = (s: string): string => cleStricte(s).replace(/\u{621}/gu, '\u{627}');

/** l'article « ال » au début d'une clé (suivi d'au moins deux lettres) */
const ARTICLE = /^\u{627}\u{644}(?=.{2})/u;

export interface Mot {
  s: number;
  a: number;
  /** rang du jeton dans le verset (1…), en comptant les signes de pause SEULEMENT pour le retrouver dans le texte */
  ordre: number;
  forme: string;
  racine: string;
  lemme: string;
  ks: string;
}
export interface Lemme {
  bw: string;
  ar: string;
  racine: string;
  nature: string;
  rang: number;
  /** nombre de mots du Coran dont le radical principal porte ce lemme */
  n: number;
  ks: string;
}
export interface Famille {
  racine: string;
  frequence: number;
  lemmes: Lemme[];
}
export interface Resultat {
  /** mots trouvés, dans l'ordre du Coran */
  mots: Mot[];
  /** vrai si la clé large a été utilisée (aucune correspondance stricte) */
  approx: boolean;
}

const tsv = (t: string): string[][] =>
  t
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));

function ajouter<T>(map: Map<string, T[]>, cle: string, v: T): void {
  const l = map.get(cle);
  if (l) l.push(v);
  else map.set(cle, [v]);
}

export class IndexMots {
  readonly mots: Mot[] = [];
  readonly lemmes = new Map<string, Lemme>();
  private parCle = new Map<string, number[]>();
  private parCleLache = new Map<string, number[]>();
  private parLemme = new Map<string, number[]>();
  private lemmesParCle = new Map<string, Lemme[]>();
  private lemmesParCleLache = new Map<string, Lemme[]>();
  private parRacine = new Map<string, Lemme[]>();
  private motsParRacine = new Map<string, number[]>();
  private racinesParCle = new Map<string, string>();

  constructor(motsTsv: string, lemmesTsv: string) {
    for (const [bw, ar, racine, nature, rang] of tsv(lemmesTsv)) {
      const l: Lemme = {
        bw: bw!,
        ar: ar!,
        racine: racine!,
        nature: nature!,
        rang: Number(rang),
        n: 0,
        ks: cleStricte(ar!),
      };
      this.lemmes.set(l.bw, l);
    }
    const ordre = new Map<string, number>();
    // les formes se répètent (≈ 30 000 distinctes pour 77 000 mots) : la clé de chacune n'est calculée qu'une fois
    const cles = new Map<string, string>();
    const cle = (f: string) => {
      let k = cles.get(f);
      if (k === undefined) cles.set(f, (k = cleStricte(f)));
      return k;
    };
    for (const [ref, forme, racine, lemme] of tsv(motsTsv)) {
      const p = ref!.split(':');
      const s = Number(p[0]);
      const a = Number(p[1]);
      const k = `${s}:${a}`;
      const o = (ordre.get(k) ?? 0) + 1;
      ordre.set(k, o);
      // le second jeton d'un mot que Tanzil écrit en deux (37:130:3b) n'est pas un mot à chercher
      if (/b$/.test(p[2]!)) continue;
      const i = this.mots.length;
      const m: Mot = {
        s,
        a,
        ordre: o,
        forme: forme!,
        racine: racine!,
        lemme: lemme!,
        ks: cle(forme!),
      };
      this.mots.push(m);
      ajouter(this.parCle, m.ks, i);
      ajouter(this.parCleLache, m.ks.replace(SANS_ALIF, ''), i);
      ajouter(this.parLemme, m.lemme, i);
      if (m.racine) ajouter(this.motsParRacine, m.racine, i);
      const l = this.lemmes.get(m.lemme);
      if (l) l.n++;
    }
    for (const l of this.lemmes.values()) {
      ajouter(this.lemmesParCle, l.ks, l);
      ajouter(this.lemmesParCleLache, l.ks.replace(SANS_ALIF, ''), l);
      if (l.racine) {
        ajouter(this.parRacine, l.racine, l);
        this.racinesParCle.set(cleRacine(l.racine), l.racine);
      }
    }
    for (const l of this.parRacine.values()) l.sort((x, y) => y.n - x.n || (x.bw < y.bw ? -1 : 1));
  }

  /** Racine (écrite avec espaces, comme dans les données) correspondant à ce que l'élève a tapé, ou null. */
  racineDe(saisie: string): string | null {
    return this.racinesParCle.get(cleRacine(saisie)) ?? null;
  }

  famille(racine: string): Famille | null {
    const lemmes = this.parRacine.get(racine);
    if (!lemmes) return null;
    return { racine, frequence: this.motsParRacine.get(racine)?.length ?? 0, lemmes };
  }

  /**
   * Cherche un MOT : les formes dont la clé est celle de la saisie, et tous les mots des lemmes dont la clé est celle de
   * la saisie (ou de la saisie sans « ال ») — c'est ainsi que « كتاب » trouve « ٱلْكِتَٰبِ », « كِتَٰبَهُۥ » et « بِكِتَٰبِهِمْ ».
   * Sans correspondance stricte, recours à la clé large (sans alif ni hamza : « الرحمن », « لكن »).
   */
  chercherMot(saisie: string, lemme?: string): Resultat {
    const strict = cleStricte(saisie);
    if (!strict) return { mots: [], approx: false };
    const sansAl = strict.replace(ARTICLE, '');
    const trouve = (
      cles: string[],
      parCle: Map<string, number[]>,
      lemmes: Map<string, Lemme[]>,
    ) => {
      const set = new Set<number>();
      for (const i of parCle.get(cles[0]!) ?? []) set.add(i);
      for (const c of cles)
        for (const l of lemmes.get(c) ?? [])
          for (const i of this.parLemme.get(l.bw) ?? []) set.add(i);
      return set;
    };
    let set = trouve([strict, sansAl], this.parCle, this.lemmesParCle);
    let approx = false;
    if (!set.size) {
      const lache = cleLache(saisie);
      if (lache.length >= 2) {
        set = trouve([lache, cleLache(sansAl)], this.parCleLache, this.lemmesParCleLache);
        approx = set.size > 0;
      }
    }
    let idx = [...set].sort((x, y) => x - y);
    if (lemme) idx = idx.filter((i) => this.mots[i]!.lemme === lemme);
    return { mots: idx.map((i) => this.mots[i]!), approx };
  }

  /** Tous les mots d'une racine (écrite comme dans les données), dans l'ordre du Coran. */
  motsDeRacine(racine: string, lemme?: string): Mot[] {
    const idx = this.motsParRacine.get(racine) ?? [];
    const out = idx.map((i) => this.mots[i]!);
    return lemme ? out.filter((m) => m.lemme === lemme) : out;
  }
}

/** Charge l'index depuis le dossier de données (`mots.tsv`, `lemmes.tsv`). */
export function chargerIndex(dossier: string): IndexMots {
  return new IndexMots(
    readFileSync(join(dossier, 'mots.tsv'), 'utf8'),
    readFileSync(join(dossier, 'lemmes.tsv'), 'utf8'),
  );
}

/**
 * Position, dans `texte.split(' ')`, du `ordre`-ième jeton qui n'est pas un signe de pause isolé (le texte est celui de
 * Tanzil APRÈS séparation de la basmala d'en-tête, comme dans le lecteur). -1 si le verset est plus court.
 */
export function indiceDuJeton(texte: string, ordre: number): number {
  let n = 0;
  const jetons = texte.split(' ');
  for (let i = 0; i < jetons.length; i++) {
    if (PAUSE.test(jetons[i]!)) continue;
    if (++n === ordre) return i;
  }
  return -1;
}
