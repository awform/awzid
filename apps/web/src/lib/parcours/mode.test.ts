import { afterEach, describe, expect, it } from 'vitest';
import { modeLocal, setModeLocal, showsScore } from './mode';
import { nextActivity, type Resume } from './parcours';

/** stockage minimal (l'environnement de test n'a pas de localStorage) */
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;
afterEach(() => store.clear());

describe('A39 — mode d’évaluation sur l’appareil', () => {
  it('défaut : vérification pour l’adulte, défi doux pour un mineur', () => {
    expect(modeLocal('p1', 'adulte')).toBe('verification');
    expect(modeLocal('p2', 'enfant')).toBe('douce');
    expect(modeLocal('p3', 'ado')).toBe('douce');
  });
  it('une note chiffrée ne s’affiche qu’« avec vérification »', () => {
    expect(showsScore('p1', 'adulte')).toBe(true);
    setModeLocal('p1', 'serein');
    expect(showsScore('p1', 'adulte')).toBe(false);
    expect(showsScore('p2', 'enfant')).toBe(false);
    setModeLocal('p2', 'verification');
    expect(showsScore('p2', 'enfant')).toBe(true);
  });
});

describe('A39 — « Ma prochaine activité » en mode serein', () => {
  const done: Resume = {
    courant: { code: 'ad1', titre: null, titreAr: null, depuis: null, origine: 'parent' },
    proposition: null,
    progression: { faites: 3, total: 3 },
    enCours: null,
    prochaine: null,
    derniere: null,
    examen: { id: 'ad1.l04', statut: null },
    suivant: { code: 'ad2', titre: null },
  };
  it('leçons faites : ouvrir le niveau suivant (serein), sinon le défi ou l’épreuve', () => {
    expect(nextActivity(done, 0, '2026-10-06', 'serein')).toEqual({
      kind: 'ouvrir',
      niveau: 'ad1',
    });
    expect(nextActivity(done, 0, '2026-10-06', 'douce')).toEqual({
      kind: 'epreuve',
      niveau: 'ad1',
    });
    expect(nextActivity(done, 0, '2026-10-06')).toEqual({ kind: 'epreuve', niveau: 'ad1' });
  });
});
