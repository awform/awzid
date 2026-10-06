import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FAQ, LEGAL, LEGAL_PAGES, type FaqItem, type LegalKey, type LegalPage } from './content';
import { LEGAL_FR, loadLegal } from './pages';

/** A39 : version anglaise hors de la coquille, fichier statique téléchargé seulement quand l'anglais sert */
const EN = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../static/i18n/legal-en.json', import.meta.url)),
    'utf8',
  ),
) as { legal: Record<LegalKey, LegalPage>; faq: Array<{ titre: string; items: FaqItem[] }> };
const LEGAL_EN = EN.legal;
const FAQ_EN = EN.faq;

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
  it('le français sert tant que l’interface est en français (aucun téléchargement)', async () => {
    let asked = 0;
    const get = (async () => {
      asked++;
      return new Response('{}');
    }) as typeof fetch;
    expect(await loadLegal(get)).toBe(LEGAL_FR);
    expect(asked).toBe(0);
  });
});
