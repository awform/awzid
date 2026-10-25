/**
 * Jetons des signes (25/10/2026, direction artistique) : une couleur fixe par signe, accessible AA en clair et en sombre,
 * sans conflit avec les couleurs du tajwīd du lecteur du Coran ni avec celles des lettres étudiées ; feuille synchronisée.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FAMILLE, pastilleDouble, voyelleDe } from '../cahier/jeux/modele';
import { FAMILLES_SIGNES, SIGNES_CLAIR, SIGNES_SOMBRE, renderSignesCss } from './signes';
import { THEMES, contrast } from './tokens';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const distance = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!));

describe('jetons des signes', () => {
  it('signes.css est celui que génère signes.ts (pnpm --filter @awform/web theme)', () => {
    expect(lire('./signes.css')).toBe(renderSignesCss());
  });
  it('valeurs de la direction artistique en clair : kasra #2c4a6e, ḍamma #a67c1a, shadda #a8613f', () => {
    expect(SIGNES_CLAIR['sg-kasra']).toBe('#2c4a6e');
    expect(SIGNES_CLAIR['sg-damma']).toBe('#a67c1a');
    expect(SIGNES_CLAIR['sg-shadda']).toBe('#a8613f');
    // mêmes clés dans les deux modes
    expect(Object.keys(SIGNES_SOMBRE)).toEqual(Object.keys(SIGNES_CLAIR));
  });
  it('cinq familles ; le tanwīn prend la couleur de sa voyelle ; les voyelles longues ont leur version claire', () => {
    expect([...FAMILLES_SIGNES].sort()).toEqual(['damma', 'fatha', 'kasra', 'shadda', 'soukoun']);
    expect(new Set(Object.values(FAMILLE))).toEqual(new Set(FAMILLES_SIGNES));
    expect(FAMILLE.fathatan).toBe(FAMILLE.fatha);
    expect(FAMILLE.kasratan).toBe(FAMILLE.kasra);
    expect(FAMILLE.dammatan).toBe(FAMILLE.damma);
    expect(['fathatan', 'kasratan', 'dammatan'].every((k) => pastilleDouble(k as 'fathatan'))).toBe(
      true,
    );
    expect(pastilleDouble('fatha')).toBe(false);
    expect(voyelleDe('shadda_kasra')).toBe('kasra');
    expect(voyelleDe('dammatan')).toBe('damma');
    expect(voyelleDe('soukoun')).toBeNull();
    for (const v of ['fatha', 'kasra', 'damma'])
      for (const pal of [SIGNES_CLAIR, SIGNES_SOMBRE]) expect(pal[`sg-${v}-l`]).toBeTruthy();
  });
  it('contraste sur la carte et sur le papier de chaque mode : signes montrés en grand (≥ 24 px), AA grand texte 3:1', () => {
    for (const [mode, pal, c] of [
      ['clair', SIGNES_CLAIR, THEMES.clair.couleurs],
      ['sombre', SIGNES_SOMBRE, THEMES.clair.inverse],
    ] as const)
      for (const [k, v] of Object.entries(pal))
        for (const fond of ['card', 'paper'])
          expect(contrast(v, c[fond]!), `${mode} ${k}/${fond}`).toBeGreaterThanOrEqual(3);
    // les couleurs de base (hors voyelles longues claires) : AA texte courant sauf l'or (3,5:1, grand texte seulement)
    for (const k of ['sg-fatha', 'sg-kasra', 'sg-soukoun', 'sg-shadda'])
      expect(contrast(SIGNES_CLAIR[k]!, THEMES.clair.couleurs.card!), k).toBeGreaterThanOrEqual(
        4.5,
      );
  });
  it('aucun conflit avec le tajwīd du lecteur du Coran ni avec les lettres étudiées (distance RVB ≥ 30)', () => {
    for (const [mode, pal, c] of [
      ['clair', SIGNES_CLAIR, THEMES.clair.couleurs],
      ['sombre', SIGNES_SOMBRE, THEMES.clair.inverse],
    ] as const) {
      const autres = Object.entries(c).filter(
        ([k, v]) => /^(tj-|tjk-|c[0-3]$)/.test(k) && /^#/.test(v),
      );
      expect(autres.length).toBeGreaterThanOrEqual(20);
      for (const [k, v] of Object.entries(pal))
        for (const [k2, v2] of autres)
          expect(distance(v, v2), `${mode} ${k} / ${k2}`).toBeGreaterThanOrEqual(30);
    }
  });
  it('les jeux emploient les jetons, jamais une couleur en dur pour un signe', () => {
    const src = lire('../cahier/jeux/Construis.svelte');
    for (const k of Object.keys(SIGNES_CLAIR)) expect(src, k).toContain(`var(--${k})`);
    const regles = [...src.matchAll(/\[data-sg[^{]*\{[^}]*\}/g)].map((m) => m[0]);
    expect(regles.length).toBeGreaterThan(8);
    for (const r of regles) expect(r).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
