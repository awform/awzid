import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTranslations, readTranslation, TRANSLATIONS } from '../src/cli-traductions.js';
import { loadTanzil } from '../src/quran.js';
import { CONTENT_DIR } from './helpers.js';

/**
 * Muṣḥaf par page — traductions du sens (QuranEnc.com). Conditions de la source : aucune modification, ajout
 * ni suppression ; les fichiers livrés doivent donc être la source recopiée à l'identique (texte et notes).
 */
const STATIC = fileURLToPath(new URL('../../../apps/web/static/traductions', import.meta.url));

describe('traductions QuranEnc', () => {
  for (const src of TRANSLATIONS) {
    it(`${src.key} : empreinte de la source, 6 236 versets numérotés sans trou`, () => {
      const rows = readTranslation(src);
      expect(rows).toHaveLength(6236);
      let prev = { s: 1, a: 0 };
      for (const r of rows) {
        if (r.s === prev.s) expect(r.a).toBe(prev.a + 1);
        else {
          expect(r.s).toBe(prev.s + 1);
          expect(r.a).toBe(1);
        }
        expect(r.text.length).toBeGreaterThan(0);
        prev = r;
      }
      expect(prev).toMatchObject({ s: 114, a: 6 });
    });
  }

  it('mêmes versets que le texte Tanzil des livres (si présent)', () => {
    const file = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
    if (!existsSync(file)) return;
    const tanzil = loadTanzil(readFileSync(file, 'utf8'));
    for (const src of TRANSLATIONS) {
      const keys = readTranslation(src).map((r) => `${r.s}:${r.a}`);
      expect(new Set(keys)).toEqual(new Set(tanzil.keys()));
    }
  });

  it('fichiers livrés = source recopiée à l’identique (texte et notes), octet pour octet', () => {
    const want = buildTranslations();
    expect(want.size).toBe(TRANSLATIONS.length * 114);
    for (const [rel, body] of want) {
      expect(readFileSync(join(STATIC, rel), 'utf8'), rel).toBe(body);
    }
    // lecture inverse : chaque verset du fichier livré redonne exactement la ligne de la source
    for (const src of TRANSLATIONS) {
      const rows = readTranslation(src);
      const parsed = JSON.parse(readFileSync(join(STATIC, src.key, '002.json'), 'utf8')) as {
        version: string;
        t: [number, string, string][];
      };
      expect(parsed.version).toBe(src.version);
      const s2 = rows.filter((r) => r.s === 2);
      expect(parsed.t).toEqual(s2.map((r) => [r.a, r.text, r.notes]));
    }
  });
});
