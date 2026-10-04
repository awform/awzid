import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSources, suraJson } from '../src/cli-tajwid.js';
import { loadTanzil } from '../src/quran.js';
import {
  alignVerse,
  buildTajwid,
  runsOf,
  TAJWID_RULES,
  TAJWID_TANZIL_SHA256,
  textHash,
  wordRuns,
  type TajwidSura,
} from '../src/tajwid.js';
import { tanwinDisplay, tanwinUndo } from '../src/text.js';
import { CONTENT_DIR } from './helpers.js';

/**
 * Lot 29 — tajwid en couleurs : le texte Tanzil n'est JAMAIS modifié ; les couleurs sont des enveloppes posées
 * sur des plages de caractères. Échec bloquant au moindre écart.
 */
const R = (r: string) => TAJWID_RULES.indexOf(r as (typeof TAJWID_RULES)[number]);
const W = 'مِنْ رَبِّهِمْ'; // texte d'ESSAI (deux mots), pas un verset
const join2 = (runs: { t: string }[]) => runs.map((x) => x.t).join('');

describe('morceaux colorés (runsOf, wordRuns)', () => {
  it('la concaténation des morceaux est exactement le texte ; règle imbriquée prioritaire', () => {
    const e: [string, ...number[]] = [textHash(W), R('ikhfa'), 0, 6, R('ghunnah'), 2, 2];
    const runs = runsOf(W, e)!;
    expect(join2(runs)).toBe(W);
    expect(runs.map((x) => x.r)).toEqual(['ikhfa', 'ghunnah', 'ikhfa', null]);
  });
  it('empreinte différente, position hors du texte, règle inconnue : aucune couleur', () => {
    expect(runsOf(W, ['zzz', R('ghunnah'), 0, 2])).toBeNull();
    expect(runsOf(W, [textHash(W), R('ghunnah'), 10, 99])).toBeNull();
    expect(runsOf(W, [textHash(W), R('ghunnah'), -1, 2])).toBeNull();
    expect(runsOf(W, [textHash(W), 99, 0, 2])).toBeNull();
    expect(runsOf(W, [textHash(W), R('ghunnah'), 0])).toBeNull();
    expect(runsOf(W, undefined)).toBeNull();
    // sans annotation : un seul morceau, sans règle
    expect(runsOf(W, [textHash(W)])).toEqual([{ t: W, r: null }]);
  });
  it('la petite mīm reste avec son tanwin (affichage du Muṣḥaf inchangé)', () => {
    const t = 'سَمِيعٌۢ بَصِيرٌ'; // essai
    const i = t.indexOf('ۢ');
    const runs = runsOf(t, [textHash(t), R('iqlab'), i - 1, 1])!;
    expect(runs.find((x) => x.r === 'iqlab')!.t).toBe('ٌۢ');
    expect(tanwinUndo(runs.map((x) => tanwinDisplay(x.t)).join(''))).toBe(t);
  });
  it('mots coupés aux espaces, espace jamais colorié ; mots rejoints = portion exacte', () => {
    const runs = runsOf(W, [textHash(W), R('idghaam_no_ghunnah'), 2, 5])!;
    const words = wordRuns(runs, W, 0, W.length)!;
    expect(words).toHaveLength(2);
    expect(words.map((w) => join2(w)).join(' ')).toBe(W);
    expect(words[1]![0]).toEqual({ t: 'رَ', r: 'idghaam_no_ghunnah' });
    // portion (après une basmala, par exemple)
    expect(wordRuns(runs, W, 5, W.length)!.map((w) => join2(w))).toEqual(['رَبِّهِمْ']);
  });
});

describe('calage sur notre texte Tanzil (alignVerse)', () => {
  const ref = 'عَلِيمٌ وَلَا'; // essai : copie « 2017 »
  const ours = 'عَلِيمٌۭ ۚ وَلَا'; // essai : + petite mīm, + signe de pause
  it('positions recalées, petite mīm rattachée, signe de pause laissé hors couleur', () => {
    // tanwin, espace, wāw : « ٌ و » dans la copie de 2017
    const e = alignVerse('t', ref, ours, [{ rule: 'idghaam_ghunnah', start: 6, end: 9 }]);
    expect(e[0]).toBe(textHash(ours));
    const runs = runsOf(ours, e)!;
    expect(join2(runs)).toBe(ours);
    const col = runs.filter((x) => x.r).map((x) => x.t);
    expect(col.join('|')).toBe('ٌۭ |و');
    expect(col.join('')).not.toContain('ۚ');
  });
  it('refuse tout écart qui n’est pas une insertion admise', () => {
    expect(() => alignVerse('t', ref, ours.replace('ل', 'ك'), [])).toThrow(/écart|contenu/);
    expect(() => alignVerse('t', ref, 'x' + ours, [])).toThrow(/écart non admis/);
    expect(() => alignVerse('t', ref, ours, [{ rule: 'inventee', start: 0, end: 1 }])).toThrow(
      /inconnue/,
    );
    expect(() => alignVerse('t', ref, ours, [{ rule: 'ghunnah', start: 3, end: 99 }])).toThrow(
      /invalide/,
    );
  });
});

const SHIPPED = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'static', 'tajwid');
const shipped = (s: number) =>
  readFileSync(join(SHIPPED, `${String(s).padStart(3, '0')}.json`), 'utf8');

// le texte Tanzil seul suffit (présent aussi en CI : infra/ci/contenu) ; les livres ne sont pas nécessaires
const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');

describe.skipIf(!existsSync(TSV))('tajwid des 6 236 versets (texte Tanzil)', () => {
  const raw = readFileSync(TSV);
  const tanzil = loadTanzil(raw.toString('utf8'));

  it('les annotations ont été calées sur CE texte Tanzil (sinon : régénérer)', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(TAJWID_TANZIL_SHA256);
  });

  it('les fichiers livrés sont exactement ceux que donne la source (rien d’ajouté à la main)', () => {
    const { source, ref } = readSources();
    const suras = buildTajwid(source, ref, tanzil);
    for (const x of suras) expect(shipped(x.s), `sourate ${x.s}`).toBe(suraJson(x));
  });

  it('chaque verset : empreinte = texte Tanzil, positions valides, morceaux et mots = texte exact', () => {
    let verses = 0;
    let anns = 0;
    const bad: string[] = [];
    for (let s = 1; s <= 114; s++) {
      const d = JSON.parse(shipped(s)) as TajwidSura;
      expect(d.s).toBe(s);
      d.a.forEach((e, i) => {
        const key = `${s}:${i + 1}`;
        const text = tanzil.get(key)!;
        verses++;
        anns += (e.length - 1) / 3;
        const runs = runsOf(text, e);
        if (!runs || join2(runs) !== text) return bad.push(`${key} morceaux`);
        const words = wordRuns(runs, text, 0, text.length);
        if (!words) return bad.push(`${key} mots`);
        // affichage du tanwin du Muṣḥaf appliqué morceau par morceau : réversible, texte retrouvé
        const shown = words.map((w) => w.map((x) => tanwinDisplay(x.t)).join('')).join(' ');
        if (tanwinUndo(shown) !== text) bad.push(`${key} affichage`);
      });
    }
    expect(bad).toEqual([]);
    expect(verses).toBe(6236);
    expect(anns).toBeGreaterThan(60_000);
  });

  it('les caractères colorés correspondent à la règle (contrôle de vraisemblance)', () => {
    // lettres attendues dans chaque morceau coloré, d'après la définition de la règle
    const expectChars: Partial<Record<(typeof TAJWID_RULES)[number], RegExp>> = {
      qalqalah: /[قطبجد]/,
      ghunnah: /[نم]ّ/,
      // conversion : ن ou tanwin (avec sa petite mīm) devant ب ; un signe de pause peut couper la plage
      iqlab: /[ۭۢ]|ن|^ب/,
      hamzat_wasl: /^ٱ$/,
      lam_shamsiyyah: /^ل$/,
      ikhfa_shafawi: /م|ب/,
      idghaam_shafawi: /م/,
    };
    const bad: string[] = [];
    for (let s = 1; s <= 114; s++) {
      const d = JSON.parse(shipped(s)) as TajwidSura;
      d.a.forEach((e, i) => {
        for (const run of runsOf(tanzil.get(`${s}:${i + 1}`)!, e)!) {
          const re = run.r && expectChars[run.r];
          if (re && !re.test(run.t)) bad.push(`${s}:${i + 1} ${run.r} « ${run.t} »`);
        }
      });
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });
});
