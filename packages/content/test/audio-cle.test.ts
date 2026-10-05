import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  audioFileId,
  audioKey,
  containsQuranRun,
  isQuranExcerpt,
  looksQuranic,
  quranCorpus,
  quranRuns,
  sha1Hex,
  skeleton,
} from '../src/audio-cle.js';

/**
 * Chantier A3 : la clé audio de l'application doit être EXACTEMENT celle du moteur des livres (awform.js).
 * Fixture (`fixtures/audio-cles.tsv`, produite par la fonction recopiée telle quelle d'awform.js) :
 * 200 textes de `liste.csv` (nom du fichier = SHA-1 de la clé) et 60 textes BRUTS des livres.
 */
const rows = readFileSync(join(import.meta.dirname, 'fixtures', 'audio-cles.tsv'), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('\t') as [string, string, string]);

describe('A3 — clé audio identique au moteur des livres', () => {
  it('200 textes réels de liste.csv : SHA-1 de la clé = nom du fichier', () => {
    const liste = rows.filter((r) => r[0] === 'liste');
    expect(liste.length).toBe(200);
    for (const [, sha, texte] of liste) {
      expect(audioKey(texte)).toBe(texte); // déjà normalisé : la clé est stable
      expect(audioFileId(texte)).toBe(sha);
    }
  });

  it('textes bruts des livres (balisage, tatweel, signes) : même clé que la fonction d’awform.js', () => {
    const bruts = rows.filter((r) => r[0] === 'brut');
    expect(bruts.length).toBeGreaterThanOrEqual(50);
    for (const [, brut, cle] of bruts) expect(audioKey(JSON.parse(brut))).toBe(JSON.parse(cle));
  });

  it('cas limites : ✱ de tête, crochets, alif waṣla, alif suscrit, NFD → NFC, espaces', () => {
    expect(audioKey('✱ *  [بَ]ـابٌ  ')).toBe('بَابٌ');
    expect(audioKey('ٱلْحَمْدُ')).toBe('الْحَمْدُ');
    expect(audioKey('هٰذَا')).toBe('هذَا');
    expect(audioKey('رَحْمَةً ۚ وَ')).toBe('رَحْمَةً وَ');
    expect(audioKey(String.fromCharCode(101, 0x301))).toBe(String.fromCharCode(0xe9));
    expect(audioKey('')).toBe('');
    expect(audioFileId('  ')).toBeNull();
  });

  it('SHA-1 sans dépendance = SHA-1 de Node (ASCII, arabe, longueurs aux bornes de bloc)', () => {
    for (const s of [
      '',
      'abc',
      'بَابٌ',
      'x'.repeat(55),
      'x'.repeat(56),
      'x'.repeat(64),
      'ب'.repeat(300),
    ])
      expect(sha1Hex(s)).toBe(createHash('sha1').update(s, 'utf8').digest('hex'));
  });
});

describe('A3 — garde coranique', () => {
  it('signes du Muṣḥaf : jamais de synthèse', () => {
    expect(looksQuranic('ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ ۛ فِيهِ ۛ')).toBe(true);
    expect(looksQuranic('هٰذَا بَيْتٌ')).toBe(false);
    expect(looksQuranic('بَابٌ')).toBe(false);
  });

  it('extrait du Coran (écriture courante comme ʿuthmānī), à partir de 3 mots', () => {
    // versets fictifs de test (aucun texte coranique dans ce test : squelettes seulement)
    const corpus = quranCorpus([
      'قَالَ ٱلْوَلَدُ ذَهَبْتُ إِلَى ٱلْمَدْرَسَةِ',
      'ثُمَّ رَجَعْتُ إِلَى بَيْتِي',
    ]);
    expect(isQuranExcerpt('ذَهَبْتُ إِلَى الْمَدْرَسَةِ', corpus)).toBe(true);
    expect(isQuranExcerpt('الْمَدْرَسَةِ ثُمَّ رَجَعْتُ', corpus)).toBe(true); // deux versets consécutifs
    expect(isQuranExcerpt('الْمَدْرَسَةِ', corpus)).toBe(false); // un mot isolé n'est pas un extrait
    expect(isQuranExcerpt('ذَهَبْتُ إِلَى السُّوقِ', corpus)).toBe(false);
    expect(skeleton('ٱلْكِتَٰبُ')).toBe(skeleton('الْكِتَابُ'));
  });

  it('texte qui CITE au moins 5 mots consécutifs du Coran (hadith, invocation) : écarté', () => {
    const runs = quranRuns([
      'قَالَ ٱلْوَلَدُ ذَهَبْتُ إِلَى ٱلْمَدْرَسَةِ',
      'ثُمَّ رَجَعْتُ إِلَى بَيْتِي',
    ]);
    expect(
      containsQuranRun('قَالَتْ أُمِّي: الْوَلَدُ ذَهَبْتُ إِلَى الْمَدْرَسَةِ ثُمَّ نِمْتُ', runs),
    ).toBe(true);
    expect(containsQuranRun('قَالَتْ أُمِّي: ذَهَبْتُ إِلَى الْمَدْرَسَةِ', runs)).toBe(false);
  });
});
