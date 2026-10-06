/**
 * A5 — « L'IA QUI ÉCOUTE LA RÉCITATION » : comparaison MOT À MOT de ce que la machine a entendu avec le texte
 * Tanzil (riwāya Ḥafṣ) d'une portion. Pur, sans dépendance : partagé par le serveur (vérification d'un
 * enregistrement) et par l'appareil (suivi en direct, masquage qui se dévoile).
 *
 * RÈGLES ABSOLUES (cahier des charges A5) :
 *  - on ne repère QUE des MOTS : oubliés, ajoutés, remplacés, dans le désordre, verset sauté. Jamais de tajwīd,
 *    jamais de jugement de la qualité, jamais « ta récitation est valide » : seul le maître juge ;
 *  - chaque écart porte une CONFIANCE ; en cas de doute, rien n'est signalé (« je n'ai pas bien entendu ») :
 *    mieux vaut rater une erreur que d'en signaler une fausse ;
 *  - le texte Tanzil n'est jamais modifié : la normalisation ne sert qu'à COMPARER (clé interne), l'affichage
 *    garde les mots exacts (indices `k` dans `texte.split(' ')`).
 */

// ------------------------------------------------------------------ normalisation (comparaison seulement)

/** voyelles, sukūn, chadda, signes coraniques (petites lettres, arrêts), tatweel — PAS l'alif suscrit (U+0670) */
const SIGNES = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0640]/g;
const LETTRE = /[\u0621-\u064A]/;

/** Clé de comparaison d'un mot (graphie ʿuthmānī ou courante) : lettres de base, hamza et alifs unifiés. */
export function cleMot(mot: string): string {
  return mot
    .replace(SIGNES, '')
    .replace(/\u0670/g, 'ا') // alif suscrit : ٱلرَّحْمَٰنِ -> الرحمان
    .replace(/[\u0671\u0622\u0623\u0625]/g, 'ا')
    .replace(/\u0624/g, 'و')
    .replace(/\u0626/g, 'ي')
    .replace(/\u0649/g, 'ي')
    .replace(/\u0629/g, 'ه')
    .replace(/[^\u0621-\u064A]/g, '');
}

/** Squelette : la clé sans alif ni hamza (écarts d'orthographe ʿuthmānī / courante, ex. \u0635\u0644\u0648\u0629 / صلاة). */
export function squelette(cle: string): string {
  return cle.replace(/[\u0627\u0621]/g, '');
}

function leven(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length]!;
}

const ratio = (a: string, b: string) =>
  a.length + b.length === 0 ? 1 : 1 - leven(a, b) / Math.max(a.length, b.length);

/** Ressemblance de deux mots (0 à 1) : la meilleure entre clés et squelettes. */
export function ressemblance(cleA: string, cleB: string): number {
  if (cleA === cleB) return 1;
  const sa = squelette(cleA);
  const sb = squelette(cleB);
  // un squelette d'une seule lettre ne suffit pas à reconnaître un mot
  const s = sa.length >= 2 || sb.length >= 2 ? ratio(sa, sb) : 0;
  return Math.max(ratio(cleA, cleB), s);
}

// ------------------------------------------------------------------ texte attendu

/** Lettres isolées (al-muqaṭṭaʿāt) : prononcées en noms de lettres (« alif lām mīm ») — jamais signalées. */
const LETTRES_ISOLEES = new Set(
  ['الم', 'المص', 'الر', 'المر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'ص', 'حم', 'عسق', 'ق', 'ن'].map(
    cleMot,
  ),
);

export interface MotAttendu {
  /** rang dans la portion (0…) */
  i: number;
  s: number;
  a: number;
  /** rang du mot dans `texte.split(' ')` du verset (affichage exact) */
  k: number;
  /** mot Tanzil exact (jamais modifié) */
  texte: string;
  cle: string;
  /** basmala en tête d'un verset 1 : facultative (jamais signalée si absente) */
  facultatif?: boolean;
  /** lettres isolées : prononcées autrement qu'écrites, jamais signalées */
  lettres?: boolean;
}

export interface VersetTexte {
  s: number;
  a: number;
  text: string;
}

/**
 * Mots attendus d'une portion (versets Tanzil dans l'ordre). Les signes d'arrêt isolés (ۚ ۖ ۛ…) ne sont pas
 * des mots : ils restent à l'affichage mais ne sont pas attendus. La basmala d'un verset 1 (hors 1 et 9) est
 * facultative.
 */
export function motsAttendus(versets: readonly VersetTexte[], basmala = ''): MotAttendu[] {
  const out: MotAttendu[] = [];
  const bismCles = basmala ? basmala.split(' ').map(cleMot) : [];
  for (const v of versets) {
    const toks = v.text.replace(/^\uFEFF/, '').split(' ');
    const avecBasmala =
      v.a === 1 &&
      v.s !== 1 &&
      v.s !== 9 &&
      bismCles.length === 4 &&
      toks.length > 4 &&
      toks.slice(0, 4).every((w, n) => cleMot(w) === bismCles[n]);
    toks.forEach((w, k) => {
      if (!LETTRE.test(w)) return;
      const cle = cleMot(w);
      const m: MotAttendu = { i: out.length, s: v.s, a: v.a, k, texte: w, cle };
      if (avecBasmala && k < 4) m.facultatif = true;
      if (k <= (avecBasmala ? 4 : 0) && LETTRES_ISOLEES.has(cle)) m.lettres = true;
      out.push(m);
    });
  }
  return out;
}

// ------------------------------------------------------------------ alignement

export interface MotEntendu {
  w: string;
  /** confiance de la machine pour ce mot (0 à 1) */
  conf: number;
  /** instants (secondes) si le modèle les donne */
  t0?: number;
  t1?: number;
}

type Op =
  | { t: 'eg'; i: number; j: number; sim: number } // un mot attendu <-> un mot entendu
  | { t: 'fus'; i: number; j: number; n: number; sim: number } // 1 attendu <-> n entendus (يا أيها)
  | { t: 'sep'; i: number; n: number; j: number; sim: number } // n attendus <-> 1 entendu
  | { t: 'lettres'; i: number; j: number; n: number } // lettres isolées absorbant n mots entendus
  | { t: 'om'; i: number } // attendu absent
  | { t: 'aj'; j: number }; // entendu en plus

/** Seuils (calibrés par l'évaluation A5, docs/projet/ECOUTE_IA.md). */
export const SEUILS = {
  /** au-dessus : même mot */
  meme: 0.7,
  /** au-dessous : mot différent (entre les deux : doute, rien n'est signalé) */
  different: 0.45,
  /** confiance minimale de la machine pour signaler un mot remplacé ou ajouté */
  confMot: 0.8,
  /** confiance minimale d'un écart pour être montré */
  confEcart: 0.6,
  /** voix entendue (s) à la place d'un mot absent au-delà de laquelle on doute */
  voixDoute: 0.3,
  /** part minimale des mots attendus reconnus pour donner un résultat */
  couvertureMin: 0.5,
};

const costEg = (sim: number) => (sim >= SEUILS.meme ? (1 - sim) * 0.5 : 1.2 - sim);

/** Alignement de coût minimal (programmation dynamique). */
export function aligner(att: readonly MotAttendu[], ent: readonly MotEntendu[]): Op[] {
  const n = att.length;
  const m = ent.length;
  const cles = ent.map((e) => cleMot(e.w));
  const W = m + 1;
  const cost = new Float64Array((n + 1) * W).fill(Infinity);
  const from = new Int32Array((n + 1) * W).fill(-1);
  const kind = new Uint8Array((n + 1) * W);
  const simMemo = new Map<number, number>();
  const sim = (i: number, j: number) => {
    const key = i * W + j;
    let v = simMemo.get(key);
    if (v === undefined) {
      v = ressemblance(att[i]!.cle, cles[j]!);
      simMemo.set(key, v);
    }
    return v;
  };
  cost[0] = 0;
  const relax = (i: number, j: number, c: number, pi: number, pj: number, k: number) => {
    const x = i * W + j;
    if (c < cost[x]!) {
      cost[x] = c;
      from[x] = pi * W + pj;
      kind[x] = k;
    }
  };
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const c = cost[i * W + j]!;
      if (c === Infinity) continue;
      const a = att[i];
      if (a) {
        // absent : facultatif ou lettres isolées presque gratuits
        relax(i + 1, j, c + (a.facultatif ? 0.05 : a.lettres ? 0.1 : 1), i, j, 1);
        if (j < m) {
          if (a.lettres) {
            for (let k = 1; k <= 6 && j + k <= m; k++) relax(i + 1, j + k, c + 0.1, i, j, 10 + k);
          }
          relax(i + 1, j + 1, c + costEg(sim(i, j)), i, j, 2);
          // un mot écrit en un seul (يَٰٓأَيُّهَا) entendu en deux, ou l'inverse : seulement si c'est net et
          // que le mot seul ne suffit pas
          if (j + 1 < m && sim(i, j) < SEUILS.meme) {
            const s2 = ressemblance(a.cle, cles[j]! + cles[j + 1]!);
            if (s2 >= 0.85) relax(i + 1, j + 2, c + costEg(s2) + 0.15, i, j, 3);
          }
          const b = att[i + 1];
          if (b && sim(i, j) < SEUILS.meme) {
            const s3 = ressemblance(a.cle + b.cle, cles[j]!);
            if (s3 >= 0.85) relax(i + 2, j + 1, c + costEg(s3) + 0.15, i, j, 4);
          }
        }
      }
      if (j < m) relax(i, j + 1, c + 1, i, j, 5);
    }
  const ops: Op[] = [];
  let x = n * W + m;
  while (x > 0) {
    const p = from[x]!;
    const i = Math.floor(p / W);
    const j = p % W;
    const k = kind[x]!;
    if (k === 1) ops.push({ t: 'om', i });
    else if (k === 2) ops.push({ t: 'eg', i, j, sim: sim(i, j) });
    else if (k === 3)
      ops.push({ t: 'fus', i, j, n: 2, sim: ressemblance(att[i]!.cle, cles[j]! + cles[j + 1]!) });
    else if (k === 4)
      ops.push({
        t: 'sep',
        i,
        n: 2,
        j,
        sim: ressemblance(att[i]!.cle + att[i + 1]!.cle, cles[j]!),
      });
    else if (k === 5) ops.push({ t: 'aj', j });
    else ops.push({ t: 'lettres', i, j, n: k - 10 });
    x = p;
  }
  return ops.reverse();
}

// ------------------------------------------------------------------ écarts

export type TypeEcart = 'oublie' | 'ajoute' | 'remplace' | 'ordre' | 'verset_saute';
export type EtatMot = 'ok' | 'oublie' | 'remplace' | 'ordre' | 'doute' | 'non_recite';

export interface Ecart {
  type: TypeEcart;
  /** premier mot attendu concerné (pour « ajouté » : le mot APRÈS lequel le mot a été ajouté, -1 = au début) */
  i: number;
  /** dernier mot attendu concerné (groupe de mots oubliés, verset sauté) */
  fin: number;
  s: number;
  a: number;
  /** 0 à 1 */
  confiance: number;
}

export interface ResultatEcoute {
  /** « pas_compris » : la machine n'a pas assez bien entendu — elle ne dit rien d'autre (réessayer) */
  statut: 'resultat' | 'pas_compris';
  ecarts: Ecart[];
  /** état de chaque mot attendu (pour surligner le texte) */
  mots: EtatMot[];
  /** écarts possibles écartés faute de confiance (« je n'ai pas bien entendu » à ces endroits) */
  doutes: number;
  /** part des mots attendus (récités) reconnus */
  couverture: number;
  /** confiance globale (0 à 1) */
  confiance: number;
  /** premier et dernier mot attendu reconnus (le reste : non récité, jamais compté comme erreur) */
  debut: number;
  finRecitee: number;
}

/** Mots qu'un élève peut dire en plus sans faute : isti'ādha, basmala, āmīn, ṣadaqa-llāh… */
const AJOUTS_PERMIS = new Set(
  [
    'أعوذ',
    'بالله',
    'من',
    'الشيطان',
    'الرجيم',
    'بسم',
    'الله',
    'الرحمن',
    'الرحيم',
    'صدق',
    'العظيم',
  ].map(cleMot),
);
const AMIN = new Set(['آمين', 'امين', 'أمين'].map(cleMot));

function voixEntre(voix: ReadonlyArray<readonly [number, number]>, a: number, b: number): number {
  let s = 0;
  for (const [x, y] of voix) s += Math.max(0, Math.min(y, b) - Math.max(x, a));
  return s;
}

export interface OptionsComparaison {
  /** zones de voix (secondes) détectées dans l'audio */
  voix?: ReadonlyArray<readonly [number, number]>;
  /** suivi en direct : la fin est encore en cours (rien n'est signalé après le dernier mot reconnu) */
  enCours?: boolean;
}

/**
 * Compare ce qui a été entendu avec la portion attendue. Ne signale que des écarts SÛRS (confiance ≥
 * SEUILS.confEcart) ; tout le reste devient « doute ». Le début et la fin non récités ne sont jamais des erreurs.
 */
export function comparer(
  att: readonly MotAttendu[],
  ent: readonly MotEntendu[],
  opts: OptionsComparaison = {},
): ResultatEcoute {
  const ops = aligner(att, ent);
  const etat: EtatMot[] = att.map(() => 'non_recite');
  const okEnt = new Map<number, number>(); // mot attendu -> mot entendu reconnu
  for (const o of ops) {
    if (o.t === 'eg' && o.sim >= SEUILS.meme) okEnt.set(o.i, o.j);
    if (o.t === 'fus' && o.sim >= SEUILS.meme) okEnt.set(o.i, o.j);
    if (o.t === 'sep' && o.sim >= SEUILS.meme) {
      okEnt.set(o.i, o.j);
      okEnt.set(o.i + 1, o.j);
    }
  }
  const reconnus = [...okEnt.keys()].sort((x, y) => x - y);
  const vide: ResultatEcoute = {
    statut: 'pas_compris',
    ecarts: [],
    mots: etat,
    doutes: 0,
    couverture: 0,
    confiance: 0,
    debut: -1,
    finRecitee: -1,
  };
  if (reconnus.length < Math.min(3, att.filter((a) => !a.facultatif).length)) return vide;
  const debut = reconnus[0]!;
  const finR = reconnus[reconnus.length - 1]!;
  for (const o of ops)
    if ((o.t === 'lettres' || o.t === 'eg') && o.i >= debut && o.i <= finR) etat[o.i] = 'ok';
  for (const i of reconnus) etat[i] = 'ok';

  const voix = opts.voix;
  const confDe = (j: number | undefined) => (j === undefined ? 0 : (ent[j]?.conf ?? 0));
  /** mot entendu reconnu le plus proche avant / apr\u00E8s le mot attendu i */
  const voisinAvant = (i: number) => {
    for (let x = i - 1; x >= debut; x--) if (okEnt.has(x)) return okEnt.get(x);
    return undefined;
  };
  const voisinApres = (i: number) => {
    for (let x = i + 1; x <= finR; x++) if (okEnt.has(x)) return okEnt.get(x);
    return undefined;
  };

  type Cand = { type: TypeEcart; i: number; fin: number; conf: number; j?: number };
  const cands: Cand[] = [];
  const ajouts: Array<{ j: number; apres: number }> = [];
  let dernierI = -1;
  for (const o of ops) {
    if ('i' in o) dernierI = o.t === 'sep' ? o.i + 1 : o.i;
    if (o.t === 'aj') {
      ajouts.push({ j: o.j, apres: dernierI });
      continue;
    }
    if (o.i < debut || o.i > finR) continue;
    const a = att[o.i]!;
    if (a.facultatif || a.lettres) continue;
    if (o.t === 'om') {
      cands.push({ type: 'oublie', i: o.i, fin: o.i, conf: 1 });
    } else if (o.t === 'eg' && o.sim < SEUILS.meme) {
      if (o.sim < SEUILS.different) {
        cands.push({
          type: 'remplace',
          i: o.i,
          fin: o.i,
          conf: confDe(o.j) * (1 - o.sim * 0.5),
          j: o.j,
        });
      } else etat[o.i] = 'doute';
    }
  }

  // désordre : un mot « oublié » ici et le même mot « ajouté » tout près -> « ordre »
  const pris = new Set<number>();
  for (const c of cands) {
    if (c.type !== 'oublie' && c.type !== 'remplace') continue;
    for (const ad of ajouts) {
      if (pris.has(ad.j) || Math.abs(ad.apres - c.i) > 3) continue;
      if (ressemblance(att[c.i]!.cle, cleMot(ent[ad.j]!.w)) >= SEUILS.meme) {
        c.type = 'ordre';
        c.conf = ent[ad.j]!.conf;
        pris.add(ad.j);
        break;
      }
    }
    if (c.type === 'remplace' && c.j !== undefined) {
      // deux mots voisins remplacés l'un par l'autre
      for (const d of [-1, 1]) {
        const o = okEnt.get(c.i + d);
        const jj = c.j;
        const nb = att[c.i + d];
        if (nb && ressemblance(nb.cle, cleMot(ent[jj]!.w)) >= SEUILS.meme && o === undefined) {
          c.type = 'ordre';
          break;
        }
      }
    }
  }

  // oublis : confiance des voisins, et SILENCE à la place du mot (sinon : de la voix non comprise -> doute)
  const ecarts: Ecart[] = [];
  let doutes = 0;
  const groupes: Cand[] = [];
  for (const c of cands) {
    const g = groupes[groupes.length - 1];
    if (g && g.type === 'oublie' && c.type === 'oublie' && c.i === g.fin + 1) g.fin = c.i;
    else groupes.push({ ...c });
  }
  for (const c of groupes) {
    let conf = c.conf;
    if (c.type === 'oublie') {
      const av = voisinAvant(c.i);
      const ap = voisinApres(c.fin);
      conf = Math.min(confDe(av), confDe(ap));
      const e0 = av !== undefined ? ent[av] : undefined;
      const e1 = ap !== undefined ? ent[ap] : undefined;
      if (voix && e0?.t1 !== undefined && e1?.t0 !== undefined) {
        const v = voixEntre(voix, e0.t1 + 0.08, e1.t0 - 0.08);
        // des mots entendus non reconnus dans le trou : ils expliquent cette voix (remplacement, répétition)
        if (v > SEUILS.voixDoute) conf *= 0.3;
      }
    }
    if (c.type === 'remplace' && (c.conf < SEUILS.confMot * 0.9 || cleMot(ent[c.j!]!.w).length < 2))
      conf = 0;
    if (conf >= SEUILS.confEcart) {
      const a = att[c.i]!;
      ecarts.push({ type: c.type, i: c.i, fin: c.fin, s: a.s, a: a.a, confiance: round(conf) });
      for (let x = c.i; x <= c.fin; x++)
        etat[x] = c.type === 'ordre' ? 'ordre' : c.type === 'remplace' ? 'remplace' : 'oublie';
    } else {
      doutes++;
      for (let x = c.i; x <= c.fin; x++) etat[x] = 'doute';
    }
  }

  // ajouts : sûrs, hors répétition (l'élève reprend), hors formules permises, dans la partie récitée
  for (const ad of ajouts) {
    if (pris.has(ad.j)) continue;
    if (ad.apres < debut || ad.apres >= finR) continue;
    const e = ent[ad.j]!;
    const k = cleMot(e.w);
    if (k.length < 2) continue;
    if (AMIN.has(k)) continue;
    if (AJOUTS_PERMIS.has(k)) continue;
    let rep = false;
    for (let x = Math.max(0, ad.apres - 6); x <= Math.min(att.length - 1, ad.apres + 2); x++)
      if (ressemblance(att[x]!.cle, k) >= 0.6) rep = true;
    if (rep) continue;
    if (e.conf >= SEUILS.confMot && e.conf >= SEUILS.confEcart) {
      const a = att[Math.max(0, ad.apres)]!;
      ecarts.push({
        type: 'ajoute',
        i: ad.apres,
        fin: ad.apres,
        s: a.s,
        a: a.a,
        confiance: round(e.conf),
      });
    } else doutes++;
  }

  // verset entier oublié -> « verset sauté »
  for (const e of ecarts) {
    if (e.type !== 'oublie') continue;
    const duVerset = att.filter((m) => m.s === e.s && m.a === e.a && !m.facultatif && !m.lettres);
    if (duVerset.length && duVerset[0]!.i >= e.i && duVerset[duVerset.length - 1]!.i <= e.fin)
      e.type = 'verset_saute';
  }
  ecarts.sort((x, y) => x.i - y.i);

  const recitables = att.filter((m, i) => i >= debut && i <= finR && !m.facultatif && !m.lettres);
  const couverture = recitables.length
    ? recitables.filter((m) => okEnt.has(m.i)).length / recitables.length
    : 0;
  const confs = reconnus.map((i) => confDe(okEnt.get(i)));
  const confiance = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : 0;
  // trop d'écarts ou trop peu reconnu : sans doute un autre passage, du bruit, un micro lointain -> se taire
  const motsEnErreur = ecarts.reduce((s, e) => s + (e.fin - e.i + 1), 0);
  if (
    couverture < SEUILS.couvertureMin ||
    confiance < 0.5 ||
    (recitables.length >= 6 && motsEnErreur > recitables.length * 0.4)
  )
    return { ...vide, couverture: round(couverture), confiance: round(confiance) };
  if (opts.enCours) for (let x = finR + 1; x < att.length; x++) etat[x] = 'non_recite';
  return {
    statut: 'resultat',
    ecarts,
    mots: etat,
    doutes,
    couverture: round(couverture),
    confiance: round(confiance),
    debut,
    finRecitee: finR,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Nombre de mots à revoir (pour un message bienveillant : « 2 mots à revoir »). */
export function motsARevoir(r: ResultatEcoute): number {
  return r.ecarts.reduce((s, e) => s + (e.type === 'ajoute' ? 1 : e.fin - e.i + 1), 0);
}
