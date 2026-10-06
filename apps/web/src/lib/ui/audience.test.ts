import { describe, expect, it } from 'vitest';
import { activeNav, audienceOf, navFor, paletteOf, themeOf, type Context } from './audience';

const ctx = (c: Partial<Context>): Context => ({
  profileKind: null,
  accountKind: null,
  profileKinds: [],
  path: '/',
  ...c,
});

describe('lot 26 — public, thème et navigation', () => {
  it('le thème suit le public : enfant → jardin, ado → nuit, adulte → manuscrit, autres → clair', () => {
    expect(themeOf(audienceOf(ctx({ accountKind: 'parent', profileKind: 'enfant' })))).toBe(
      'jardin',
    );
    expect(themeOf(audienceOf(ctx({ accountKind: 'parent', profileKind: 'ado' })))).toBe('nuit');
    expect(themeOf(audienceOf(ctx({ accountKind: 'adulte', profileKinds: ['adulte'] })))).toBe(
      'manuscrit',
    );
    expect(themeOf(audienceOf(ctx({ accountKind: 'parent' })))).toBe('clair');
    expect(themeOf(audienceOf(ctx({ accountKind: 'enseignant' })))).toBe('clair');
    expect(themeOf(audienceOf(ctx({ accountKind: 'admin' })))).toBe('clair');
    expect(themeOf(audienceOf(ctx({})))).toBe('clair');
  });

  it('palette verdure par public : adultes partout, enfants et ados jamais (Coran compris), visiteurs au Coran', () => {
    for (const p of ['/coran/lecteur', '/hifz', '/lecons/ad1.l01', '/', '/quotidien'])
      expect(paletteOf('adulte', p), p).toBe('verdure');
    for (const a of ['enfant', 'ado'] as const)
      for (const p of ['/coran/lecteur', '/hifz', '/lecons/ad1.l01'])
        expect(paletteOf(a, p), `${a} ${p}`).toBeNull();
    expect(paletteOf('visiteur', '/coran/lecteur')).toBe('verdure');
    expect(paletteOf('visiteur', '/hifz')).toBe('verdure');
    expect(paletteOf('visiteur', '/coranique')).toBeNull();
    expect(paletteOf('visiteur', '/lecons/ad1.l01')).toBeNull();
    for (const a of ['parent', 'enseignant', 'admin'] as const)
      expect(paletteOf(a, '/coran')).toBeNull();
    // réglage par public prêt pour la suite (p. ex. les ados aussi, plus tard)
    expect(paletteOf('ado', '/', { ado: 'partout' })).toBe('verdure');
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

  it('un compte adulte (16-17 ans) dont le profil est « ado » a le thème nuit', () => {
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
    expect(activeNav(adulte, '/quotidien/qibla')).toBe('quotidien');
    for (const a of ['ado', 'adulte', 'parent', 'visiteur'] as const)
      expect(
        navFor(a).some((x) => x.id === 'quotidien'),
        a,
      ).toBe(true);
    for (const p of ['/ecriture', '/lectures/x', '/revisions', '/suivi', '/plus'])
      expect(activeNav(adulte, p), p).toBe('plus');
    const enfant = navFor('enfant');
    expect(activeNav(enfant, '/ecriture')).toBe('ecriture');
    const ens = navFor('enseignant');
    expect(activeNav(ens, '/enseignant/ecole')).toBe('ecole');
    expect(activeNav(ens, '/enseignant/classe/42')).toBe('classes');
  });
});
