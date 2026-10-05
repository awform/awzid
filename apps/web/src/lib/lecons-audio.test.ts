import { describe, expect, it } from 'vitest';
import { audioFileId } from '@awform/content/audio-cle';
import {
  audioIdFor,
  pageAudioText,
  recitationQuery,
  SLOW_RATE,
  type LevelAudio,
} from './lecons-audio';

const la = (texts: string[]): LevelAudio => ({
  niveau: 'en1',
  fichiers: new Set(texts.map((s) => audioFileId(s)!)),
  octets: 0,
  mention: 'voix de synthèse (provisoire)',
  credits: [],
});

describe('A3 — boutons « écouter » des leçons', () => {
  it('bouton seulement si le fichier du texte existe (clé du moteur des livres)', () => {
    const a = la(['بَابٌ']);
    // le balisage du livre ([..], tatweel) ne change pas la clé
    expect(audioIdFor('[بَ]ابٌ', a)).toBe(audioFileId('بَابٌ'));
    expect(audioIdFor('قَلَمٌ', a)).toBeNull();
    expect(audioIdFor('', a)).toBeNull();
    expect(audioIdFor('بَابٌ', null)).toBeNull();
  });

  it('jamais sur un texte coranique (signes du Muṣḥaf), même si un fichier existait', () => {
    const t = 'ذَٰلِكَ ٱلْكِتَٰبُ';
    expect(audioIdFor(t, la([t]))).toBeNull();
  });

  it('verset : lien vers la récitation du Complexe quand la référence est connue', () => {
    expect(recitationQuery('Al-Fātiḥa 1:2')).toBe('?s=1&a=2');
    expect(recitationQuery('112:1-4')).toBe('?s=112&a=1');
    expect(recitationQuery('sans référence')).toBeNull();
    expect(recitationQuery('200:1')).toBeNull();
    expect(recitationQuery(undefined)).toBeNull();
  });

  it('lecture lente à 0,8', () => expect(SLOW_RATE).toBe(0.8));

  it('lecture graduée : la page entière, lignes jointes (clé du moteur des livres)', () => {
    const page = 'فِي السُّوقِ تَمْرٌ. | السُّوقُ قَرِيبٌ.';
    const a = la(['فِي السُّوقِ تَمْرٌ. السُّوقُ قَرِيبٌ.']);
    expect(audioIdFor(pageAudioText(page), a)).toBe(
      audioFileId('فِي السُّوقِ تَمْرٌ. السُّوقُ قَرِيبٌ.'),
    );
    // une page qui cite le Coran (signes du Muṣḥaf) : jamais de bouton
    expect(audioIdFor(pageAudioText('قَالَ: ﴿ذَٰلِكَ ٱلْكِتَٰبُ﴾ | نَعَمْ'), a)).toBeNull();
  });
});
