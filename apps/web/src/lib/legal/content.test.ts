import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAQ, LEGAL, LEGAL_PAGES, type FaqItem, type LegalKey, type LegalPage } from './content';

// A37 : version anglaise dans un fichier statique (hors de la coquille), chargée à la demande
const { legal: LEGAL_EN, faq: FAQ_EN } = JSON.parse(
  readFileSync(new URL('../../../static/i18n/legal/en.json', import.meta.url), 'utf8'),
) as { legal: Record<LegalKey, LegalPage>; faq: Array<{ titre: string; items: FaqItem[] }> };

describe('pages légales et aide : version anglaise complète (à relire par un locuteur natif)', () => {
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
