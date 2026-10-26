/**
 * Récitation de Muḥammad Ayyūb dans les leçons (26/10/2026) — table « texte du livre → versets d'Ayyūb ».
 * Décisions du référent (`DECISION_ZERO_MUET.md`, `referent-373-DECISIONS.md`, `referent-25-10-DECISIONS.md`, consignes
 * du 26/10/2026) :
 *  - Ayyūb SEUL, fichiers stockés chez nous ; jamais de récitateur en ligne, jamais de synthèse sur le Coran ;
 *  - verset entier cité : le fichier du verset ; FRAGMENT (4 mots consécutifs de Tanzil ou plus, ou moins avec une
 *    référence ou une décision du référent) : le VERSET ENTIER, le fragment surligné (étape A) ; plusieurs versets : les
 *    fichiers enchaînés dans l'ordre du Muṣḥaf (Tanzil TRIÉ : le fichier n'est pas dans l'ordre) ;
 *  - Basmala présentée comme Coran : seule, 1:1 ; en tête d'une sourate citée depuis son verset 1, le fichier annexe
 *    de la Basmala d'Ayyūb pour cette sourate (`b:S`) ;
 *  - texte MIXTE (phrase, hadith, dialogue qui cite un verset) : synthèse pour la partie non coranique (`t:` + empreinte
 *    du fichier de synthèse de cette partie), Ayyūb pour le verset, joués à la suite ; le texte affiché ne change pas ;
 *  - comparaison avec Tanzil : squelette (voyelles, signes et alifs retirés, POUR LA COMPARAISON SEULEMENT, comme la
 *    garde) ; le texte affiché n'est jamais modifié ni normalisé ;
 *  - rapprochement AMBIGU (fragment présent dans plusieurs versets : mutashābihāt…) sans référence du livre ni décision
 *    du référent : « doute », jamais branché au hasard.
 * Aucun texte coranique n'est écrit ici : tout vient de Tanzil et des livres.
 */
import { looksQuranic, skeleton } from './audio-cle.js';

/** mot de Tanzil (ordre du Muṣḥaf) */
export interface MotCoran {
  /** squelette */
  k: string;
  s: number;
  v: number;
  /** mot de la Basmala en tête du verset 1 (Tanzil l'y écrit ; sourates autres que 1 et 9) */
  b: boolean;
}

export interface IndexCoran {
  mots: MotCoran[];
  /** quatre squelettes consécutifs → positions dans `mots` */
  quad: Map<string, number[]>;
  /** « s:v » → première et dernière position du verset (Basmala de tête exclue) */
  bornes: Map<string, [number, number]>;
  /** versets de trois mots au plus (seuls ou deux ou trois consécutifs) : squelette → « s:v » ou « s:v-w » */
  courts: Map<string, string[]>;
  /** squelette souple d'un mot → positions */
  parMot: Map<string, number[]>;
}

const c = (n: number) => String.fromCharCode(n);
/** squelette de la Basmala (4 mots), écrit par codes */
const BASMALA = skeleton(
  String.fromCharCode(
    ...[0x628, 0x633, 0x645, 0x20, 0x627, 0x644, 0x644, 0x647, 0x20, 0x627, 0x644, 0x631],
    ...[0x62d, 0x645, 0x646, 0x20, 0x627, 0x644, 0x631, 0x62d, 0x64a, 0x645],
  ),
);
const BASMALA_MOTS = BASMALA.split(' ').length;

/** versets des lettres détachées (muqaṭṭaʿāt) : récités même seuls (§ 2 bis) */
export const MUQATTAAT = new Set(
  '2:1 3:1 7:1 10:1 11:1 12:1 13:1 14:1 15:1 19:1 20:1 26:1 27:1 28:1 29:1 30:1 31:1 32:1 36:1 38:1 40:1 41:1 42:1 42:2 43:1 44:1 45:1 46:1 50:1 68:1'.split(
    ' ',
  ),
);

const cleVerset = (k: string) => k.split(':').map(Number) as [number, number];

/** Index des mots du Coran, dans l'ORDRE DU MUṢḤAF (clés de Tanzil triées). */
export function indexCoran(tanzil: ReadonlyMap<string, string>): IndexCoran {
  if (tanzil.size === 0) throw new Error('texte du Coran absent');
  const cles = [...tanzil.keys()].map(cleVerset).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const mots: MotCoran[] = [];
  const bornes = new Map<string, [number, number]>();
  const parVerset: Array<{ cle: string; s: number; v: number; k: string }> = [];
  for (const [s, v] of cles) {
    const k = skeleton(tanzil.get(`${s}:${v}`)!);
    const w = k.split(' ').filter(Boolean);
    const tete = v === 1 && s !== 1 && k.startsWith(`${BASMALA} `) ? BASMALA_MOTS : 0;
    w.forEach((x, i) => mots.push({ k: x, s, v, b: i < tete }));
    bornes.set(`${s}:${v}`, [mots.length - w.length + tete, mots.length - 1]);
    parVerset.push({ cle: `${s}:${v}`, s, v, k: w.slice(tete).join(' ') });
  }
  const quad = new Map<string, number[]>();
  for (let i = 0; i + 4 <= mots.length; i++) {
    const q = `${mots[i]!.k} ${mots[i + 1]!.k} ${mots[i + 2]!.k} ${mots[i + 3]!.k}`;
    const l = quad.get(q);
    if (l) l.push(i);
    else quad.set(q, [i]);
  }
  const courts = new Map<string, string[]>();
  const ajoute = (k: string, ref: string) => {
    const l = courts.get(k);
    if (l) l.push(ref);
    else courts.set(k, [ref]);
  };
  for (let i = 0; i < parVerset.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(parVerset.length, i + 3); j++) {
      const x = parVerset[j]!;
      if (x.s !== parVerset[i]!.s) break;
      acc = acc ? `${acc} ${x.k}` : x.k;
      if (acc.split(' ').length > 3) break;
      ajoute(acc, j === i ? x.cle : `${x.s}:${parVerset[i]!.v}-${x.v}`);
    }
  }
  const parMot = new Map<string, number[]>();
  mots.forEach((m, i) => {
    const k = souple(m.k);
    const l = parMot.get(k);
    if (l) l.push(i);
    else parMot.set(k, [i]);
  });
  return { mots, quad, bornes, courts, parMot };
}

/** mot d'un texte : squelette et place dans le texte (caractères [a, b[) */
export interface MotTexte {
  k: string;
  a: number;
  b: number;
}

type Classe = 'signe' | 'separateur' | string;
const classes = new Map<string, Classe>();
function classe(ch: string): Classe {
  let r = classes.get(ch);
  if (r !== undefined) return r;
  const b = c(0x628);
  // crochets de balisage des livres : retirés avant la comparaison (comme la garde)
  if (ch === '[' || ch === ']') r = 'signe';
  else {
    const k = skeleton(`${b}${ch}${b}`);
    r = k === `${b}${b}` ? 'signe' : k === `${b} ${b}` ? 'separateur' : k.slice(1, -1);
  }
  classes.set(ch, r);
  return r;
}

/** Mots d'un texte (squelettes, comme `skeleton(s).split(' ')`, crochets retirés) avec leur place. */
export function motsTexte(s: string): MotTexte[] {
  const out: MotTexte[] = [];
  let k = '';
  let a = -1;
  let fin = 0;
  const ferme = () => {
    if (k) out.push({ k, a, b: fin });
    k = '';
    a = -1;
  };
  for (let i = 0; i < s.length; i++) {
    const x = classe(s[i]!);
    if (x === 'separateur') ferme();
    else {
      // le mot commence à son premier signe (alif, hamza, voyelle) : une partie du texte ne coupe jamais un mot
      if (a < 0) a = i;
      if (x !== 'signe') k += x;
      fin = i + 1;
    }
  }
  ferme();
  // vocatif et « ها » : le Muṣḥaf les écrit attachés au mot suivant (يَٰٓأَيُّهَا, يَٰقَوْمِ, هَٰٓأَنتُمْ) ; les livres les séparent
  const fusion: MotTexte[] = [];
  for (let i = 0; i < out.length; i++) {
    const x = out[i]!;
    const y = out[i + 1];
    if (y && (x.k === c(0x64a) || x.k === c(0x647))) {
      fusion.push({ k: x.k + y.k, a: x.a, b: y.b });
      i++;
    } else fusion.push(x);
  }
  return fusion;
}

/** égalité souple d'un mot (prolongement d'une citation déjà reconnue) : sans و ي (lettres de prolongation, ۧ…) */
const souple = (k: string) => k.replace(/[وي]/g, '');
const egalSouple = (x: string, y: string) =>
  x === y || (souple(x) === souple(y) && souple(x).length >= 2);

export interface Ref {
  s: number;
  a: number;
  b: number;
}
const REF = /(\d{1,3}|[٠-٩]{1,3})\s*:\s*(\d{1,3}|[٠-٩]{1,3})(?:\s*[-–]\s*(\d{1,3}|[٠-٩]{1,3}))?/g;
const num = (x: string) => Number(x.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
/** références de versets écrites dans un texte (« 49:10 », « ٢:٢٥٥ », « 2:255-257 ») */
export function refsDe(s: string): Ref[] {
  const out: Ref[] = [];
  for (const m of String(s ?? '').matchAll(REF)) {
    const x = num(m[1]!);
    const a = num(m[2]!);
    const b = m[3] ? num(m[3]) : a;
    if (x >= 1 && x <= 114 && a >= 1 && b >= a) out.push({ s: x, a, b });
  }
  return out;
}

/** segment d'un plan : versets (une sourate), Basmala annexe d'une sourate, partie dite par la synthèse */
export type Segment =
  { k: 'v'; s: number; a: number; b: number } | { k: 'b'; s: number } | { k: 't'; texte: string };

/** « lemme » : mot du Coran présenté comme vocabulaire (exercice de langue) : la synthèse, en graphie courante */
export type Statut =
  | 'verset'
  | 'fragment'
  | 'mixte'
  | 'doute'
  | 'court'
  | 'aucun'
  | 'lemme'
  /** note rédigée en français : non lue, pas un muet */
  | 'francais';

export interface Analyse {
  statut: Statut;
  segments: Segment[];
  /** parties du texte reconnues comme Coran (caractères [a, b[) */
  coran: Array<[number, number]>;
  /** pourquoi (doute, court, choix d'un verset) */
  note: string;
}

export interface Contexte {
  /** références du livre (texte, bloc) */
  refs?: Ref[];
  /** versets décidés par le référent pour ce texte (« 2:182 », « 1:1-7 ») */
  decision?: string[];
  /** le texte est présenté comme verset (﴿ ﴾, référence, liste de versets, graphie du Muṣḥaf) */
  presente?: boolean;
  /** expressions de moins de 4 mots réservées à Ayyūb par le référent : squelettes des mots, verset (« 12:4 ») */
  reserves?: ReadonlyArray<{ k: string[]; ref: string }>;
  /**
   * nature de la décision du référent : « ayyub » (tout le passage arabe est récité : rien en synthèse), « mixte »
   * (synthèse pour le texte du livre), « table » (table des récitations : verset entier)
   */
  decisionType?: 'ayyub' | 'mixte' | 'table';
  /** le texte est gardé sans voix par la garde coranique ou par la vidéo (présenté comme Coran) */
  garde?: boolean;
  /**
   * contexte CORANIQUE (mot à mot d'un verset, tafsīr, hifẓ, partie Coran, Prière, muṣḥaf) : un passage de moins de
   * 4 mots s'y entend dans son verset entier (décision du référent du 26/10/2026) ; hors de ce contexte, c'est du
   * vocabulaire (« lemme ») : la synthèse
   */
  coranique?: boolean;
  /** sourates que la leçon (ou le livre) cite : choix du verset d'un passage présent à plusieurs endroits */
  sourates?: readonly number[];
}

/**
 * Choix du verset d'un passage présent à plusieurs endroits (décision du référent du 26/10/2026) : celui d'une sourate
 * que la leçon cite, sinon la PREMIÈRE occurrence dans l'ordre du Muṣḥaf (Tanzil trié) ; la référence est affichée.
 */
function choisirOccurrence(
  positions: readonly number[],
  idx: IndexCoran,
  sourates: readonly number[] | undefined,
): { p: number; note: string } {
  const tri = [...positions].sort((x, y) => x - y);
  const cite = tri.find((q) => sourates?.includes(idx.mots[q]!.s));
  return cite !== undefined
    ? { p: cite, note: 'sourate citée par la leçon' }
    : { p: tri[0]!, note: 'première occurrence dans l’ordre du Muṣḥaf' };
}

/**
 * Trois versets candidats les plus proches d'un passage (score : mots du passage présents dans le verset, plus les
 * suites de deux mots), pour la décision du référent.
 */
export function candidats(passage: string, idx: IndexCoran, n = 3): string[] {
  const m = motsTexte(passage).map((x) => souple(x.k));
  const scores = new Map<string, number>();
  const vus = new Set<string>();
  for (const k of new Set(m))
    for (const q of idx.parMot.get(k) ?? []) {
      const c = `${idx.mots[q]!.s}:${idx.mots[q]!.v}`;
      if (vus.has(`${c}|${k}`)) continue;
      vus.add(`${c}|${k}`);
      scores.set(c, (scores.get(c) ?? 0) + 1);
    }
  for (const [c, sc] of scores) {
    const bo = idx.bornes.get(c);
    if (!bo) continue;
    const verset = ` ${idx.mots
      .slice(bo[0], bo[1] + 1)
      .map((x) => souple(x.k))
      .join(' ')} `;
    let bonus = 0;
    for (let j = 0; j + 1 < m.length; j++) if (verset.includes(` ${m[j]} ${m[j + 1]} `)) bonus++;
    scores.set(c, sc + bonus);
  }
  return [...scores]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, n)
    .map(([c, s]) => `${c} (${s})`);
}

interface Course {
  i: number;
  n: number;
  /** positions de départ dans le Coran (mêmes mots) */
  occ: number[];
}

const DANS = (x: { s: number; v: number }, r: Ref) => x.s === r.s && x.v >= r.a && x.v <= r.b;
/** parenthèses ornées du Muṣḥaf */
const ORNE = /[﴾﴿]/;
/** lettres et signes arabes (blocs Unicode de l'arabe), écrits par codes */ const AR_CLASSE = [
  [0x600, 0x6ff],
  [0x750, 0x77f],
  [0x8a0, 0x8ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]
  .map(([a, b]) => `\\u{${a!.toString(16)}}-\\u{${b!.toString(16)}}`)
  .join('');
const PASSAGE_ARABE = new RegExp(
  `[${AR_CLASSE}]+(?:[\\s\\u{a0}.,:;!?«»"'()\\[\\]…\\-–—←=/·|]*[${AR_CLASSE}]+)*[.!?\\u{61f}]?`,
  'gu',
);
/** ponctuation de bord d'une partie dite */ const BORDS =
  /^[\s|:.,،؛!?؟«»"'()…—–\-←=/·[\]]+|[\s|:,،؛«»"'(…—–\-←=/·[\]]+$/g;
const decisionsEnRefs = (d: string[] | undefined): Ref[] => (d ?? []).flatMap((x) => refsDe(x));

/** Analyse un texte du livre : parties coraniques, versets, plan de lecture. */
export function analyser(texte: string, idx: IndexCoran, ctx: Contexte = {}): Analyse {
  const w = motsTexte(texte);
  // note rédigée en FRANÇAIS (méthode, tajwīd) avec des mots du Coran en exemple : non lue (décision du référent du
  // 26/10/2026 : la voix ne fait pas le tajwīd) ; une citation de 4 mots ou plus y reste récitée par Ayyūb
  const francais =
    (texte.match(/[A-Za-zÀ-ÿ]/g) ?? []).length > (texte.match(/[ء-ي]/g) ?? []).length;
  const M = idx.mots;
  const courses: Course[] = [];
  let libre = 0;
  for (let i = 0; i + 4 <= w.length;) {
    const occ = idx.quad.get(`${w[i]!.k} ${w[i + 1]!.k} ${w[i + 2]!.k} ${w[i + 3]!.k}`) ?? [];
    let best = 0;
    let debut = i;
    let bestOcc: number[] = [];
    for (const p0 of occ) {
      // prolongement (écriture souple) vers la fin, puis vers le début (sans reprendre une citation précédente)
      let n = 4;
      while (i + n < w.length && p0 + n < M.length && egalSouple(w[i + n]!.k, M[p0 + n]!.k)) n++;
      let r = 0;
      while (i - r - 1 >= libre && p0 - r - 1 >= 0 && egalSouple(w[i - r - 1]!.k, M[p0 - r - 1]!.k))
        r++;
      const p = p0 - r;
      if (n + r > best || (n + r === best && i - r < debut)) {
        best = n + r;
        debut = i - r;
        bestOcc = [p];
      } else if (n + r === best && i - r === debut && !bestOcc.includes(p)) bestOcc.push(p);
    }
    // Basmala suivie d'un ou deux mots qui ressemblent au début d'une sourate (« أُقِرُّ » / « ٱقْرَأْ ») : la Basmala seule
    if (
      best >= 4 &&
      best < BASMALA_MOTS + 3 &&
      w
        .slice(debut, debut + BASMALA_MOTS)
        .map((x) => x.k)
        .join(' ') === BASMALA
    ) {
      best = BASMALA_MOTS;
      bestOcc = idx.quad.get(BASMALA) ?? bestOcc;
    }
    if (best >= 4) {
      courses.push({ i: debut, n: best, occ: bestOcc });
      i = libre = debut + best;
    } else i++;
  }
  // expressions réservées à Ayyūb par le référent (moins de 4 mots : Yūsuf 12:4…), cherchées hors des citations trouvées
  for (const r of ctx.reserves ?? []) {
    const n = r.k.length;
    for (let i = 0; i + n <= w.length; i++) {
      if (!r.k.every((x, j) => egalSouple(w[i + j]!.k, x))) continue;
      if (courses.some((co) => i < co.i + co.n && co.i < i + n)) continue;
      const bo = idx.bornes.get(r.ref);
      if (!bo) continue;
      // place des mots dans le verset décidé (vérifiée contre Tanzil)
      for (let p = bo[0]; p + n - 1 <= bo[1]; p++)
        if (r.k.every((x, j) => egalSouple(M[p + j]!.k, x))) {
          courses.push({ i, n, occ: [p] });
          break;
        }
    }
  }
  const refs = [...(ctx.refs ?? []), ...refsDe(texte)];
  const dec = decisionsEnRefs(ctx.decision);
  const libreEn = (i: number, n: number) => !courses.some((co) => i < co.i + co.n && co.i < i + n);
  // passages entre parenthèses ornées ﴿ ﴾ (annoncés comme Coran) de moins de 4 mots : cherchés dans tout le Coran
  for (const m of texte.matchAll(/[﴾﴿]([^﴾﴿]+)[﴾﴿]/g)) {
    const d = m.index;
    const f = d + m[0].length;
    const ids = w.map((x, j) => (x.a >= d && x.b <= f ? j : -1)).filter((j) => j >= 0);
    if (!ids.length || !libreEn(ids[0]!, ids.length)) continue;
    const i = ids[0]!;
    const n = ids.length;
    const occ = (idx.parMot.get(souple(w[i]!.k)) ?? []).filter((p) =>
      ids.every((j, q) => p + q < M.length && egalSouple(w[j]!.k, M[p + q]!.k)),
    );
    if (occ.length) courses.push({ i, n, occ });
  }
  // décision du référent (versets choisis pour ce texte) : les mots du texte qui se lisent dans ces versets
  if (dec.length && ctx.decisionType) {
    const parDecision: Course[] = [];
    for (let i = 0; i < w.length;) {
      let best = 0;
      let bp = -1;
      for (const r of dec) {
        const d0 = idx.bornes.get(`${r.s}:${r.a}`);
        const f0 = idx.bornes.get(`${r.s}:${r.b}`);
        if (!d0 || !f0) continue;
        for (let p = d0[0]; p <= f0[1]; p++) {
          let n = 0;
          while (i + n < w.length && p + n <= f0[1] && egalSouple(w[i + n]!.k, M[p + n]!.k)) n++;
          if (n > best) {
            best = n;
            bp = p;
          }
        }
      }
      // deux mots consécutifs au moins ; un mot seul quand le référent a dit « tout est récité »
      // « بِسْمِ اللَّهِ » SEUL (dhikr avant un acte) : la synthèse, jamais Ayyūb (précision du référent du 26/10/2026)
      const dhikrBasmala =
        best === 2 &&
        `${w[i]!.k} ${w[i + 1]!.k}` === BASMALA.split(' ').slice(0, 2).join(' ') &&
        w[i + 2]?.k !== BASMALA.split(' ')[2];
      if (!dhikrBasmala && (best >= 2 || (best === 1 && ctx.decisionType === 'ayyub'))) {
        parDecision.push({ i, n: best, occ: [bp] });
        i += best;
      } else i++;
    }
    if (parDecision.length) {
      courses.length = 0;
      courses.push(...parDecision);
    }
  }
  courses.sort((x, y) => x.i - y.i);

  // —— textes courts (moins de 4 mots du Coran) : verset entier, lettres détachées, ou fragment référencé / décidé
  if (!courses.length) {
    const k = w.map((x) => x.k).join(' ');
    if (!k) return { statut: 'aucun', segments: [], coran: [], note: '' };
    if (francais)
      return { statut: 'francais', segments: [], coran: [], note: 'note en français : non lue' };
    const choix: string[] = [];
    const entiers = idx.courts.get(k) ?? [];
    const lettres = entiers.filter((r) => MUQATTAAT.has(r));
    const vus = (rs: Ref[]) => {
      for (const r of rs)
        for (let v = r.a; v <= r.b; v++) {
          const bo = idx.bornes.get(`${r.s}:${v}`);
          if (!bo) continue;
          // mots du texte consécutifs dans le verset (ou la plage)
          const fin = idx.bornes.get(`${r.s}:${r.b}`)?.[1] ?? bo[1];
          for (let p = bo[0]; p + w.length - 1 <= fin; p++)
            if (w.every((x, j) => egalSouple(x.k, M[p + j]!.k))) {
              const dernier = M[p + w.length - 1]!;
              choix.push(dernier.v === v ? `${r.s}:${v}` : `${r.s}:${v}-${dernier.v}`);
              break;
            }
        }
    };
    let note = '';
    if (dec.length) {
      vus(dec);
      note = 'décision du référent';
    }
    // fragment de moins de 4 mots : seulement ANNONCÉ comme Coran dans le texte lui-même (référence, ﴿ ﴾) ; une
    // référence du bloc seule (carte, liste de mots) le présente comme vocabulaire : synthèse (§ 2 bis, décision 373 n° 5)
    const refsTexte = refsDe(texte);
    if (!choix.length && refsTexte.length) {
      vus(refsTexte);
      note = 'référence du livre';
    }
    // contexte coranique (mot à mot d'un verset, tafsīr, hifẓ, Prière…) : la référence du bloc donne le verset
    if (!choix.length && (ORNE.test(texte) || ctx.coranique) && refs.length) {
      vus(refs);
      note = 'référence du livre';
    }
    // gardé comme Coran (ou annoncé : ﴿ ﴾, référence) et lu dans le Coran
    const presenteCoran = ctx.garde || ORNE.test(texte) || refsTexte.length > 0;
    // « بِسْمِ اللَّهِ » seul : dhikr dit avant un acte, la synthèse (précision du référent du 26/10/2026)
    if (k === BASMALA.split(' ').slice(0, 2).join(' '))
      return { statut: 'court', segments: [], coran: [], note: 'بسم الله seul : dhikr (synthèse)' };
    // occurrences dans le texte des versets (jamais la Basmala de tête de sourate, qui n'est pas dans le fichier du verset)
    const occurrences = (idx.parMot.get(souple(w[0]!.k)) ?? []).filter(
      (p) =>
        !M[p]!.b &&
        w.every((x, q) => p + q < M.length && !M[p + q]!.b && egalSouple(x.k, M[p + q]!.k)),
    );
    const enContexte = ctx.presente || lettres.length > 0 || ctx.coranique;
    if (!choix.length && entiers.length && enContexte) {
      if (entiers.length === 1) {
        choix.push(entiers[0]!);
        note = lettres.length ? 'lettres détachées' : 'verset entier';
      } else {
        // verset entier présent à plusieurs endroits : sourate citée par la leçon, sinon le premier du Muṣḥaf
        const c = choisirOccurrence(occurrences, idx, ctx.sourates);
        const v = idx.mots[c.p]!;
        choix.push(entiers.find((r) => r.startsWith(`${v.s}:${v.v}`)) ?? `${v.s}:${v.v}`);
        note = c.note;
      }
    }
    // passage de moins de 4 mots en contexte coranique, sans référence : le verset (sourate citée, sinon le premier)
    if (!choix.length && presenteCoran && ctx.coranique && occurrences.length) {
      const c = choisirOccurrence(occurrences, idx, ctx.sourates);
      const d = idx.mots[c.p]!;
      const f = idx.mots[c.p + w.length - 1]!;
      choix.push(d.v === f.v ? `${d.s}:${d.v}` : `${d.s}:${d.v}-${f.v}`);
      note = c.note;
    }
    // plusieurs versets désignés par les références : le premier du Muṣḥaf
    const uniques = [...new Set(choix)].slice(0, 1);
    // gardé comme Coran mais présenté comme VOCABULAIRE (lemme, exercice de langue) : la synthèse, en graphie courante
    if (!uniques.length && presenteCoran && occurrences.length)
      return {
        statut: 'lemme',
        segments: [],
        coran: [],
        note: entiers.length
          ? `verset entier de moins de 4 mots présenté comme vocabulaire (${entiers.join(', ')}) : synthèse en graphie courante`
          : 'mot du Coran présenté comme vocabulaire : synthèse en graphie courante',
      };
    if (uniques.length !== 1)
      return {
        statut: uniques.length ? 'doute' : 'court',
        segments: [],
        coran: [],
        note: uniques.length
          ? `plusieurs versets possibles : ${uniques.join(', ')}`
          : entiers.length
            ? `verset entier de moins de 4 mots, présenté comme vocabulaire (${entiers.join(', ')})`
            : 'moins de 4 mots consécutifs du Coran, sans référence',
      };
    const [s, a, b] = (() => {
      const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(uniques[0]!)!;
      return [Number(m[1]), Number(m[2]), Number(m[3] ?? m[2])];
    })();
    const entier = entiers.includes(uniques[0]!);
    return {
      statut: entier ? 'verset' : 'fragment',
      segments: [{ k: 'v', s, a, b }],
      coran: [[w[0]!.a, w[w.length - 1]!.b]],
      note,
    };
  }

  // —— citations de 4 mots ou plus : choix du verset, puis plan dans l'ordre du texte
  const segments: Segment[] = [];
  const coran: Array<[number, number]> = [];
  let fragment = false;
  let fin = 0;
  const notes: string[] = [];
  // décision « tout est récité » : aucune partie confiée à la synthèse
  const sansSynthese = ctx.decisionType === 'ayyub' && dec.length > 0;
  const ajouteTexte = (de: number, a: number) => {
    if (sansSynthese || francais) return;
    // seulement les passages ARABES (le français n'a pas de voix : décision du client du 24/10/2026) ; références,
    // parenthèses ornées, ponctuation de bord : rien à dire
    for (const m of texte.slice(de, a).matchAll(PASSAGE_ARABE)) {
      const t = m[0]
        .replace(/\(\s*[0-9٠-٩:\-–\s]+\s*\)/g, ' ')
        .replace(/[﴾﴿]/g, ' ')
        .replace(BORDS, '')
        .trim();
      if (/[ء-ي]/.test(t)) segments.push({ k: 't', texte: t });
    }
  };
  for (const co of courses) {
    // occurrences distinctes (plage de versets) ; Basmala seule : 1:1
    const plages = new Map<string, number>();
    for (const p of co.occ) {
      const d = M[p]!;
      const f = M[p + co.n - 1]!;
      const basmalaSeule =
        co.n === BASMALA_MOTS &&
        co.occ.length > 1 &&
        w
          .slice(co.i, co.i + co.n)
          .map((x) => x.k)
          .join(' ') === BASMALA;
      const cle = basmalaSeule ? 'basmala' : `${d.s}:${d.v}|${f.s}:${f.v}|${d.b ? 1 : 0}`;
      if (!plages.has(cle)) plages.set(cle, p);
    }
    let p: number | undefined;
    if (plages.has('basmala')) p = undefined;
    else if (plages.size === 1) p = [...plages.values()][0];
    else {
      for (const [quoi, liste] of [
        ['décision du référent', dec],
        ['référence du livre', refs],
      ] as const) {
        if (!liste.length) continue;
        const ok = [...plages.values()].filter((q) =>
          liste.some((r) => DANS(M[q]!, r) || DANS(M[q + co.n - 1]!, r)),
        );
        if (ok.length === 1) {
          p = ok[0];
          notes.push(quoi);
          break;
        }
      }
      if (p === undefined) {
        // ni référence ni décision : sourate citée par la leçon, sinon la première occurrence du Muṣḥaf (mêmes mots)
        const c = choisirOccurrence([...plages.values()], idx, ctx.sourates);
        p = c.p;
        notes.push(c.note);
      }
    }
    const a0 = w[co.i]!.a;
    const b0 = w[co.i + co.n - 1]!.b;
    ajouteTexte(fin, a0);
    coran.push([a0, b0]);
    fin = b0;
    if (p === undefined) {
      // Basmala seule, présentée comme Coran : 1:1 (décision du 24/10/2026)
      segments.push({ k: 'v', s: 1, a: 1, b: 1 });
      continue;
    }
    // versets couverts, dans l'ordre ; Basmala annexe devant le verset 1 si la citation la contient
    const premier = M[p]!;
    const dernier = M[p + co.n - 1]!;
    const bd = idx.bornes.get(`${premier.s}:${premier.v}`)!;
    const bf = idx.bornes.get(`${dernier.s}:${dernier.v}`)!;
    if ((!premier.b && p !== bd[0]) || p + co.n - 1 !== bf[1]) fragment = true;
    let cur: { s: number; a: number; b: number } | null = null;
    for (let q = p; q < p + co.n; q++) {
      const m = M[q]!;
      if (m.b) {
        if (q === p || !M[q - 1]!.b) {
          if (cur) segments.push({ k: 'v', ...cur });
          cur = null;
          segments.push({ k: 'b', s: m.s });
        }
        continue;
      }
      if (cur && cur.s === m.s && (m.v === cur.b || m.v === cur.b + 1)) cur.b = m.v;
      else {
        if (cur) segments.push({ k: 'v', ...cur });
        cur = { s: m.s, a: m.v, b: m.v };
      }
    }
    if (cur) segments.push({ k: 'v', ...cur });
  }
  ajouteTexte(fin, texte.length);
  // versets consécutifs (deux citations du même verset, ou de versets qui se suivent sans texte entre elles) : fusionnés
  const plan: Segment[] = [];
  for (const x of segments) {
    const y = plan[plan.length - 1];
    if (y?.k === 'v' && x.k === 'v' && y.s === x.s && x.a >= y.a && x.a <= y.b + 1)
      y.b = Math.max(y.b, x.b);
    else plan.push({ ...x });
  }
  // mots des versets joués (souples), dans l'ordre
  const joues: string[] = [];
  for (const x of plan)
    if (x.k === 'v') {
      const d = idx.bornes.get(`${x.s}:${x.a}`)![0];
      const f = idx.bornes.get(`${x.s}:${x.b}`)![1];
      for (let q = d; q <= f; q++) joues.push(souple(M[q]!.k));
    }
  const jouesTexte = ` ${joues.join(' ')} `;
  // une partie qui n'est faite QUE de mots consécutifs des versets joués (reprise après « … », morceau entre deux
  // citations) est du Coran : elle est entendue dans la récitation, jamais confiée à la synthèse
  for (let j = plan.length - 1; j >= 0; j--) {
    const x = plan[j]!;
    if (x.k !== 't') continue;
    const m = motsTexte(x.texte).map((y) => souple(y.k));
    if (m.length && jouesTexte.includes(` ${m.join(' ')} `)) {
      plan.splice(j, 1);
      // versets qui se retrouvent voisins : fusionnés
      const y = plan[j - 1];
      const z = plan[j];
      if (y?.k === 'v' && z?.k === 'v' && y.s === z.s && z.a >= y.a && z.a <= y.b + 1) {
        y.b = Math.max(y.b, z.b);
        plan.splice(j, 1);
      }
    }
  }
  // une partie restante écrite en graphie du Muṣḥaf (« … وَلَا ٱلضَّآلِّينَ ») est du Coran : son verset (s'il est sûr), jamais
  // la synthèse ; une partie en écriture courante de 3 mots ou plus qui se lit dans le Coran : au référent
  const occurrences = (m: string[]) =>
    (idx.parMot.get(souple(m[0] ?? '')) ?? []).filter((q) =>
      m.every((x, j) => q + j < M.length && egalSouple(x, M[q + j]!.k)),
    );
  // Décisions du référent du 26/10/2026 : dans une partie restante, chaque passage qui se lit dans le Coran (2 mots ou plus
  // en graphie du Muṣḥaf — la parenthèse d'une analyse grammaticale —, 3 mots ou plus en écriture courante) passe à Ayyūb
  // (verset entier) ; la synthèse ne lit que le reste (l'analyse). Passage déjà entendu dans un verset joué : retiré.
  // Passage en graphie du Muṣḥaf présent à plusieurs endroits, sans sourate citée : au référent (liste finale).
  // (décision du référent pour ce texte : ses versets font foi, rien d'autre n'est cherché)
  for (let j = plan.length - 1; j >= 0 && !dec.length; j--) {
    const x = plan[j]!;
    if (x.k !== 't') continue;
    const mt = motsTexte(x.texte);
    if (!mt.length) continue;
    const morceaux: Segment[] = [];
    let de = 0;
    const reste = (a: number, b: number) => {
      const t = x.texte.slice(a, b).replace(BORDS, '').trim();
      if (/[ء-ي]/.test(t)) morceaux.push({ k: 't', texte: t });
    };
    for (let i = 0; i < mt.length;) {
      let trouve = 0;
      let occ: number[] = [];
      for (let n = mt.length - i; n >= 2; n--) {
        // deux mots : seulement s'ils sont TOUS deux en graphie du Muṣḥaf (« كِتَٰبًۭا (فِي » n'est pas une citation)
        if (n < 3 && !mt.slice(i, i + n).every((y) => looksQuranic(x.texte.slice(y.a, y.b))))
          continue;
        const o = occurrences(mt.slice(i, i + n).map((y) => y.k)).filter((q) => !M[q]!.b);
        if (o.length) {
          trouve = n;
          occ = o;
          break;
        }
      }
      if (!trouve) {
        i++;
        continue;
      }
      const part = mt.slice(i, i + trouve).map((y) => souple(y.k));
      const deja = jouesTexte.includes(` ${part.join(' ')} `);
      reste(de, mt[i]!.a);
      de = mt[i + trouve - 1]!.b;
      if (!deja) {
        const spans = new Map<string, number>();
        for (const q of occ) {
          const d = M[q]!;
          const f = M[q + trouve - 1]!;
          if (d.s === f.s && !spans.has(`${d.s}:${d.v}:${f.v}`))
            spans.set(`${d.s}:${d.v}:${f.v}`, q);
        }
        let q: number | undefined;
        if (spans.size === 1) q = [...spans.values()][0];
        else {
          const cites = [...spans.values()].filter((y) => ctx.sourates?.includes(M[y]!.s));
          if (cites.length) q = Math.min(...cites);
          // écriture courante (3 mots ou plus) : la première occurrence du Muṣḥaf ; graphie du Muṣḥaf : au référent
          else if (!looksQuranic(x.texte.slice(mt[i]!.a, de))) q = Math.min(...spans.values());
        }
        if (q === undefined)
          return {
            statut: 'doute',
            segments: [],
            coran,
            note: `passage en graphie du Muṣḥaf sans verset sûr : « ${x.texte.slice(mt[i]!.a, de)} »`,
          };
        const d = M[q]!;
        const f = M[q + trouve - 1]!;
        morceaux.push({ k: 'v', s: d.s, a: d.v, b: f.v });
        fragment = true;
      }
      i += trouve;
    }
    reste(de, x.texte.length);
    plan.splice(j, 1, ...morceaux);
  }
  // garde-fou : une partie confiée à la synthèse ne reprend AUCUNE suite de deux mots des versets joués. Décision du
  // référent du 26/10/2026 : on la DÉCOUPE pour que la synthèse ne lise que le texte du livre (les mots du verset sont
  // entendus dans la récitation) ; ce qui reste est dit à sa place
  if (plan.some((x) => x.k === 't')) {
    const paires = new Set<string>();
    for (let q = 0; q + 1 < joues.length; q++) paires.add(`${joues[q]} ${joues[q + 1]}`);
    for (let j = plan.length - 1; j >= 0; j--) {
      const x = plan[j]!;
      if (x.k !== 't') continue;
      const m = motsTexte(x.texte);
      const sk = m.map((y) => souple(y.k));
      const coranique = new Set<number>();
      for (let q = 0; q + 1 < sk.length; q++)
        if (paires.has(`${sk[q]} ${sk[q + 1]}`)) coranique.add(q).add(q + 1);
      if (!coranique.size) continue;
      const morceaux: Segment[] = [];
      for (let q = 0; q < m.length;) {
        if (coranique.has(q)) {
          q++;
          continue;
        }
        let r = q;
        while (r + 1 < m.length && !coranique.has(r + 1)) r++;
        const t = x.texte.slice(m[q]!.a, m[r]!.b).replace(BORDS, '').trim();
        if (/[ء-ي]/.test(t)) morceaux.push({ k: 't', texte: t });
        q = r + 1;
      }
      plan.splice(j, 1, ...morceaux);
      notes.push('partie du livre découpée : la synthèse ne lit pas les mots du verset');
    }
  }
  // versets devenus voisins (passages remis à Ayyūb) : fusionnés
  for (let j = plan.length - 1; j > 0; j--) {
    const y = plan[j - 1]!;
    const z = plan[j]!;
    if (y.k === 'v' && z.k === 'v' && y.s === z.s && z.a >= y.a && z.a <= y.b + 1) {
      y.b = Math.max(y.b, z.b);
      plan.splice(j, 1);
    }
  }
  // un même verset cité deux fois dans le texte (hadith qui reprend deux passages d'un verset) : récité une seule fois
  const vus = new Set<string>();
  for (let j = 0; j < plan.length; j++) {
    const x = plan[j]!;
    if (x.k !== 'v') continue;
    const c = `${x.s}:${x.a}-${x.b}`;
    if (vus.has(c)) plan.splice(j--, 1);
    else vus.add(c);
  }
  const mixte = plan.some((x) => x.k === 't');
  if (francais && !plan.some((x) => x.k === 'v'))
    return { statut: 'francais', segments: [], coran: [], note: 'note en français : non lue' };
  return {
    statut: mixte ? 'mixte' : fragment ? 'fragment' : 'verset',
    segments: plan,
    coran,
    note: [...new Set(notes)].join(' ; '),
  };
}

/** Écriture compacte d'un segment dans la table de l'application. */
export function segmentCourt(x: Segment, fichier: (texte: string) => string): string {
  if (x.k === 'v') return x.a === x.b ? `${x.s}:${x.a}` : `${x.s}:${x.a}-${x.b}`;
  if (x.k === 'b') return `b:${x.s}`;
  return `t:${fichier(x.texte)}`;
}
