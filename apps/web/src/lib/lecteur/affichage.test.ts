import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLE_DEPLIE, dansExercice, garderDeplie, lireDeplie } from './affichage';

function stockage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('lecteur réduit ou déplié', () => {
  it('réduit par défaut ; le choix « Régler » est gardé sur l’appareil', () => {
    const s = stockage();
    vi.stubGlobal('localStorage', s);
    expect(lireDeplie()).toBe(false);
    garderDeplie(true);
    expect(s.m.get(CLE_DEPLIE)).toBe('1');
    expect(lireDeplie()).toBe(true);
    garderDeplie(false);
    expect(lireDeplie()).toBe(false);
  });

  it('stockage indisponible (navigation privée, accès refusé) : réduit, sans erreur', () => {
    const refus = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: refus, setItem: refus });
    expect(lireDeplie()).toBe(false);
    expect(() => garderDeplie(true)).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(lireDeplie()).toBe(false);
    expect(() => garderDeplie(true)).not.toThrow();
  });

  it('exercice : reconnu par son conteneur [data-exercise]', () => {
    const el = (dedans: boolean) =>
      ({ closest: (s: string) => (s === '[data-exercise]' && dedans ? {} : null) }) as Element;
    expect(dansExercice(el(true))).toBe(true);
    expect(dansExercice(el(false))).toBe(false);
    expect(dansExercice(null)).toBe(false);
    expect(dansExercice(undefined)).toBe(false);
  });
});
