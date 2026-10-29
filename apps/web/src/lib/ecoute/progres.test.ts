import { describe, expect, it } from 'vitest';
import { comparer, motsAttendus, type QuranMeta, type VersetTexte } from '@awform/hifz';
import {
  fusionner,
  justessePartDuJour,
  lignesPages,
  lignesSourates,
  pageApresRecitation,
  pageDe,
  propre,
  reecoutePermise,
  resumerSeance,
  versetsDePage,
  type Registre,
} from './progres';
import { MARGE_APRES, MARGE_AVANT, plageDuVerset } from './reecoute';

/**
 * Justesse par page et progression par sourate (tarteel-egal-wip) : calculs PURS. Phrases ORDINAIRES (aucun texte
 * religieux retapé) ; métadonnées du Muṣḥaf simulées (3 « sourates » de 4, 3 et 5 versets, 3 pages).
 */
const V: VersetTexte[] = [
  { s: 1, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا' },
  { s: 1, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ' },
  { s: 1, a: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا' },
];
const ATT = motsAttendus(V);
const entendu = (mots: string[]) =>
  mots.map((w, n) => ({ w, conf: 0.95, t0: n * 0.5, t1: n * 0.5 + 0.4 }));
const dits = ATT.map((m) => m.texte);
const META = {
  weights: [
    [1, 1, 1, 1],
    [1, 1, 1],
    [1, 1, 1, 1, 1],
  ],
  totalWeight: 3,
  realPages: true,
  // page 1 : 1:1 à 1:2 ; page 2 : 1:3 à 2:2 ; page 3 : 2:3 à la fin
  divisions: {
    pages: [
      [1, 1],
      [1, 3],
      [2, 3],
    ],
  },
} as unknown as QuranMeta;

describe('résumé d’une séance', () => {
  it('récitation juste : chaque verset entier, sans erreur, tout reconnu', () => {
    const r = comparer(ATT, entendu(dits), {});
    const reg = resumerSeance(ATT, r, '2026-10-29')!;
    expect(Object.keys(reg)).toEqual(['1:1', '1:2', '1:3']);
    for (const e of Object.values(reg)) expect(propre(e)).toBe(true);
    expect(reg['1:1']![4]).toBe('2026-10-29');
  });

  it('un mot oublié : le verset n’est pas « sans écart », sa justesse baisse, les autres restent propres', () => {
    const r = comparer(ATT, entendu(dits.filter((_, i) => i !== 6)), {});
    const reg = resumerSeance(ATT, r, '2026-10-29')!;
    const v2 = reg['1:2']!;
    expect(propre(v2)).toBe(false);
    expect(v2[2]).toBe(1);
    expect(v2[0]).toBe(v2[1] - 1);
    expect(propre(reg['1:1'])).toBe(true);
    expect(propre(reg['1:3'])).toBe(true);
  });

  it('un verset à peine commencé (dernier mot non récité) n’est pas compté comme entier', () => {
    const r = comparer(ATT, entendu(dits.slice(0, 11)), {});
    const reg = resumerSeance(ATT, r, '2026-10-29')!;
    expect(reg['1:3']?.[3] ?? 0).toBe(0);
    expect(propre(reg['1:3'])).toBe(false);
  });

  it('« pas compris » : rien n’est enregistré', () => {
    const r = comparer(ATT, [], {});
    expect(resumerSeance(ATT, r, '2026-10-29')).toBeNull();
  });
});

describe('registre', () => {
  it('la dernière séance l’emporte, mais un verset partiel ne remplace pas un verset entier', () => {
    const avant: Registre = { '1:1': [4, 4, 0, 1, '2026-10-28'] };
    expect(fusionner(avant, { '1:1': [3, 4, 1, 1, '2026-10-29'] })['1:1']).toEqual([
      3,
      4,
      1,
      1,
      '2026-10-29',
    ]);
    expect(fusionner(avant, { '1:1': [1, 1, 0, 0, '2026-10-29'] })['1:1']).toEqual(avant['1:1']);
    expect(fusionner(avant, { '1:2': [2, 2, 0, 0, '2026-10-29'] })['1:2']).toBeDefined();
  });
});

describe('pages et sourates', () => {
  const reg: Registre = {
    '1:1': [4, 4, 0, 1, 'j'],
    '1:2': [3, 4, 1, 1, 'j'],
    '1:3': [5, 5, 0, 1, 'j'],
    '2:1': [2, 2, 0, 1, 'j'],
  };
  it('versets d’une page et page d’un verset', () => {
    expect(versetsDePage(META, 1)).toEqual([
      [1, 1],
      [1, 2],
    ]);
    expect(versetsDePage(META, 2)).toEqual([
      [1, 3],
      [1, 4],
      [2, 1],
      [2, 2],
    ]);
    expect(versetsDePage(META, 3).at(-1)).toEqual([3, 5]);
    expect(pageDe(META, 1, 4)).toBe(2);
    expect(pageDe(META, 2, 3)).toBe(3);
  });
  it('justesse par page : mots reconnus / mots récités, avec les versets récités', () => {
    const l = lignesPages(reg, META);
    expect(l[0]).toEqual({ page: 1, justesse: 88, recites: 2, total: 2 });
    expect(l[1]).toEqual({ page: 2, justesse: 100, recites: 2, total: 4 });
  });
  it('progression par sourate : versets récités sans écart / versets de la sourate', () => {
    const l = lignesSourates(reg, META);
    expect(l).toEqual([
      { s: 1, propres: 2, total: 4, pct: 50 },
      { s: 2, propres: 1, total: 3, pct: 33 },
    ]);
    expect(lignesSourates(reg, META, [3])).toEqual([]);
  });
  it('khatma : les pages entièrement récitées sans écart à partir de la reprise du plan', () => {
    const complet: Registre = {
      '1:1': [4, 4, 0, 1, 'j'],
      '1:2': [4, 4, 0, 1, 'j'],
      '1:3': [4, 4, 0, 1, 'j'],
      '1:4': [4, 4, 0, 1, 'j'],
      '2:1': [4, 4, 0, 1, 'j'],
    };
    // page 1 propre, page 2 incomplète (2:2 manque) : le plan, à la page 1, peut passer à la page 2
    expect(pageApresRecitation(complet, META, 1, 3)).toBe(2);
    expect(pageApresRecitation(reg, META, 1, 3)).toBe(1);
    expect(pageApresRecitation({}, META, 1, 3)).toBe(1);
  });
  it('lecture du jour : justesse moyenne des pages du jour déjà récitées', () => {
    expect(justessePartDuJour(reg, META, [1, 2])).toEqual({ justesse: 94, pages: 2 });
    expect(justessePartDuJour({}, META, [1, 2])).toBeNull();
  });
});

describe('réécoute de la récitation', () => {
  it('réservée à un compte adulte : jamais un enfant ni un ado', () => {
    expect(reecoutePermise('adulte', false)).toBe(true);
    expect(reecoutePermise('enfant', true)).toBe(false);
    expect(reecoutePermise('enfant', false)).toBe(false);
    expect(reecoutePermise('ado', false)).toBe(false);
    expect(reecoutePermise('adulte', true)).toBe(false);
  });
  it('extrait du verset : instants des mots du verset, avec une marge', () => {
    const inst = ATT.map((m) => [m.i * 1, m.i * 1 + 0.8] as [number, number]);
    const p = plageDuVerset(ATT, inst, 1, 2)!;
    const mots = ATT.filter((m) => m.a === 2);
    expect(p[0]).toBeCloseTo(mots[0]!.i - MARGE_AVANT);
    expect(p[1]).toBeCloseTo(mots.at(-1)!.i + 0.8 + MARGE_APRES);
    expect(plageDuVerset(ATT, null, 1, 2)).toBeNull();
    expect(
      plageDuVerset(
        ATT,
        ATT.map(() => null),
        1,
        2,
      ),
    ).toBeNull();
  });
});
