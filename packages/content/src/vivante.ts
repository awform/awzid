/**
 * Chantier A21 — « application vivante » : courtes animations (10 à 20 s) après chaque partie d'une leçon et
 * condensé animé (1 à 2 min) en fin de leçon, GÉNÉRÉS depuis les données des livres par six modèles
 * réutilisables : lettre, mot (+ image existante), structure (syllabes, ḥarakāt, phrase), dialogue (+ schéma),
 * règle/notion, récapitulatif (condensé + questions éclair). Aucune animation écrite à la main par page.
 *
 * Règles (vérifiées par les tests) :
 *  - AUCUN texte n'est écrit ici : chaque chaîne arabe d'une animation est une chaîne du livre, recopiée telle
 *    quelle, ou un morceau d'une chaîne du livre coupé à une espace (jamais normalisée, jamais retapée) ; ce
 *    module ne contient aucun caractère arabe ;
 *  - rien des parties « Coran » (versets, mots du Coran, tajwid) ni « adab/fiqh » (hadiths, versets cités) ;
 *    tout texte qui ressemble au Coran (signes du Muṣḥaf) est écarté ;
 *  - aucune image de personnage : seulement les illustrations d'objets déjà utilisées par les mots du livre ;
 *  - la voix (`say`) n'est qu'un texte du livre : le lecteur ne joue que le fichier audio existant de ce texte
 *    (clé du moteur des livres), jamais une synthèse.
 */
import { looksQuranic } from './audio-cle.js';

export type VivModel = 'lettre' | 'mot' | 'structure' | 'dialogue' | 'regle' | 'recap';
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
}

export const MOTION_MIN_MS = 10_000;
export const MOTION_MAX_MS = 20_000;
export const CONDENSE_MIN_MS = 60_000;
export const CONDENSE_MAX_MS = 120_000;
/** temps compté pour une question éclair dans la durée du condensé */
export const QUESTION_MS = 9_000;
export const QUESTIONS = 3;

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
/** écriture arabe (U+0600–U+06FF) */
export const ARABIC = new RegExp(`[${ch(0x600)}-${ch(0x6ff)}]`);
/** ponctuation finale laissée hors d'une case de schéma : . , ! ? et leurs formes arabes (U+061F, U+060C) */
const END_PUNCT = new RegExp(`[.,!?${ch(0x61f)}${ch(0x60c)}]+$`);

type Obj = Record<string, unknown>;
const str = (x: unknown): string | undefined =>
  typeof x === 'string' && x.trim() !== '' ? x : undefined;
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});
/** texte arabe utilisable : présent et sans signes du Muṣḥaf */
const arOk = (x: unknown): string | undefined => {
  const s = str(x);
  return s && !looksQuranic(s) ? s : undefined;
};
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
const plainLen = (s: string) => s.replace(/[[\]]/g, '').length;

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
  for (const b of raw.map(withMs)) {
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

/** Schéma d'une structure (« X … / Y … ») : partie fixe + case remplie par la suite d'une réplique. */
export function schemaParts(
  note: string,
  repliques: ReadonlyArray<{ ar?: string }>,
): Array<{ fixe: string; slot?: string }> | null {
  const parts = note
    .split(/\s[/|]\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Array<{ fixe: string; slot?: string }> = [];
  for (const p of parts) {
    const i = p.indexOf('…');
    if (i < 0) {
      out.push({ fixe: p });
      continue;
    }
    const fixe = p.slice(0, i).trim();
    if (!fixe) continue;
    // réplique qui commence par la partie fixe : la case reçoit le mot suivant, tel qu'écrit
    let slot: string | undefined;
    for (const r of repliques) {
      const ar = (r.ar ?? '').replace(/[[\]]/g, '');
      if (!ar.startsWith(fixe + ' ')) continue;
      const next = ar.slice(fixe.length + 1).split(' ')[0];
      // ponctuation finale (. , ! ? et leurs formes arabes U+061F, U+060C) laissée hors de la case
      slot = next?.replace(END_PUNCT, '') || undefined;
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
        const suite = str(it.suite);
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
    if (pool.length) pools.push(pool);
  }
  // une question par exercice, à tour de rôle, jusqu'à trois (variété des types)
  const out: VivQuestion[] = [];
  for (let round = 0; out.length < QUESTIONS && pools.some((p) => p.length > round); round++)
    for (const p of pools) if (p[round] && out.length < QUESTIONS) out.push(p[round]!);
  return out;
};

/**
 * Animations d'une leçon (projection ÉLÈVE reçue par l'application). Les leçons de sciences islamiques, de
 * lecture du Coran, les bilans et les examens n'en ont pas (renvoie une liste vide).
 */
export function buildVivante(
  lessonRaw: unknown,
  opts: VivOptions,
): { motions: VivMotion[]; condense: VivMotion | null } {
  const L = obj(lessonRaw);
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
  if (str(N.signe) || arOk(N.texte_ar))
    lect.push({
      k: 'regle',
      ...(str(N.signe) ? { signe: str(N.signe) } : {}),
      ...(arOk(N.texte_ar) ? { ar: arOk(N.texte_ar), say: [arOk(N.texte_ar)!] } : {}),
      ...(firstSentence(str(N.texte_fr)) ? { fr: firstSentence(str(N.texte_fr)) } : {}),
    });
  const syl = arr(R.syllabes)
    .map((s) => arOk(obj(s).ar))
    .filter((s): s is string => !!s);
  for (const c of chunks(syl, 3).slice(0, 2)) lect.push({ k: 'harakat', items: c, say: c });
  const ved = obj(R.vedette);
  if (arOk(ved.ar) && !R.non_prepare)
    lect.push({
      k: 'phrase',
      ar: arOk(ved.ar)!,
      say: [arOk(ved.ar)!],
      ...(str(ved.fr) ? { fr: str(ved.fr) } : {}),
    });
  if (!R.non_prepare)
    for (const pRaw of [...arr(R.phrases), ...arr(R.paragraphes)].slice(0, 3)) {
      const p = typeof pRaw === 'string' ? { ar: pRaw } : obj(pRaw);
      const ar = arOk(p.ar);
      if (ar) lect.push({ k: 'phrase', ar, say: [ar], ...(str(p.fr) ? { fr: str(p.fr) } : {}) });
    }
  push(fit(id('lecture'), 'lecture', 'structure', lect));

  // 3. MOT + IMAGE existante
  push(
    fit(
      id('mots'),
      'mots',
      'mot',
      arr(L.mots)
        .map(obj)
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
      const ar = arOk(r.ar);
      if (!ar) continue;
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
      arr(L.lexique)
        .map(obj)
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
  const retiens = arr(L.retiens).map(obj);
  const regles: Array<BeatBody> = retiens.length
    ? retiens
        .filter((r) => arOk(r.ar))
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

/** Toutes les chaînes arabes d'une animation (contrôle des tests : chacune vient du livre). */
export function arabicStrings(m: VivMotion): string[] {
  const out: string[] = [];
  const add = (s?: string) => s && ARABIC.test(s) && out.push(s);
  for (const b of m.beats) {
    b.say?.forEach(add);
    switch (b.k) {
      case 'lettre':
        add(b.l);
        add(b.nom);
        add(b.points);
        b.formes?.forEach(add);
        break;
      case 'mot':
      case 'phrase':
      case 'bulle':
        add(b.ar);
        if (b.k === 'bulle') add(b.qui);
        break;
      case 'harakat':
        b.items.forEach(add);
        break;
      case 'schema':
        for (const p of b.parts) [p.fixe, p.slot].forEach(add);
        break;
      case 'regle':
        add(b.signe);
        add(b.ar);
        add(b.l);
        break;
      case 'question':
        if (b.q.kind === 'premiere_lettre')
          [b.q.suite, b.q.reponse, ...b.q.options].forEach((s) => add(s));
        else if (b.q.kind === 'contient') [b.q.cible, b.q.ar].forEach(add);
        else [b.q.dit, ...b.q.options].forEach((s) => add(s));
        break;
    }
  }
  return out;
}
