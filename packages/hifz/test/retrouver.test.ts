import { describe, expect, it } from 'vitest';
import {
  chercherDouble,
  decisionRetrouver,
  IndexCoran,
  SEUIL_RETROUVER,
  squeletteMot,
  squelettePhrase,
} from '../src/retrouver.js';
import { cleMot } from '../src/ecoute.js';
import { HAS_TANZIL, loadTanzil } from './helpers.js';

/**
 * « Retrouve ce verset » (shazam_coran) : moteur de recherche dans tout le texte. Phrases ORDINAIRES (aucun texte
 * religieux retapé) pour la logique ; le vrai texte Tanzil n'est lu que depuis le fichier des livres (tests sautés
 * sans lui).
 */
const V = [
  { s: 2, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا مَعَ أَخِيهِ الصَّغِيرِ' },
  { s: 2, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ الكَبِيرِ' },
  { s: 2, a: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا بِمَا تَعَلَّمَ' },
  { s: 3, a: 1, text: 'كَتَبَتِ البِنْتُ رِسَالَةً طَوِيلَةً إِلَى جَدَّتِهَا' },
  // même texte qu'en 2:2 (une « formule répétée »)
  { s: 3, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ الكَبِيرِ' },
  { s: 3, a: 3, text: 'وَفِي المَسَاءِ جَلَسَتِ الأُسْرَةُ حَوْلَ المَائِدَةِ' },
];
/** « entendu » : le texte sans voyelles, comme une transcription */
const nus = (s: number, a: number, de = 0, n = 99) =>
  V.find((v) => v.s === s && v.a === a)!
    .text.split(' ')
    .slice(de, de + n)
    .map(cleMot);

describe('Retrouve ce verset : squelettes', () => {
  it('lettres de base, sans voyelles, sans alif ni hamza', () => {
    expect(squeletteMot('الكِتَابُ')).toBe(squeletteMot('الكتب'));
    expect(squeletteMot('أَصْدِقَائِهِ')).toBe('صدقيه');
    expect(squelettePhrase('ذَهَبَ الوَلَدُ')).toBe('ذهبلولد');
  });
});

describe('Retrouve ce verset : recherche', () => {
  // fichier DANS LE DÉSORDRE (comme tanzil-uthmani.tsv d'Awzid) : l'index le remet dans l'ordre du muṣḥaf
  const melange = [V[4]!, V[0]!, V[5]!, V[2]!, V[1]!, V[3]!];
  const idx = new IndexCoran(melange);

  it('trie le texte dans l’ordre du muṣḥaf', () => {
    expect(idx.versets).toEqual([
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 1],
      [3, 2],
      [3, 3],
    ]);
  });

  it('retrouve un verset entendu sans voyelles (score 1)', () => {
    const r = idx.chercher(nus(2, 3));
    expect(r.resultats[0]).toMatchObject({ verset: '2:3', passage: ['2:3'], score: 1 });
    expect(r.egaux).toEqual(['2:3']);
  });

  it('un extrait à cheval sur deux versets donne le passage entier, dans l’ordre', () => {
    const r = idx.chercher([...nus(2, 3, 3), ...nus(3, 1, 0, 3)]);
    expect(r.resultats[0]!.passage).toEqual(['2:3', '3:1']);
    expect(r.resultats[0]!.score).toBe(1);
  });

  it('mots coupés ou collés par la machine : la recherche ne dépend pas des espaces', () => {
    const w = nus(3, 1);
    const colles = [w[0]! + w[1]!, ...w.slice(2)];
    expect(idx.chercher(colles).resultats[0]!.verset).toBe('3:1');
  });

  it('lettres que la machine confond (س/ص, ت/ط…) : coût réduit, le bon verset reste premier', () => {
    const w = nus(2, 1).map((x) => x.replace(/ص/g, 'س').replace(/ت/g, 'ط'));
    const r = idx.chercher(w);
    expect(r.resultats[0]!.verset).toBe('2:1');
    expect(r.resultats[0]!.score).toBeGreaterThan(0.9);
  });

  it('texte identique ailleurs : les deux versets EX ÆQUO', () => {
    const r = idx.chercher(nus(2, 2));
    expect(r.egaux.sort()).toEqual(['2:2', '3:2']);
    const d = decisionRetrouver(r);
    expect(d.statut).toBe('trouve');
    expect(d.egaux.sort()).toEqual(['2:2', '3:2']);
  });

  it('trop peu de lettres : on ne cherche pas', () => {
    expect(idx.chercher(['ذهب']).raison).toBe('trop_peu_de_lettres');
  });

  it('autre chose que le texte : score sous le seuil, rien n’est montré (on ne devine jamais)', () => {
    const r = idx.chercher(['سافر', 'التاجر', 'بالقطار', 'الى', 'مدينة', 'بعيدة', 'جدا']);
    expect(r.resultats[0]?.score ?? 0).toBeLessThan(SEUIL_RETROUVER);
    expect(decisionRetrouver(r)).toEqual({ statut: 'pas_trouve', resultats: [], egaux: [] });
  });

  it('double lecture : la recherche la plus sûre l’emporte (une lecture fausse est rattrapée)', () => {
    const faux = ['سافر', 'التاجر', 'بالقطار', 'الى', 'مدينة', 'بعيدة'];
    const r = chercherDouble(idx, [faux, nus(3, 3)]);
    expect(r.resultats[0]!.verset).toBe('3:3');
    expect(chercherDouble(idx, [[], []]).resultats).toEqual([]);
  });
});

describe.skipIf(!HAS_TANZIL)('Retrouve ce verset : vrai texte Tanzil (lu, jamais retapé)', () => {
  const T = loadTanzil();
  const tous = [...T].map(([k, text]) => {
    const [s, a] = k.split(':').map(Number) as [number, number];
    return { s, a, text };
  });
  const idx = new IndexCoran(tous);
  const nu = (k: string) => T.get(k)!.split(' ').map(cleMot).filter(Boolean);

  it('le fichier n’est pas dans l’ordre du muṣḥaf ; l’index, si', () => {
    expect(tous[0]).not.toMatchObject({ s: 1, a: 1 });
    expect(idx.versets[0]).toEqual([1, 1]);
    expect(idx.versets).toHaveLength(6236);
    expect(idx.lettres).toBeGreaterThan(250_000);
  });

  it('retrouve un passage de deux versets', () => {
    const r = idx.chercher([...nu('112:1'), ...nu('112:2')]);
    expect(r.resultats[0]).toMatchObject({ passage: ['112:1', '112:2'], score: 1 });
  });

  it('basmala en tête de l’extrait : retirée, le verset qui suit est retrouvé', () => {
    const r = idx.chercher([...nu('1:1'), ...nu('114:1'), ...nu('114:2')]);
    expect(r.resultats[0]!.passage).toEqual(['114:1', '114:2']);
  });

  it('extrait court : un 2ᵉ passage peu ressemblant (score 0,67) n’est pas montré', () => {
    const r = idx.chercher(nu('112:1'));
    expect(r.resultats[1]!.score).toBeLessThan(0.8);
    expect(decisionRetrouver(r).resultats.map((x) => x.verset)).toEqual(['112:1']);
  });

  it('début identique ailleurs : ex æquo, et le passage presque identique parmi les autres', () => {
    const d = decisionRetrouver(idx.chercher(nu('11:77').slice(0, 3)));
    expect(d.egaux).toEqual(['11:77', '29:31']);
    expect(d.resultats.map((x) => x.verset)).toContain('29:33');
  });

  it('formule répétée (55:13 = 55:16 = …) : plusieurs versets ex æquo', () => {
    const r = idx.chercher(nu('55:13'));
    expect(r.egaux.length).toBeGreaterThan(1);
    expect(r.egaux).toContain('55:13');
    expect(r.egaux.every((v) => T.get(v) === T.get('55:13'))).toBe(true);
  });
});
