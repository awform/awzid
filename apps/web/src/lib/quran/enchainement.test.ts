import { describe, expect, it } from 'vitest';
import { Prechargeur, prochainJouable } from './enchainement';

const fichiers = new Map([
  [1, { url: 'a1.mp3' }],
  [2, { url: 'a2.mp3' }],
  [4, { url: 'a4.mp3' }],
]);
const trouve = (a: number) => fichiers.get(a);

describe('prochainJouable', () => {
  it('donne le verset suivant de la file, avec sa position', () => {
    expect(prochainJouable([1, 2, 4], 0, trouve)).toEqual({ i: 1, aya: 2, f: { url: 'a2.mp3' } });
  });
  it('saute un verset sans fichier (comme la lecture)', () => {
    expect(prochainJouable([2, 3, 4], 0, trouve)?.aya).toBe(4);
  });
  it('fin de file ou plus aucun fichier : null', () => {
    expect(prochainJouable([1, 2], 1, trouve)).toBeNull();
    expect(prochainJouable([2, 3], 0, trouve)).toBeNull();
  });
  it('répétition du même verset : la position suivante porte le même verset', () => {
    expect(prochainJouable([1, 1, 2], 0, trouve)).toEqual({ i: 1, aya: 1, f: { url: 'a1.mp3' } });
  });
  it('avant le début (idx -1) : premier élément', () => {
    expect(prochainJouable([1], -1, trouve)?.i).toBe(0);
  });
});

describe('Prechargeur (un verset d’avance)', () => {
  it('le verset préchargé est repris sans attente, une seule fois', () => {
    const p = new Prechargeur();
    expect(p.ranger(p.debut(), { i: 1, aya: 2, url: 'blob:x' })).toBe(true);
    expect(p.a(1)).toBe(true);
    expect(p.prendre(1, 2)?.url).toBe('blob:x');
    expect(p.prendre(1, 2)).toBeNull();
  });
  it('autre position ou autre verset (saut, précédent) : pas de reprise', () => {
    const p = new Prechargeur();
    p.ranger(p.debut(), { i: 3, aya: 5, url: 'u' });
    expect(p.prendre(2, 5)).toBeNull();
    expect(p.prendre(3, 6)).toBeNull();
    expect(p.prendre(3, 5)).not.toBeNull();
  });
  it('file changée : une préparation en retard est refusée et l’ancienne réserve rendue', () => {
    const p = new Prechargeur();
    const jeton = p.debut();
    p.ranger(jeton, { i: 1, aya: 2, url: 'old' });
    expect(p.vider()?.url).toBe('old');
    expect(p.ranger(jeton, { i: 1, aya: 2, url: 'tard' })).toBe(false);
    expect(p.prendre(1, 2)).toBeNull();
  });
});
