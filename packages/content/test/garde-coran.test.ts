/**
 * Garde coranique de la voix (`src/garde-coran.ts`) sur le VRAI texte Tanzil : règle partagée par les vidéos vivantes
 * et l'import des audios des leçons. Aucun texte coranique n'est écrit ici : les extraits sont pris dans le fichier
 * Tanzil, les formules dans `data/dhikr-formules.json`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioKey, looksQuranic, skeleton } from '../src/audio-cle.js';
import { citeCoran, gardeCoran, refusVoix } from '../src/garde-coran.js';
import { loadTanzil } from '../src/index.js';
import { CONTENT_DIR } from './helpers.js';

const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;
const cleVerset = (k: string) => k.split(':').map(Number) as [number, number];
const verses = tanzil
  ? [...tanzil.entries()]
      .sort(([a], [b]) => {
        const [x, y] = cleVerset(a);
        const [u, v] = cleVerset(b);
        return x - u || y - v;
      })
      .map(([, v]) => v)
  : [];
const formules = (
  JSON.parse(readFileSync(new URL('../data/dhikr-formules.json', import.meta.url), 'utf8')) as {
    formules: { ar: string; categorie: string }[];
  }
).formules;
/** formule de la liste, en clé audio (comme l'index du moteur des livres) */
const formule = (cat: string, n = 0) =>
  audioKey(formules.filter((f) => f.categorie === cat)[n]!.ar);
/** mots d'un verset, en clés audio, sans signe propre au Muṣḥaf */
const mots = (ref: string) =>
  audioKey(tanzil!.get(ref)!)
    .split(' ')
    .filter((w) => !looksQuranic(w));

describe.skipIf(!tanzil)('garde coranique de la voix (Tanzil)', () => {
  const g = tanzil ? gardeCoran(verses) : null!;

  it('« مَا شَاءَ اللَّهُ » (dans 18:39) et la kaffārat al-majlis sont des formules : voix permise', () => {
    const ms = formule('formule');
    expect(skeleton(audioKey(tanzil!.get('18:39')!))).toContain(skeleton(ms));
    expect(refusVoix(ms, g)).toBeNull();
    const k = formule('kaffara');
    expect(refusVoix(k, g)).toBeNull();
    // sans la liste blanche, la kaffāra serait une citation (« أَنْ لَا إِلٰهَ إِلَّا أَنْتَ », 21:87)
    const w = skeleton(k).split(' ');
    expect(w.some((_, i) => g.suites.has(w.slice(i, i + 4).join(' ')))).toBe(true);
  });

  it('une suite de 4 mots du Coran est refusée, seule ou dans une phrase ; 3 mots ou un mot isolé sont permis', () => {
    const w = mots('2:255');
    const quatre = w.slice(3, 7).join(' ');
    expect(citeCoran(quatre, g)).toBe(true);
    expect(refusVoix(quatre, g)).toBe('citation');
    expect(refusVoix(`${formule('formule')} ${quatre}`, g)).toBe('citation');
    expect(refusVoix(w.slice(3, 6).join(' '), g)).toBeNull();
    expect(refusVoix(w[3]!, g)).toBeNull();
  });

  it('présenté comme Coran (référence de verset, verset entier) : refusé, même court, même pour une formule', () => {
    const deux = mots('2:255').slice(3, 5).join(' ');
    expect(refusVoix(deux, g)).toBeNull();
    expect(refusVoix(`${deux} (2:255)`, g)).toBe('coran');
    expect(refusVoix(`${formule('formule')} (18:39)`, g)).toBe('coran');
    const court = verses.findIndex((v) => audioKey(v).split(' ').length === 2);
    expect(court).toBeGreaterThan(0);
    expect(refusVoix(audioKey(verses[court]!), g)).toBe('coran');
  });
});
