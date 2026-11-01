import { describe, expect, it } from 'vitest';
import {
  ALPHABET_MDP_ELEVE,
  genererMotDePasseEleve,
  lienWhatsappParents,
  lireListeEleves,
  messageParents,
  LANGUES_MESSAGE,
} from '../src/eleves-lot.js';

describe('liste d’élèves saisie ou collée (V2-5)', () => {
  it('saisie « prénom année », une ligne par élève, lignes vides ignorées', () => {
    const r = lireListeEleves('Moussa 2017\n\nAwa 2017\r\nIbrahima 2016\n', 2026);
    expect(r.rejets).toEqual([]);
    expect(r.eleves).toEqual([
      { prenom: 'Moussa', annee: 2017 },
      { prenom: 'Awa', annee: 2017 },
      { prenom: 'Ibrahima', annee: 2016 },
    ]);
  });
  it('collage depuis un tableur : tabulation, point-virgule, virgule, en-tête et date complète', () => {
    const r = lireListeEleves(
      'Prénom\tAnnée\nMoussa\t2017\nAïcha;12/03/2016\n"Jean-Éric", 2015\nFatou Bintou\t2017\tCE2',
      2026,
    );
    expect(r.rejets).toEqual([]);
    expect(r.eleves).toEqual([
      { prenom: 'Moussa', annee: 2017 },
      { prenom: 'Aïcha', annee: 2016 },
      { prenom: 'Jean-Éric', annee: 2015 },
      { prenom: 'Fatou Bintou', annee: 2017 },
    ]);
  });
  it('prénoms en double : gardés tels quels (l’identifiant les distingue)', () => {
    const r = lireListeEleves('Awa 2017\nAwa 2017', 2026);
    expect(r.eleves).toHaveLength(2);
  });
  it('lignes refusées avec leur numéro et leur motif', () => {
    const r = lireListeEleves('Moussa\n2017\nZaid 1850\nLéa 2030\nA<b> 2017\nOk 2016', 2026);
    expect(r.eleves).toEqual([{ prenom: 'Ok', annee: 2016 }]);
    expect(r.rejets.map((x) => [x.ligne, x.code])).toEqual([
      [1, 'annee_manquante'],
      [2, 'prenom_manquant'],
      [3, 'annee_invalide'],
      [4, 'annee_invalide'],
      [5, 'prenom_invalide'],
    ]);
  });
  it('prénom en écriture arabe accepté', () => {
    const r = lireListeEleves('أمينة 2017', 2026);
    expect(r.eleves).toEqual([{ prenom: 'أمينة', annee: 2017 }]);
  });
});

describe('mot de passe d’élève généré', () => {
  it('8 caractères de l’alphabet sans signe ambigu', () => {
    let n = 0;
    const p = genererMotDePasseEleve((m) => n++ % m);
    expect(p).toHaveLength(8);
    for (const c of p) expect(ALPHABET_MDP_ELEVE).toContain(c);
    expect(ALPHABET_MDP_ELEVE).not.toMatch(/[01oOlI]/);
  });
});

describe('message WhatsApp aux parents : identifiant seulement', () => {
  it('ne contient jamais le mot de passe, dans les cinq langues', () => {
    const mdp = 'k7m2x9qa';
    for (const l of LANGUES_MESSAGE) {
      const m = messageParents(l, {
        prenom: 'Moussa',
        login: 'moussa-482',
        ecole: 'École Darou Salam',
      });
      expect(m).toContain('moussa-482');
      expect(m).toContain('Moussa');
      expect(m).not.toContain(mdp);
      const lien = lienWhatsappParents(l, { prenom: 'Moussa', login: 'moussa-482' });
      expect(lien).toMatch(/^https:\/\/wa\.me\/\?text=/);
      expect(decodeURIComponent(lien)).toContain('moussa-482');
    }
  });
  it('langue inconnue : français', () => {
    expect(messageParents('xx', { prenom: 'A', login: 'a-123' })).toContain('Identifiant');
  });
});
