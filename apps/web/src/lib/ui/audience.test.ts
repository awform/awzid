import { describe, expect, it } from 'vitest';
import { activeNav, ancienThemeDuPublic, audienceOf, navFor, type Context } from './audience';

const ctx = (c: Partial<Context>): Context => ({
  profileKind: null,
  accountKind: null,
  profileKinds: [],
  path: '/',
  ...c,
});

describe('lot 26 — public et navigation', () => {
  it("11/10/2026 : plus de thème par public ; l'ancien thème sert seulement à la migration", () => {
    expect(
      ancienThemeDuPublic(audienceOf(ctx({ accountKind: 'parent', profileKind: 'enfant' }))),
    ).toBe('jardin');
    expect(
      ancienThemeDuPublic(audienceOf(ctx({ accountKind: 'parent', profileKind: 'ado' }))),
    ).toBe('nuit');
    expect(
      ancienThemeDuPublic(audienceOf(ctx({ accountKind: 'adulte', profileKinds: ['adulte'] }))),
    ).toBe('manuscrit');
    for (const c of [
      { accountKind: 'parent' },
      { accountKind: 'enseignant' },
      { accountKind: 'admin' },
      {},
    ] as const)
      expect(ancienThemeDuPublic(audienceOf(ctx(c)))).toBe('clair');
  });

  it("les espaces du parent restent « clairs » même quand un enfant est actif sur l'appareil", () => {
    for (const path of ['/profils', '/compte', '/messages', '/abonnement'])
      expect(audienceOf(ctx({ accountKind: 'parent', profileKind: 'enfant', path }))).toBe(
        'parent',
      );
    expect(audienceOf(ctx({ accountKind: 'parent', profileKind: 'enfant', path: '/coran' }))).toBe(
      'enfant',
    );
  });

  it('un compte adulte (16-17 ans) dont le profil est « ado » est de public « ado »', () => {
    expect(audienceOf(ctx({ accountKind: 'adulte', profileKinds: ['ado'] }))).toBe('ado');
  });

  it('3 à 5 entrées par public, toujours', () => {
    for (const a of [
      'enfant',
      'ado',
      'adulte',
      'parent',
      'enseignant',
      'admin',
      'visiteur',
    ] as const) {
      const n = navFor(a).length;
      expect(n, a).toBeGreaterThanOrEqual(3);
      expect(n, a).toBeLessThanOrEqual(5);
    }
  });

  it("l'entrée active suit la page (matières, « Plus », espace enseignant)", () => {
    const adulte = navFor('adulte');
    expect(activeNav(adulte, '/')).toBe('arabe');
    expect(activeNav(adulte, '/lecons/ad1.l03')).toBe('arabe');
    // A12 : « Sciences » sous « Plus » pour les adultes (l'enfant garde son entrée)
    expect(activeNav(adulte, '/lecons/re1.l03')).toBe('plus');
    expect(activeNav(adulte, '/sciences')).toBe('plus');
    expect(activeNav(navFor('enfant'), '/lecons/re1.l03')).toBe('sciences');
    expect(activeNav(adulte, '/hifz')).toBe('coran');
    expect(activeNav(adulte, '/coran/lecteur')).toBe('coran');
    expect(activeNav(adulte, '/aujourdhui')).toBe('aujourdhui');
    // A37 : « Vivre l'islam » (bon comportement, prières, qibla, adhkār, verset) à la place de « Prières »
    for (const p of [
      '/vivre',
      '/vivre/fiche',
      '/quotidien',
      '/quotidien/qibla',
      '/quotidien/adhkar',
    ])
      expect(activeNav(adulte, p), p).toBe('vivre');
    for (const a of ['enfant', 'ado', 'adulte', 'parent', 'visiteur'] as const)
      expect(
        navFor(a).some((x) => x.id === 'vivre'),
        a,
      ).toBe(true);
    // même place que « Prières » : 4e entrée des ados et adultes
    expect(navFor('ado').map((x) => x.id)).toEqual([
      'aujourdhui',
      'arabe',
      'coran',
      'vivre',
      'plus',
    ]);
    for (const p of ['/ecriture', '/lectures/x', '/revisions', '/suivi', '/plus'])
      expect(activeNav(adulte, p), p).toBe('plus');
    const enfant = navFor('enfant');
    expect(enfant.map((x) => x.id)).toEqual(['aujourdhui', 'arabe', 'coran', 'vivre', 'sciences']);
    expect(activeNav(enfant, '/vivre')).toBe('vivre');
    // l'écriture de l'enfant se fait depuis l'espace Arabe
    expect(activeNav(enfant, '/ecriture')).toBe('arabe');
    const ens = navFor('enseignant');
    expect(activeNav(ens, '/enseignant/ecole')).toBe('ecole');
    expect(activeNav(ens, '/enseignant/classe/42')).toBe('classes');
  });
});
