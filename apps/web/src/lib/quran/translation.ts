/**
 * Muṣḥaf par page — traductions du SENS (QuranEnc.com), à côté du texte arabe. Fichiers statiques par sourate
 * (`/traductions/<clé>/NNN.json`, générés par `pnpm --filter @awform/content traductions`), chargés à la
 * demande et gardés dans IndexedDB (hors ligne ensuite), jamais préchargés par le service worker.
 * Conditions de la source : texte et notes affichés tels quels, source et version indiquées (LICENCES.md § 4).
 */
import { kvGet, kvSet } from '$lib/idb';

export interface TranslationInfo {
  key: string;
  /** langue de la traduction (attribut lang, sens d'écriture) */
  lang: 'fr' | 'en';
  version: string;
  /** clé du libellé (traducteur) dans les catalogues */
  label: string;
  url: string;
}
export const TRANSLATIONS: readonly TranslationInfo[] = [
  {
    key: 'french_rashid',
    lang: 'fr',
    version: '1.0.3',
    label: 'mp.trad_french_rashid',
    url: 'https://quranenc.com/fr/browse/french_rashid',
  },
  {
    key: 'english_rwwad',
    lang: 'en',
    version: '1.0.19',
    label: 'mp.trad_english_rwwad',
    url: 'https://quranenc.com/en/browse/english_rwwad',
  },
];
export const translationInfo = (key: string) => TRANSLATIONS.find((x) => x.key === key) ?? null;

export interface TranslatedVerse {
  a: number;
  text: string;
  notes: string;
}
export interface TranslationSura {
  key: string;
  version: string;
  s: number;
  verses: Map<number, TranslatedVerse>;
}

export function parseTranslation(raw: {
  key: string;
  version: string;
  s: number;
  t: [number, string, string][];
}): TranslationSura {
  return {
    key: raw.key,
    version: raw.version,
    s: raw.s,
    verses: new Map(raw.t.map(([a, text, notes]) => [a, { a, text, notes }])),
  };
}

/**
 * Notes de bas de page de la source, une par ligne (« [12] … ») ; découpées seulement pour l'affichage en
 * liste, le texte de chaque note reste celui de la source.
 */
export const noteLines = (notes: string) =>
  notes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

type Raw = Parameters<typeof parseTranslation>[0];
const memo = new Map<string, TranslationSura>();
export async function loadTranslation(key: string, s: number): Promise<TranslationSura | null> {
  const info = translationInfo(key);
  if (!info || s < 1 || s > 114) return null;
  const id = `${key}:${s}`;
  const have = memo.get(id);
  if (have) return have;
  const kvKey = `trad:${key}:${info.version}:${s}`;
  let raw = (await kvGet<Raw>(kvKey).catch(() => undefined)) ?? null;
  if (!raw) {
    try {
      const r = await fetch(`/traductions/${key}/${String(s).padStart(3, '0')}.json`);
      if (!r.ok) return null;
      raw = (await r.json()) as Raw;
      await kvSet(kvKey, raw).catch(() => {});
    } catch {
      return null;
    }
  }
  if (raw.key !== key || raw.s !== s) return null;
  const out = parseTranslation(raw);
  memo.set(id, out);
  return out;
}
