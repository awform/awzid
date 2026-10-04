import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTanzil, parseQuranData } from '@awform/content';
import {
  pageOf,
  pageSegments,
  pageVerses,
  parseRef,
  readPrefs,
  repeatQueue,
  searchForm,
  searchVerses,
  spreadOf,
  stepPage,
  swipeStep,
  writePrefs,
  type Ref,
} from './mushaf';
import { ayaNumberAr, SURA_NAMES_AR, suraTitleAr } from './sura-names-ar';

/** Muṣḥaf par page — logique pure (références seulement ; le texte n'est jamais transformé). */
// métadonnées d'ESSAI : 3 sourates de 5, 3 et 4 versets, 4 pages
const LEN = [5, 3, 4];
const STARTS: Ref[] = [
  [1, 1],
  [1, 4],
  [2, 2],
  [3, 1],
];

describe('pages', () => {
  it('morceaux et versets d’une page, sur une ou deux sourates', () => {
    expect(pageSegments(STARTS, LEN, 1)).toEqual([{ s: 1, from: 1, to: 3 }]);
    expect(pageSegments(STARTS, LEN, 2)).toEqual([
      { s: 1, from: 4, to: 5 },
      { s: 2, from: 1, to: 1 },
    ]);
    expect(pageVerses(STARTS, LEN, 3)).toEqual([
      [2, 2],
      [2, 3],
    ]);
    expect(pageSegments(STARTS, [5, 3, 4], 4)).toEqual([{ s: 3, from: 1, to: 4 }]);
    expect(pageOf(STARTS, 1, 5)).toBe(2);
    expect(pageOf(STARTS, 2, 1)).toBe(2);
    expect(pageOf(STARTS, 3, 4)).toBe(4);
  });
  it('double page : impaire à droite, paire à gauche ; pas d’une ou deux pages', () => {
    expect(spreadOf(1)).toEqual([1, 2]);
    expect(spreadOf(2)).toEqual([1, 2]);
    expect(spreadOf(604)).toEqual([603, 604]);
    expect(stepPage(2, 1, true)).toBe(3);
    expect(stepPage(3, -1, true)).toBe(1);
    expect(stepPage(604, 1, true)).toBe(603);
    expect(stepPage(1, -1, false)).toBe(1);
    expect(stepPage(10, 1, false)).toBe(11);
  });
  it('bandeau et numéro de verset (ornements, hors texte coranique)', () => {
    expect(SURA_NAMES_AR).toHaveLength(114);
    expect(suraTitleAr(1).startsWith('سورة ')).toBe(true);
    expect(ayaNumberAr(255)).toBe('۝٢٥٥');
  });
  it('balayage : vers la droite = page suivante (livre arabe) ; geste vertical ignoré', () => {
    expect(swipeStep(80, 5)).toBe(1);
    expect(swipeStep(-80, 5)).toBe(-1);
    expect(swipeStep(30, 0)).toBe(0);
    expect(swipeStep(80, 90)).toBe(0);
  });
});

describe('recherche', () => {
  it('références : verset, page, juzʾ, sourate ; hors bornes refusées', () => {
    expect(parseRef('2:3', LEN)).toEqual({ kind: 'verse', s: 2, a: 3 });
    expect(parseRef(' 3 4 ', LEN)).toEqual({ kind: 'verse', s: 3, a: 4 });
    expect(parseRef('2:9', LEN)).toBeNull();
    expect(parseRef('page 604', LEN)).toEqual({ kind: 'page', p: 604 });
    expect(parseRef('p605', LEN)).toBeNull();
    expect(parseRef('juz 30', LEN)).toEqual({ kind: 'juz', j: 30 });
    expect(parseRef('3', LEN)).toEqual({ kind: 'sura', s: 3 });
    expect(parseRef('abc', LEN)).toBeNull();
  });
  it('forme de recherche sans signes ; le texte source n’est pas modifié', () => {
    const v = { s: 1, a: 1, text: 'مِنْ رَبِّهِمْ' }; // texte d'ESSAI, pas un verset
    const before = v.text;
    expect(searchForm(v.text)).toBe('من ربهم');
    expect(searchVerses([v], 'ربهم')).toEqual([{ s: 1, a: 1 }]);
    expect(searchVerses([v], 'ر')).toEqual([]);
    expect(v.text).toBe(before);
  });
});

describe('réglages et répétition', () => {
  it('réglages relus avec des bornes ; Warsh (indisponible) jamais retenu', () => {
    const m = new Map<string, string>();
    const st = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    writePrefs({ ...readPrefs(st), kind: 'warsh', memo: 9, page: 900, repeatVerse: 0 }, st);
    const p = readPrefs(st);
    expect(p.kind).toBe('hafs');
    expect(p.memo).toBe(3);
    expect(p.page).toBe(604);
    expect(p.repeatVerse).toBe(1);
    expect(readPrefs({ getItem: () => '{oops' }).kind).toBe('hafs');
  });
  it('file de répétition : chaque verset N fois, la plage M fois', () => {
    expect(repeatQueue(3, 4, 2, 2)).toEqual([3, 3, 4, 4, 3, 3, 4, 4]);
    expect(repeatQueue(1, 1, 0, 0)).toEqual([1]);
  });
});

// Avec le vrai contenu (VM, CI avec livres) : les 604 pages du Muṣḥaf de Médine couvrent les 6 236 versets,
// chacun une seule fois, dans l'ordre.
const DIR = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
const DATA = join(DIR, 'coran', 'tanzil-quran-data.js');
const TEXT = join(DIR, 'coran', 'tanzil-uthmani.tsv');
describe.runIf(existsSync(DATA) && existsSync(TEXT))('pages réelles (métadonnées Tanzil)', () => {
  it('604 pages, 6 236 versets, chacun une fois, dans l’ordre', () => {
    const d = parseQuranData(readFileSync(DATA, 'utf8'));
    const tanzil = loadTanzil(readFileSync(TEXT, 'utf8'));
    const len = Array.from({ length: 114 }, (_, i) => {
      let n = 0;
      while (tanzil.has(`${i + 1}:${n + 1}`)) n++;
      return n;
    });
    expect(d.pages).toHaveLength(604);
    const all = Array.from({ length: 604 }, (_, i) => pageVerses(d.pages, len, i + 1)).flat();
    expect(all).toHaveLength(6236);
    expect(all.map(([s, a]) => `${s}:${a}`)).toEqual(
      [...tanzil.keys()].sort((x, y) => {
        const [a1, b1] = x.split(':').map(Number);
        const [a2, b2] = y.split(':').map(Number);
        return a1! - a2! || b1! - b2!;
      }),
    );
    for (let p = 1; p <= 604; p++) expect(pageVerses(d.pages, len, p).length).toBeGreaterThan(0);
    expect(pageOf(d.pages, 2, 255)).toBe(42);
    expect(pageSegments(d.pages, len, 604).map((g) => g.s)).toEqual([112, 113, 114]);
  });
  it('noms arabes des bandeaux = noms de la source Tanzil, tels quels', () => {
    const src = readFileSync(DATA, 'utf8');
    const block = src.slice(src.indexOf('QuranData.Sura = ['));
    const names = [...block.matchAll(/\[\d+, \d+, \d+, \d+, '([^']+)'/g)]
      .slice(0, 114)
      .map((m) => m[1]);
    expect(SURA_NAMES_AR).toEqual(names);
  });
});
