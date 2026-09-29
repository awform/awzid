/**
 * Contenu synthétique des tests (audit INF-2) : importable sans erreur bloquante, identique à la sortie du
 * générateur, et SANS aucun bloc religieux (Coran, hadiths, fiqh, rubriques de religion) ni verset.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockingIssues, loadEdition } from '@awform/content';
import { SYNTH_DIR } from './content.js';

const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (f === 'coran') return [];
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe('contenu synthétique des tests', () => {
  it('importable par le vrai importeur, sans erreur bloquante', () => {
    const load = loadEdition({ contentDir: SYNTH_DIR, levels: ['en1', 'ad1'] });
    expect(blockingIssues(load)).toEqual([]);
    expect(load.levels.map((l) => l.units.length)).toEqual([5, 3]);
    expect(load.hifz.map((h) => h.code)).toEqual(['en1', 'ad1']);
  });
  it('aucun texte religieux : ni Coran, ni hadith, ni fiqh ; carnets sans texte', () => {
    for (const f of files(SYNTH_DIR)) {
      const s = readFileSync(f, 'utf8');
      for (const k of ['"coran"', '"hadiths"', '"fiqh_adab"', '"rubriques"', '"tajwid_ex"'])
        expect(s.includes(k), `${f} : ${k}`).toBe(false);
      // carnets de hifẓ : numéros de sourates et de versets seulement, aucun caractère arabe
      if (f.includes(join('data', 'hifz'))) expect(/[\u0600-\u06FF]/.test(s), f).toBe(false);
    }
  });
  it('à jour : le générateur redonne exactement les fichiers versionnés', () => {
    const before = files(SYNTH_DIR).map((f) => [f, readFileSync(f, 'utf8')]);
    execFileSync('node', [join(SYNTH_DIR, '..', 'synthetique', 'generer.mjs')]);
    const after = files(SYNTH_DIR).map((f) => [f, readFileSync(f, 'utf8')]);
    expect(after).toEqual(before);
  });
});
