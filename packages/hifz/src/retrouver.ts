/**
 * « RETROUVE CE VERSET » (le « Shazam » du Coran, interrupteur `shazam_coran`) : à partir des mots entendus par le
 * service d'écoute (5 à 15 s de récitation), retrouver le passage dans TOUT le texte Tanzil (riwāya Ḥafṣ).
 * Pur, sans dépendance : utilisé par l'API (index construit une fois depuis la base) et par les tests.
 *
 * Méthode validée par l'étude (`recherche_coran_ia/ETUDE_SHAZAM.md`, 94 % au rang 1, 100 % parmi les 3 premiers,
 * aucune réponse fausse au-dessus du seuil 0,6) ; portage fidèle du prototype `retrouve_verset.py` :
 *  1. SQUELETTES : lettres de base sans voyelles, sans alif ni hamza (écarts uthmānī / transcription : الرحمن /
 *     الرحمان, الكتب / الكتاب), mots ENCHAÎNÉS sans espaces (la machine coupe ou colle parfois les mots) ;
 *  2. Coran CONTINU, dans l'ordre du muṣḥaf (le fichier Tanzil d'Awzid ne l'est pas : on TRIE) : un extrait à
 *     cheval sur deux versets ou deux sourates se retrouve d'un seul tenant ;
 *  3. VOTE « Shazam » : chaque 4-gramme de lettres de l'extrait vote pour une diagonale (position Coran − position
 *     extrait) ; 15 meilleures diagonales ;
 *  4. ALIGNEMENT FIN : distance d'édition semi-globale (début et fin libres dans le texte), coût ½ entre lettres que
 *     la machine confond ; score = 1 − coût / longueur ;
 *  5. passages AU MÊME SCORE que le premier (formules répétées, mutashābihāt) : rendus ENSEMBLE (« ex æquo »).
 *
 * Le texte Tanzil n'est jamais modifié : les squelettes ne servent qu'à COMPARER.
 */
import { cleMot, squelette } from './ecoute.js';

/** longueur des n-grammes de lettres */
const K = 4;
/** largeur d'une « diagonale » (tolère des lettres ajoutées ou perdues) */
const BANDE = 8;
const CANDIDATS = 15;
/** un 4-gramme plus fréquent que cela ne vote pas (« لله »…) */
const GRAMME_COMMUN = 4000;
/** seuil d'affichage validé par l'étude : en dessous, on se tait (« je n'ai pas reconnu ») */
export const SEUIL_RETROUVER = 0.6;
/** voix minimale (secondes) : en dessous, on demande de réciter plus longtemps au lieu de deviner */
export const VOIX_MIN_RETROUVER = 3;

const PROCHES = ['سص', 'تط', 'ذزظ', 'دض', 'كق', 'هح', 'ثس', 'غع'];

function coutSub(a: string, b: string): number {
  if (a === b) return 0;
  for (const g of PROCHES) if (g.includes(a) && g.includes(b)) return 0.5;
  return 1;
}

/** Squelette d'un mot (ou d'une phrase, mots enchaînés). */
export const squeletteMot = (w: string): string => squelette(cleMot(w));
export const squelettePhrase = (p: string): string => p.split(/\s+/).map(squeletteMot).join('');

function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length]!;
}

export interface PassageTrouve {
  /** verset principal « s:a » (le plus présent dans le passage) */
  verset: string;
  /** versets couverts par le passage, dans l'ordre */
  passage: string[];
  /** 0 à 1 */
  score: number;
}

export interface Recherche {
  /** 3 meilleurs passages distincts (score décroissant) */
  resultats: PassageTrouve[];
  /** versets principaux des passages AU MÊME SCORE que le premier (texte identique ailleurs) */
  egaux: string[];
  raison?: 'trop_peu_de_lettres' | 'aucun_ngramme';
}

/** arrondi à 3 décimales, au pair en cas d'égalité exacte (comme `round` de Python : scores identiques au prototype) */
function round3(x: number): number {
  const y = x * 1000;
  let r = Math.round(y);
  if (y - Math.floor(y) === 0.5 && r % 2 !== 0) r -= 1;
  return r / 1000;
}

export class IndexCoran {
  readonly versets: Array<[number, number]> = [];
  private readonly txt: string;
  private readonly versetDe: Int32Array;
  private readonly post = new Map<string, Int32Array>();
  private readonly entetes: string[];

  /** `versets` : tout le texte Tanzil, dans n'importe quel ordre (trié ici dans l'ordre du muṣḥaf). */
  constructor(versets: ReadonlyArray<{ s: number; a: number; text: string }>) {
    const tri = [...versets].sort((x, y) => x.s - y.s || x.a - y.a);
    const morceaux = tri.map((v) => squelettePhrase(v.text.replace(/\uFEFF/g, '')));
    this.versetDe = new Int32Array(morceaux.reduce((s, m) => s + m.length, 0));
    let o = 0;
    tri.forEach((v, iv) => {
      this.versets.push([v.s, v.a]);
      const sq = morceaux[iv]!;
      this.versetDe.fill(iv, o, o + sq.length);
      o += sq.length;
    });
    this.txt = morceaux.join('');
    const tmp = new Map<string, number[]>();
    for (let i = 0; i + K <= this.txt.length; i++) {
      const g = this.txt.slice(i, i + K);
      const l = tmp.get(g);
      if (l) l.push(i);
      else tmp.set(g, [i]);
    }
    for (const [g, l] of tmp) this.post.set(g, Int32Array.from(l));
    // basmala et isti'ādha en tête d'extrait : retirées avant la recherche (elles ne désignent aucun verset) ; la
    // basmala est celle du texte Tanzil (1:1), jamais retapée
    const iBasmala = tri.findIndex((v) => v.s === 1 && v.a === 1);
    this.entetes = [
      ...(iBasmala >= 0 ? [morceaux[iBasmala]!] : []),
      squelettePhrase('أعوذ بالله من الشيطان الرجيم'),
    ];
  }

  get lettres(): number {
    return this.txt.length;
  }
  get grammes(): number {
    return this.post.size;
  }

  private nomVerset(iv: number): string {
    const [s, a] = this.versets[iv]!;
    return `${s}:${a}`;
  }

  /** Distance d'édition semi-globale de q contre txt[d0:d1] : [coût, début, fin] dans le texte. */
  private aligner(q: string, d0: number, d1: number): [number, number, number] {
    const t = this.txt.slice(d0, d1);
    const n = t.length;
    let prev = new Float64Array(n + 1);
    let prevS = Int32Array.from({ length: n + 1 }, (_, j) => j);
    let cur = new Float64Array(n + 1);
    let curS = new Int32Array(n + 1);
    for (let i = 1; i <= q.length; i++) {
      const qc = q[i - 1]!;
      cur[0] = i;
      curS[0] = 0;
      for (let j = 1; j <= n; j++) {
        const cDiag = prev[j - 1]! + coutSub(qc, t[j - 1]!);
        const cHaut = prev[j]! + 1;
        const cGauche = cur[j - 1]! + 1;
        if (cDiag <= cHaut && cDiag <= cGauche) {
          cur[j] = cDiag;
          curS[j] = prevS[j - 1]!;
        } else if (cHaut <= cGauche) {
          cur[j] = cHaut;
          curS[j] = prevS[j]!;
        } else {
          cur[j] = cGauche;
          curS[j] = curS[j - 1]!;
        }
      }
      [prev, cur] = [cur, prev];
      [prevS, curS] = [curS, prevS];
    }
    let j = 1;
    for (let x = 2; x <= n; x++) if (prev[x]! < prev[j]!) j = x;
    return [prev[j]!, d0 + prevS[j]!, d0 + j];
  }

  private retirerEntete(q: string): string {
    for (const e of this.entetes)
      if (q.length > e.length + 6 && lev(e, q.slice(0, e.length)) <= 3) return q.slice(e.length);
    return q;
  }

  /** verset le plus présent dans txt[s0:s1] (le premier en cas d'égalité) et versets couverts */
  private versetsDe(s0: number, s1: number): { principal: number; ids: number[] } {
    const nb = new Map<number, number>();
    for (let i = s0; i < Math.max(s0 + 1, s1); i++) {
      const iv = this.versetDe[i]!;
      nb.set(iv, (nb.get(iv) ?? 0) + 1);
    }
    const ids = [...nb.keys()].sort((x, y) => x - y);
    let principal = ids[0]!;
    for (const iv of ids) if (nb.get(iv)! > nb.get(principal)!) principal = iv;
    return { principal, ids };
  }

  /** Recherche à partir des mots entendus (une lecture du service). */
  chercher(mots: readonly string[], n = 3): Recherche {
    const q = this.retirerEntete(mots.map(squeletteMot).join(''));
    if (q.length < 8) return { resultats: [], egaux: [], raison: 'trop_peu_de_lettres' };
    const votes = new Map<number, number>();
    let vu = false;
    for (let i = 0; i + K <= q.length; i++) {
      const p = this.post.get(q.slice(i, i + K));
      if (!p || p.length > GRAMME_COMMUN) continue;
      vu = true;
      for (const x of p) {
        const b = Math.floor((x - i) / BANDE);
        votes.set(b, (votes.get(b) ?? 0) + 1);
      }
    }
    if (!vu) return { resultats: [], egaux: [], raison: 'aucun_ngramme' };
    // deux bandes voisines ; à égalité, la bande la plus petite d'abord (comme le prototype)
    const lisse = [...votes.keys()]
      .sort((x, y) => x - y)
      .map((b) => [b, votes.get(b)! + (votes.get(b + 1) ?? 0)] as const);
    const tete = [...lisse].sort((x, y) => y[1] - x[1]).slice(0, CANDIDATS);
    const marge = Math.max(16, Math.floor(q.length / 3));
    const vus: number[] = [];
    const cands: Array<[number, number, number]> = [];
    for (const [bande] of tete) {
      const d0 = Math.max(0, bande * BANDE - marge);
      const d1 = Math.min(this.txt.length, bande * BANDE + q.length + BANDE + marge);
      if (vus.some((v) => Math.abs(d0 - v) < BANDE * 2)) continue;
      vus.push(d0);
      cands.push(this.aligner(q, d0, d1));
    }
    cands.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    const chevauche = (pris: Array<[number, number]>, s0: number, s1: number) =>
      pris.some(([b0, b1]) => Math.min(s1, b1) - Math.max(s0, b0) > 0.5 * (s1 - s0));
    const egaux: string[] = [];
    const resultats: PassageTrouve[] = [];
    const pris: Array<[number, number]> = [];
    for (const [cout, s0, s1] of cands) {
      if (chevauche(pris, s0, s1)) continue;
      pris.push([s0, s1]);
      const { principal, ids } = this.versetsDe(s0, s1);
      // passages au score égal au meilleur : formules répétées, à montrer ENSEMBLE
      if (cout <= cands[0]![0] + 0.02 * q.length) {
        const nom = this.nomVerset(principal);
        if (!egaux.includes(nom)) egaux.push(nom);
      }
      if (resultats.length < n)
        resultats.push({
          verset: this.nomVerset(principal),
          passage: ids.map((iv) => this.nomVerset(iv)),
          score: round3(Math.max(0, 1 - cout / q.length)),
        });
    }
    return { resultats, egaux };
  }
}

/**
 * Double lecture du même audio (RNN-T et tête CTC) : on garde la recherche la plus sûre (à égalité, le RNN-T).
 * Mesuré par l'étude : 94 % au rang 1 au lieu de 92 % (RNN-T seul) ; le RNN-T hallucine parfois sur un extrait
 * coupé net, la tête CTC le rattrape.
 */
export function chercherDouble(
  idx: IndexCoran,
  lectures: ReadonlyArray<readonly string[]>,
): Recherche {
  let best: Recherche | null = null;
  const essai = (mots: readonly string[]) => {
    const r = idx.chercher(mots);
    if (!best || (r.resultats[0]?.score ?? 0) > (best.resultats[0]?.score ?? 0)) best = r;
  };
  for (const mots of lectures) if (mots.length) essai(mots);
  // rien de sûr : on retente SANS LES PREMIERS MOTS (mot tronqué au début de l'extrait, ou reste d'une lecture
  // « décrochée » : « سورة الأعراف للبث في بطنه… » ; mesuré le 25/10/2026) ; seulement en secours, jamais quand
  // une lecture entière est déjà sûre
  if (((best as Recherche | null)?.resultats[0]?.score ?? 0) < SEUIL_RETROUVER)
    for (const mots of lectures)
      for (const k of [1, 2]) if (mots.length - k >= 4) essai(mots.slice(k));
  return best ?? { resultats: [], egaux: [], raison: 'trop_peu_de_lettres' };
}

export interface Retrouve {
  statut: 'trouve' | 'pas_trouve';
  /** passages au-dessus du seuil (le premier d'abord) */
  resultats: PassageTrouve[];
  /** versets au texte identique au meilleur passage (au moins 2 : « ce passage se trouve dans n versets ») */
  egaux: string[];
}

/**
 * Les AUTRES passages (2ᵉ et 3ᵉ) ne sont montrés que s'ils sont presque identiques au premier (un passage voisin au
 * texte proche, ex. 11:77 et 29:33) : le seuil 0,6 de l'étude vaut pour le PREMIER ; sur un extrait court, un 2ᵉ à
 * 0,67 n'est que du bruit (mesuré : « قل هو الله احد » -> 2:207 à 0,667).
 */
export const SEUIL_AUTRES = 0.8;
export const ECART_AUTRES = 0.15;

/** Décision montrée à l'élève : rien sous le seuil (on ne devine jamais). */
export function decisionRetrouver(r: Recherche, seuil = SEUIL_RETROUVER): Retrouve {
  const [premier, ...suite] = r.resultats;
  if (!premier || premier.score < seuil) return { statut: 'pas_trouve', resultats: [], egaux: [] };
  const autres = suite.filter(
    (x) => x.score >= seuil && x.score >= SEUIL_AUTRES && x.score >= premier.score - ECART_AUTRES,
  );
  return {
    statut: 'trouve',
    resultats: [premier, ...autres],
    egaux: r.egaux.length > 1 ? r.egaux : [],
  };
}
