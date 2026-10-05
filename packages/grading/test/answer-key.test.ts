import { describe, expect, it } from 'vitest';
import type {
  ChasseExercise,
  CompleteExercise,
  OrdreExercise,
  RelierExercise,
  VraiFauxExercise,
} from '@awform/content/types';
import { answerKey } from '../src/index.js';

const same = (a: unknown, b: unknown) =>
  JSON.stringify(answerKey(a as never)) === JSON.stringify(answerKey(b as never));

describe('corrigé distinct du texte (F1, E5)', () => {
  const vf: VraiFauxExercise = {
    type: 'vrai_faux',
    consigne_fr: 'Vrai ou faux ?',
    items: [
      { fr: 'Le chat dort', vrai: true },
      { fr: 'Le chien vole', vrai: false },
    ],
  };
  it('une coquille de consigne ou de texte ne change pas le corrigé', () => {
    const fixed = {
      ...vf,
      consigne_fr: 'Vrai ou faux ?!',
      items: [{ fr: 'Le chat dort.', vrai: true }, vf.items[1]],
    };
    expect(same(vf, fixed)).toBe(true);
  });
  it('une réponse attendue changée, ou un item ajouté, change le corrigé', () => {
    expect(same(vf, { ...vf, items: [vf.items[0], { ...vf.items[1], vrai: true }] })).toBe(false);
    expect(same(vf, { ...vf, items: [...vf.items, { fr: 'x', vrai: true }] })).toBe(false);
  });
  it('complete : crochets de couleur ignorés, réponse comparée', () => {
    const c: CompleteExercise = {
      type: 'complete',
      items: [{ avant: 'ذَهَبَ', options: ['[إِلَى]', 'فِي'], reponse: '[إِلَى]', fr: 'Il va à' }],
    };
    const typo = { ...c, items: [{ ...c.items[0]!, fr: 'Il est allé à', reponse: 'إِلَى' }] };
    expect(same(c, typo)).toBe(true);
    expect(same(c, { ...c, items: [{ ...c.items[0]!, reponse: 'فِي' }] })).toBe(false);
  });
  it('relier : voyelles et traduction corrigées → même corrigé ; autre mot → corrigé changé', () => {
    const r: RelierExercise = {
      type: 'relier',
      items: [
        { ar: 'بَابٌ', img: 'door', fr: 'porte' },
        { ar: 'قَلَمٌ', img: 'pen', fr: 'stylo' },
      ],
    };
    expect(
      same(r, { ...r, items: [{ ar: 'بَابُ', img: 'door', fr: 'une porte' }, r.items[1]] }),
    ).toBe(true);
    expect(same(r, { ...r, items: [{ ar: 'بَيْتٌ', img: 'door' }, r.items[1]] })).toBe(false);
  });
  it('chasse et ordre : par cases attendues et par suite d’étiquettes', () => {
    const ch: ChasseExercise = { type: 'chasse', cible: 'ب', grille: ['بَ', 'تَ', 'بُ'] };
    expect(same(ch, { ...ch, grille: ['بِ', 'تِ', 'بُ'] })).toBe(true);
    expect(same(ch, { ...ch, grille: ['تَ', 'بَ', 'بُ'] })).toBe(false);
    const o: OrdreExercise = {
      type: 'ordre',
      items: [{ mots: ['بَيْتٌ', 'هٰذَا'], phrase: 'هٰذَا بَيْتٌ', fr: 'Ceci est une maison' }],
    };
    expect(same(o, { ...o, items: [{ ...o.items[0]!, fr: 'C’est une maison' }] })).toBe(true);
    expect(same(o, { ...o, items: [{ ...o.items[0]!, mots: ['هٰذَا', 'بَيْتٌ'] }] })).toBe(false);
  });
  it('exercice non noté : tout le contenu, sauf le champ « id »', () => {
    const q = { type: 'question', consigne_fr: 'Raconte', id: 'en1.l01.ex9' };
    expect(same(q, { ...q, id: 'autre' })).toBe(true);
    expect(same(q, { ...q, consigne_fr: 'Raconte !' })).toBe(false);
  });
});
