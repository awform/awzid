import { describe, expect, it } from 'vitest';
import { nextMode, readMode, writeMode } from './mode';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('lot 26 — mode clair / sombre de l’appareil', () => {
  it('auto par défaut, réglage mémorisé, retour à auto', () => {
    const s = mem();
    expect(readMode(s)).toBe('auto');
    writeMode('sombre', s);
    expect(readMode(s)).toBe('sombre');
    writeMode('auto', s);
    expect(readMode(s)).toBe('auto');
  });
  it('stockage indisponible ou valeur inconnue : auto, sans erreur', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
      removeItem: () => {},
    };
    expect(readMode(broken)).toBe('auto');
    expect(() => writeMode('clair', broken)).not.toThrow();
    expect(readMode({ getItem: () => 'violet' })).toBe('auto');
  });
  it('le bouton fait le tour des trois modes', () => {
    expect(nextMode('auto')).toBe('sombre');
    expect(nextMode('sombre')).toBe('clair');
    expect(nextMode('clair')).toBe('auto');
  });
});
