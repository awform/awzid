/**
 * Histoires (5/11/2026) — illustrations : chaque SVG servi avec un récit est inerte et autonome.
 * Aucun <text>, <image>, <script>, <foreignObject>, <iframe>, <style>, lien <a>, gestionnaire on*=, ni URL externe
 * (http:, https:, //…, url(...) ou href hors de « #id ») ; seul l'espace de noms SVG (xmlns) est permis.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { histoiresDir } from '../src/lectures.js';

const dir = histoiresDir();
const recits = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map(
    (f) =>
      JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        id: string;
        illus?: Array<{ v: string; svg: string }>;
      },
  );
const svgs = recits.flatMap((r) =>
  (r.illus ?? []).map((x, i) => ({ nom: `${r.id}#${i}`, svg: x.svg })),
);

describe('Histoires : illustrations SVG', () => {
  it('des illustrations sont bien servies (prophètes et livre 2)', () => {
    expect(svgs.length).toBeGreaterThan(100);
  });
  it.each(svgs)('$nom : inerte, sans texte ni ressource externe', ({ svg }) => {
    expect(svg.startsWith('<svg')).toBe(true);
    const s = svg.replace(/\sxmlns(?::\w+)?="[^"]*"/g, '');
    expect(s).not.toMatch(/<\s*(?:text|image|script|foreignObject|iframe|style|a)\b/i);
    expect(s).not.toMatch(/\bon\w+\s*=/i);
    expect(s).not.toMatch(/https?:|\/\//i);
    expect(s).not.toMatch(/url\(\s*['"]?(?!#)/i);
    expect(s).not.toMatch(/href\s*=\s*["'](?!#)/i);
  });
  it('les identifiants internes sont uniques entre les illustrations d’un même récit', () => {
    for (const r of recits) {
      const ids = (r.illus ?? []).flatMap((x) =>
        [...x.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
      );
      expect(new Set(ids).size, r.id).toBe(ids.length);
    }
  });
});
