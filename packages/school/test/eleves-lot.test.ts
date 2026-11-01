import { describe, expect, it } from 'vitest';
import {
  prenomValide,
  premierMot,
  translitterer,
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
      { prenom: 'Fatou', annee: 2017 },
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

describe('colonne « prénom » d’un tableur (cinq langues)', () => {
  const an = 2017;
  const cas: Array<[string, string]> = [
    ['français', `Nom\tPrénom\tAnnée de naissance\nDiop\tMoussa\t${an}`],
    ['anglais', `Last name,First name,Year of birth\nDiop,Moussa,${an}`],
    ['espagnol', `Apellidos;Nombre de pila;Año de nacimiento\nDiop;Moussa;${an}`],
    ['allemand', `Nachname;Vorname;Geburtsjahr\nDiop;Moussa;${an}`],
    ['arabe', `اللقب\tالاسم الأول\tسنة الميلاد\nDiop\tMoussa\t${an}`],
    ['prénom avant le nom', `Prénom\tNom\tAnnée\nMoussa\tDiop\t${an}`],
  ];
  it.each(cas)('%s : le prénom est pris, jamais le nom de famille', (_l, texte) => {
    const r = lireListeEleves(texte, 2026);
    expect(r.ambigu).toBeUndefined();
    expect(r.rejets).toEqual([]);
    expect(r.eleves).toEqual([{ prenom: 'Moussa', annee: an }]);
  });
  it('un intitulé général (« Name », « Nom et prénom ») n’est jamais retenu seul : on demande', () => {
    const r = lireListeEleves(`Name\tYear\nMoussa\t${an}`, 2026);
    expect(r.eleves).toEqual([]);
    expect(r.ambigu?.colonnes).toEqual([{ index: 0, titre: 'Name' }]);
    expect(lireListeEleves(`Name\tYear\nMoussa\t${an}`, 2026, 0).eleves).toEqual([
      { prenom: 'Moussa', annee: an },
    ]);
    const np = lireListeEleves(`Nom et prénom\tAnnée\nDIOP Fatou\t${an}`, 2026);
    expect(np.eleves).toEqual([]);
    expect(np.ambigu?.colonnes[0]).toEqual({ index: 0, titre: 'Nom et prénom' });
  });
  it('plusieurs colonnes de texte sans intitulé reconnu : on demande laquelle prendre', () => {
    const t = `Name\tClass\tYear\nMoussa\tCE2\t${an}`;
    const r = lireListeEleves(t, 2026);
    expect(r.eleves).toEqual([]);
    expect(r.ambigu?.colonnes).toEqual([
      { index: 0, titre: 'Name' },
      { index: 1, titre: 'Class' },
    ]);
    expect(r.ambigu?.apercu).toEqual(['Moussa', 'CE2', String(an)]);
    // l’enseignant choisit la colonne 0
    expect(lireListeEleves(t, 2026, 0).eleves).toEqual([{ prenom: 'Moussa', annee: an }]);
    // sans en-tête non plus : « Diop  Moussa »
    expect(lireListeEleves(`Diop\tMoussa\t${an}`, 2026).ambigu).toBeDefined();
    expect(lireListeEleves(`Diop\tMoussa\t${an}`, 2026, 1).eleves[0]?.prenom).toBe('Moussa');
  });
  it('une ligne de données qui contient « nom » n’est pas prise pour un en-tête', () => {
    const r = lireListeEleves(`Salomon\nNomar ${an}`, 2026);
    expect(r.rejets.map((x) => x.code)).toEqual(['annee_manquante']);
    expect(r.eleves).toEqual([{ prenom: 'Nomar', annee: an }]);
  });
  it('seul le premier mot d’une colonne « prénom » est gardé', () => {
    expect(lireListeEleves(`Prénom\tAnnée\nFatou Bintou\t${an}`, 2026).eleves[0]?.prenom).toBe(
      'Fatou',
    );
    expect(premierMot('  Jean-Éric   Ndiaye ')).toBe('Jean-Éric');
  });
  it('« DIOP Fatou » ou « Fatou DIOP » : l’ordre est demandé, puis le nom de famille n’est jamais pris', () => {
    for (const texte of [
      `DIOP Fatou ${an}`,
      `Fatou DIOP ${an}`,
      `Nom et prénom\tAnnée\nDIOP Fatou\t${an}`,
    ]) {
      const colonne = texte.includes('\t') ? 0 : undefined;
      const r = lireListeEleves(texte, 2026, colonne);
      expect(r.eleves, texte).toEqual([]);
      expect(r.ambigu?.ordre, texte).toBe(true);
      expect(r.ambigu?.apercu[0]).toMatch(/Fatou/);
    }
    const nomPrenom = lireListeEleves(
      `DIOP Fatou ${an}\nNDIAYE Awa ${an}`,
      2026,
      undefined,
      'nom-prenom',
    );
    expect(nomPrenom.eleves).toEqual([
      { prenom: 'Fatou', annee: an },
      { prenom: 'Awa', annee: an },
    ]);
    const prenomNom = lireListeEleves(
      `Fatou DIOP ${an}\nAwa NDIAYE ${an}`,
      2026,
      undefined,
      'prenom-nom',
    );
    expect(prenomNom.eleves).toEqual([
      { prenom: 'Fatou', annee: an },
      { prenom: 'Awa', annee: an },
    ]);
    // un mot seul : aucune question
    expect(lireListeEleves(`Fatou ${an}`, 2026).ambigu).toBeUndefined();
  });
  it('nom puis prénom : le prénom est le dernier mot (« DE SOUZA Marie » donne Marie)', () => {
    const r = lireListeEleves(
      `DE SOUZA Marie ${an}\nDIOP Fatou ${an}`,
      2026,
      undefined,
      'nom-prenom',
    );
    expect(r.eleves).toEqual([
      { prenom: 'Marie', annee: an },
      { prenom: 'Fatou', annee: an },
    ]);
  });
  it('un intitulé « prénom » sûr n’a pas besoin de l’ordre', () => {
    const r = lireListeEleves(`Nom\tPrénom\tAnnée\nDIOP\tFatou Bintou\t${an}`, 2026);
    expect(r.ambigu).toBeUndefined();
    expect(r.eleves).toEqual([{ prenom: 'Fatou', annee: an }]);
  });
});

describe('prénom valide', () => {
  it('l’espace ordinaire est le seul séparateur ; liant et non-liant permis', () => {
    expect(prenomValide('Jean Marc')).toBe(true);
    for (const mauvais of ['Jean\tMarc', 'Jean\u00a0Marc', 'Jean\u2003Marc', 'Jean\nMarc'])
      expect(prenomValide(mauvais), JSON.stringify(mauvais)).toBe(false);
    expect(prenomValide('می\u200cخواهم')).toBe(true); // ZWNJ
    expect(prenomValide('ک\u200dا')).toBe(true); // ZWJ
    expect(prenomValide('A\u200eb')).toBe(false); // marque d’orientation
    expect(prenomValide('123')).toBe(false);
  });
});

describe('translittération de l’arabe (identifiant et étiquette)', () => {
  it.each([
    ['أمينة', 'amina'],
    ['موسى', 'musa'],
    ['علي', 'ali'],
    ['يوسف', 'yusf'],
    ['فاطمة', 'fatma'],
    ['عائشة', 'aisha'],
    ['خديجة', 'khdija'],
    ['إبراهيم', 'ibrahim'],
    ['مُحَمَّد', 'mahamad'],
    ['عبد', 'abd'],
    ['زينب', 'zinb'],
    ['Moussa', 'Moussa'],
    ['Ɓaaba', 'Baaba'],
    ['Ɗiko Ŋgoy Ƴaya', 'Diko Nggoy Yaya'],
    ['ɓaaba ɗiko', 'baaba diko'],
  ])('%s → %s', (ar, latin) => {
    expect(translitterer(ar)).toBe(latin);
  });
  it('ne produit jamais de caractère arabe, ni de « ? »', () => {
    for (const nom of ['رحمة', 'سلمى', 'عبد الله', 'ئ', 'ؤ', 'پژمان'])
      expect(translitterer(nom), nom).not.toMatch(/[\u0600-\u06ff?]/);
  });
});
