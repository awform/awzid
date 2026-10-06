import { describe, expect, it } from 'vitest';
import { bidiSegments, type BidiSegment } from './segments';

/** Cas réels des livres (champs *_fr et lecture) : segments attendus, hors texte français simple. */
const isolated = (segs: BidiSegment[]) =>
  segs.filter((s) => s.kind !== 'plain').map((s) => [s.kind, s.text]);

const CASES: [string, 'fr' | 'ar', [string, string][]][] = [
  [
    // ad2, leçon 11 : objectif
    'Je sais régler la durée du chant du nez (الْغُنَّةُ) dans toutes les règles du ن et du م.',
    'fr',
    [
      ['ar', 'الْغُنَّةُ'],
      ['ar', 'ن'],
      ['ar', 'م'],
    ],
  ],
  [
    // en4, leçon 7 : notion (parenthèses et virgules entre deux mots arabes)
    "Au présent, la lettre du début dit qui fait l'action : أَ = je (أَكْتُبُ), نَـ = nous (نَكْتُبُ), يَـ = il (يَكْتُبُ, leçon 5)",
    'fr',
    [
      ['ar', 'أَ'],
      ['ar', 'أَكْتُبُ'],
      ['ar', 'نَـ'],
      ['ar', 'نَكْتُبُ'],
      ['ar', 'يَـ'],
      ['ar', 'يَكْتُبُ'],
    ],
  ],
  [
    // ad1, leçon 1 : erreurs fréquentes — liste écrite à la française, lue dans l'ordre du texte
    'Prononcer ث comme « s » ou « t » (ou « f ») : faire sortir le bout de la langue devant le miroir et opposer ثَ / تَ / سَ.',
    'fr',
    [
      ['ar', 'ث'],
      ['ar', 'ثَ'],
      ['ar', 'تَ'],
      ['ar', 'سَ'],
    ],
  ],
  [
    // ad1, leçon 2 : prérequis — liste à la virgule arabe : un seul segment ; 3 mots → sur sa ligne
    'Leçon 1 : ب ت ث ن ي, les trois voyelles brèves, ثَبَتَ، نَبَتَ، بُنِيَ ; le salam.',
    'fr',
    [
      ['ar', 'ب ت ث ن ي'],
      ['ar-long', 'ثَبَتَ، نَبَتَ، بُنِيَ'],
    ],
  ],
  [
    // ra1, leçon 2 : citation longue ENTRE GUILLEMETS → sur sa ligne, guillemets compris (règle du client)
    "Hadith d'Abū Hurayra, rapporté par al-Bukhārī (7288, avec ces mots, dans un hadith plus long) et Muslim (1337, même sens : « … وَإِذَا نَهَيْتُكُمْ عَنْ شَيْءٍ فَدَعُوهُ ») ; n° 9 des Quarante d'an-Nawawī.",
    'fr',
    [['ar-long', '« … وَإِذَا نَهَيْتُكُمْ عَنْ شَيْءٍ فَدَعُوهُ »']],
  ],
  [
    // ad1, leçon 20 : exemple long suivi de sa traduction → sur sa propre ligne, la traduction dessous
    'faire, agir, œuvrer (rang 45) — verbe ; فَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ خَيْرًۭا يَرَهُۥ : « Quiconque',
    'fr',
    [['ar-long', 'فَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ خَيْرًۭا يَرَهُۥ']],
  ],
  [
    // ad1, leçon 7 : longue liste entre parenthèses → sur sa ligne, parenthèses comprises
    "J'écris 3 phrases courtes avec les verbes déjà lus (كَتَبَ، عَلِمَ، عَمِلَ، فَهِمَ، سَمِعَ، غَسَلَ).",
    'fr',
    [['ar-long', '(كَتَبَ، عَلِمَ، عَمِلَ، فَهِمَ، سَمِعَ، غَسَلَ)']],
  ],
  [
    // ra1, leçon 20 : citation interrompue « … » collée à l'arabe
    "Faut-il dire l'invocation d'ouverture « سُبْحَانَكَ اللَّهُمَّ… » ?",
    'fr',
    [['ar', 'سُبْحَانَكَ اللَّهُمَّ…']],
  ],
  [
    // ra1, leçon 4 : ﷺ dans le français
    'Pourquoi, selon vous, le Prophète ﷺ a-t-il répondu à Sufyān par une phrase si courte ?',
    'fr',
    [['ar', 'ﷺ']],
  ],
  [
    // ad1, leçon 1 : syllabation avec tirets → un seul segment
    'Faire réciter la Basmala avec la bonne syllabation (بِسْ-مِلْ-لَا-هِرْ-رَحْ-مَا-نِرْ-رَ-حِيمْ).',
    'fr',
    [['ar', 'بِسْ-مِلْ-لَا-هِرْ-رَحْ-مَا-نِرْ-رَ-حِيمْ']],
  ],
  // ad1, leçon 23 : texte arabe avec un fragment français
  ['نَعْبُدُ : نَـ = nous', 'ar', [['ltr', 'nous']]],
  ['اهْدِنَا = اهْدِ + ـنَا', 'ar', []],
  // en4 : tatwīl devant la lettre, dans le français
  [
    'sur eux : ـهِمْ (عَلَيْهِمْ)',
    'fr',
    [
      ['ar', 'ـهِمْ'],
      ['ar', 'عَلَيْهِمْ'],
    ],
  ],
];

describe('bidiSegments — cas réels des livres', () => {
  for (const [text, base, want] of CASES) {
    it(text.slice(0, 50), () => {
      const segs = bidiSegments(text, base);
      expect(isolated(segs)).toEqual(want);
      // le texte n'est jamais modifié : la concaténation redonne la chaîne exacte
      expect(segs.map((s) => s.text).join('')).toBe(text);
    });
  }

  it('texte sans l’autre écriture : un seul segment, sans copie', () => {
    expect(bidiSegments('Bonjour !')).toEqual([{ text: 'Bonjour !', kind: 'plain' }]);
    expect(bidiSegments('بِسْمِ اللَّهِ', 'ar')).toEqual([
      { text: 'بِسْمِ اللَّهِ', kind: 'plain' },
    ]);
    expect(bidiSegments('')).toEqual([]);
  });

  it('règle du client : 1 ou 2 mots arabes dans la ligne, 3 mots ou plus sur leur propre ligne', () => {
    const kinds = (t: string) => isolated(bidiSegments(t)).map((x) => x[0]);
    expect(kinds('Le mot كِتَابٌ veut dire livre.')).toEqual(['ar']);
    expect(kinds('On dit بِسْمِ اللَّهِ avant de manger.')).toEqual(['ar']);
    expect(kinds('On dit إِنْ شَاءَ اللَّهُ quand on promet.')).toEqual(['ar-long']);
    // au milieu d'une phrase française, ou à la fin : toujours sur sa ligne
    expect(kinds('Il répond : جَزَاكَ اللَّهُ خَيْرًا.')).toEqual(['ar-long']);
  });

  it('parenthèses jamais coupées par une frontière de segment', () => {
    for (const t of ['ب (ت) et ث', 'x (ب), (ت) y', 'ب) (ت', 'le mot (بِـ) collé']) {
      for (const s of bidiSegments(t)) {
        if (s.kind === 'plain') continue;
        const o = (s.text.match(/[([]/g) ?? []).length;
        const c = (s.text.match(/[)\]]/g) ?? []).length;
        expect(o, `${t} → ${s.text}`).toBe(c);
      }
    }
  });
});
