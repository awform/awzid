import { describe, expect, it } from 'vitest';
import { readMode } from '../ui/mode';
import { readPrefs } from '../quran/mushaf';
import { ancienTheme, apresMigration, CLE_MIGRATION, migrerThemesSupprimes } from './migration';

function mem(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

/** appareil déjà utilisé (le lecteur a servi) : la migration s'applique */
const USAGE = { 'awzid.coran.signets.v1': '[]' };

describe('11/10/2026 — migration silencieuse des thèmes supprimés', () => {
  it('reconnaît les anciens noms (accents, casse, nuit étoilée)', () => {
    expect(ancienTheme('Manuscrit')).toBe('manuscrit');
    expect(ancienTheme('jardin')).toBe('jardin');
    expect(ancienTheme('nuit')).toBe('nuit');
    expect(ancienTheme('Nuit étoilée')).toBe('nuit');
    expect(ancienTheme('nuit-etoilee')).toBe('nuit');
    expect(ancienTheme('verdure')).toBe('verdure');
    expect(ancienTheme('violet')).toBeNull();
    expect(ancienTheme(42)).toBeNull();
  });

  it('manuscrit → clair + Sépia ; nuit → sombre ; jardin et verdure → selon le téléphone', () => {
    expect(apresMigration('manuscrit', 'auto', null)).toEqual({ mode: 'clair', fond: 'sepia' });
    expect(apresMigration('nuit', 'auto', null)).toEqual({ mode: 'sombre', fond: null });
    expect(apresMigration('jardin', 'auto', null)).toEqual({ mode: 'auto', fond: null });
    expect(apresMigration('verdure', 'auto', null)).toEqual({ mode: 'auto', fond: null });
    expect(apresMigration('clair', 'auto', null)).toEqual({ mode: 'auto', fond: null });
  });

  it('un choix fait à la main est respecté (mode et fond de lecture)', () => {
    expect(apresMigration('manuscrit', 'sombre', 'ivoire')).toEqual({
      mode: 'sombre',
      fond: 'ivoire',
    });
    expect(apresMigration('nuit', 'clair', null)).toEqual({ mode: 'clair', fond: null });
  });

  it('adulte (ancien manuscrit) : mode clair et lecteur en Sépia, une seule fois', () => {
    const s = mem(USAGE);
    expect(migrerThemesSupprimes(s, 'manuscrit')).toBe(true);
    expect(readMode(s)).toBe('clair');
    expect(readPrefs(s).fond).toBe('sepia');
    expect(s.getItem(CLE_MIGRATION)).toBe('1');
    // deuxième passage : rien ne bouge, même si l'utilisateur change ensuite de réglage
    s.setItem('awzid.mode', 'sombre');
    expect(migrerThemesSupprimes(s, 'manuscrit')).toBe(false);
    expect(readMode(s)).toBe('sombre');
  });

  it('ado (ancienne nuit) : sombre ; enfant (ancien jardin) : le téléphone décide', () => {
    const a = mem(USAGE);
    migrerThemesSupprimes(a, 'nuit');
    expect(readMode(a)).toBe('sombre');
    expect(readPrefs(a).fond).toBe('ivoire');
    const e = mem(USAGE);
    migrerThemesSupprimes(e, 'jardin');
    expect(readMode(e)).toBe('auto');
    expect(e.getItem('awzid.mode')).toBeNull();
  });

  it('appareil neuf : rien ne change (le téléphone décide), drapeau posé', () => {
    const s = mem();
    expect(migrerThemesSupprimes(s, 'manuscrit')).toBe(false);
    expect(s.dump()).toEqual({ [CLE_MIGRATION]: '1' });
  });

  it('ancienne clé de thème ou de palette enregistrée : elle prime, puis elle est effacée', () => {
    const s = mem({ 'awzid.theme': 'nuit étoilée', 'awzid.palette': 'verdure' });
    migrerThemesSupprimes(s, 'clair');
    expect(readMode(s)).toBe('sombre');
    expect(s.getItem('awzid.theme')).toBeNull();
    expect(s.getItem('awzid.palette')).toBeNull();
  });

  it('les autres réglages du lecteur sont conservés', () => {
    const s = mem({ 'awzid.mushaf.v1': JSON.stringify({ size: 2, vue: 'versets' }) });
    migrerThemesSupprimes(s, 'manuscrit');
    const p = readPrefs(s);
    expect([p.size, p.vue, p.fond]).toEqual([2, 'versets', 'sepia']);
  });

  it('aucun écran cassé : contenu abîmé, valeur inconnue ou stockage bloqué', () => {
    const abime = mem({ 'awzid.mushaf.v1': '{pas du json', 'awzid.mode': 'violet' });
    expect(() => migrerThemesSupprimes(abime, 'manuscrit')).not.toThrow();
    expect(readMode(abime)).toBe('clair');
    expect(readPrefs(abime).fond).toBe('sepia');
    const bloque = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
      removeItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(() => migrerThemesSupprimes(bloque, 'nuit')).not.toThrow();
    expect(migrerThemesSupprimes(null, 'nuit')).toBe(false);
    // un fond inconnu dans le lecteur retombe sur l'Ivoire
    expect(readPrefs(mem({ 'awzid.mushaf.v1': JSON.stringify({ fond: 'rose' }) })).fond).toBe(
      'ivoire',
    );
  });
});
