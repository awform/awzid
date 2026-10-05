import { describe, expect, it } from 'vitest';
import { readVivante, vivanteActive, writeVivante } from './reglage';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
  };
};

describe('A21 / A21b — réglage des leçons vivantes', () => {
  it('par défaut : actives partout dans les livres d’arabe (A21b)', () => {
    const r = readVivante(mem());
    expect(r).toEqual({ on: true, off: [] });
    for (const l of ['en1', 'en5', 'ado1', 'ado4', 'ad1', 'ad10'])
      expect(vivanteActive(l, r)).toBe(true);
  });

  it('jamais hors des livres d’arabe : religion (re, ra) et lecture du Coran (qc)', () => {
    const r = readVivante(mem());
    for (const l of ['re1', 'ra1', 'qc1', 'hifz', '']) expect(vivanteActive(l, r)).toBe(false);
  });

  it('un niveau peut être désactivé ; interrupteur général', () => {
    const s = mem();
    writeVivante({ on: true, off: ['en1', 'en1', 're1'] }, s);
    const r = readVivante(s);
    expect(r.off).toEqual(['en1']);
    expect(vivanteActive('en1', r)).toBe(false);
    expect(vivanteActive('en2', r)).toBe(true);
    writeVivante({ on: false, off: [] }, s);
    expect(vivanteActive('en2', readVivante(s))).toBe(false);
  });

  it('ancien réglage du pilote (niveaux activés) : tout reste actif', () => {
    const s = mem();
    s.setItem('awzid.vivante', JSON.stringify({ on: true, levels: ['en1'] }));
    expect(readVivante(s)).toEqual({ on: true, off: [] });
    expect(vivanteActive('ad3', readVivante(s))).toBe(true);
  });

  it('stockage illisible ou indisponible : réglage par défaut', () => {
    const bad = { getItem: () => '{', setItem: () => {} };
    expect(readVivante(bad)).toEqual({ on: true, off: [] });
    expect(readVivante(null)).toEqual({ on: true, off: [] });
  });
});
