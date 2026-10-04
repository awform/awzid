import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrast,
  CONTRAST_PAIRS,
  KNOWN_CONTRAST_GAPS,
  palettes,
  renderCss,
  THEME_NAMES,
  THEMES,
} from './tokens';

describe('thème par jetons', () => {
  it('tokens.css est à jour (pnpm --filter @awform/web theme)', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(css).toBe(renderCss());
  });

  it('mouvement réduit respecté', () => {
    expect(renderCss()).toContain('prefers-reduced-motion: reduce');
  });

  it('lot 26 : quatre thèmes par public, chacun avec sa variante sombre (ou claire pour la nuit)', () => {
    expect(THEME_NAMES.sort()).toEqual(['clair', 'jardin', 'manuscrit', 'nuit']);
    const css = renderCss();
    for (const n of THEME_NAMES) {
      expect(css).toContain(`[data-theme='${n}']`);
      // mêmes jetons de couleur dans les deux modes
      expect(Object.keys(THEMES[n].inverse).sort()).toEqual(Object.keys(THEMES[n].couleurs).sort());
    }
    expect(css).toContain("[data-theme='nuit'][data-mode='clair']");
    expect(css).toContain("[data-theme='manuscrit'][data-mode='sombre']");
    expect(css).toContain('prefers-color-scheme: dark');
    // la nuit ne suit pas la préférence claire du système : elle reste sombre
    expect(css).not.toContain(":root:not([data-mode])[data-theme='nuit']");
  });

  it('lot 26 : cibles tactiles ≥ 48 px dans chaque thème (56 px pour les enfants)', () => {
    for (const n of THEME_NAMES)
      expect(parseInt(THEMES[n].tailles.cible)).toBeGreaterThanOrEqual(48);
    expect(parseInt(THEMES.jardin.tailles.cible)).toBeGreaterThanOrEqual(56);
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
      ].map((k) => THEMES.clair.couleurs[k]!.toLowerCase()),
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

  it('lot 26 : aucun blanc ou noir en dur dans les styles (le mode sombre doit suivre les jetons)', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../../', import.meta.url).pathname;
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.svelte') ? [p] : [];
      });
    // illustrations des livres (scènes, sprites, tracé) : couleurs propres au dessin, hors thème
    const DESSINS = /(Illus|Scene|Sprite|TraceCanvas|Sym)\.svelte$|certificat|imprimer/;
    const found: string[] = [];
    for (const f of walk(root)) {
      if (DESSINS.test(f)) continue;
      const src = readFileSync(f, 'utf8');
      for (const style of src.match(/<style>[\s\S]*?<\/style>/g) ?? [])
        for (const m of style.matchAll(
          /(?<![-\w])(background|color|border(?:-[a-z]+)?):[^;]*(#fff\b|#ffffff\b|#000\b|#1b1b1b\b|\bwhite\b|\bblack\b)/gi,
        ))
          found.push(`${f.slice(root.length)}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  for (const p of palettes())
    it(`contraste WCAG AA — palette ${p.nom}`, () => {
      const fails = CONTRAST_PAIRS.filter((x) => {
        const r = contrast(p.couleurs[x.fg]!, p.couleurs[x.bg]!);
        return r < (x.grand ? 3 : 4.5);
      })
        .map((x) => `${x.fg}/${x.bg} ${contrast(p.couleurs[x.fg]!, p.couleurs[x.bg]!).toFixed(2)}`)
        .filter((k) => !KNOWN_CONTRAST_GAPS.includes(k.split(' ')[0]!));
      expect(fails).toEqual([]);
    });

  it('le calcul de contraste suit WCAG (noir/blanc = 21)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
