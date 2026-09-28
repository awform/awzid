import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HifzBookData } from '../src/book.js';
import { TOTAL_PAGES, type QuranMeta } from '../src/quran.js';

export const CONTENT = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
export const TANZIL_FILE = join(CONTENT, 'coran', 'tanzil-uthmani.tsv');
export const HAS_TANZIL = existsSync(TANZIL_FILE);
export const HAS_BOOKS = existsSync(join(CONTENT, 'data', 'hifz', 'en1.js'));

export function loadTanzil(): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of readFileSync(TANZIL_FILE, 'utf8')
    .replace(/^\uFEFF/, '')
    .split('\n')) {
    const l = line.replace(/\r$/, '');
    const tab = l.indexOf('\t');
    if (tab > 0) m.set(l.slice(0, tab), l.slice(tab + 1).replace(/^\uFEFF/, ''));
  }
  return m;
}

export function loadBook(code: string): HifzBookData {
  const src = readFileSync(join(CONTENT, 'data', 'hifz', `${code}.js`), 'utf8');
  const json = src.slice(src.indexOf('(') + 1, src.lastIndexOf(')'));
  return JSON.parse(json) as HifzBookData;
}

/** Coran synthétique déterministe (114 sourates, 6 236 versets, 604 pages) pour les tests sans contenu. */
export function syntheticMeta(): QuranMeta {
  const weights: number[][] = [];
  let total = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let s = 1; s <= 114; s++) {
    // longues sourates au début, courtes à la fin (comme le Muṣḥaf)
    const verses = s === 1 ? 7 : Math.max(3, Math.round(286 * Math.pow(0.955, s - 2)));
    const row: number[] = [];
    for (let a = 0; a < verses; a++) {
      const w = Math.round(20 + rnd() * (s < 30 ? 120 : 40));
      row.push(w);
      total += w;
    }
    weights.push(row);
  }
  // total pour ≈ 604 pages de ≈ 550 lettres
  void TOTAL_PAGES;
  return { weights, totalWeight: total };
}
