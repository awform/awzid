/**
 * PRONONCIATION (21/10/2026, 3e amélioration du tuteur) : « le tuteur est là pour aider l'élève à bien parler ».
 *
 * À l'oral, le modèle rend (schéma CONV_SCHEMA) :
 *  - `entendu_litteral` : les sons RÉELLEMENT entendus, lettre par lettre, sans correction ;
 *  - `transcription_ar` : la phrase que l'élève voulait dire ;
 *  - `prononciation` : les mots où un son a été nettement remplacé ({ entendu, correct }).
 *
 * L'APPLICATION décide seule de ce qui est montré, avec la règle « mieux vaut se taire qu'accuser à tort » : une
 * remarque n'est faite que si TOUT concorde —
 *  1. le mot entendu figure dans `entendu_litteral`, le mot juste dans `transcription_ar` ;
 *  2. le mot juste est un mot du livre (mots déjà vus ou dialogue de la leçon) ;
 *  3. la différence entre les deux, lettre par lettre, est UNE confusion connue (ح/ه, ع/ء, ق/ك, ص/س, ط/ت, ض/د,
 *     ظ/ذ/ز, ث/س, خ/ه, غ/ر — répétée au besoin dans le mot, comme تَمَاتِم pour طَمَاطِم), OU une voyelle longue
 *     (ا, و, ي) ajoutée ou omise, OU une shadda omise ; toute autre différence = doute, rien n'est dit.
 * Le texte de la remarque est écrit par l'application (modèle de phrase ci-dessous), jamais par le modèle : court,
 * bienveillant, il donne le bon modèle. Une seule remarque par tour. L'élève voit le mot JUSTE (mot du livre), jamais
 * ce que le modèle a cru entendre.
 */
import { bareWords, type QuranIndex } from '../arabic.js';
import type { Audience } from '../types.js';
import { classerEntree, contientCoran } from './garde.js';
import type {
  ConvSortieFournisseur,
  MotNiveau,
  PrononBrouillon,
  PrononFournisseur,
  Replique,
} from './types.js';

export interface RemarquePrononciation {
  /** le mot juste, vocalisé (mot du livre) */
  correct: string;
  /** le son attendu (lettre), ou « voyelle_longue », « voyelle_breve », « shadda » */
  son: string;
  /** le son entendu à la place (lettre), si c'est une confusion de lettres */
  entendu?: string;
  /** une phrase en français, écrite par l'application */
  explication_fr: string;
}

/** Paires de sons confondus (lettres de base ; ء couvre toutes les hamzas et l'alif initial). */
export const CONFUSIONS: ReadonlyArray<readonly [string, string]> = [
  ['ح', 'ه'],
  ['ع', 'ء'],
  ['ق', 'ك'],
  ['ص', 'س'],
  ['ط', 'ت'],
  ['ض', 'د'],
  ['ظ', 'ذ'],
  ['ظ', 'ز'],
  ['ذ', 'ز'],
  ['ث', 'س'],
  ['خ', 'ه'],
  ['غ', 'ر'],
];
const confondus = (a: string, b: string) =>
  CONFUSIONS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** Comment dire le son JUSTE (phrase de l'application, en français ; une lettre arabe isolée au plus). */
export const MODELES_SON: Record<string, string> = {
  ح: 'un h fort et soufflé, la gorge serrée, plus appuyé que le ه',
  ه: 'un h léger, simplement soufflé',
  ع: 'un son serré qui vient du milieu de la gorge, pas un simple arrêt de la voix',
  ء: 'un petit arrêt net de la voix, sans serrer la gorge',
  ق: 'un k prononcé tout au fond de la bouche, contre la luette',
  ك: 'un k ordinaire, comme en français',
  ص: 'un s emphatique : la langue plus lourde, la voix plus grave',
  س: 'un s léger, comme en français',
  ط: 'un t emphatique : la langue plus lourde, la voix plus grave',
  ت: 'un t léger, comme en français',
  ض: 'un d emphatique : la langue plus lourde, la voix plus grave',
  د: 'un d léger, comme en français',
  ظ: 'le « th » anglais de « this », mais emphatique, la langue entre les dents',
  ذ: 'le « th » anglais de « this », la langue entre les dents',
  ز: 'un z comme en français',
  ث: 'le « th » anglais de « think », la langue entre les dents',
  خ: 'un son raclé au fond de la gorge, comme la jota espagnole',
  غ: 'un r grasseyé du fond de la gorge, comme le r français',
  ر: 'un r roulé du bout de la langue',
};

const HARAKAT = /[ً-ِْ-ٰٟۡـ]/g;
const SHADDA = 'ّ';
const HAMZAS = /[أإآؤئءٱ]/g;
const LONGUES = new Set(['ا', 'و', 'ي']);

/**
 * Forme « sons » d'un mot : lettres seules (voyelles brèves retirées, shadda gardée), hamzas et alif initial réunis
 * en ء, ى → ا, tanwīn final retiré (avec l'alif qui le porte, ou le « ن » d'un tanwīn écrit comme il s'entend).
 */
export function formeSons(mot: string, tanwinOreille = false): string {
  let m = mot.trim();
  // tanwīn final : « ـًا », « ـً », « ـٌ », « ـٍ », ou écrit à l'oreille « ـَنْ / ـُنْ / ـِنْ »
  m = m.replace(/[ًٌٍ]ا?$/, '').replace(/اً$/, '');
  if (tanwinOreille) m = m.replace(/[َُِ]نْ$/, '');
  m = m.replace(HARAKAT, '').replace(HAMZAS, 'ء').replace(/ى/g, 'ا').replace(/^ا/, 'ء');
  // shadda : gardée juste après sa lettre (déjà le cas en NFC), autre signe : retiré
  return [...m].filter((c) => /[ء-ي]/.test(c) || c === SHADDA).join('');
}

/** Lettres sans shadda. */
const lettres = (s: string) => s.replace(new RegExp(SHADDA, 'g'), '');

/**
 * Différence de prononciation entre ce qui a été entendu et le mot juste, ou null si elle n'est pas UNE confusion
 * connue (doute : on se tait).
 */
export function differenceSon(
  entendu: string,
  correct: string,
): Pick<RemarquePrononciation, 'son' | 'entendu'> | null {
  // le tanwīn du mot juste peut avoir été écrit « à l'oreille » (غَدًا entendu « رَدَنْ »)
  const c = formeSons(correct);
  const e = formeSons(entendu, /[\u064B\u064C\u064D]ا?$|ا\u064B$/.test(correct.trim()));
  if (!e || !c || e === c) return null;
  const le = lettres(e);
  const lc = lettres(c);
  if (le.length === lc.length) {
    if (le === lc) {
      // mêmes lettres : seule une shadda OMISE est une faute nette (une shadda en trop se lit mal sur la dictée)
      const sc = (c.match(new RegExp(SHADDA, 'g')) ?? []).length;
      const se = (e.match(new RegExp(SHADDA, 'g')) ?? []).length;
      return sc === se + 1 ? { son: 'shadda' } : null;
    }
    // substitutions : toutes du MÊME couple de sons (طَمَاطِم → تَمَاتِم)
    let couple: [string, string] | null = null;
    for (let i = 0; i < lc.length; i++) {
      if (le[i] === lc[i]) continue;
      const k: [string, string] = [lc[i]!, le[i]!];
      if (!confondus(k[0], k[1])) return null;
      if (couple && (couple[0] !== k[0] || couple[1] !== k[1])) return null;
      couple = k;
    }
    return couple ? { son: couple[0], entendu: couple[1] } : null;
  }
  // voyelle longue ajoutée ou omise (une lettre ا, و ou ي, jamais en fin de mot)
  const [long, court] =
    lc.length === le.length + 1 ? [lc, le] : le.length === lc.length + 1 ? [le, lc] : [null, null];
  if (!long || !court) return null;
  for (let i = 0; i < long.length - 1; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === court && LONGUES.has(long[i]!) && i > 0)
      return { son: long === lc ? 'voyelle_longue' : 'voyelle_breve' };
  }
  return null;
}

/** Phrase de la remarque (application) : courte, bienveillante, elle donne le bon modèle. */
export function explicationPrononciation(son: string): string {
  if (son === 'voyelle_longue')
    return 'Ce mot se dit avec une voyelle longue : on la tient deux temps au lieu d’un.';
  if (son === 'voyelle_breve') return 'Ce mot se dit avec une voyelle brève, sans l’allonger.';
  if (son === 'shadda')
    return 'Ce mot se dit avec une lettre doublée (shadda) : on appuie dessus un peu plus longtemps.';
  const m = MODELES_SON[son];
  return m ? `Ce mot se dit avec un ${son} : ${m}.` : '';
}

/** Formes nues (avec et sans préfixes courants) des mots du livre, pour vérifier que le mot juste en est un. */
function motsDuLivre(mots: readonly MotNiveau[], dialogue: readonly Replique[]): Set<string> {
  const s = new Set<string>();
  const ajouter = (w: string) => {
    s.add(w);
    s.add(w.replace(/^(وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك)/, ''));
  };
  for (const m of mots) for (const w of bareWords(m.ar)) ajouter(w);
  for (const r of dialogue) for (const w of bareWords(r.ar)) ajouter(w);
  return s;
}
const connu = (livre: Set<string>, mot: string) => {
  const w = bareWords(mot)[0] ?? '';
  return !!w && (livre.has(w) || livre.has(w.replace(/^(وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك)/, '')));
};
const contient = (phrase: string, mot: string) => {
  const w = bareWords(mot);
  return w.length === 1 && bareWords(phrase).includes(w[0]!);
};

/**
 * Remarque de prononciation à montrer (une au plus), ou null. Toutes les conditions de l'en-tête doivent tenir ;
 * la première faute valide de la liste du modèle est retenue.
 */
export function remarquePrononciation(o: {
  entenduLitteral: string;
  transcription: string;
  fautes: ReadonlyArray<{ entendu: string; correct: string }>;
  mots: readonly MotNiveau[];
  dialogue: readonly Replique[];
}): RemarquePrononciation | null {
  if (!o.entenduLitteral || !o.fautes.length) return null;
  const livre = motsDuLivre(o.mots, o.dialogue);
  for (const f of o.fautes.slice(0, 2)) {
    if (bareWords(f.entendu).length !== 1 || bareWords(f.correct).length !== 1) continue;
    if (!contient(o.entenduLitteral, f.entendu)) continue;
    if (!contient(o.transcription, f.correct)) continue;
    if (!connu(livre, f.correct)) continue;
    const d = differenceSon(f.entendu, f.correct);
    if (!d) continue;
    const explication_fr = explicationPrononciation(d.son);
    if (!explication_fr) continue;
    return { correct: f.correct.trim(), ...d, explication_fr };
  }
  return null;
}

// ------------------------------------------------------------------ 28/10/2026 : appel dédié, paires difficiles

/**
 * Paires DIFFICILES : le modèle ne les entend pas de façon fiable (21/10/2026 : ع/ء, ق/ك, ص/س jamais repérés, il
 * « entend » le mot attendu). Aucune remarque n'est faite sur elles (ni sur la shadda, jamais repérée) : à la place,
 * un CONSEIL D'ÉCOUTE prudent, qui n'accuse pas (« écoute la différence »), avec une paire minimale tirée des livres
 * (fiches makhārij du 25/10/2026, mots copiés des leçons ; mots sans sens religieux).
 */
export const PAIRES_ECOUTE: Readonly<
  Record<string, { autre: string; paire: readonly [MotNiveau, MotNiveau] }>
> = {
  // ad1 l25 (fiche 03)
  ق: {
    autre: 'ك',
    paire: [
      { ar: 'قَلْبٌ', fr: 'cœur' },
      { ar: 'كَلْبٌ', fr: 'chien' },
    ],
  },
  // ad1 l25 (fiche 02)
  ع: {
    autre: 'ء',
    paire: [
      { ar: 'عَلَمٌ', fr: 'drapeau' },
      { ar: 'أَلَمٌ', fr: 'douleur' },
    ],
  },
  // ad1 l25 (fiche 04)
  ص: {
    autre: 'س',
    paire: [
      { ar: 'صَيْفٌ', fr: 'été' },
      { ar: 'سَيْفٌ', fr: 'épée' },
    ],
  },
  // en1 l16 (fiche 01) : noms des deux lettres
  ح: {
    autre: 'ه',
    paire: [
      { ar: 'حَاءٌ', fr: 'nom de la lettre ح' },
      { ar: 'هَاءٌ', fr: 'nom de la lettre ه' },
    ],
  },
};
/** Ordre de priorité du conseil (une seule paire par tour). */
const ORDRE_CONSEIL = ['ق', 'ع', 'ص', 'ح'] as const;
/** Différences jamais signalées comme faute (détection non fiable) : conseil d'écoute ou silence. */
export const PAIRES_DIFFICILES: ReadonlyArray<readonly [string, string]> = [
  ['ع', 'ء'],
  ['ق', 'ك'],
  ['ص', 'س'],
];
export const estDifficile = (d: Pick<RemarquePrononciation, 'son' | 'entendu'>): boolean =>
  d.son === 'shadda' ||
  d.son === 'voyelle_breve' ||
  PAIRES_DIFFICILES.some(
    ([x, y]) => (d.son === x && d.entendu === y) || (d.son === y && d.entendu === x),
  );

export interface ConseilEcoute {
  /** le son du mot dit par l'élève (lettre) */
  son: string;
  /** le son voisin avec lequel on le confond */
  autre: string;
  /** le mot du livre, vocalisé, où se trouve ce son */
  mot: string;
  /** paire minimale à écouter (mots des livres) */
  paire: readonly [MotNiveau, MotNiveau];
  explication_fr: string;
}

export interface IssuePrononciation {
  remarque: RemarquePrononciation | null;
  conseil: ConseilEcoute | null;
  filtre: Array<{ step: string; action: 'ok' | 'bloque' | 'ecarte'; detail?: string }>;
}

/** Brouillon de l'appel de prononciation, validé (sinon null : rien n'est dit). */
export function validerPrononBrouillon(x: unknown): PrononBrouillon | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (Object.keys(o).some((k) => !['entendu', 'voulu', 'fautes'].includes(k))) return null;
  if (typeof o.entendu !== 'string' || typeof o.voulu !== 'string') return null;
  if (o.entendu.length > 400 || o.voulu.length > 400) return null;
  if (!Array.isArray(o.fautes) || o.fautes.length > 3) return null;
  const fautes: PrononBrouillon['fautes'] = [];
  for (const f of o.fautes as Array<Record<string, unknown>>) {
    if (typeof f?.entendu !== 'string' || typeof f?.correct !== 'string') return null;
    if (f.entendu.length > 60 || f.correct.length > 60) return null;
    fautes.push({ entendu: f.entendu, correct: f.correct });
  }
  return { entendu: o.entendu, voulu: o.voulu, fautes };
}

/**
 * GARDE-FOU (28/10/2026, batterie réelle) : Flash-Lite laisse parfois la transcription VIDE à l'oral (3 fois sur 3 sur
 * « quelqu'un d'internet veut me rencontrer ») ; le classement de ce qu'a dit l'élève (religion, protection…) serait
 * aveugle. Dans ce cas SEULEMENT, on attend l'appel de prononciation (lancé en parallèle, gemini-3.8-flash) et sa
 * « phrase voulue » sert de transcription. Sans elle, le tour reste jugé sur la sortie du modèle (filtres).
 */
export async function completerTranscription(
  out: ConvSortieFournisseur,
  prononciation: Promise<ConvSortieFournisseur | null> | null,
): Promise<{ out: ConvSortieFournisseur; complete: boolean }> {
  const b = out.brouillon as Record<string, unknown> | null;
  if (out.status !== 'ok' || !prononciation || !b || typeof b !== 'object' || Array.isArray(b))
    return { out, complete: false };
  if (typeof b.transcription_ar === 'string' && b.transcription_ar.trim())
    return { out, complete: false };
  const r = await prononciation;
  const pb = r && r.status === 'ok' ? validerPrononBrouillon(r.brouillon) : null;
  if (!pb?.voulu.trim()) return { out, complete: false };
  return { out: { ...out, brouillon: { ...b, transcription_ar: pb.voulu } }, complete: true };
}

/** Forme VOCALISÉE du livre d'un mot (même forme nue), pour que l'élève voie le mot du livre. */
function formeDuLivre(
  mots: readonly MotNiveau[],
  dialogue: readonly Replique[],
  mot: string,
): string | null {
  const cible = bareWords(mot)[0];
  if (!cible) return null;
  for (const t of [...mots.map((m) => m.ar), ...dialogue.map((r) => r.ar)])
    for (const w of t.split(/[\s،,.؟?!:;«»"]+/))
      if (w && bareWords(w).length === 1 && bareWords(w)[0] === cible) return w;
  return null;
}

/**
 * Issue de l'appel de prononciation (oral, réponse NORMALE de la conversation seulement) : une remarque vérifiée
 * (paires fiables : ح/ه, ط/ت, ض/د, ظ/ذ/ز, ث/س, خ/ه, غ/ر, voyelle longue), sinon au plus un conseil d'écoute pour une
 * paire difficile présente dans un mot du livre que l'élève voulait dire. Garde-fous : si la phrase voulue ou les sons
 * entendus touchent un sujet refusé (religion, Coran…), RIEN n'est montré.
 */
export function issuePrononciation(
  out: Pick<ConvSortieFournisseur, 'status' | 'brouillon' | 'detail'>,
  o: {
    mots: readonly MotNiveau[];
    dialogue: readonly Replique[];
    index: QuranIndex;
    audience: Audience;
  },
): IssuePrononciation {
  const vide = (
    step: string,
    action: 'bloque' | 'ecarte',
    detail?: string,
  ): IssuePrononciation => ({
    remarque: null,
    conseil: null,
    filtre: [{ step, action, ...(detail ? { detail } : {}) }],
  });
  if (out.status !== 'ok')
    return vide('prononciation', 'ecarte', `${out.status}:${out.detail ?? ''}`);
  const b = validerPrononBrouillon(out.brouillon);
  if (!b) return vide('prononciation', 'ecarte', 'schema');
  for (const t of [b.voulu, b.entendu])
    if (contientCoran(t, o.index) || classerEntree(t, o.audience) !== 'normal')
      return vide('prononciation', 'bloque', 'sujet');
  const filtre: IssuePrononciation['filtre'] = [];
  const r = remarquePrononciation({
    entenduLitteral: b.entendu,
    transcription: b.voulu,
    fautes: b.fautes,
    mots: o.mots,
    dialogue: o.dialogue,
  });
  if (r && !estDifficile(r)) {
    const livre = formeDuLivre(o.mots, o.dialogue, r.correct);
    filtre.push({ step: 'prononciation', action: 'ok', detail: r.son });
    return { remarque: livre ? { ...r, correct: livre } : r, conseil: null, filtre };
  }
  if (b.fautes.length)
    filtre.push({
      step: 'prononciation',
      action: 'ecarte',
      detail: r ? `difficile:${r.son}` : 'doute',
    });
  // conseil d'écoute : premier son difficile (ordre de priorité) présent dans un mot du livre de la phrase voulue
  const livre = motsDuLivre(o.mots, o.dialogue);
  const motsVoulus = b.voulu.split(/[\s،,.؟?!:;«»"]+/).filter((w) => bareWords(w).length === 1);
  for (const son of ORDRE_CONSEIL) {
    const w = motsVoulus.find((m) => connu(livre, m) && formeSons(m).includes(son));
    if (!w) continue;
    const p = PAIRES_ECOUTE[son]!;
    const mot = formeDuLivre(o.mots, o.dialogue, w) ?? w;
    filtre.push({ step: 'conseil_ecoute', action: 'ok', detail: son });
    return {
      remarque: null,
      conseil: {
        son,
        autre: p.autre,
        mot,
        paire: p.paire,
        explication_fr: `Écoute la différence entre ${son} et ${p.autre} : ${MODELES_SON[son]}. Répète les deux mots, puis le mot de ta phrase.`,
      },
      filtre,
    };
  }
  return { remarque: null, conseil: null, filtre };
}

/**
 * Pour le fournisseur SIMULÉ (tests, démonstration) : fautes de prononciation d'une phrase par rapport aux mots du
 * livre (même règle que l'application, à l'envers).
 */
export function fautesSimulees(
  dit: string,
  mots: readonly MotNiveau[],
  dialogue: readonly Replique[],
): Array<{ entendu: string; correct: string }> {
  const vocalises = [...mots.map((m) => m.ar), ...dialogue.map((r) => r.ar)]
    .flatMap((t) => t.split(/[\s،,.؟?!:;]+/))
    .filter((w) => bareWords(w).length === 1);
  const out: Array<{ entendu: string; correct: string }> = [];
  for (const w of dit.split(/[\s،,.؟?!:;]+/).filter((x) => bareWords(x).length === 1)) {
    if (vocalises.some((v) => formeSons(v) === formeSons(w))) continue;
    const juste = vocalises.find((v) => differenceSon(w, v));
    if (juste) out.push({ entendu: w, correct: juste });
    if (out.length >= 2) break;
  }
  return out;
}

/** Phrase voulue (simulé) : les fautes remplacées par les mots justes. */
export function phraseVoulueSimulee(
  dit: string,
  fautes: ReadonlyArray<{ entendu: string; correct: string }>,
): string {
  return fautes.reduce((p, f) => p.replace(f.entendu, f.correct), dit);
}

/**
 * Appel de prononciation SIMULÉ (tests, démonstration) : l'audio « SIMULE:<phrase> » est entendu tel quel ; les
 * fautes sont celles que la règle de l'application reconnaît par rapport au dialogue de la leçon (lu dans l'invite).
 */
export class PrononciationSimulee implements PrononFournisseur {
  readonly name = 'simule';
  readonly real = false;
  constructor(readonly modele = 'gemini-3.8-flash') {}
  async ecouter(
    systeme: string,
    audio: { mime: string; data: Buffer },
    ctx?: { mots: readonly MotNiveau[] },
  ) {
    const brut = audio.data.toString('utf8');
    const dit = brut.startsWith('SIMULE:') ? brut.slice(7) : '';
    const dialogue: Replique[] = [];
    try {
      const m = /<dialogue_de_la_lecon>(.*)<\/dialogue_de_la_lecon>/s.exec(systeme);
      for (const ar of JSON.parse(m?.[1] ?? '[]') as string[]) dialogue.push({ qui: '', ar });
    } catch {
      /* invite sans dialogue : aucune faute simulée */
    }
    const fautes = dit ? fautesSimulees(dit, ctx?.mots ?? [], dialogue) : [];
    return {
      status: 'ok' as const,
      brouillon: { entendu: dit, voulu: phraseVoulueSimulee(dit, fautes), fautes },
      usage: { texte: Math.ceil(systeme.length / 3), audio: 32 * 3, sortie: 120 },
    };
  }
}
