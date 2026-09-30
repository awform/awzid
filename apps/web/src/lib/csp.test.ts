/**
 * Politique de sécurité du contenu (complément A) : aucune ressource tierce, aucun script ni <style> en ligne
 * autorisé globalement ; seuls les attributs style restent permis ; objets et cadres interdits.
 */
import { describe, expect, it } from 'vitest';
import config from '../../svelte.config.js';

const d = config.kit!.csp!.directives! as Record<string, string[]>;

describe('CSP', () => {
  it('aucune source « unsafe » pour les scripts, les feuilles de style et la valeur par défaut', () => {
    for (const k of ['default-src', 'script-src', 'style-src'])
      expect(
        d[k]!.filter((x) => x.startsWith('unsafe')),
        k,
      ).toEqual([]);
    expect(d['style-src-attr']).toEqual(['unsafe-inline']);
  });
  it('aucune origine tierce : seulement self, data: pour les images, blob: pour l’audio', () => {
    for (const [k, v] of Object.entries(d))
      for (const x of v)
        expect(['self', 'none', 'unsafe-inline', 'data:', 'blob:'].includes(x), `${k} ${x}`).toBe(
          true,
        );
    expect(d['img-src']).toEqual(['self', 'data:']);
    expect(d['media-src']).toEqual(['self', 'blob:']);
  });
  it('ni objets, ni intégration dans un cadre, ni envoi de formulaire ailleurs', () => {
    expect(d['object-src']).toEqual(['none']);
    expect(d['frame-ancestors']).toEqual(['none']);
    expect(d['form-action']).toEqual(['self']);
    expect(d['base-uri']).toEqual(['self']);
  });
});
