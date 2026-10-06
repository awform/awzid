import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import IntlMessageFormat from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { formatIcu } from './icu';

const read = (p: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')) as Record<
    string,
    string
  >;
const CATALOGS: Record<string, Record<string, string>> = {
  // A37 : textes du personnel dans un fichier statique à part
  fr: {
    ...read('./messages/fr.json'),
    ...read('../../../static/i18n/fr-personnel.json'),
    ...read('../../../static/i18n/fr-quotidien.json'),
    ...read('../../../static/i18n/fr-vivre.json'),
  },
  en: read('../../../static/i18n/en.json'),
  es: read('../../../static/i18n/es.json'),
  de: read('../../../static/i18n/de.json'),
  ar: read('../../../static/i18n/ar.json'),
};

/** arguments d'un message (premier niveau et imbriqués) */
const argsOf = (msg: string) => [
  ...new Set([...msg.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]!)),
];

describe('formateur ICU minimal (lot F2) = intl-messageformat', () => {
  for (const [code, cat] of Object.entries(CATALOGS))
    it(`${code} : chaque message, plusieurs valeurs`, () => {
      let n = 0;
      for (const [key, msg] of Object.entries(cat)) {
        const names = argsOf(msg);
        for (const v of [0, 1, 2, 3, 5, 11, 21, 100, 1234.5]) {
          const values = Object.fromEntries(names.map((a) => [a, v]));
          const ref = String(new IntlMessageFormat(msg, code).format(values));
          expect(formatIcu(msg, code, values), `${code}:${key}=${v}`).toBe(ref);
          n++;
          if (!names.length) break;
        }
        // valeurs textuelles (noms, dates déjà mises en forme)
        if (names.length && !/plural/.test(msg)) {
          const values = Object.fromEntries(names.map((a) => [a, `«${a}»`]));
          expect(formatIcu(msg, code, values)).toBe(
            String(new IntlMessageFormat(msg, code).format(values)),
          );
        }
      }
      expect(n).toBeGreaterThan(1000);
    });

  it('apostrophes et cas particuliers', () => {
    expect(formatIcu("l'école de {n}", 'fr', { n: 'Awa' })).toBe("l'école de Awa");
    expect(formatIcu("''{x}''", 'fr', { x: 1 })).toBe("'1'");
    expect(formatIcu("'{x}' {x}", 'fr', { x: 1 })).toBe('{x} 1');
    expect(
      formatIcu('{n, plural, =0 {aucun} one {# élève} other {# élèves}}', 'fr', { n: 1200 }),
    ).toBe(
      new IntlMessageFormat('{n, plural, =0 {aucun} one {# élève} other {# élèves}}', 'fr').format({
        n: 1200,
      }),
    );
    expect(() => formatIcu('{x, select, a {A} other {B}}', 'fr', { x: 'a' })).toThrow();
    expect(() => formatIcu('{x}', 'fr', {})).toThrow();
  });
});
