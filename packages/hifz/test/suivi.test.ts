import { describe, expect, it } from 'vitest';
import {
  comparer,
  ecartsDAccord,
  motsAttendus,
  type Ecart,
  type VersetTexte,
} from '../src/ecoute.js';

/**
 * Suivi de la récitation (shazam_coran) : un écart n'est montré PENDANT la récitation que si les deux lectures du
 * même audio (RNN-T et tête CTC) le voient au même endroit. Phrases ORDINAIRES (aucun texte religieux retapé).
 */
const V: VersetTexte[] = [
  { s: 200, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا مَعَ أَخِيهِ' },
  { s: 200, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ' },
  { s: 200, a: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا' },
];
const ATT = motsAttendus(V);
const e = (type: Ecart['type'], i: number, fin = i): Ecart => ({
  type,
  i,
  fin,
  s: 200,
  a: 1,
  confiance: 0.9,
});
const entendu = (mots: string[]) => {
  const ent = mots.map((w, n) => ({ w, conf: 0.95, t0: n * 0.5, t1: n * 0.5 + 0.4 }));
  return { ent, voix: ent.map((x) => [x.t0, x.t1] as [number, number]) };
};

describe('Suivi : accord des deux lectures', () => {
  it('même endroit (à un mot près) : montré ; ailleurs ou absent de l’autre lecture : tu', () => {
    expect(ecartsDAccord([e('oublie', 5)], [e('oublie', 5)])).toHaveLength(1);
    expect(ecartsDAccord([e('oublie', 5)], [e('remplace', 6)])).toHaveLength(1);
    expect(ecartsDAccord([e('remplace', 5)], [e('oublie', 8)])).toEqual([]);
    expect(ecartsDAccord([e('oublie', 5)], [])).toEqual([]);
    expect(ecartsDAccord([e('verset_saute', 6, 11)], [e('oublie', 9)])).toHaveLength(1);
  });

  it('une lecture se trompe seule (mot mal entendu) : rien n’est signalé à l’élève', () => {
    const juste = ATT.map((m) => m.cle);
    const fausse = [...juste];
    fausse[3] = 'السوق'; // la tête CTC entend un autre mot, le RNN-T entend juste
    const a = entendu(juste);
    const b = entendu(fausse);
    const ra = comparer(ATT, a.ent, { voix: a.voix, enCours: true });
    const rb = comparer(ATT, b.ent, { voix: b.voix, enCours: true });
    expect(rb.ecarts).toHaveLength(1);
    expect(ecartsDAccord(ra.ecarts, rb.ecarts)).toEqual([]);
    expect(ecartsDAccord(rb.ecarts, ra.ecarts)).toEqual([]);
  });

  it('vraie erreur (mot oublié) : les deux lectures la voient, elle est montrée', () => {
    const sans = ATT.map((m) => m.cle).filter((_, n) => n !== 8);
    const a = entendu(sans);
    const ra = comparer(ATT, a.ent, { voix: a.voix, enCours: true });
    const rb = comparer(ATT, a.ent, { voix: a.voix, enCours: true });
    expect(ecartsDAccord(ra.ecarts, rb.ecarts)).toEqual([
      expect.objectContaining({ type: 'oublie', i: 8 }),
    ]);
  });
});
