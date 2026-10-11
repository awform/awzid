import { describe, expect, it } from 'vitest';
import { comparer, motsAttendus, type MotEntendu } from '@awform/hifz';
import { aRevoirDe, versetsARevoir, type Bilan } from './bilans';
import { bilanDe } from './ecoute';

/** A5 — bilan de séance (appareil) : positions des mots à revoir, jamais l'audio ni les mots entendus. */
const V = [
  { s: 200, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ' },
  { s: 200, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ' },
];
const att = motsAttendus(V);
const ent = (sans: number[]): MotEntendu[] =>
  att
    .map((m, n) => ({ w: m.cle, conf: 0.95, t0: n * 0.5, t1: n * 0.5 + 0.4, n }))
    .filter((x) => !sans.includes(x.n));

describe('A5 : bilan de séance', () => {
  it('garde les versets récités et la position des mots à revoir, rien de l’audio', () => {
    const e = ent([5]);
    const r = comparer(att, e, { voix: e.map((x) => [x.t0, x.t1] as [number, number]) });
    const b = bilanDe({ s: 200, from: 1, to: 2 }, att, r);
    expect(b.versets).toEqual([1, 2]);
    expect(b.aRevoir).toBe(1);
    expect(b.mots).toEqual([[200, 2, 1, 'oublie']]);
    expect(versetsARevoir(b)).toEqual([2]);
    expect(JSON.stringify(b)).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('carnet : la dernière séance de chaque portion, seulement s’il reste des mots à revoir', () => {
    const b = (from: number, n: number, pasCompris = false): Bilan => ({
      date: '2026-10-06',
      s: 200,
      from,
      to: from + 1,
      versets: [from, from + 1],
      aRevoir: n,
      mots: [],
      pasCompris,
    });
    // la plus récente d'abord : 1-2 revue sans erreur -> plus à revoir ; 3-4 à revoir ; « pas compris » ignoré
    const l = [b(1, 0), b(3, 2), b(1, 3), b(5, 4, true)];
    expect(aRevoirDe(l).map((x) => x.from)).toEqual([3]);
  });
});
