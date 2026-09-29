/**
 * Audit MET-3 : un jour invalide n'arrête plus le rejeu ; le mois d'essai se juge sur ses 28 premiers jours ;
 * un compteur infini ou non numérique est une erreur, jamais une note parfaite.
 */
import { describe, expect, it } from 'vitest';
import { note, replay, trialStats, type EngineConfig, type HifzEvent } from '../src/index.js';

const CFG: EngineConfig = { dailyMinutes: 30, newMinutes: 6 };
let n = 0;
const ev = (day: number, kind: HifzEvent['kind'], q?: 0 | 1 | 2 | 3): HifzEvent => ({
  day,
  id: String(n++).padStart(8, '0'),
  part: 'A',
  kind,
  ...(q !== undefined ? { q } : {}),
  source: 'auto',
});

describe('audit MET-3', () => {
  it('un jour invalide (NaN) est ignoré, le reste du journal est rejoué', () => {
    const good = [ev(1, 'appris'), ev(2, 'revision', 3), ev(3, 'revision', 3)];
    const a = replay([{ key: 'A', pages: 1 }], good, 6, CFG);
    const b = replay([{ key: 'A', pages: 1 }], [ev(Number.NaN, 'revision', 0), ...good], 6, CFG);
    expect(b.state.parts.get('A')).toEqual(a.state.parts.get('A'));
  });

  it('mois d’essai : régularité sur les 28 premiers jours seulement', () => {
    // 28 jours travaillés sur 56 : 50 % de régularité, pas 100 %
    const events = Array.from({ length: 28 }, (_, i) => ev(i * 2, 'revision', 3));
    const s = trialStats(events, 0, 56);
    expect(s.regularity).toBeCloseTo(0.5, 1);
  });

  it('barème : un compteur infini ou non numérique est refusé', () => {
    const base = {
      aides: 0,
      hesitations: 0,
      sauts: 0,
      oublis: 0,
      claires: 0,
      discretes: 0,
      fluidite: 5,
    };
    expect(() => note({ ...base, oublis: Infinity })).toThrow();
    expect(() => note({ ...base, aides: Number.NaN })).toThrow();
    expect(note(base).total).toBe(20);
  });
});
