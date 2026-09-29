import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  certNumber,
  chooseGender,
  csvCell,
  dateAr,
  DEFAULT_RULES,
  HIFZ_MODEL,
  hifzCertFields,
  levelCertFields,
  levelResult,
  levelModelKey,
  renderDoc,
  rulesFrom,
  toCsv,
  type CertModels,
} from '../src/index.js';

const s = (score: number, max = 20) => ({ score, max });

describe('note finale et décision (règles des livres)', () => {
  it('exemple AD4 des règles : bilans 15·13·16·14/20, récitations 80, productions 70, examen 73 → NF 73, mention Bien', () => {
    const r = levelResult({
      track: 'adultes',
      bilans: [s(15), s(13), s(16), s(14)],
      recitations: s(80, 100),
      productions: s(70, 100),
      examen: s(73, 100),
    });
    expect(r.status).toBe('complet');
    expect(r.bilansPct).toBe(72.5);
    expect(r.nf).toBe(73);
    expect(r.decision?.code).toBe('B');
    expect(r.certificat).toBe(true);
    expect(r.mention).toEqual({ fr: 'Bien', ar: 'جَيِّدٌ جِدًّا' });
    expect(r.ccPartiel).toBe(false);
  });
  it('classe papier : bilans et examen seuls → CC sur les bilans (signalé), NF arrondie au demi-point', () => {
    const r = levelResult({
      track: 'enfants',
      bilans: [s(18), s(17), s(19), s(16)],
      examen: s(17),
    });
    expect(r.ccPartiel).toBe(true);
    expect(r.cc).toBe(87.5);
    expect(r.examenPct).toBe(85);
    expect(r.nf).toBe(86);
    expect(r.decision?.code).toBe('TB');
  });
  it('incomplet tant qu’un bilan ou l’examen manque : aucune décision', () => {
    const r = levelResult({ track: 'enfants', bilans: [s(15), null, s(12), s(14)], examen: null });
    expect(r.status).toBe('incomplet');
    expect(r.missing).toEqual(['bilan 2', 'examen']);
    expect(r.decision).toBeNull();
    expect(r.certificat).toBe(false);
  });
  it('plancher de l’examen : NF ≥ 60 mais examen < 50 → validation conditionnelle, pas de certificat', () => {
    const r = levelResult({ track: 'adultes', bilans: [s(20), s(20), s(20), s(20)], examen: s(9) });
    expect(r.nf).toBe(67);
    expect(r.decision?.code).toBe('VC');
    expect(r.conditionManquante).toMatch(/examen/);
    expect(r.certificat).toBe(false);
  });
  it('seuils 80 / 70 / 60 / 40', () => {
    const at = (x: number) =>
      levelResult({ track: 'enfants', bilans: [s(x, 100)], examen: s(x, 100) }).decision?.code;
    expect([at(80), at(79.5), at(70), at(60), at(59.5), at(40), at(39)]).toEqual([
      'TB',
      'B',
      'B',
      'AB',
      'VC',
      'VC',
      'R',
    ]);
  });
  it('règles importées lues champ par champ, repli sur les valeurs des livres', () => {
    expect(rulesFrom(undefined)).toEqual(DEFAULT_RULES);
    expect(rulesFrom({ nf: { examen: 0.5, cc: 0.5, arrondi: 1 } }).nf.examen).toBe(0.5);
  });
});

describe('certificats', () => {
  const models: CertModels = {
    modeles: {
      niveau_enfants: {
        titre_fr: 'Certificat de réussite — AWFORM Enfants',
        fr: [
          "L'établissement {etablissement} certifie que **{prenom_nom}** a terminé le **niveau {n}, « {titre_fr} »**, mention **{mention}**.",
          "Qu'Allah le (la) bénisse et fasse de ce savoir une lumière pour lui (elle) !",
          'Fait à {lieu}, le {date}.',
        ],
        titre_ar: 'شَهَادَةُ نَجَاحٍ',
        ar: [
          'تَشْهَدُ إِدَارَةُ {etablissement_ar} أَنَّ التِّلْمِيذَ (التِّلْمِيذَةَ): **{nom_ar}**',
          'قَدْ أَتَمَّ (أَتَمَّتِ) الْمُسْتَوَى {n_ar}، وَكَانَ تَقْدِيرُهُ (تَقْدِيرُهَا): **{mention_ar}**.',
          'حُرِّرَ فِي {lieu_ar} بِتَارِيخِ {date_ar}.',
        ],
      },
    },
    ordinaux_ar: { acc: ['الْأَوَّلَ', 'الثَّانِيَ'], gen: ['الْأَوَّلِ', 'الثَّانِي'] },
    mois_ar: [
      'يَنَايِرُ',
      'فِبْرَايِرُ',
      'مَارِسُ',
      'أَبْرِيلُ',
      'مَايُو',
      'يُونْيُو',
      'يُولْيُو',
      'أُغُسْطُسُ',
      'سِبْتَمْبَرُ',
      'أُكْتُوبَرُ',
      'نُوفَمْبَرُ',
      'دِيسَمْبَرُ',
    ],
  };
  const result = levelResult({ track: 'enfants', bilans: [s(18), s(17)], examen: s(17) });
  const fields = levelCertFields(
    {
      school: {
        schoolName: 'École pilote',
        schoolNameAr: null,
        place: 'Dakar',
        placeAr: 'دَاكَار',
      },
      rank: 1,
      bookTitleFr: "Je lis et j'écris l'arabe",
      bookTitleAr: 'أَقْرَأُ وَأَكْتُبُ',
      ref: { code: 'en1', cecrl: 'pré-A1', mots_coran: 63, sourates: ['Al-Fātiḥa'] },
      result,
      day: '2027-06-20',
      pupilName: 'Awa D.',
      pupilNameAr: 'عَوَا',
      extra: { nf: '100', prenom_nom: 'Awa Diop' },
    },
    models,
  );

  it('champs calculés, saisies de l’enseignant, jamais de note forcée', () => {
    expect(fields.prenom_nom).toBe('Awa Diop');
    expect(fields.nf).not.toBe('100');
    expect(fields.mention).toBe('Très bien');
    expect(fields.n_ar).toBe('الْأَوَّلَ');
    expect(fields.date).toBe('20 juin 2027');
    expect(fields.date_ar).toBe('٢٠ يُونْيُو ٢٠٢٧');
    // nom arabe de l'école absent : repli sur le nom en lettres latines
    expect(fields.etablissement_ar).toBe('École pilote');
  });
  it('genre : variantes arabes et françaises choisies ; sans genre, texte inclusif du modèle', () => {
    const f = renderDoc('niveau_enfants', models.modeles.niveau_enfants!, fields, 'f');
    const g = renderDoc('niveau_enfants', models.modeles.niveau_enfants!, fields, 'm');
    const n = renderDoc('niveau_enfants', models.modeles.niveau_enfants!, fields, null);
    const txt = (d: typeof f) =>
      [...d.fr, ...d.ar].map((l) => l.map((x) => x.t).join('')).join('\n');
    expect(txt(f)).toContain('التِّلْمِيذَةَ: عَوَا');
    expect(txt(f)).toContain('قَدْ أَتَمَّتِ الْمُسْتَوَى');
    expect(txt(f)).toContain('la bénisse');
    expect(txt(f)).toContain('pour elle');
    expect(txt(g)).toContain('قَدْ أَتَمَّ الْمُسْتَوَى');
    expect(txt(g)).toContain('le bénisse');
    expect(txt(n)).toContain('le (la) bénisse');
    expect(f.missing).toEqual([]);
    expect(f.fr[0]!.some((x) => x.b && x.t === 'Awa Diop')).toBe(true);
  });
  it('champ manquant signalé et laissé en pointillés', () => {
    const d = renderDoc(
      'niveau_enfants',
      models.modeles.niveau_enfants!,
      { ...fields, lieu: '' },
      'f',
    );
    expect(d.missing).toEqual(['lieu']);
    expect(d.fr[2]!.map((x) => x.t).join('')).toContain('…………');
  });
  it('français : « (CECRL) » n’est pas pris pour une variante de genre ; « né(e) » l’est', () => {
    expect(chooseGender('les langues (CECRL), né(e) le', 'fr', 'f')).toBe(
      'les langues (CECRL), née le',
    );
    expect(chooseGender('les langues (CECRL), né(e) le', 'fr', 'm')).toBe(
      'les langues (CECRL), né le',
    );
  });
  it('numéro unique et date arabe', () => {
    expect(certNumber('en1', 2027, 42)).toBe('AWF-EN1-2027-0042');
    expect(dateAr('2026-10-05', models.mois_ar)).toBe('٥ أُكْتُوبَرُ ٢٠٢٦');
    expect(levelModelKey('religion')).toBe('niveau_religion');
  });
  it('attestation de hifẓ : jamais présentée comme une ijāza', () => {
    const d = renderDoc(
      'fin_partie_hifz',
      HIFZ_MODEL,
      hifzCertFields({
        school: { schoolName: 'École pilote', schoolNameAr: null, place: 'Dakar', placeAr: null },
        pupilName: 'Awa D.',
        partie: 'Al-Ikhlāṣ (112:1-4)',
        validationDay: '2026-11-02',
        note: 17.5,
        mention: 'Très bien',
        day: '2026-11-03',
        extra: {},
      }),
      'f',
    );
    const txt = d.fr.map((l) => l.map((x) => x.t).join('')).join('\n');
    expect(d.missing).toEqual([]);
    expect(txt).toContain("elle n'est pas une ijāza");
    expect(txt).toContain('17,5/20');
    expect(d.aValider).toBe(true);
  });
});

describe('export CSV', () => {
  it('séparateur « ; », BOM, guillemets, virgule décimale, formules neutralisées', () => {
    const c = toCsv(
      ['Élève', 'NF'],
      [
        ['=HYPERLINK("x")', 73.5],
        ['Awa; "D."', null],
      ],
    );
    expect(c.startsWith('\uFEFF')).toBe(true);
    expect(c).toContain('"\'=HYPERLINK(""x"")";73,5');
    expect(c).toContain('"Awa; ""D.""";');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell('-3')).toBe("'-3");
  });
});

// modèles RÉELS des livres (copie de contenu sur la machine de développement ; absents en CI)
const CONTENT = process.env.AWFORM_CONTENT_DIR ?? join(process.env.HOME ?? '', 'awform-content');
const CERTS = join(CONTENT, 'data', 'eval', 'certificats.js');

describe.skipIf(!existsSync(CERTS))('modèles des livres (certificats.js)', () => {
  const src = readFileSync(CERTS, 'utf8');
  const j = JSON.parse(src.slice(src.indexOf('(') + 1, src.lastIndexOf(')'))) as CertModels;
  it('les modèles de niveau existent pour chaque filière', () => {
    for (const t of ['enfants', 'adultes', 'ados', 'religion'])
      expect(j.modeles[levelModelKey(t)!]?.fr.length).toBeGreaterThan(0);
    expect(j.ordinaux_ar?.acc).toHaveLength(10);
    expect(j.mois_ar).toHaveLength(12);
  });
  it('certificat Religion : la mention « ni une ijāza » du modèle est conservée', () => {
    const d = renderDoc('niveau_religion', j.modeles.niveau_religion!, {}, 'm');
    expect(d.fr.map((l) => l.map((x) => x.t).join('')).join(' ')).toMatch(/ni une ijāza/);
  });
});
