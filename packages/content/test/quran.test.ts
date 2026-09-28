import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ayahCandidates,
  checkVerse,
  loadTanzil,
  parseEcartsVoulus,
  parseRefs,
} from '../src/quran.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

const BISM = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const FAKE = loadTanzil(
  [
    `1:1\t\uFEFF${BISM}\r`,
    '1:2\tٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ\r',
    `112:1\tبِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ\r`,
    '112:2\tٱللَّهُ ٱلصَّمَدُ\r',
    '',
  ].join('\n'),
);

describe('références', () => {
  it('lit les formes usuelles', () => {
    expect(parseRefs('Al-Fātiḥa 1:1')).toEqual([{ sura: 1, from: 1, to: 1 }]);
    expect(parseRefs('An-Nās 114:1-3')).toEqual([{ sura: 114, from: 1, to: 3 }]);
    expect(parseRefs('65:2 (fin) et 65:3')).toEqual([
      { sura: 65, from: 2, to: 2 },
      { sura: 65, from: 3, to: 3 },
    ]);
    expect(parseRefs('88:24 ; 87:1')).toHaveLength(2);
    expect(parseRefs('2:285-2:286')).toEqual([{ sura: 2, from: 285, to: 286 }]);
  });
});

describe('contrôle octet par octet', () => {
  it('retire seulement BOM et CR du TSV', () => {
    expect(FAKE.get('1:1')).toBe(BISM);
    expect(FAKE.get('1:2')?.endsWith('\r')).toBe(false);
  });
  it('accepte le verset identique, avec ou sans crochets de couleur', () => {
    expect(checkVerse('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', '1:2', FAKE).status).toBe(
      'identique',
    );
    expect(checkVerse('ٱلْ[حَ]مْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', '1:2', FAKE).status).toBe(
      'identique',
    );
  });
  it('accepte le verset 1 sans basmala (basmala Tanzil avec chadda sur le bā)', () => {
    expect(ayahCandidates(FAKE, 112, 1)).toContain('قُلْ هُوَ ٱللَّهُ أَحَدٌ');
    expect(checkVerse('قُلْ هُوَ ٱللَّهُ أَحَدٌ', '112:1', FAKE).status).toBe('identique');
    expect(checkVerse('قُلْ هُوَ ٱللَّهُ أَحَدٌ ۝ ٱللَّهُ ٱلصَّمَدُ', '112:1-2', FAKE).status).toBe(
      'identique',
    );
  });
  it('classe un extrait exact comme « extrait »', () => {
    expect(checkVerse('رَبِّ ٱلْعَٰلَمِينَ', '1:2 (fin)', FAKE).status).toBe('extrait');
  });
  it('refuse un verset dont les signes ont été réordonnés (normalisation NFC)', () => {
    const rabbTanzil = 'رَبِّ'; // رَبِّ : bā, chadda PUIS kasra (ordre Tanzil)
    const rabbNfc = 'رَبِّ'; // kasra puis chadda (ordre canonique NFC)
    const t = loadTanzil(`1:2\tٱلْحَمْدُ لِلَّهِ ${rabbTanzil} ٱلْعَٰلَمِينَ\n`);
    const tanzil = t.get('1:2') ?? '';
    const reordered = tanzil.replace(rabbTanzil, rabbNfc);
    expect(checkVerse(tanzil, '1:2', t).status).toBe('identique');
    expect(reordered).not.toBe(tanzil);
    expect(checkVerse(reordered, '1:2', t).status).toBe('ecart');
  });
  it('refuse une référence inconnue ou absente', () => {
    expect(checkVerse('x', '1:9', FAKE).status).toBe('reference_inconnue');
    expect(checkVerse('x', 'sans référence', FAKE).status).toBe('reference_absente');
  });
  it('lit la liste blanche ECARTS_VERSETS.md (lignes VOULU seulement)', () => {
    const md = [
      '| Livre | Leçon | Référence | Écart | Décision | Justification |',
      '|---|---|---|---|---|---|',
      '| en1 | l05 | 95:1 | basmala absente | VOULU | ok |',
      '| en3 | l12 | 106:2 | ordre NFC | CORRIGÉ | ok |',
    ].join('\n');
    expect([...parseEcartsVoulus(md)]).toEqual(['en1.l05|95:1']);
  });
});

describe.skipIf(!HAS_CONTENT)('Tanzil réel', () => {
  it('contient les 6 236 versets', () => {
    const t = loadTanzil(readFileSync(join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv'), 'utf8'));
    expect(t.size).toBe(6236);
    expect(t.get('1:1')?.startsWith('بِسْمِ')).toBe(true);
  });
  it('détecte sur le vrai texte une inversion chadda/voyelle (effet d’une normalisation NFC)', () => {
    const t = loadTanzil(readFileSync(join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv'), 'utf8'));
    let tested = 0;
    for (const key of ['1:2', '1:3', '112:2', '114:1']) {
      const text = t.get(key) ?? '';
      const swapped = text.replace(/ّ([ً-ِ])/, '$1ّ');
      if (swapped === text) continue;
      tested++;
      expect(checkVerse(text, key, t).status).toBe('identique');
      expect(checkVerse(swapped, key, t).status).toBe('ecart');
    }
    expect(tested).toBeGreaterThan(0);
  });
});
