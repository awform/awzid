import { describe, expect, it } from 'vitest';
import { MUTASHABIHAT, prochesDe, type Mutashabih } from './mutashabihat';
import {
  amorce,
  carteErreurs,
  dansMemorise,
  fraicheur,
  marquesDesBilans,
  parSourate,
  passagesMemorises,
  pointsFaibles,
  QUALITE,
  SEUILS,
  tirageImpose,
  tirer,
  urgentsDabord,
  versetsDe,
  type Marque,
} from './outils';

/** Hifẓ complet — logique pure des outils (aucun texte coranique ici : seulement des références). */

const ikhlas = { s: 112, from: 1, to: 4 };
const falaq = { s: 113, from: 1, to: 5 };

describe('passages mémorisés', () => {
  it('seules les parts apprises, avec leurs plages', () => {
    const refs = new Map([
      ['112:1-4', { ref: [ikhlas] }],
      ['113:1-5', { ref: [falaq] }],
    ]);
    const p = passagesMemorises(
      [
        { key: '112:1-4', learnedDay: 20_000 },
        { key: '113:1-5', learnedDay: null },
      ],
      refs,
    );
    expect(p).toEqual([{ key: '112:1-4', ref: [ikhlas] }]);
  });
  it('versets sans doublon', () => {
    expect(versetsDe([ikhlas, { s: 112, from: 3, to: 4 }])).toHaveLength(4);
  });
});

describe('test au hasard', () => {
  it('tire un verset des plages mémorisées et la suite (2 versets) sans sortir de la plage', () => {
    expect(tirer([ikhlas], () => 0)).toEqual({ s: 112, a: 1, to: 3 });
    expect(tirer([ikhlas], () => 0.99)).toEqual({ s: 112, a: 4, to: 4 });
    expect(tirer([], () => 0)).toBeNull();
  });
  it('évite les versets déjà tirés tant qu’il en reste', () => {
    const deja = new Set(['112:1', '112:2', '112:3']);
    expect(tirer([ikhlas], () => 0, deja)).toMatchObject({ a: 4 });
    deja.add('112:4');
    expect(tirer([ikhlas], () => 0, deja)).toMatchObject({ a: 1 });
  });
  it('tous les versets peuvent sortir (répartition uniforme)', () => {
    const vus = new Set<number>();
    for (let i = 0; i < 9; i++) vus.add(tirer([ikhlas, falaq], () => i / 9)!.a + 0);
    expect(vus.size).toBeGreaterThanOrEqual(5);
  });
  it('verset imposé seulement s’il est mémorisé', () => {
    expect(tirageImpose([ikhlas], '112:2')).toEqual({ s: 112, a: 2, to: 4 });
    expect(tirageImpose([ikhlas], '2:255')).toBeNull();
    expect(tirageImpose([ikhlas], 'x')).toBeNull();
  });
  it('amorce : le premier tiers (1 à 5 mots), jamais tout le verset', () => {
    expect(amorce(1)).toBe(1);
    expect(amorce(2)).toBe(1);
    expect(amorce(4)).toBe(2);
    expect(amorce(9)).toBe(3);
    expect(amorce(40)).toBe(5);
  });
  it('auto-évaluation → résultat du moteur (juste 3, hésitant 2, oublié 0)', () => {
    expect(QUALITE).toEqual({ juste: 3, hesitant: 2, oublie: 0 });
  });
});

describe('carte des erreurs', () => {
  const m = (day: string, a: number, k: number, t: Marque['t']): Marque => ({
    day,
    s: 112,
    a,
    k,
    t,
  });
  it('par verset et par mot ; une récitation juste résout les marques plus anciennes', () => {
    const carte = carteErreurs([
      m('2026-10-01', 1, 2, 'erreur'),
      m('2026-10-01', 1, 2, 'hesitation'),
      m('2026-10-02', 2, -1, 'oubli'),
      m('2026-10-03', 3, 0, 'hesitation'),
      m('2026-10-04', 3, -1, 'juste'),
    ]);
    expect([...carte.keys()].sort()).toEqual(['112:1', '112:2']);
    const v1 = carte.get('112:1')!;
    expect(v1).toMatchObject({ erreurs: 1, hesitations: 1, oublis: 0 });
    // l'erreur reste la marque la plus forte du mot
    expect(v1.mots.get(2)).toBe('erreur');
    expect(carte.get('112:2')!.mots.size).toBe(0);
  });
  it('ordre du journal : une marque après « juste » redevient active', () => {
    const carte = carteErreurs([m('2026-10-05', 1, 0, 'erreur'), m('2026-10-04', 1, -1, 'juste')]);
    expect(carte.get('112:1')?.erreurs).toBe(1);
  });
  it('points faibles : du plus lourd au plus léger', () => {
    const l = pointsFaibles(
      carteErreurs([m('2026-10-01', 1, 0, 'hesitation'), m('2026-10-01', 2, 0, 'erreur')]),
    );
    expect(l.map((p) => p.a)).toEqual([2, 1]);
  });
  it('bilans de l’IA d’écoute → erreurs sur les mots ; le doute n’est jamais une erreur', () => {
    const r = marquesDesBilans([
      {
        date: '2026-10-02T10:00:00.000Z',
        mots: [
          [112, 1, 2, 'oublie'],
          [112, 1, 3, 'doute'],
        ],
      },
    ]);
    expect(r).toEqual([{ day: '2026-10-02', s: 112, a: 1, k: 2, t: 'erreur', src: 'ecoute' }]);
  });
});

describe('fraîcheur', () => {
  const passages = [
    { key: '112:1-4', ref: [ikhlas] },
    { key: '113:1-5', ref: [falaq] },
    { key: '114:1-6', ref: [{ s: 114, from: 1, to: 6 }] },
  ];
  it('frais, à revoir, urgent selon la dernière révision réussie (ou ratée)', () => {
    const f = fraicheur(
      passages,
      [
        { day: '2026-10-01', part: '112:1-4', kind: 'appris', q: null },
        { day: '2026-10-10', part: '112:1-4', kind: 'revision', q: 3 },
        { day: '2026-09-01', part: '113:1-5', kind: 'appris', q: null },
        { day: '2026-10-02', part: '113:1-5', kind: 'revision', q: 2 },
        { day: '2026-10-11', part: '114:1-6', kind: 'appris', q: null },
        { day: '2026-10-12', part: '114:1-6', kind: 'revision', q: 1 },
      ],
      '2026-10-12',
    );
    expect(f.map((x) => [x.key, x.niveau, x.jours])).toEqual([
      ['112:1-4', 'frais', 2],
      ['113:1-5', 'a_revoir', 10],
      // dernière révision ratée : urgent même si l'apprentissage est récent
      ['114:1-6', 'urgent', 1],
    ]);
  });
  it('urgent au-delà du seuil', () => {
    const [f] = fraicheur(
      [passages[0]!],
      [{ day: '2026-08-01', part: '112:1-4', kind: 'appris', q: null }],
      '2026-10-12',
    );
    expect(f!.jours).toBeGreaterThanOrEqual(SEUILS.urgent);
    expect(f!.niveau).toBe('urgent');
  });
  it('par sourate : le niveau le plus urgent d’abord', () => {
    const f = fraicheur(
      passages.slice(0, 2),
      [
        { day: '2026-10-11', part: '112:1-4', kind: 'appris', q: null },
        { day: '2026-08-01', part: '113:1-5', kind: 'appris', q: null },
      ],
      '2026-10-12',
    );
    expect(parSourate(f).map((s) => [s.s, s.niveau])).toEqual([
      [113, 'urgent'],
      [112, 'frais'],
    ]);
  });
  it('séance du jour : dans une piste, l’urgent d’abord, l’ordre du moteur sinon', () => {
    const items = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
    const n = new Map([
      ['b', 'urgent' as const],
      ['c', 'a_revoir' as const],
      ['d', 'urgent' as const],
    ]);
    expect(urgentsDabord(items, n).map((x) => x.key)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('deux rakʿa', () => {
  it('un passage choisi doit être (une partie d’)un passage mémorisé', () => {
    expect(dansMemorise({ s: 112, from: 1, to: 2 }, [ikhlas])).toBe(true);
    expect(dansMemorise({ s: 112, from: 3, to: 5 }, [ikhlas])).toBe(false);
    expect(dansMemorise({ s: 2, from: 255, to: 255 }, [ikhlas])).toBe(false);
    expect(dansMemorise({ s: 112, from: 3, to: 2 }, [ikhlas])).toBe(false);
  });
});

describe('mutashābihāt (structure seulement)', () => {
  it('la liste livrée est VIDE : aucune donnée créée par l’équipe', () => {
    expect(MUTASHABIHAT).toEqual([]);
    expect(prochesDe(2, 35)).toEqual([]);
  });
  it('alerte « verset proche de… » dans les deux sens, seulement pour une paire sourcée', () => {
    // références FICTIVES de test (aucune affirmation savante) : la structure seule est vérifiée
    const liste: Mutashabih[] = [
      { a: { s: 1, a: 1 }, b: { s: 1, a: 2 }, source: 'source de test' },
      { a: { s: 1, a: 3 }, b: { s: 1, a: 4 }, source: '  ' },
    ];
    expect(prochesDe(1, 1, liste)).toEqual([{ s: 1, a: 2 }]);
    expect(prochesDe(1, 2, liste)).toEqual([{ s: 1, a: 1 }]);
    expect(prochesDe(1, 3, liste)).toEqual([]);
  });
});
