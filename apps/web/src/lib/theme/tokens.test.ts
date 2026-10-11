import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrast,
  CONTRAST_PAIRS,
  KNOWN_CONTRAST_GAPS,
  palettes,
  PALETTES,
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

  it('Coran épuré : palette « verdure » (vert, blanc, or), claire et sombre, mêmes jetons que les thèmes', () => {
    const css = renderCss();
    const keys = Object.keys(THEMES.clair.couleurs).sort();
    expect(Object.keys(PALETTES.verdure.clair).sort()).toEqual(keys);
    expect(Object.keys(PALETTES.verdure.sombre).sort()).toEqual(keys);
    expect(PALETTES.verdure.clair.header).toBe('#ffffff');
    // après les thèmes (à spécificité égale, la palette l'emporte), mode imposé et préférence du système
    const at = css.indexOf("[data-palette='verdure']");
    expect(at).toBeGreaterThan(css.indexOf("[data-theme='manuscrit'][data-mode='sombre']"));
    expect(css).toContain("[data-palette='verdure'][data-mode='sombre']");
    expect(css).toContain(":root:not([data-mode])[data-palette='verdure']");
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

  it('charte Awzid : thème par défaut aux couleurs de la marque, paires de texte ≥ 4,5:1 (clair et sombre)', () => {
    const c = THEMES.clair.couleurs;
    const d = THEMES.clair.inverse;
    expect([c.paper, c.card, c.surface, c.primary, c.navy, c.ink, c.ink2, c.teal, c.line]).toEqual([
      '#fbf7ee',
      '#ffffff',
      '#f2ebda',
      '#0b6e4f',
      '#084c38',
      '#1e2b25',
      '#4a5a52',
      '#0b6e4f',
      '#ddd3bd',
    ]);
    expect([d.paper, d.card, d.primary, d.ink, d.ink2, d.teal, d.line, d.accent]).toEqual([
      '#0d1a15',
      '#14261f',
      '#1f9c73',
      '#e8dfc8',
      '#b4c2ba',
      '#5cc79c',
      '#28423a',
      '#d9b54a',
    ]);
    // bouton principal : blanc sur émeraude (clair) ; sur #1F9C73 le texte foncé #0D1A15 tient 4,5:1
    expect(contrast(c['on-primary']!, c.primary!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d['on-primary']!, d.primary!)).toBeGreaterThanOrEqual(4.5);
    for (const [k, m] of [
      ['clair', c],
      ['sombre', d],
    ] as const)
      for (const [fg, bg] of [
        ['ink', 'paper'],
        ['ink', 'card'],
        ['ink', 'surface'],
        ['ink2', 'paper'],
        ['ink2', 'card'],
        ['ink2', 'surface'],
        ['navy', 'paper'],
        ['navy', 'card'],
        ['teal', 'paper'],
        ['teal', 'card'],
        ['bad-ink', 'paper'],
        ['bad-ink', 'card'],
        ['on-header', 'header'],
      ] as const)
        expect(contrast(m[fg]!, m[bg]!), `${k} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    // l'or n'est jamais une couleur de texte sur fond clair
    expect(contrast(c['warn-ink']!, c.paper!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.accent!, c.paper!)).toBeLessThan(4.5);
  });

  it('le calcul de contraste suit WCAG (noir/blanc = 21)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
