/**
 * Chantier A8 — muṣḥafs des riwāyāt dans l'espace Coran (Lire, Écouter, Muṣḥaf page par page).
 * Ḥafṣ (par défaut) = texte Tanzil des livres, inchangé. Les autres riwāyāt = textes OFFICIELS du Complexe du
 * Roi Fahd (plateforme développeurs), fichiers statiques par sourate (`/riwayat/<riwāya>/NNN.json`, générés par
 * `pnpm --filter @awform/content riwayat`, texte recopié sans aucun changement), affichés avec la police fournie
 * par le Complexe (servie sans modification, chargée À LA DEMANDE). Fichiers gardés dans IndexedDB ensuite,
 * jamais préchargés par le service worker. Mémoriser et carnets de hifẓ restent en Ḥafṣ (règle du projet).
 */
import type { RiwayaIndex } from '@awform/content/riwayat';
import { kvGet, kvSet } from '$lib/idb';
import { canHighlight, HAFS } from './player';

/**
 * Fiche légère de chaque riwāya pour l'interface (budget de poids : les tables et empreintes de
 * `@awform/content/riwayat` restent côté import ; riwayat.test.ts vérifie que les deux listes concordent).
 */
export interface RiwayaInfo {
  key: 'warsh' | 'qalun' | 'shuba' | 'susi' | 'duri' | 'bazzi';
  fr: string;
  ar: string;
  version: string;
  font: string;
  fontVersion: string;
}
export const RIWAYA_TEXTS: readonly RiwayaInfo[] = [
  ['warsh', 'Warsh ʿan Nāfiʿ', 'ورش عن نافع', 'kfgqpc_warsh_v30', 'kfgqpc_warsh_v30.ttf', '3.0'],
  ['qalun', 'Qālūn ʿan Nāfiʿ', 'قالون عن نافع', 'kfgqpc_qalun_v30', 'kfgqpc_qalun_v30.ttf', '3.0'],
  [
    'shuba',
    'Shuʿba ʿan ʿĀṣim',
    'شعبة عن عاصم',
    'kfgqpc_shubah_v30',
    'kfgqpc_shubah_v30.ttf',
    '3.0',
  ],
  [
    'susi',
    'as-Sūsī ʿan Abī ʿAmr',
    'السوسي عن أبي عمرو',
    'kfgqpc_susi_v30',
    'kfgqpc_susi_v30.ttf',
    '3.0',
  ],
  [
    'duri',
    'ad-Dūrī ʿan Abī ʿAmr',
    'الدوري عن أبي عمرو',
    'UthmanicDouri v2.0',
    'uthmanic_douri_v20.ttf',
    '2.0',
  ],
  [
    'bazzi',
    'al-Bazzī ʿan Ibn Kathīr',
    'البزي عن ابن كثير',
    'kfgqpc_bazzi_v30',
    'kfgqpc_bazzi_v30.ttf',
    '3.0',
  ],
].map(([key, fr, ar, version, font, fontVersion]) => ({
  key: key as RiwayaInfo['key'],
  fr: fr!,
  ar: ar!,
  version: version!,
  font: font!,
  fontVersion: fontVersion!,
}));
export const riwayaText = (key: string) => RIWAYA_TEXTS.find((r) => r.key === key) ?? null;

export type MushafRiwaya = 'hafs' | RiwayaInfo['key'];
export interface MushafChoice {
  key: MushafRiwaya;
  fr: string;
  ar: string;
}
/** Muṣḥafs proposés, Ḥafṣ en premier (par défaut partout). */
export const MUSHAF_RIWAYAT: readonly MushafChoice[] = [
  { key: HAFS, fr: 'Ḥafṣ ʿan ʿĀṣim', ar: 'حفص عن عاصم' },
  ...RIWAYA_TEXTS.map((d) => ({ key: d.key, fr: d.fr, ar: d.ar })),
];
export const mushafChoice = (key: string) =>
  MUSHAF_RIWAYAT.find((m) => m.key === key) ?? MUSHAF_RIWAYAT[0]!;
export const isMushafRiwaya = (k: unknown): k is MushafRiwaya =>
  typeof k === 'string' && MUSHAF_RIWAYAT.some((m) => m.key === k);

/** Tajwid en couleurs et traduction du sens (numérotation koufie) : muṣḥaf Ḥafṣ seulement. */
export const tajwidForMushaf = (m: string) => m === HAFS;
export const translationForMushaf = (m: string) => m === HAFS;

/** Muṣḥaf choisi, gardé sur l'appareil (commun à Lire, Écouter et Muṣḥaf) ; Ḥafṣ par défaut. */
const KEY = 'awzid.riwaya-texte.v1';
export function readMushafRiwaya(
  store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): MushafRiwaya {
  try {
    const v = store?.getItem(KEY);
    return isMushafRiwaya(v) ? v : HAFS;
  } catch {
    return HAFS;
  }
}
export function writeMushafRiwaya(
  m: MushafRiwaya,
  store: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): void {
  try {
    store?.setItem(KEY, m);
  } catch {
    /* stockage indisponible */
  }
}

export interface RiwayaVerseData {
  a: number;
  page: number;
  juz: number;
  text: string;
}
export interface RiwayaSura {
  key: string;
  version: string;
  s: number;
  /** nom de la sourate fourni par le Complexe (police de la riwāya) */
  name: string;
  verses: Map<number, RiwayaVerseData>;
}
type RawSura = {
  key: string;
  version: string;
  s: number;
  name: string;
  t: [number, number, number, string][];
};
export function parseRiwayaSura(raw: RawSura): RiwayaSura {
  return {
    key: raw.key,
    version: raw.version,
    s: raw.s,
    name: raw.name,
    verses: new Map(raw.t.map(([a, page, juz, text]) => [a, { a, page, juz, text }])),
  };
}

async function cachedJson<T>(kvKey: string, url: string): Promise<T | null> {
  const have = await kvGet<T>(kvKey).catch(() => undefined);
  if (have) return have;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as T;
    await kvSet(kvKey, j).catch(() => {});
    return j;
  } catch {
    return null;
  }
}

const indexMemo = new Map<string, RiwayaIndex>();
export async function loadRiwayaIndex(key: string): Promise<RiwayaIndex | null> {
  const def = riwayaText(key);
  if (!def) return null;
  const hit = indexMemo.get(key);
  if (hit) return hit;
  const j = await cachedJson<RiwayaIndex>(
    `rw:${key}:${def.version}:index`,
    `/riwayat/${key}/index.json`,
  );
  if (!j || j.key !== key || j.pages.length !== 604) return null;
  indexMemo.set(key, j);
  return j;
}

const suraMemo = new Map<string, RiwayaSura>();
export async function loadRiwayaSura(key: string, s: number): Promise<RiwayaSura | null> {
  const def = riwayaText(key);
  if (!def || s < 1 || s > 114) return null;
  const id = `${key}:${s}`;
  const hit = suraMemo.get(id);
  if (hit) return hit;
  const raw = await cachedJson<RawSura>(
    `rw:${key}:${def.version}:${s}`,
    `/riwayat/${key}/${String(s).padStart(3, '0')}.json`,
  );
  if (!raw || raw.key !== key || raw.s !== s) return null;
  const out = parseRiwayaSura(raw);
  suraMemo.set(id, out);
  return out;
}

/** Famille CSS de la police d'une riwāya (déclarée seulement au premier besoin). */
export const riwayaFamily = (key: string) => `awzid-rw-${key}`;
const fonts = new Map<string, Promise<boolean>>();
/**
 * Charge À LA DEMANDE la police fournie par le Complexe (fichier TTF servi tel quel, aucune conversion ni
 * sous-ensemble : la licence de la police interdit toute modification). Vrai si la police est prête.
 */
export function ensureRiwayaFont(key: string): Promise<boolean> {
  const def = riwayaText(key);
  if (!def || typeof document === 'undefined' || typeof FontFace === 'undefined')
    return Promise.resolve(false);
  let p = fonts.get(key);
  if (!p) {
    const face = new FontFace(riwayaFamily(key), `url(/riwayat/${key}/${def.font})`, {
      display: 'swap',
    });
    p = face
      .load()
      .then((f) => {
        document.fonts.add(f);
        return true;
      })
      .catch(() => {
        fonts.delete(key);
        return false;
      });
    fonts.set(key, p);
  }
  return p;
}

/**
 * Surlignage du verset entendu : jamais celui d'une riwāya sur le texte d'une autre.
 *  - muṣḥaf Ḥafṣ : règle existante (récitation en Ḥafṣ, numérotation koufie) ;
 *  - autre muṣḥaf : récitation de la MÊME riwāya, découpée verset par verset, et dont les versets de la sourate
 *    sont exactement ceux du texte affiché (1 à n) — sinon (sourate écoutée en entier, numérotation différente,
 *    p. ex. al-Mulk d'ad-Dūrī : 31 fichiers pour 30 versets dans le texte du Complexe) : pas de surlignage.
 */
export function highlightOn(
  reciter: { riwaya: string; surlignage?: string } | null,
  mushaf: string,
  pack: { mode?: string; files: ReadonlyArray<{ aya: number }> } | null,
  textCount: number,
): boolean {
  if (!reciter || pack?.mode === 'sourate') return false;
  if (mushaf === HAFS) return canHighlight(reciter);
  if (!pack || reciter.riwaya !== mushaf || !riwayaText(mushaf)) return false;
  const ayas = new Set(pack.files.map((f) => f.aya).filter((a) => a >= 1));
  if (ayas.size !== textCount) return false;
  for (let a = 1; a <= textCount; a++) if (!ayas.has(a)) return false;
  return true;
}
