import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEdition } from '@awform/content';
import type { LanguageExercise } from '@awform/content/types';
import {
  checkItem,
  computeUnitProgress,
  correctResponse,
  exerciseTotal,
  isLanguageExercise,
  isValidItemResponse,
  itemSlots,
  plain,
  type ItemResponse,
} from '../src/index.js';

const CONTENT_DIR = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
const HAS_CONTENT = existsSync(join(CONTENT_DIR, 'data', 'index-lecons.js'));

/** Réponses item par item du corrigé : [index, réponse] pour chaque point. */
function goodItems(ex: LanguageExercise): Array<[number, ItemResponse]> {
  const r = correctResponse(ex);
  switch (r.type) {
    case 'premiere_lettre':
    case 'ecoute':
    case 'complete':
      return r.answers.map((a, i) => [i, { choice: a ?? '' }]);
    case 'vrai_faux':
      return r.answers.map((a, i) => [i, { value: !!a }]);
    case 'relier':
      return r.pairs.map((p, i) => [i, { right: p ?? -1 }]);
    case 'chasse':
    case 'contient':
      return r.selected.map((k) => [k, { touched: true }]);
    case 'ordre':
      return r.sequences.map((s, i) => [i, { sequence: [...(s ?? [])] }]);
  }
}

function badItems(ex: LanguageExercise): Array<[number, ItemResponse]> {
  switch (ex.type) {
    case 'premiere_lettre':
      return ex.items.flatMap((it, i) =>
        it.options
          .filter((o) => o !== it.reponse)
          .map((o): [number, ItemResponse] => [i, { choice: o }]),
      );
    case 'ecoute':
      return ex.items.flatMap((it, i) =>
        it.options
          .filter((o) => plain(o) !== plain(it.reponse || it.dit))
          .map((o): [number, ItemResponse] => [i, { choice: o }]),
      );
    case 'complete':
      return ex.items.flatMap((it, i) =>
        it.options
          .filter((o) => plain(o) !== plain(it.reponse))
          .map((o): [number, ItemResponse] => [i, { choice: o }]),
      );
    case 'vrai_faux':
      return ex.items.map((it, i) => [i, { value: !it.vrai }]);
    case 'relier':
      return ex.items.map((_, i) => [i, { right: (i + 1) % ex.items.length }]);
    case 'chasse':
    case 'contient': {
      const good = new Set(goodItems(ex).map(([k]) => k));
      return [...Array(itemSlots(ex)).keys()]
        .filter((k) => !good.has(k))
        .map((k) => [k, { touched: true }]);
    }
    case 'ordre':
      return ex.items.map((it, i) => [i, { sequence: [...it.mots.keys()].slice(0, -1) }]);
  }
}

const cases: Array<{ key: string; ex: LanguageExercise }> = [];
if (HAS_CONTENT) {
  const load = loadEdition({
    contentDir: CONTENT_DIR,
    levels: ['en1', 'ad1'],
    withRegistry: false,
    withIllustrations: false,
  });
  for (const l of load.levels)
    for (const u of l.units)
      for (const e of u.exercises)
        if (isLanguageExercise(e.content)) cases.push({ key: e.key, ex: e.content });
}

describe.skipIf(!HAS_CONTENT)(
  'correction item par item sur le corpus réel (appareil = serveur)',
  () => {
    it.each(cases)('$key', ({ ex }) => {
      const good = goodItems(ex);
      expect(good.length).toBe(exerciseTotal(ex));
      for (const [i, r] of good) {
        expect(isValidItemResponse(ex, r)).toBe(true);
        expect(checkItem(ex, i, r), `item ${i}`).toBe(true);
      }
      const bad = badItems(ex);
      expect(bad.length).toBeGreaterThan(0);
      for (const [i, r] of bad)
        expect(checkItem(ex, i, r), `item ${i} ${JSON.stringify(r)}`).toBe(false);
    });
  },
);

describe('entrées invalides', () => {
  const ex: LanguageExercise = { type: 'vrai_faux', items: [{ vrai: true }] };
  it('refuse un index hors limites ou une forme de réponse inattendue', () => {
    expect(checkItem(ex, 5, { value: true })).toBe(false);
    expect(checkItem(ex, -1, { value: true })).toBe(false);
    expect(isValidItemResponse(ex, { choice: 'x' })).toBe(false);
    expect(checkItem(ex, 0, { choice: 'x' } as ItemResponse)).toBe(false);
  });
});

describe('progression recalculée', () => {
  const ex1: LanguageExercise = { type: 'vrai_faux', items: [{ vrai: true }, { vrai: false }] };
  const ex2: LanguageExercise = { type: 'chasse', cible: 'ب', grille: ['ب', 'ت', 'ب'] };
  const exs = [
    { id: 'u.ex1', content: ex1 },
    { id: 'u.ex2', content: ex2 },
  ];
  it('ouverte sans tentative', () => {
    expect(computeUnitProgress(exs, [], false).status).toBe('ouverte');
  });
  it('premier essai pour le score, meilleur essai pour l’élève ; terminée avec l’auto-évaluation', () => {
    const a = [
      { exerciseId: 'u.ex1', itemIndex: 0, correct: false, order: 1 },
      { exerciseId: 'u.ex1', itemIndex: 0, correct: true, order: 2 },
      { exerciseId: 'u.ex1', itemIndex: 1, correct: true, order: 3 },
      { exerciseId: 'u.ex2', itemIndex: 0, correct: true, order: 4 },
      { exerciseId: 'u.ex2', itemIndex: 1, correct: false, order: 5 },
      { exerciseId: 'u.ex2', itemIndex: 2, correct: true, order: 6 },
    ];
    const p = computeUnitProgress(exs, a, false);
    expect(p.status).toBe('commencee');
    expect(p.score).toBeCloseTo((0.5 + 1) / 2);
    expect(p.bestScore).toBe(1);
    expect(p.exercises[1]?.errors).toBe(1);
    expect(computeUnitProgress(exs, a, true).status).toBe('terminee');
    const perfect = a.filter((x) => x.order !== 1 && x.order !== 5);
    expect(computeUnitProgress(exs, perfect, true).status).toBe('maitrisee');
  });
});
