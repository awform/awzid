import { describe, expect, it } from 'vitest';
import {
  etapesCoran,
  juzAmmaShare,
  nextActivity,
  tabsFor,
  versetMots,
  type Resume,
} from './parcours';

const lesson = (id: string, n: number, kind = 'lecon') => ({
  id,
  n,
  kind,
  numLecon: n,
  titleFr: `L${n}`,
});
const base: Resume = {
  courant: { code: 'en1', titre: 'Livre 1', titreAr: null, depuis: null, origine: 'inscription' },
  proposition: null,
  progression: { faites: 0, total: 25 },
  enCours: null,
  prochaine: lesson('en1.l01', 1),
  derniere: null,
  examen: { id: 'en1.l26', statut: null },
  suivant: { code: 'en2', titre: 'Livre 2' },
};
const TODAY = '2026-10-05';

describe('A27 — « Ma prochaine activité » selon le livre', () => {
  it('sans niveau : commencer (proposition ou test de positionnement)', () => {
    expect(nextActivity({ ...base, courant: null, proposition: 'ad1' }, 0, TODAY)).toEqual({
      kind: 'commencer',
      matiere: 'arabe',
      proposition: 'ad1',
    });
  });
  it('la prochaine leçon du livre', () => {
    expect(nextActivity(base, 0, TODAY)).toMatchObject({
      kind: 'lecon',
      unitId: 'en1.l01',
      reprise: false,
    });
  });
  it('une leçon commencée passe avant tout', () => {
    const a = {
      ...base,
      enCours: lesson('en1.l03', 3),
      derniere: {
        ...lesson('en1.l02', 2),
        le: `${TODAY}T08:00:00Z`,
        aEcriture: true,
        ecritureFaite: false,
      },
    };
    expect(nextActivity(a, 5, TODAY)).toMatchObject({
      kind: 'lecon',
      unitId: 'en1.l03',
      reprise: true,
    });
  });
  it('puis l’écriture de la leçon qui vient d’être faite', () => {
    const a = {
      ...base,
      prochaine: lesson('en1.l03', 3),
      derniere: {
        ...lesson('en1.l02', 2),
        le: `${TODAY}T08:00:00Z`,
        aEcriture: true,
        ecritureFaite: false,
      },
    };
    expect(nextActivity(a, 5, TODAY)).toMatchObject({ kind: 'ecriture', unitId: 'en1.l02' });
  });
  it('puis les révisions dues après la leçon du jour, sinon la leçon suivante', () => {
    const d = {
      ...lesson('en1.l02', 2),
      le: `${TODAY}T08:00:00Z`,
      aEcriture: true,
      ecritureFaite: true,
    };
    const a = { ...base, prochaine: lesson('en1.l03', 3), derniere: d };
    expect(nextActivity(a, 4, TODAY)).toEqual({ kind: 'revisions', mots: 4 });
    expect(nextActivity(a, 0, TODAY)).toMatchObject({ kind: 'lecon', unitId: 'en1.l03' });
    // leçon faite un autre jour : la leçon suivante d'abord
    expect(
      nextActivity({ ...a, derniere: { ...d, le: '2026-10-01T08:00:00Z' } }, 4, TODAY),
    ).toMatchObject({
      kind: 'lecon',
    });
  });
  it('toutes les leçons faites : révisions, puis l’épreuve de fin de niveau', () => {
    const a = { ...base, prochaine: lesson('en1.l26', 26, 'examen') };
    expect(nextActivity(a, 3, TODAY)).toEqual({ kind: 'revisions', mots: 3 });
    expect(nextActivity(a, 0, TODAY)).toEqual({ kind: 'epreuve', niveau: 'en1' });
    expect(nextActivity({ ...a, suivant: null }, 0, TODAY)).toEqual({ kind: 'lectures' });
  });
});

describe('A27 — onglets du niveau : seulement ceux qui ont du contenu', () => {
  const u = (aEcriture: boolean) => ({ aEcriture }) as never;
  it('adulte : leçons, lectures, écriture, pratique, mots du Coran', () => {
    expect(
      tabsFor(
        { unites: [u(true)], livrets: 3, mots: 50, progression: { faites: 1, total: 25 } },
        'adulte',
      ),
    ).toEqual(['lecons', 'lectures', 'ecriture', 'pratique', 'mots']);
  });
  it('un onglet sans contenu à ce niveau n’apparaît pas', () => {
    expect(
      tabsFor(
        { unites: [u(false)], livrets: 0, mots: 0, progression: { faites: 0, total: 25 } },
        'ado',
      ),
    ).toEqual(['lecons']);
  });
  it('enfant : leçons, lectures, écriture seulement (mots du Coran dans les jeux de révision)', () => {
    expect(
      tabsFor(
        { unites: [u(true)], livrets: 2, mots: 60, progression: { faites: 4, total: 26 } },
        'enfant',
      ),
    ).toEqual(['lecons', 'lectures', 'ecriture']);
  });
});

describe('A27 — J’écris le Coran : étapes', () => {
  const counts = Array.from({ length: 114 }, (_, i) => (i >= 77 ? 10 : 7));
  it('moitié du Juzʾ ʿAmma calculée sur les sourates 78 à 114', () => {
    const acquis = new Set<string>();
    for (let s = 78; s <= 114; s++) for (let a = 1; a <= 5; a++) acquis.add(`${s}:${a}`);
    acquis.add('2:1');
    expect(juzAmmaShare(acquis, counts)).toBe(0.5);
  });
  it('étape 2 après l’étape 1 du verset ; étape 3 : qc1 terminé ET moitié du Juzʾ ʿAmma', () => {
    expect(etapesCoran('1:2', [], false, 0)).toEqual({ 1: true, 2: false, 3: false });
    expect(etapesCoran('1:2', ['1:2:1'], false, 0.9)).toEqual({ 1: true, 2: true, 3: false });
    expect(etapesCoran('1:2', ['1:2:1'], true, 0.4)).toEqual({ 1: true, 2: true, 3: false });
    expect(etapesCoran('1:2', [], true, 0.5)).toEqual({ 1: true, 2: false, 3: true });
  });
  it('mots du verset : découpés aux espaces seulement, texte jamais retouché', () => {
    const v = 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ';
    expect(versetMots(v).join(' ')).toBe(v);
    expect(versetMots(v)).toHaveLength(4);
  });
});
