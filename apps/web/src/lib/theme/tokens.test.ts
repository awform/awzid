import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, CONTRAST_PAIRS, KNOWN_CONTRAST_GAPS, renderCss, THEMES } from './tokens';

describe('thème par jetons', () => {
  it('tokens.css est à jour (pnpm --filter @awform/web theme)', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(css).toBe(renderCss());
  });

  it('mouvement réduit respecté', () => {
    expect(renderCss()).toContain('prefers-reduced-motion: reduce');
  });

  it('aucune couleur en dur des jetons dans les styles des composants', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../../', import.meta.url).pathname;
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.svelte') ? [p] : [];
      });
    const tokenHex = new Set(
      [
        'ok-bg',
        'ok-ink',
        'bad-ink',
        'bad-bg',
        'warn-bg',
        'warn-ink',
        'soon-ink',
        'sand',
        'gold',
        'navy',
        'info',
      ].map((k) => THEMES.adultes.couleurs[k]!.toLowerCase()),
    );
    const found: string[] = [];
    for (const f of walk(root)) {
      const src = readFileSync(f, 'utf8');
      for (const style of src.match(/<style>[\s\S]*?<\/style>/g) ?? [])
        for (const h of style.match(/#[0-9a-fA-F]{6}\b/g) ?? [])
          if (tokenHex.has(h.toLowerCase())) found.push(`${f}: ${h}`);
    }
    expect(found).toEqual([]);
  });

  for (const [name, theme] of Object.entries(THEMES))
    it(`contraste WCAG AA — thème ${name}`, () => {
      const fails = CONTRAST_PAIRS.filter((p) => {
        const r = contrast(theme.couleurs[p.fg]!, theme.couleurs[p.bg]!);
        return r < (p.grand ? 3 : 4.5);
      })
        .map((p) => `${p.fg}/${p.bg}`)
        .filter((k) => !KNOWN_CONTRAST_GAPS.includes(k));
      expect(fails).toEqual([]);
    });

  it('le calcul de contraste suit WCAG (noir/blanc = 21)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
