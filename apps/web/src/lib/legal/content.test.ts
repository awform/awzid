import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LegalTexts } from './content';
import { LEGAL_PAGES } from './content';

// A37 : version anglaise dans un fichier statique (hors de la coquille), chargée à la demande ;
// A39 : version française aussi (même forme), seule source des brouillons légaux
const read = (lang: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../static/i18n/legal/${lang}.json`, import.meta.url), 'utf8'),
  ) as LegalTexts;
const { legal: LEGAL, faq: FAQ } = read('fr');
const { legal: LEGAL_EN, faq: FAQ_EN } = read('en');

describe('pages légales et aide : version anglaise complète (à relire par un locuteur natif)', () => {
  it('le français a toutes les pages, avec des sections', () => {
    for (const k of LEGAL_PAGES) expect(LEGAL[k].sections.length, k).toBeGreaterThan(0);
    expect(FAQ.length).toBeGreaterThan(0);
  });
  it('mêmes pages, mêmes sections, mêmes paragraphes', () => {
    for (const k of LEGAL_PAGES) {
      expect(
        LEGAL_EN[k].sections.map((s) => s.paras.length),
        k,
      ).toEqual(LEGAL[k].sections.map((s) => s.paras.length));
    }
  });
  it('mêmes questions dans l’aide', () => {
    expect(FAQ_EN.map((b) => b.items.length)).toEqual(FAQ.map((b) => b.items.length));
  });
  it('les mentions à compléter et à valider sont conservées en anglais', () => {
    const fr = JSON.stringify(LEGAL).match(/\[/g)?.length ?? 0;
    const en = JSON.stringify(LEGAL_EN).match(/\[/g)?.length ?? 0;
    expect(en).toBe(fr);
    expect(JSON.stringify(LEGAL_EN)).not.toMatch(/\b(le|la|les|des|une|pour|avec)\b/);
  });
});
