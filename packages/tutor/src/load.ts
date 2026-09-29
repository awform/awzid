/** Lecture du Tanzil (copie des livres, hors dépôt) : ~/awform-content/coran/tanzil-uthmani.tsv. */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const contentDir = () => process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
export const tanzilFile = () => join(contentDir(), 'coran', 'tanzil-uthmani.tsv');
export const hasTanzil = () => existsSync(tanzilFile());

export function loadTanzil(file = tanzilFile()): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .split('\n')) {
    const l = line.replace(/\r$/, '');
    const tab = l.indexOf('\t');
    if (tab > 0) m.set(l.slice(0, tab), l.slice(tab + 1).replace(/^\uFEFF/, ''));
  }
  return m;
}
