/**
 * Lot 19 — notation d'une épreuve (serveur) : une réponse par item, « chasse » / « contient » avec retrait
 * des cases touchées à tort (plancher 0), types non « langue » ignorés, réponses mal formées ignorées,
 * note sur le barème arrondie au demi-point, seuil de remédiation 8/20.
 */
import { describe, expect, it } from 'vitest';
import { examScore, gradeExam, gradeTraining, needsRemediation } from '../src/index.js';

// exercices SYNTHÉTIQUES (lettres seules, aucun contenu des livres)
const EX = [
  {
    id: 'b.ex1',
    content: {
      type: 'premiere_lettre',
      items: [
        { suite: 'ـاب', reponse: 'ب', options: ['ب', 'ت'] },
        { suite: 'ـين', reponse: 'ت', options: ['ب', 'ت'] },
      ],
    },
  },
  { id: 'b.ex2', content: { type: 'chasse', cible: 'ب', grille: ['ب', 'ت', 'ب', 'ث'] } },
  {
    id: 'b.ex3',
    content: {
      type: 'vrai_faux',
      items: [
        { ar: 'ا', vrai: true },
        { ar: 'ب', vrai: false },
      ],
    },
  },
  { id: 'b.ex4', content: { type: 'question', items: [{ q_fr: 'À l’oral' }] } },
];

describe('gradeExam', () => {
  it('copie parfaite : tous les points ; questions ouvertes non comptées', () => {
    const g = gradeExam(EX, {
      'b.ex1': { 0: { choice: 'ب' }, 1: { choice: 'ت' } },
      'b.ex2': { 0: { touched: true }, 2: { touched: true } },
      'b.ex3': { 0: { value: true }, 1: { value: false } },
    });
    expect(g).toMatchObject({ points: 6, max: 6 });
    expect(g.exercises.map((e) => e.exerciseId)).toEqual(['b.ex1', 'b.ex2', 'b.ex3']);
  });
  it('chasse : tout toucher ne rapporte rien de plus (retrait des cases fausses, plancher 0)', () => {
    const all = {
      0: { touched: true },
      1: { touched: true },
      2: { touched: true },
      3: { touched: true },
    };
    expect(gradeExam(EX, { 'b.ex2': all }).exercises[1]).toMatchObject({ points: 0, max: 2 });
    expect(
      gradeExam(EX, {
        'b.ex2': { 0: { touched: true }, 1: { touched: true }, 2: { touched: true } },
      }).exercises[1],
    ).toMatchObject({ points: 1 });
  });
  it('réponses fausses, absentes ou mal formées : 0 point, jamais d’erreur', () => {
    const g = gradeExam(EX, {
      'b.ex1': { 0: { choice: 'ت' }, 1: { value: true } },
      'b.ex3': { 0: 'vrai', 5: { value: true } },
      inconnu: { 0: { choice: 'ب' } },
    });
    expect(g).toMatchObject({ points: 0, max: 6 });
  });
});

describe('barème et remédiation', () => {
  it('note sur 20 ou 100, arrondie au demi-point ; partie de l’enseignant ajoutée', () => {
    expect(examScore({ points: 6, max: 6 }, null, 20)).toBe(20);
    expect(examScore({ points: 5, max: 6 }, null, 20)).toBe(16.5);
    expect(examScore({ points: 5, max: 6 }, { points: 3, max: 4 }, 100)).toBe(80);
    expect(examScore({ points: 0, max: 0 }, null, 20)).toBeNull();
    expect(examScore({ points: 0, max: 0 }, { points: 7, max: 10 }, 20)).toBe(14);
  });
  it('remédiation sous 8/20, ramené au barème', () => {
    expect(needsRemediation(7.5, 20)).toBe(true);
    expect(needsRemediation(8, 20)).toBe(false);
    expect(needsRemediation(39, 100)).toBe(true);
    expect(needsRemediation(40, 100)).toBe(false);
    expect(needsRemediation(null, 20)).toBe(false);
  });
});

describe('gradeTraining (D7 : entraînement sur bilan corrigé par le serveur)', () => {
  it('juste / faux item par item, sans renvoyer la réponse', () => {
    const r = gradeTraining(EX, {
      'b.ex1': { 0: { choice: 'ب' }, 1: { choice: 'ب' } },
      'b.ex2': { 1: { touched: true } },
      'b.ex3': { 9: { value: true } },
    });
    expect(r.items['b.ex1']).toEqual({ 0: true, 1: false });
    expect(r.items['b.ex2']).toEqual({ 1: false });
    expect(r.items['b.ex3']).toEqual({});
    expect(JSON.stringify(r)).not.toContain('reponse');
  });
});
