import {
  runsOf,
  wordRuns,
  type Run,
  type TajwidRule,
  type TajwidSura,
} from '@awform/content/tajwid';
import { splitBasmala } from '@awform/hifz';
import { kvGet, kvSet } from '$lib/idb';
import { isHafs } from './player';

/**
 * Lot 29 — TAJWID EN COULEURS (riwāya Ḥafṣ seulement). Les règles viennent d'une source sous licence libre
 * (`@awform/content/tajwid`, docs/projet/LICENCES.md) ; ici : familles et palettes par public, légende,
 * chargement d'UNE sourate à la demande (gardée sur l'appareil pour le hors ligne), réglages de l'appareil.
 * Le texte affiché reste le texte Tanzil : les couleurs sont des enveloppes posées sur ses caractères, et un
 * verset dont l'annotation ne correspond pas exactement au texte est affiché sans couleur.
 */
export type { Run, TajwidRule, TajwidSura };

/** Familles (motif des soulignés pour le daltonisme, et regroupement de la palette enfant). */
export type Family = 'nasal' | 'long' | 'rebond' | 'muet';

export interface LegendEntry {
  /** jeton de couleur (--tj-…, --tjk-…) */
  token: string;
  family: Family;
  rules: TajwidRule[];
  /** clé i18n du nom de la règle (termes du GLOSSAIRE du projet) */
  label: string;
}

/** Palette complète (ados, adultes) : douze couleurs. */
export const LEGEND_FULL: LegendEntry[] = [
  { token: 'tj-ghunna', family: 'nasal', rules: ['ghunnah'], label: 'tj.r_ghunna' },
  {
    token: 'tj-idgham',
    family: 'nasal',
    rules: ['idghaam_ghunnah', 'idghaam_shafawi'],
    label: 'tj.r_idgham',
  },
  { token: 'tj-ikhfa', family: 'nasal', rules: ['ikhfa', 'ikhfa_shafawi'], label: 'tj.r_ikhfa' },
  { token: 'tj-iqlab', family: 'nasal', rules: ['iqlab'], label: 'tj.r_iqlab' },
  { token: 'tj-madd2', family: 'long', rules: ['madd_2'], label: 'tj.r_madd2' },
  { token: 'tj-madd246', family: 'long', rules: ['madd_246'], label: 'tj.r_madd246' },
  { token: 'tj-munfasil', family: 'long', rules: ['madd_munfasil'], label: 'tj.r_munfasil' },
  { token: 'tj-muttasil', family: 'long', rules: ['madd_muttasil'], label: 'tj.r_muttasil' },
  { token: 'tj-madd6', family: 'long', rules: ['madd_6'], label: 'tj.r_madd6' },
  { token: 'tj-qalqala', family: 'rebond', rules: ['qalqalah'], label: 'tj.r_qalqala' },
  {
    token: 'tj-assim',
    family: 'muet',
    rules: ['idghaam_no_ghunnah', 'idghaam_mutajanisayn', 'idghaam_mutaqaribayn'],
    label: 'tj.r_assim',
  },
  {
    token: 'tj-muet',
    family: 'muet',
    rules: ['hamzat_wasl', 'lam_shamsiyyah', 'silent'],
    label: 'tj.r_muet',
  },
];

/**
 * Palette ENFANT : quatre familles seulement. Les assimilations sans chant du nez ne sont pas coloriées pour
 * l'enfant (la plage couvre aussi la lettre suivante, qui se prononce : « non prononcée » serait faux).
 */
export const LEGEND_CHILD: LegendEntry[] = [
  {
    token: 'tjk-nez',
    family: 'nasal',
    rules: ['ghunnah', 'idghaam_ghunnah', 'idghaam_shafawi', 'ikhfa', 'ikhfa_shafawi', 'iqlab'],
    label: 'tj.k_nez',
  },
  {
    token: 'tjk-long',
    family: 'long',
    rules: ['madd_2', 'madd_246', 'madd_munfasil', 'madd_muttasil', 'madd_6'],
    label: 'tj.k_long',
  },
  { token: 'tjk-rebond', family: 'rebond', rules: ['qalqalah'], label: 'tj.k_rebond' },
  {
    token: 'tjk-muet',
    family: 'muet',
    rules: ['hamzat_wasl', 'lam_shamsiyyah', 'silent'],
    label: 'tj.k_muet',
  },
];

export const legendFor = (child: boolean) => (child ? LEGEND_CHILD : LEGEND_FULL);

const index = (legend: LegendEntry[]) =>
  new Map(legend.flatMap((e) => e.rules.map((r) => [r, e] as const)));
const FULL = index(LEGEND_FULL);
const CHILD = index(LEGEND_CHILD);

/** Entrée de légende d'une règle pour ce public (null : non coloriée pour ce public). */
export function entryOf(rule: TajwidRule | null, child: boolean): LegendEntry | null {
  if (!rule) return null;
  return (child ? CHILD : FULL).get(rule) ?? null;
}

/** Le bouton n'existe qu'en Ḥafṣ (texte Tanzil et source des règles : Ḥafṣ ʿan ʿĀṣim). */
export const tajwidAllowed = (riwaya: string | null | undefined) => isHafs(riwaya);

/** Morceaux d'un verset prêts à l'affichage : basmala éventuelle et mots du reste (null : sans couleur). */
export interface VerseRuns {
  basmala: Run[][] | null;
  words: Run[][];
}

export function verseRuns(
  v: { s: number; a: number; text: string },
  basmala: string,
  data: TajwidSura | null,
): VerseRuns | null {
  if (!data || data.s !== v.s) return null;
  const runs = runsOf(v.text, data.a[v.a - 1]);
  if (!runs) return null;
  const parts = splitBasmala(v.s, v.a, v.text, basmala);
  if (!v.text.endsWith(parts.rest)) return null;
  const at = v.text.length - parts.rest.length;
  const words = wordRuns(runs, v.text, at, v.text.length);
  const head = parts.basmala ? wordRuns(runs, v.text, 0, parts.basmala.length) : null;
  if (!words || (parts.basmala && (!head || at !== parts.basmala.length + 1))) return null;
  return { basmala: head, words };
}

/**
 * Exemple de chaque entrée de légende : le premier mot de la sourate ouverte qui porte cette règle (tiré du
 * texte et de la source, jamais inventé ; absent si la règle n'apparaît pas dans la sourate).
 */
export function examples(
  verses: Array<{ s: number; a: number; text: string }>,
  basmala: string,
  data: TajwidSura | null,
  child: boolean,
): Map<string, { aya: number; word: Run[] }> {
  const out = new Map<string, { aya: number; word: Run[] }>();
  const want = legendFor(child).length;
  for (const v of verses) {
    for (const w of verseRuns(v, basmala, data)?.words ?? [])
      for (const p of w) {
        const e = entryOf(p.r, child);
        if (e && !out.has(e.token)) out.set(e.token, { aya: v.a, word: w });
      }
    if (out.size === want) break;
  }
  return out;
}

/** Attributs d'un morceau coloré : couleur adulte et couleur enfant (choisie par le thème), famille. */
export function runAttrs(r: TajwidRule | null) {
  const full = entryOf(r, false);
  const kid = entryOf(r, true);
  return {
    'data-tj': full?.token,
    'data-tjf': full?.family,
    'data-tjk': kid?.token,
    'data-tjkf': kid?.family,
  };
}

/**
 * Libellé français contenant des termes arabes : morceaux à isoler (`<bdi>`) pour que l'ordre d'affichage
 * reste juste (« (الْغُنَّةُ), 2 temps » et non « ، 2 temps »).
 */
export function bidiParts(label: string): Array<{ t: string; ar: boolean }> {
  const out: Array<{ t: string; ar: boolean }> = [];
  const re = /[؀-ۿࢠ-ࣿ](?:[؀-ۿࢠ-ࣿ\s]*[؀-ۿࢠ-ࣿ])?/g;
  let last = 0;
  for (const m of label.matchAll(re)) {
    if (m.index > last) out.push({ t: label.slice(last, m.index), ar: false });
    out.push({ t: m[0], ar: true });
    last = m.index + m[0].length;
  }
  if (last < label.length) out.push({ t: label.slice(last), ar: false });
  return out;
}

/** Fichier d'une sourate : sur l'appareil d'abord, sinon /tajwid/NNN.json (puis gardé pour le hors ligne). */
export async function loadTajwid(s: number): Promise<TajwidSura | null> {
  const key = `tajwid:${s}`;
  const have = await kvGet<TajwidSura>(key).catch(() => undefined);
  if (have?.v === 1 && have.s === s) return have;
  try {
    const r = await fetch(`/tajwid/${String(s).padStart(3, '0')}.json`);
    if (!r.ok) return null;
    const d = (await r.json()) as TajwidSura;
    if (d?.v !== 1 || d.s !== s || !Array.isArray(d.a)) return null;
    await kvSet(key, d).catch(() => {});
    return d;
  } catch {
    return null;
  }
}

/** Réglages de l'appareil : tajwid affiché (désactivé par défaut), soulignés en plus des couleurs. */
export interface TajwidPrefs {
  on: boolean;
  motifs: boolean;
}
const KEY = 'awzid.tajwid';
const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
export function readTajwidPrefs(store: Pick<Storage, 'getItem'> | null = storage()): TajwidPrefs {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<TajwidPrefs> | null;
    return { on: v?.on === true, motifs: v?.motifs === true };
  } catch {
    return { on: false, motifs: false };
  }
}
export function writeTajwidPrefs(
  p: TajwidPrefs,
  store: Pick<Storage, 'setItem'> | null = storage(),
) {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : réglage pour cette visite */
  }
}
