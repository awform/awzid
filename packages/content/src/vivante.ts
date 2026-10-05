/**
 * Chantiers A21 / A21b — « application vivante » : courtes animations (10 à 20 s) après chaque partie d'une leçon
 * et condensé animé (1 à 2 min) en fin de leçon, GÉNÉRÉS depuis les données des livres par des modèles
 * réutilisables : lettre, mot (+ image existante), structure (syllabes, ḥarakāt, phrase), dialogue (+ schéma),
 * règle/notion, récapitulatif (condensé + questions éclair) ; et, seulement là où les données du livre le
 * permettent (A21b) : racine et schème, conjugaison, nombres, heure. Aucune animation écrite à la main par page.
 *
 * Règles (vérifiées par les tests sur TOUTES les leçons des livres d'arabe) :
 *  - AUCUN texte n'est écrit ici : chaque chaîne arabe d'une animation est une chaîne du livre, recopiée telle
 *    quelle, ou un morceau d'une chaîne du livre coupé à une espace ou à un séparateur du livre (jamais
 *    normalisée, jamais retapée) ; ce module ne contient aucun caractère arabe (codes seulement) ;
 *  - rien des parties « Coran » (versets, mots du Coran, tajwid) ni « adab/fiqh » (hadiths, versets cités) ;
 *    tout texte qui ressemble au Coran (signes du Muṣḥaf) est écarté ;
 *  - aucune image de personnage : seulement les illustrations d'objets déjà utilisées par les mots du livre ;
 *  - la voix (`say`) n'est qu'un texte entier du livre : le lecteur ne joue que le fichier audio existant de
 *    ce texte (clé du moteur des livres), jamais une synthèse ;
 *  - racine et schème : une décomposition n'est montrée que si elle se VÉRIFIE lettre à lettre (le mot du
 *    livre = le schème du livre dont f, ʿayn, lām sont remplacées par les trois lettres d'une racine écrite dans la
 *    leçon) ; conjugaison : seulement les tableaux du livre dont la terminaison est balisée `[..]` ; nombres :
 *    seulement les paires « chiffre ← mot » écrites par le livre ; heure : l'heure lue dans la traduction
 *    du livre (« 8 h 30 ») d'une phrase arabe du livre, dans une leçon sur l'heure.
 */
import { audioFileId, looksQuranic } from './audio-cle.js';
import { GARDE } from './vivante-garde.js';

export type VivModel =
  | 'lettre'
  | 'mot'
  | 'structure'
  | 'dialogue'
  | 'regle'
  | 'recap'
  | 'racine'
  | 'conjugaison'
  | 'nombre'
  | 'heure';
/** partie de la page de leçon après laquelle l'animation s'affiche */
export type VivSlot = 'lettres' | 'lecture' | 'mots' | 'dialogue' | 'lexique' | 'retiens' | 'fin';

export type VivQuestion =
  | {
      kind: 'premiere_lettre';
      img?: string;
      suite: string;
      options: string[];
      reponse: string;
      fr?: string;
    }
  | { kind: 'contient'; cible: string; ar: string; oui: boolean }
  | { kind: 'ecoute'; dit: string; options: string[] };

/** plage [début, fin[ d'une lettre (avec ses signes) dans un mot */
export type Span = [number, number];

/** temps d'une animation : `ms` durée, `say` textes du livre dont le fichier audio peut être joué */
export type VivBeat = BeatBody & { ms: number };
export type BeatBody = { say?: string[] } & (
  | {
      k: 'lettre';
      l: string;
      c: number;
      nom?: string;
      points?: string;
      pointsFr?: string;
      formes?: string[];
    }
  | { k: 'mot'; ar: string; fr?: string; img?: string }
  | { k: 'harakat'; items: string[] }
  | { k: 'phrase'; ar: string; fr?: string; note?: string }
  | { k: 'bulle'; ar: string; fr?: string; qui?: string; side: 0 | 1 }
  | { k: 'schema'; parts: Array<{ fixe: string; slot?: string }> }
  | { k: 'regle'; signe?: string; ar?: string; fr?: string; l?: string; c?: number }
  | { k: 'question'; q: VivQuestion }
  /** les trois lettres de la racine glissent dans le schème ; le mot du livre se forme (racine en couleur) */
  | {
      k: 'racine';
      racine: [string, string, string];
      moule: string;
      /** places de f, ʿayn, lām dans le schème */
      mpos: [Span, Span, Span];
      mot: string;
      /** places des lettres de la racine dans le mot */
      pos: [Span, Span, Span];
      fr?: string;
    }
  /** tableau de conjugaison du livre : pronom, puis radical, puis terminaison balisée [..] */
  | { k: 'conj'; rows: Array<{ p: string; w: string }> }
  /** chiffre du livre, quantité (points), puis le mot du livre */
  | { k: 'nombre'; chiffre: string; mot: string; n: number }
  /** horloge réglée sur l'heure de la traduction du livre, phrase arabe du livre */
  | { k: 'heure'; ar: string; fr?: string; h: number; m: number }
);

export interface VivMotion {
  id: string;
  slot: VivSlot;
  model: VivModel;
  beats: VivBeat[];
  /** durée prévue (sans les questions éclair, qui attendent la réponse) */
  ms: number;
}

export interface VivOptions {
  unitId: string;
  /** clés d'illustration disponibles (le lecteur ne montre que celles-ci) */
  images?: ReadonlySet<string> | readonly string[];
  /** le texte a-t-il un fichier audio ? (questions « écoute » seulement si oui) */
  hasAudio?: (text: string) => boolean;
  /** garde coranique (tests : liste recalculée) ; par défaut `vivante-garde.ts` */
  garde?: ReadonlySet<string>;
}

export const MOTION_MIN_MS = 10_000;
export const MOTION_MAX_MS = 20_000;
export const CONDENSE_MIN_MS = 60_000;
export const CONDENSE_MAX_MS = 120_000;
/** temps compté pour une question éclair dans la durée du condensé */
export const QUESTION_MS = 9_000;
export const QUESTIONS = 3;
/** nombre maximal de points pour montrer une quantité */
export const DOTS_MAX = 20;

/** personnages des livres : jamais montrés dans une animation (aucun visage, aucun personnage) */
const PERSONAS = new Set([
  'youssouf',
  'maryam',
  'fatou',
  'papa',
  'maman',
  'grandpere',
  'grandmere',
  'adam',
  'hadj',
  'aminata',
  'abdullah',
]);

// caractères désignés par leur code (le module ne contient aucun caractère arabe)
const ch = String.fromCharCode;
const cls = (...r: Array<[number, number] | number>) =>
  r.map((x) => (typeof x === 'number' ? ch(x) : `${ch(x[0])}-${ch(x[1])}`)).join('');
/** écriture arabe (U+0600–U+06FF) */
export const ARABIC = new RegExp(`[${cls([0x600, 0x6ff])}]`);
/** ponctuation finale laissée hors d'une case de schéma : . , ! ? et leurs formes arabes (U+061F, U+060C) */
const PUNCT_ONLY = new RegExp(`^[.,!?${cls(0x61f, 0x60c)}]+$`);
/** guillemets et ponctuation autour d'un mot (« » " ( ) : ; . , ! ? … et formes arabes U+061F U+060C U+061B) */
const EDGE = `[«»"():;.,!?…${cls(0x61f, 0x60c, 0x61b)}]`;
const TRIM = new RegExp(`^${EDGE}+|${EDGE}+$`, 'g');
/** signes (ḥarakāt U+064B–U+065F, alif suscrit U+0670, tatweel U+0640) */
const SIGN = new RegExp(`[${cls([0x64b, 0x65f], 0x670, 0x640)}]`);
/** lettre arabe (U+0621–U+064A, alif waṣla U+0671) */
const LETTER = new RegExp(`[${cls([0x621, 0x64a], 0x671)}]`);
/** chiffres (arabes orientaux U+0660–U+0669 ou occidentaux) */
const DIGITS = `[0-9${cls([0x660, 0x669])}]+`;
/** racine écrite en trois lettres séparées par une espace, entre deux non-lettres */
const ROOT = new RegExp(
  `(?<![${cls([0x621, 0x64a])}${cls([0x64b, 0x65f])}])([${cls([0x621, 0x64a])}]) ([${cls([0x621, 0x64a])}]) ([${cls([0x621, 0x64a])}])(?![${cls([0x621, 0x64a])}${cls([0x64b, 0x65f])}])`,
  'g',
);
/** séparateurs du livre entre deux entrées d'une même ligne */
const SEP = /\s+[|/●•·—–]\s+/;
/** séparateurs d'entrées, virgules comprises (virgule arabe U+060C) */
const ENTRY = new RegExp(`${SEP.source}|\\s*[,${cls(0x60c)}]\\s+`);
/** f, ʿayn, lām du schème (U+0641, U+0639, U+0644) */
const FAL = [ch(0x641), ch(0x639), ch(0x644)];
/** alif hamza / madda / waṣla → alif (comparaison seulement, jamais affiché) */
const ALIF = new RegExp(`[${cls(0x622, 0x623, 0x625, 0x671)}]`, 'g');
/** pronoms personnels détachés (squelettes, comparaison seulement) */
const PRONOMS = new Set(
  [
    [0x627, 0x646, 0x627],
    [0x646, 0x62d, 0x646],
    [0x627, 0x646, 0x62a],
    [0x627, 0x646, 0x62a, 0x645, 0x627],
    [0x627, 0x646, 0x62a, 0x645],
    [0x627, 0x646, 0x62a, 0x646],
    [0x647, 0x648],
    [0x647, 0x64a],
    [0x647, 0x645, 0x627],
    [0x647, 0x645],
    [0x647, 0x646],
  ].map((c) => ch(...c)),
);

type Obj = Record<string, unknown>;
const str = (x: unknown): string | undefined =>
  typeof x === 'string' && x.trim() !== '' ? x : undefined;
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});
const unmark = (s: string) => s.replace(/[[\]]/g, '');
/** toutes les chaînes d'une valeur, récursivement */
const allStr = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(allStr) : [];
const nWords = (s: string) => s.trim().split(/\s+/).length;
/**
 * Textes des parties « Coran » et « adab/fiqh » de la leçon en cours (sans balisage) : jamais animés, même
 * recopiés ailleurs dans la leçon (un hadith dans « je retiens », une invocation dans une réplique…).
 */
let sacred: Array<[string, number]> = [];
/**
 * Texte arabe utilisable : présent, sans signes du Muṣḥaf ni citation entre ﴿ ﴾ (U+FD3E, U+FD3F), et qui
 * n'est ni un texte des parties Coran et adab/fiqh, ni un morceau d'un tel texte, ni ne le contient.
 */
const arOk = (x: unknown): string | undefined => {
  const s = str(x);
  if (!s || looksQuranic(s) || /[\ufd3e\ufd3f]/.test(s)) return undefined;
  const u = unmark(s);
  const n = nWords(u);
  const hit = sacred.some(
    ([t, m]) => t === u || (n >= 3 && t.includes(u)) || (m >= 3 && u.includes(t)),
  );
  return n >= 2 && hit ? undefined : s;
};
/** empreintes (8 premiers chiffres hexadécimaux de la clé audio) des textes du livre qui citent le Coran */
let garde: ReadonlySet<string> = new Set();
const GARDE_SET = new Set(GARDE.split(' '));
/** clé d'une chaîne pour la garde coranique (même clé que les fichiers audio des livres) */
export const gardeKey = (s: string) => (audioFileId(s) ?? '').slice(0, 8);
/**
 * Garde de CHAQUE temps : toutes ses chaînes arabes passent `arOk` (Muṣḥaf, parties Coran et adab/fiqh) et
 * aucune n'est une citation du Coran relevée dans les livres (liste `vivante-garde.ts`, tenue à jour par le
 * test qui compare TOUTES les animations au texte Tanzil).
 */
const safe = (b: BeatBody) => beatStrings(b).every((s) => !!arOk(s) && !garde.has(gardeKey(s)));
/** au-delà, un texte ne se lit pas en quelques secondes : il reste dans la page, sans animation */
export const MAX_WORDS = 14;
const short = (s: string | undefined) => (s && nWords(unmark(s)) <= MAX_WORDS ? s : undefined);
/** première phrase d'un texte français long (coupée à un point suivi d'une espace) */
export function firstSentence(fr: string | undefined, max = 140): string | undefined {
  if (!fr) return undefined;
  if (fr.length <= max) return fr;
  const m = /^(.+?[.!?])\s/.exec(fr);
  return m && m[1]!.length <= max * 1.6 ? m[1] : undefined;
}
/** partie avant le premier « ; » d'une remarque française (points d'une lettre) */
const beforeSemi = (fr: string | undefined) => fr?.split(' ; ')[0];

const wordsOf = (s: string) => s.split(' ').filter(Boolean).length;
const plainLen = (s: string) => unmark(s).length;

/** durée d'un temps selon son modèle (lecture lente, adaptée aux enfants) */
function beatMs(b: BeatBody): number {
  switch (b.k) {
    case 'lettre':
      return 3200 + (b.formes?.length ? 800 : 0);
    case 'mot':
      return 2600;
    case 'harakat':
      return 1400 + 700 * b.items.length;
    case 'phrase':
      return Math.min(5000, 2200 + 350 * wordsOf(b.ar));
    case 'bulle':
      return Math.min(4200, 2000 + 60 * plainLen(b.ar));
    case 'schema':
      return 4200;
    case 'regle':
      return Math.min(5200, 3000 + (b.fr ? 15 * b.fr.length : 0));
    case 'question':
      return QUESTION_MS;
    case 'racine':
      return 4800;
    case 'conj':
      return 1600 + 1300 * b.rows.length;
    case 'nombre':
      return 2600 + 160 * Math.min(b.n, DOTS_MAX);
    case 'heure':
      return 4400;
  }
}

function withMs(b: BeatBody): VivBeat {
  return { ...b, ms: beatMs(b) } as VivBeat;
}

/**
 * Durée entre 10 et 20 s : on garde les premiers temps tant que la somme reste ≤ 20 s ; si la somme est
 * < 10 s, chaque temps est allongé dans la même proportion. null si rien n'est animable.
 */
function fit(id: string, slot: VivSlot, model: VivModel, raw: Array<BeatBody>) {
  const beats: VivBeat[] = [];
  let total = 0;
  for (const b of raw.filter(safe).map(withMs)) {
    if (total + b.ms > MOTION_MAX_MS) continue;
    beats.push(b);
    total += b.ms;
  }
  if (!beats.length) return null;
  if (total < MOTION_MIN_MS) {
    const f = MOTION_MIN_MS / total;
    for (const b of beats) b.ms = Math.ceil(b.ms * f);
    total = beats.reduce((s, b) => s + b.ms, 0);
  }
  return { id, slot, model, beats, ms: total } satisfies VivMotion;
}

/** Découpe un texte du livre en morceaux de n éléments (ordre du livre). */
const chunks = <T>(xs: T[], n: number) =>
  xs.reduce<T[][]>((a, x, i) => (i % n ? a[a.length - 1]!.push(x) : a.push([x]), a), []);

/** Schéma d'une structure (« X … / Y … — Z ») : partie fixe + case remplie par la suite d'une réplique. */
export function schemaParts(
  note: string,
  repliques: ReadonlyArray<{ ar?: string }>,
): Array<{ fixe: string; slot?: string }> | null {
  const parts = note
    .split(SEP)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);
  const out: Array<{ fixe: string; slot?: string }> = [];
  for (const p of parts) {
    const i = p.indexOf('…');
    const rest = i < 0 ? '' : p.slice(i + 1).trim();
    // une seule case, à la fin de la partie (ponctuation finale permise) ; sinon la partie telle qu'écrite
    if (i < 0 || p.includes('…', i + 1) || (rest && !PUNCT_ONLY.test(rest))) {
      out.push({ fixe: p });
      continue;
    }
    const fixe = p.slice(0, i).trim();
    if (!fixe) continue;
    // réplique qui commence par la partie fixe : la case reçoit le mot suivant, tel qu'écrit
    let slot: string | undefined;
    for (const r of repliques) {
      const ar = unmark(r.ar ?? '');
      if (!ar.startsWith(fixe + ' ')) continue;
      const next = ar.slice(fixe.length + 1).split(' ')[0];
      // ponctuation et guillemets laissés hors de la case
      slot = next?.replace(TRIM, '') || undefined;
      if (slot) break;
    }
    out.push({ fixe, ...(slot ? { slot } : {}) });
  }
  return out.length ? out : null;
}

const questionsOf = (lesson: Obj, opts: VivOptions, imgOk: (k?: string) => string | undefined) => {
  const pools: VivQuestion[][] = [];
  for (const exRaw of arr(lesson.exercices)) {
    const ex = obj(exRaw);
    if (ex.livre === 'ecriture') continue;
    const pool: VivQuestion[] = [];
    if (ex.type === 'premiere_lettre')
      for (const itRaw of arr(ex.items)) {
        const it = obj(itRaw);
        const suite = arOk(it.suite);
        const reponse = str(it.reponse);
        const options = arr(it.options).filter((o): o is string => typeof o === 'string');
        if (!suite || !reponse || !options.includes(reponse)) continue;
        const img = imgOk(str(it.img));
        pool.push({
          kind: 'premiere_lettre',
          suite,
          reponse,
          options,
          ...(img ? { img } : {}),
          ...(str(it.fr) ? { fr: str(it.fr) } : {}),
        });
      }
    if (ex.type === 'contient' && str(ex.cible))
      for (const mRaw of arr(ex.mots)) {
        const m = obj(mRaw);
        const ar = arOk(m.ar);
        if (ar && typeof m.oui === 'boolean')
          pool.push({ kind: 'contient', cible: str(ex.cible)!, ar, oui: m.oui });
      }
    if (ex.type === 'ecoute')
      for (const itRaw of arr(ex.items)) {
        const it = obj(itRaw);
        const dit = arOk(it.dit);
        const options = arr(it.options).filter((o): o is string => typeof o === 'string');
        if (dit && options.includes(dit) && opts.hasAudio?.(dit))
          pool.push({ kind: 'ecoute', dit, options });
      }
    const sur = pool.filter((q) => safe({ k: 'question', q }));
    if (sur.length) pools.push(sur);
  }
  // une question par exercice, à tour de rôle, jusqu'à trois (variété des types)
  const out: VivQuestion[] = [];
  for (let round = 0; out.length < QUESTIONS && pools.some((p) => p.length > round); round++)
    for (const p of pools) if (p[round] && out.length < QUESTIONS) out.push(p[round]!);
  return out;
};

// ————— A21b : outils des nouveaux modèles (lecture des chaînes du livre, rien d'ajouté) —————

/** lettres d'un mot (sans crochets) avec leur plage (lettre + signes qui la suivent) */
function lettersOf(w: string): Array<{ c: string; s: number; e: number }> {
  const out: Array<{ c: string; s: number; e: number }> = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i]!;
    if (SIGN.test(c)) {
      if (out.length) out[out.length - 1]!.e = i + 1;
    } else out.push({ c, s: i, e: i + 1 });
  }
  return out;
}
const skel = (w: string) =>
  lettersOf(unmark(w))
    .map((x) => x.c)
    .join('')
    .replace(ALIF, ch(0x627));

/**
 * Décomposition vérifiée d'un mot : schème (avec f, ʿayn, lām) dont les trois lettres, remplacées par celles de la
 * racine, redonnent le mot lettre à lettre. null sinon (racine faible, autre schème…).
 */
export function matchRoot(
  mot: string,
  moule: string,
  racine: readonly string[],
): { pos: [Span, Span, Span]; mpos: [Span, Span, Span] } | null {
  const w = lettersOf(mot);
  const m = lettersOf(moule);
  if (w.length !== m.length || racine.length !== 3) return null;
  const at = FAL.map((f) => m.flatMap((x, i) => (x.c === f ? [i] : [])));
  if (at.some((x) => x.length !== 1)) return null;
  const [a, b, c] = at.map((x) => x[0]!) as [number, number, number];
  if (!(a < b && b < c)) return null;
  const norm = (x: string) => x.replace(ALIF, ch(0x627));
  for (let i = 0; i < w.length; i++) {
    const want = i === a ? racine[0] : i === b ? racine[1] : i === c ? racine[2] : norm(m[i]!.c);
    if ((i === a || i === b || i === c ? w[i]!.c : norm(w[i]!.c)) !== want) return null;
  }
  if (!LETTER.test(mot) || skel(mot) === skel(moule)) return null;
  const sp = (x: { s: number; e: number }): Span => [x.s, x.e];
  return {
    pos: [sp(w[a]!), sp(w[b]!), sp(w[c]!)],
    mpos: [sp(m[a]!), sp(m[b]!), sp(m[c]!)],
  };
}

/** mots (morceaux coupés à une espace ou à un séparateur, ponctuation de bord retirée) d'une chaîne */
const tokensOf = (s: string) =>
  s
    .split(/\s+/)
    .map((t) => t.replace(TRIM, ''))
    .filter((t) => LETTER.test(t) && !/[0-9]/.test(t) && !/[←-⇿=+]/.test(t));

/** Racine et schème (A21b) : pour les leçons qui écrivent une racine et un schème (fāʿil, mafʿūl…). */
function racineBeats(
  texts: string[],
  glose: Map<string, string>,
): Array<Extract<BeatBody, { k: 'racine' }>> {
  const roots = new Map<string, [string, string, string]>();
  for (const s of texts)
    for (const m of s.matchAll(ROOT)) roots.set(m[1]! + m[2]! + m[3]!, [m[1]!, m[2]!, m[3]!]);
  if (!roots.size) return [];
  const toks = [...new Set(texts.flatMap((s) => tokensOf(unmark(s))))].filter(
    (t) => !looksQuranic(t),
  );
  const moules = toks.filter((t) => FAL.every((f) => lettersOf(t).some((x) => x.c === f)));
  const out: Array<Extract<BeatBody, { k: 'racine' }>> = [];
  const used = new Set<string>();
  for (const mot of toks) {
    if (moules.includes(mot) || used.has(skel(mot))) continue;
    for (const moule of moules)
      for (const r of roots.values()) {
        const hit = !used.has(skel(mot)) && matchRoot(mot, moule, r);
        if (!hit) continue;
        used.add(skel(mot));
        out.push({
          k: 'racine',
          racine: r,
          moule,
          mot,
          ...hit,
          ...(glose.get(mot) ? { fr: glose.get(mot) } : {}),
        });
      }
  }
  // variété : un schème après l'autre
  const by = new Map<string, typeof out>();
  for (const b of out) by.set(b.moule, [...(by.get(b.moule) ?? []), b]);
  const mix: typeof out = [];
  for (let i = 0; mix.length < out.length; i++)
    for (const l of by.values()) if (l[i]) mix.push(l[i]!);
  return mix.length >= 2 ? mix : [];
}

/** Conjugaison (A21b) : lignes « pronom + verbe » d'un tableau du livre dont la terminaison est balisée. */
function conjBeats(sources: string[][]): Array<Extract<BeatBody, { k: 'conj' }>> {
  let best: Array<{ p: string; w: string }> = [];
  let bestScore = 0;
  // le même verbe écrit ailleurs dans la leçon avec sa terminaison balisée (même mot, crochets en plus)
  const balise = new Map<string, string>();
  for (const s of sources.flat())
    for (const t of s.split(/\s+/))
      if (t.includes('[')) balise.set(unmark(t.replace(TRIM, '')), t.replace(TRIM, ''));
  for (const src of sources) {
    const rows: Array<{ p: string; w: string; stem: string }> = [];
    for (const s of src)
      for (const e of s.split(ENTRY)) {
        const t = e
          .trim()
          .split(/\s+/)
          .map((x) => x.replace(TRIM, ''));
        if (t.length !== 2) continue;
        // « pronom verbe » ou « verbe (pronom) »
        const [p, w0] = PRONOMS.has(skel(t[0]!)) ? [t[0]!, t[1]!] : [t[1]!, t[0]!];
        const w = w0.includes('[') ? w0 : (balise.get(w0) ?? w0);
        if (!PRONOMS.has(skel(p)) || !LETTER.test(w) || /[0-9]/.test(w)) continue;
        if (rows.some((r) => skel(r.p) === skel(p))) continue;
        rows.push({ p, w, stem: skel(w.replace(/\[[^\]]*\]/g, '')) });
      }
    // un seul verbe : le radical (hors terminaison balisée) le plus fréquent
    const count = new Map<string, number>();
    for (const r of rows) count.set(r.stem, (count.get(r.stem) ?? 0) + 1);
    const stem = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const kept = rows.filter((r) => r.stem === stem).map(({ p, w }) => ({ p, w }));
    const marked = kept.filter((r) => r.w.includes('[')).length;
    const score = kept.length >= 3 && marked >= 2 ? marked * 10 + kept.length : 0;
    if (score > bestScore) [best, bestScore] = [kept, score];
  }
  if (!best.length) return [];
  const per = Math.ceil(best.length / Math.ceil(best.length / 4));
  return chunks(best, per).map((rows) => ({ k: 'conj' as const, rows }));
}

const digitVal = (d: string) =>
  Number([...d].map((c) => (c >= '0' && c <= '9' ? c : String(c.charCodeAt(0) - 0x660))).join(''));

/** Nombres (A21b) : paires « chiffre ← mot » / « chiffre = mot » / « chiffre mot » écrites par le livre. */
function nombreBeats(texts: string[]): Array<Extract<BeatBody, { k: 'nombre' }>> {
  const W = `[^0-9${cls([0x660, 0x669])}←-⇿=+|/:]+`;
  const A = new RegExp(`^\\[?(${DIGITS})\\]?\\s*(?:(?:←|=)\\s*)?(${W})$`);
  const B = new RegExp(`^(${W}?)\\s*(?:←|=)\\s*\\[?(${DIGITS})\\]?$`);
  const out: Array<Extract<BeatBody, { k: 'nombre' }>> = [];
  const seen = new Set<number>();
  for (const s of texts)
    for (const e of s.split(ENTRY)) {
      const x = e.trim();
      const a = A.exec(x);
      const b = a ? null : B.exec(x);
      const chiffre = a?.[1] ?? b?.[2];
      const mot = unmark((a?.[2] ?? b?.[1] ?? '').trim()).replace(TRIM, '');
      if (!chiffre || !mot || !LETTER.test(mot) || looksQuranic(mot)) continue;
      const n = digitVal(chiffre);
      if (!Number.isFinite(n) || seen.has(n)) continue;
      seen.add(n);
      out.push({ k: 'nombre', chiffre, mot, n });
    }
  return out.length >= 3 ? out : [];
}

/** Heure (A21b) : phrase arabe du livre dont la traduction du livre donne une heure (« 8 h 30 »). */
function heureBeats(
  items: Array<{ ar?: string; fr?: string }>,
): Array<Extract<BeatBody, { k: 'heure' }>> {
  const out: Array<Extract<BeatBody, { k: 'heure' }>> = [];
  for (const it of items) {
    const ar = arOk(it.ar);
    const t = [...(it.fr ?? '').matchAll(/\b(\d{1,2}) ?h(?: ?([0-5]\d))?\b/g)];
    if (!ar || !LETTER.test(ar) || t.length !== 1) continue;
    const h = Number(t[0]![1]);
    const m = Number(t[0]![2] ?? 0);
    if (h > 24) continue;
    out.push({ k: 'heure', ar, fr: it.fr, h, m, say: [ar] });
  }
  return out.length >= 2 ? out : [];
}

/**
 * Animations d'une leçon (projection ÉLÈVE reçue par l'application). Les leçons de sciences islamiques, de
 * lecture du Coran, les bilans et les examens n'en ont pas (renvoie une liste vide).
 */
export function buildVivante(
  lessonRaw: unknown,
  opts: VivOptions,
): { motions: VivMotion[]; condense: VivMotion | null } {
  const L = obj(lessonRaw);
  garde = opts.garde ?? GARDE_SET;
  sacred = [...allStr(L.coran), ...allStr(L.fiqh_adab)]
    .filter((s) => ARABIC.test(s))
    .map((s) => [unmark(s).trim(), nWords(s)]);
  const id = (s: string) => `${opts.unitId}.viv.${s}`;
  const images = opts.images ? new Set(opts.images) : null;
  const dlg = obj(L.dialogue);
  const repliques = arr(dlg.repliques).map(obj);
  const banned = new Set(PERSONAS);
  for (const k of arr(obj(L.scene).persos)) if (typeof k === 'string') banned.add(k);
  for (const r of repliques)
    if (str(r.qui))
      banned.add(
        String(r.qui)
          .toLowerCase()
          .replace(/[^a-z]/g, ''),
      );
  const imgOk = (k?: string) => (k && !banned.has(k) && (!images || images.has(k)) ? k : undefined);
  const motions: VivMotion[] = [];
  const push = (m: VivMotion | null) => m && motions.push(m);

  // 1. LETTRE : chaque lettre se dessine, son nom, ses points, ses formes
  const lettres = arr(L.lettres).map(obj);
  push(
    fit(
      id('lettres'),
      'lettres',
      'lettre',
      lettres
        .filter((x) => str(x.l) && str(x.nom_ar))
        .map((x, i) => ({
          k: 'lettre' as const,
          l: x.l as string,
          c: i % 4,
          ...(arOk(x.nom_ar) ? { nom: arOk(x.nom_ar), say: [arOk(x.nom_ar)!] } : {}),
          ...(arOk(x.points_ar) ? { points: arOk(x.points_ar) } : {}),
          ...(beforeSemi(str(x.points_fr)) ? { pointsFr: beforeSemi(str(x.points_fr)) } : {}),
          ...(arr(x.formes).length
            ? { formes: arr(x.formes).filter((f): f is string => typeof f === 'string') }
            : {}),
        })),
    ),
  );

  // 2. STRUCTURE : notion (signe), syllabes (ḥarakāt mises en relief), mot vedette, phrases
  const R = obj(L.lecture);
  const N = obj(L.notion);
  const lect: Array<BeatBody> = [];
  const signe = arOk(N.signe);
  const nar = short(arOk(N.texte_ar));
  if (signe || nar)
    lect.push({
      k: 'regle',
      ...(signe ? { signe } : {}),
      ...(nar ? { ar: nar, say: [nar] } : {}),
      ...(firstSentence(str(N.texte_fr)) ? { fr: firstSentence(str(N.texte_fr)) } : {}),
    });
  const syl = arr(R.syllabes)
    .map((s) => short(arOk(obj(s).ar)))
    .filter((s): s is string => !!s);
  for (const c of chunks(syl, 3).slice(0, 2)) lect.push({ k: 'harakat', items: c, say: c });
  const ved = obj(R.vedette);
  // textes non préparés : jamais animés ; phrases (ou paragraphes) courtes seulement, dans l'ordre du livre
  if (!R.non_prepare)
    for (const pRaw of [ved, ...arr(R.phrases), ...arr(R.paragraphes)].slice(0, 4)) {
      const p = typeof pRaw === 'string' ? { ar: pRaw } : obj(pRaw);
      const ar = short(arOk(p.ar));
      if (ar) lect.push({ k: 'phrase', ar, say: [ar], ...(str(p.fr) ? { fr: str(p.fr) } : {}) });
    }
  push(
    fit(
      id('lecture'),
      'lecture',
      'structure',
      lect.filter((b) => b.k !== 'regle' || b.signe || b.ar),
    ),
  );

  // 2 bis (A21b). Modèles tirés des chaînes de la notion, de la lecture, de « je retiens » et des mots
  const mots = arr(L.mots).map(obj);
  const lexique = arr(L.lexique).map(obj);
  const retiens = arr(L.retiens).map(obj);
  const texts = [
    N.signe,
    N.texte_ar,
    N.texte_fr,
    L.decouvre_ar,
    ...arr(R.syllabes).map((s) => obj(s).ar),
    ...arr(R.ligne),
    ...retiens.flatMap((r) => [r.ar, r.fr]),
    ...mots.flatMap((w) => [w.ar, w.fr]),
    ...lexique.flatMap((w) => [w.ar, w.fr]),
  ].filter((s): s is string => !!str(s) && !looksQuranic(s as string));
  const glose = new Map<string, string>();
  for (const w of [...mots, ...lexique])
    if (str(w.ar) && str(w.fr) && !glose.has(unmark(w.ar as string)))
      glose.set(unmark(w.ar as string), w.fr as string);
  push(fit(id('racine'), 'lecture', 'racine', racineBeats(texts, glose)));
  const arOnly = (xs: unknown[]) => xs.filter((s): s is string => !!arOk(s));
  push(
    fit(
      id('conjugaison'),
      'lecture',
      'conjugaison',
      conjBeats([
        arOnly([N.texte_ar]),
        arOnly(retiens.map((r) => r.ar)),
        arOnly(arr(R.syllabes).map((s) => obj(s).ar)),
        arOnly(arr(R.ligne)),
      ]),
    ),
  );
  push(fit(id('nombres'), 'lecture', 'nombre', nombreBeats(texts.filter((s) => ARABIC.test(s)))));
  if (/heure/i.test(`${str(L.titre_fr) ?? ''} ${str(N.titre_fr) ?? ''}`))
    push(
      fit(
        id('heure'),
        'lecture',
        'heure',
        heureBeats(
          [ved, ...arr(R.phrases), ...retiens, ...lexique].map((x) => {
            const o = obj(x);
            return { ar: str(o.ar), fr: str(o.fr) };
          }),
        ),
      ),
    );

  // 3. MOT + IMAGE existante
  push(
    fit(
      id('mots'),
      'mots',
      'mot',
      mots
        .filter((w) => arOk(w.ar))
        .map((w) => ({
          k: 'mot' as const,
          ar: w.ar as string,
          say: [w.ar as string],
          ...(str(w.fr) ? { fr: str(w.fr) } : {}),
          ...(imgOk(str(w.img)) ? { img: imgOk(str(w.img)) } : {}),
        })),
    ),
  );

  // 4. DIALOGUE : bulles (formes géométriques, aucun personnage) + schéma de la structure
  if (repliques.length) {
    const sides: Record<string, 0 | 1> = {};
    let n = 0;
    const beats: Array<BeatBody> = [];
    const note = arOk(dlg.note_ar);
    const schema = note ? schemaParts(note, repliques as Array<{ ar?: string }>) : null;
    const budget = MOTION_MAX_MS - (schema ? beatMs({ k: 'schema', parts: [] }) : 0);
    let used = 0;
    for (const r of repliques) {
      const ar = short(arOk(r.ar));
      if (!ar) break;
      const who = str(r.qui) ?? '';
      if (!(who in sides)) sides[who] = (n++ % 2) as 0 | 1;
      const b = {
        k: 'bulle' as const,
        ar,
        side: sides[who]!,
        say: [ar],
        ...(str(r.fr) ? { fr: str(r.fr) } : {}),
        ...(arOk(r.qui_ar) ? { qui: arOk(r.qui_ar) } : {}),
      };
      if (used + beatMs(b) > budget) break;
      used += beatMs(b);
      beats.push(b);
    }
    if (schema) beats.push({ k: 'schema', parts: schema });
    push(fit(id('dialogue'), 'dialogue', 'dialogue', beats));
  }

  // 5. Lexique de la leçon (modèle « mot », sans image)
  push(
    fit(
      id('lexique'),
      'lexique',
      'mot',
      lexique
        .filter((x) => arOk(x.ar))
        .map((x) => ({
          k: 'mot' as const,
          ar: x.ar as string,
          say: [x.ar as string],
          ...(str(x.fr) ? { fr: str(x.fr) } : {}),
        })),
    ),
  );

  // 6. RÈGLE : « je retiens » (ou, à défaut, les points de chaque lettre)
  const regles: Array<BeatBody> = retiens.length
    ? retiens
        .filter((r) => short(arOk(r.ar)))
        .map((r) => ({
          k: 'regle' as const,
          ar: r.ar as string,
          say: [r.ar as string],
          ...(firstSentence(str(r.fr)) ? { fr: firstSentence(str(r.fr)) } : {}),
        }))
    : lettres
        .filter((x) => str(x.l) && arOk(x.points_ar))
        .map((x, i) => ({
          k: 'regle' as const,
          l: x.l as string,
          c: i % 4,
          ar: x.points_ar as string,
          say: [x.points_ar as string],
          ...(str(x.points_fr) ? { fr: beforeSemi(str(x.points_fr)) } : {}),
        }));
  push(fit(id('retiens'), 'retiens', 'regle', regles));

  // 7. RÉCAPITULATIF : condensé (temps clés de chaque animation) + 3 questions éclair
  const questions = questionsOf(L, opts, imgOk);
  let condense: VivMotion | null = null;
  if (motions.length) {
    const qms = questions.length * QUESTION_MS;
    const picked: Array<{ b: VivBeat; m: number; r: number }> = [];
    let total = qms;
    // tour à tour, un temps de chaque animation (deux tours, puis d'autres tant que < 1 min), ≤ 2 min
    for (let round = 0; motions.some((m) => m.beats.length > round); round++) {
      if (round >= 2 && total >= CONDENSE_MIN_MS) break;
      motions.forEach((m, mi) => {
        const b = m.beats[round];
        if (!b || total + b.ms > CONDENSE_MAX_MS) return;
        picked.push({ b: { ...b }, m: mi, r: round });
        total += b.ms;
      });
    }
    // ordre de la leçon : les temps de chaque partie restent groupés
    picked.sort((a, b) => a.m - b.m || a.r - b.r);
    const beats: VivBeat[] = picked.map((x) => x.b);
    for (const q of questions) beats.push({ k: 'question', q, ms: QUESTION_MS });
    condense = { id: id('condense'), slot: 'fin', model: 'recap', beats, ms: total };
  }
  return { motions, condense };
}

/** Chaînes arabes d'un temps (contrôle : chacune vient du livre, aucune n'est sacrée). */
export function beatStrings(b: BeatBody): string[] {
  const out: string[] = [];
  const add = (s?: string) => s && ARABIC.test(s) && out.push(s);
  b.say?.forEach(add);
  switch (b.k) {
    case 'lettre':
      [b.l, b.nom, b.points, ...(b.formes ?? [])].forEach(add);
      break;
    case 'mot':
    case 'phrase':
    case 'heure':
      add(b.ar);
      break;
    case 'bulle':
      [b.ar, b.qui].forEach(add);
      break;
    case 'harakat':
      b.items.forEach(add);
      break;
    case 'schema':
      for (const p of b.parts) [p.fixe, p.slot].forEach(add);
      break;
    case 'regle':
      [b.signe, b.ar, b.l].forEach(add);
      break;
    case 'racine':
      [...b.racine, b.moule, b.mot].forEach(add);
      break;
    case 'conj':
      for (const r of b.rows) [r.p, r.w].forEach(add);
      break;
    case 'nombre':
      [b.chiffre, b.mot].forEach(add);
      break;
    case 'question':
      if (b.q.kind === 'premiere_lettre') [b.q.suite, b.q.reponse, ...b.q.options].forEach(add);
      else if (b.q.kind === 'contient') [b.q.cible, b.q.ar].forEach(add);
      else [b.q.dit, ...b.q.options].forEach(add);
      break;
  }
  return out;
}

/** Toutes les chaînes arabes d'une animation (contrôle des tests : chacune vient du livre). */
export const arabicStrings = (m: VivMotion): string[] => m.beats.flatMap(beatStrings);
