import { describe, expect, it } from 'vitest';
import { comparer, instantsDesMots, motsAttendus, type VersetTexte } from '../src/ecoute.js';

/**
 * Instants des mots reconnus (tarteel-egal-wip) : servent à « Réécouter ma récitation » d'un verset (adulte, audio en
 * mémoire sur l'appareil). Des nombres seulement. Phrases ORDINAIRES (aucun texte religieux retapé).
 */
const V: VersetTexte[] = [
  { s: 200, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا مَعَ أَخِيهِ' },
  { s: 200, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ' },
];
const ATT = motsAttendus(V);
const entendu = (mots: string[], debut = 10) =>
  mots.map((w, n) => ({ w, conf: 0.95, t0: debut + n * 0.5, t1: debut + n * 0.5 + 0.4 }));
const dits = ATT.map((m) => m.texte);

describe('instantsDesMots', () => {
  it('récitation complète : chaque mot attendu a les instants du mot entendu', () => {
    const ent = entendu(dits);
    const inst = instantsDesMots(ATT, ent);
    expect(inst).toHaveLength(ATT.length);
    inst.forEach((x, i) => expect(x).toEqual([ent[i]!.t0, ent[i]!.t1]));
  });

  it('un mot oublié n’a pas d’instants ; les autres gardent les leurs', () => {
    const sans = dits.filter((_, i) => i !== 3);
    const ent = entendu(sans);
    const inst = instantsDesMots(ATT, ent);
    expect(inst[3]).toBeNull();
    expect(inst[2]).toEqual([ent[2]!.t0, ent[2]!.t1]);
    expect(inst[4]).toEqual([ent[3]!.t0, ent[3]!.t1]);
    // cohérent avec la comparaison : le mot sans instants est bien celui signalé oublié
    const r = comparer(ATT, ent);
    expect(r.ecarts.some((e) => e.type === 'oublie' && e.i === 3)).toBe(true);
  });

  it('modèle sans instants : null partout, jamais d’erreur', () => {
    const ent = dits.map((w) => ({ w, conf: 0.9 }));
    expect(instantsDesMots(ATT, ent).every((x) => x === null)).toBe(true);
  });

  it('ne contient que des nombres (jamais le mot entendu)', () => {
    const inst = instantsDesMots(ATT, entendu(dits));
    expect(JSON.stringify(inst)).toMatch(/^[\d.,[\]null-]+$/);
  });
});
