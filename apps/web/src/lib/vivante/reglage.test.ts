import { describe, expect, it } from 'vitest';
import { readVivante, vivanteActive, writeVivante } from './reglage';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
  };
};

describe('A21 — réglage des leçons vivantes', () => {
  it('par défaut : les trois pilotes seulement', () => {
    const r = readVivante(mem());
    expect(r).toEqual({ on: true, levels: [] });
    expect(vivanteActive('en1.l01', 'en1', r)).toBe(true);
    expect(vivanteActive('ado1.l01', 'ado1', r)).toBe(true);
    expect(vivanteActive('ad1.l01', 'ad1', r)).toBe(true);
    expect(vivanteActive('en1.l02', 'en1', r)).toBe(false);
  });

  it('activable par niveau ; interrupteur général ; jamais hors des livres d’arabe', () => {
    const s = mem();
    writeVivante({ on: true, levels: ['en1', 'en1', 're1'] }, s);
    const r = readVivante(s);
    expect(r.levels).toEqual(['en1']);
    expect(vivanteActive('en1.l07', 'en1', r)).toBe(true);
    expect(vivanteActive('re1.l01', 're1', { on: true, levels: ['re1'] })).toBe(false);
    expect(vivanteActive('qc1.l01', 'qc1', r)).toBe(false);
    writeVivante({ on: false, levels: ['en1'] }, s);
    expect(vivanteActive('en1.l01', 'en1', readVivante(s))).toBe(false);
  });

  it('stockage illisible ou indisponible : réglage par défaut', () => {
    const bad = { getItem: () => '{', setItem: () => {} };
    expect(readVivante(bad)).toEqual({ on: true, levels: [] });
    expect(readVivante(null)).toEqual({ on: true, levels: [] });
  });
});
