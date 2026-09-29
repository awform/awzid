import { describe, expect, it } from 'vitest';
import { renderVerification, type Verification } from './verification';

const V: Verification = {
  numero: 'AWF-EN1-2026-0001',
  type: 'niveau',
  sujet: 'en1',
  sujetTitre: 'Enfants — niveau 1',
  titulaire: '<script>alert(1)</script>',
  mention: 'Très bien',
  delivreLe: '2026-09-29T10:00:00Z',
  statut: 'valide',
  annulation: null,
  signature: 'valide',
};

describe('page publique de vérification', () => {
  it('sans JavaScript ; tout texte échappé ; registre seulement', () => {
    const h = renderVerification(V, V.numero);
    expect(h).not.toMatch(/<script/i);
    expect(h).toContain('&#60;script&#62;');
    expect(h).toContain('AWF-EN1-2026-0001');
    expect(h).toContain('class="s ok"');
  });
  it('annulé, signature invalide ou introuvable : bandeau d’alerte', () => {
    expect(
      renderVerification(
        { ...V, statut: 'annule', annulation: { le: V.delivreLe, motif: 'x' } },
        V.numero,
      ),
    ).toContain('class="s ko"');
    expect(renderVerification({ ...V, signature: 'invalide' }, V.numero)).toContain('class="s ko"');
    const none = renderVerification(null, 'AWF-EN1-2026-9999');
    expect(none).toContain('class="s ko"');
    expect(none).not.toContain('<table>');
  });
});
