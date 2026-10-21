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
import { bareWords } from '../arabic.js';
import type { MotNiveau, Replique } from './types.js';

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
  let m = mot.normalize('NFC').trim();
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
  const e = formeSons(
    entendu,
    /[\u064B\u064C\u064D]ا?$|ا\u064B$/.test(correct.normalize('NFC').trim()),
  );
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
