import { describe, expect, it } from 'vitest';
import { navFor } from '$lib/ui/audience';
import { navPourEnfant, pageOuverteAEnfant } from './enfant-session';

describe('interface de l’enfant en session limitée', () => {
  it('réglages, profils, compte, paiements, accords, famille, école, messages : fermés', () => {
    for (const p of [
      '/compte',
      '/compte/securite',
      '/profils',
      '/abonnement',
      '/offres',
      '/famille',
      '/acces/accords',
      '/ecole',
      '/enseignant',
      '/admin',
      '/messages',
      '/plus',
      '/ma-classe',
      '/recital',
      '/tuteur',
      '/cahier-parler',
      '/inscription',
    ])
      expect(pageOuverteAEnfant(p), p).toBe(false);
  });
  it('apprentissage : ouvert', () => {
    for (const p of [
      '/',
      '/aujourdhui',
      '/lecons/en1',
      '/coran',
      '/vivre',
      '/sciences',
      '/ecriture',
      '/hors-ligne',
      '/aide',
      '/connexion',
    ])
      expect(pageOuverteAEnfant(p), p).toBe(true);
  });
  it('navigation : aucun onglet vers une page fermée, pour chaque public', () => {
    for (const a of ['enfant', 'ado', 'adulte'] as const) {
      const nav = navPourEnfant(navFor(a));
      expect(nav.length).toBeGreaterThan(0);
      for (const x of nav) expect(pageOuverteAEnfant(x.href), `${a} ${x.id}`).toBe(true);
    }
    expect(navPourEnfant(navFor('enfant')).map((x) => x.id)).toEqual([
      'aujourdhui',
      'arabe',
      'coran',
      'vivre',
      'sciences',
    ]);
  });
});

describe('fonctions fermées à l’enfant (écoute / récitation, tuteur, signalement, avis, khatma)', () => {
  it('fn() les refuse en session d’enfant, les laisse ouvertes sinon', async () => {
    const { fn, fonctionsEtat, FERMEES_ENFANT } = await import('$lib/fonctions.svelte');
    fonctionsEtat.restreint = false;
    const avant = [...FERMEES_ENFANT].map((k) => fn(k));
    expect(avant).toContain(true); // au moins une est ouverte hors session d'enfant : le test est parlant
    fonctionsEtat.restreint = true;
    for (const k of FERMEES_ENFANT) expect(fn(k), k).toBe(false);
    expect(fn('vivre_islam')).toBe(true);
    fonctionsEtat.restreint = false;
  });
});
