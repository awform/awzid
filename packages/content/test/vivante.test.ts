import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONDENSE_MAX_MS,
  CONDENSE_MIN_MS,
  MOTION_MAX_MS,
  MOTION_MIN_MS,
  arabicStrings,
  buildVivante,
  schemaParts,
  type VivMotion,
} from '../src/vivante.js';
import {
  containsQuranRun,
  isQuranExcerpt,
  looksQuranic,
  quranCorpus,
  quranRuns,
} from '../src/audio-cle.js';
import { loadTanzil, parseDataFile, studentProjection } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

/** Leçons pilotes du chantier A21 : 1re leçon d'en1 (enfants), d'ado1 (ados), d'ad1 (adultes). */
const PILOTES = ['en1.l01', 'ado1.l01', 'ad1.l01'];
const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');

const readLesson = (unit: string) => {
  const [book, l] = unit.split('.');
  const f = join(CONTENT_DIR, 'data', book!, `${l}.js`);
  return existsSync(f) ? parseDataFile(readFileSync(f, 'utf8'), f).value : null;
};
/** toutes les chaînes d'une valeur (livre), récursivement */
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const unmark = (s: string) => s.replace(/[[\]]/g, '');
const allStrings = (ms: VivMotion[]) => ms.flatMap(arabicStrings);

describe('A21 — générateurs des leçons vivantes (règles, sans livres)', () => {
  it('le module ne contient aucun caractère arabe (rien de retapé)', () => {
    const src = readFileSync(new URL('../src/vivante.ts', import.meta.url), 'utf8');
    expect(/\p{sc=Arabic}/u.test(src)).toBe(false);
  });

  it('leçon vide : aucune animation, aucun condensé', () => {
    expect(buildVivante({}, { unitId: 'x' })).toEqual({ motions: [], condense: null });
  });

  it('texte aux signes du Muṣḥaf écarté ; Coran et adab jamais animés ; aucun personnage', () => {
    const verse = 'x۟y'; // signe du Muṣḥaf
    const r = buildVivante(
      {
        mots: [
          { ar: 'a', fr: 'A', img: 'door' },
          { ar: verse, fr: 'V', img: 'door' },
          { ar: 'b', fr: 'B', img: 'maryam' },
        ],
        coran: { versets: [{ ar: 'coran-verset' }] },
        fiqh_adab: { points: [{ ar: 'adab-point' }] },
      },
      { unitId: 'u', images: ['door', 'maryam'] },
    );
    const m = r.motions.find((x) => x.slot === 'mots')!;
    expect(m.beats.map((b) => (b.k === 'mot' ? [b.ar, b.img] : null))).toEqual([
      ['a', 'door'],
      ['b', undefined],
    ]);
    expect(JSON.stringify(r)).not.toMatch(/coran-verset|adab-point/);
  });

  it('question « écoute » seulement si le fichier audio du texte existe', () => {
    const lesson = {
      mots: [{ ar: 'm', fr: 'M' }],
      exercices: [{ type: 'ecoute', items: [{ dit: 'd', options: ['d', 'e'] }] }],
    };
    const q = (has: boolean) =>
      buildVivante(lesson, { unitId: 'u', hasAudio: () => has }).condense!.beats.filter(
        (b) => b.k === 'question',
      ).length;
    expect(q(false)).toBe(0);
    expect(q(true)).toBe(1);
  });

  it('syllabes : morceaux de 3 dans l’ordre du livre, chaque syllabe recopiée telle quelle', () => {
    const syl = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const r = buildVivante({ lecture: { syllabes: syl.map((ar) => ({ ar })) } }, { unitId: 'u' });
    const h = r.motions[0]!.beats.filter((b) => b.k === 'harakat');
    expect(h.map((b) => (b.k === 'harakat' ? b.items : []))).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('schéma « X … / Y … » : case remplie par le mot suivant d’une réplique, tel qu’écrit', () => {
    expect(schemaParts('A … / B …', [{ ar: 'A [m]ot.' }, { ar: 'B autre!' }, { ar: 'C' }])).toEqual(
      [
        { fixe: 'A', slot: 'mot' },
        { fixe: 'B', slot: 'autre' },
      ],
    );
    expect(schemaParts('A ← x | B ← y', [])).toEqual([{ fixe: 'A ← x' }, { fixe: 'B ← y' }]);
  });
});

describe.skipIf(!HAS_CONTENT)('A21 — les trois leçons pilotes (vrais livres)', () => {
  const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;
  const verses = tanzil ? [...tanzil.values()] : [];
  const corpus = tanzil ? quranCorpus(verses) : '';
  const runs = tanzil ? quranRuns(verses) : new Set<string>();

  for (const unit of PILOTES) {
    const raw = readLesson(unit);
    const level = unit.split('.')[0]!;
    const lesson = raw ? studentProjection(raw, level) : null;
    const images = new Set(
      strings((lesson as { mots?: unknown })?.mots).concat(
        strings((lesson as { exercices?: unknown })?.exercices),
      ),
    );
    const r = lesson
      ? buildVivante(lesson, { unitId: unit, images, hasAudio: () => true })
      : { motions: [], condense: null };

    it(`${unit} : une animation après chaque partie, 10 à 20 s chacune`, () => {
      expect(lesson).not.toBeNull();
      expect(r.motions.map((m) => m.slot)).toEqual([
        'lettres',
        'lecture',
        'mots',
        'dialogue',
        'retiens',
      ]);
      for (const m of r.motions) {
        expect(m.ms, m.id).toBeGreaterThanOrEqual(MOTION_MIN_MS);
        expect(m.ms, m.id).toBeLessThanOrEqual(MOTION_MAX_MS);
        expect(m.beats.reduce((s, b) => s + b.ms, 0)).toBe(m.ms);
        expect(m.beats.length).toBeGreaterThan(0);
      }
    });

    it(`${unit} : les six modèles servent (lettre, mot, structure, dialogue, règle, récapitulatif)`, () => {
      const models = new Set([...r.motions.map((m) => m.model), r.condense?.model]);
      for (const k of ['lettre', 'mot', 'structure', 'dialogue', 'regle', 'recap'])
        expect(models, k).toContain(k);
      // chaque modèle produit ses temps propres
      const kinds = new Set(r.motions.flatMap((m) => m.beats.map((b) => b.k)));
      for (const k of ['lettre', 'mot', 'harakat', 'phrase', 'bulle', 'schema', 'regle'])
        expect(kinds, k).toContain(k);
      // mot + image existante (objets seulement)
      const mots = r.motions.find((m) => m.slot === 'mots')!;
      expect(mots.beats.some((b) => b.k === 'mot' && b.img)).toBe(true);
    });

    it(`${unit} : condensé de 1 à 2 min avec 3 questions éclair tirées des exercices`, () => {
      const c = r.condense!;
      expect(c.ms).toBeGreaterThanOrEqual(CONDENSE_MIN_MS);
      expect(c.ms).toBeLessThanOrEqual(CONDENSE_MAX_MS);
      const qs = c.beats.filter((b) => b.k === 'question');
      expect(qs).toHaveLength(3);
      const exStrings = new Set(strings((lesson as { exercices?: unknown }).exercices));
      for (const b of qs)
        for (const s of strings(b.k === 'question' ? b.q : null).filter((x) => /[؀-ۿ]/.test(x)))
          expect(exStrings.has(s), s).toBe(true);
      // un temps de chaque animation au moins
      for (const m of r.motions)
        expect(
          c.beats.some((b) => m.beats.some((x) => JSON.stringify(x) === JSON.stringify(b))),
          m.id,
        ).toBe(true);
    });

    it(`${unit} : aucun texte arabe modifié — chaque chaîne est une chaîne du livre (ou un mot d’une réplique)`, () => {
      const book = strings(lesson);
      const exact = new Set([...book, ...book.map(unmark)]);
      const all = [...allStrings(r.motions), ...(r.condense ? arabicStrings(r.condense) : [])];
      expect(all.length).toBeGreaterThan(20);
      for (const s of all) {
        if (exact.has(s)) continue;
        // case d'un schéma : morceau d'une réplique coupé à une espace
        expect(
          book.some((b) => ` ${unmark(b)} `.includes(` ${s}`)),
          `non trouvé dans le livre : ${s}`,
        ).toBe(true);
      }
      // la voix ne vise QUE des textes entiers du livre (clé audio du moteur des livres)
      for (const m of r.motions)
        for (const b of m.beats) for (const s of b.say ?? []) expect(book).toContain(s);
    });

    it(`${unit} : aucun verset, rien des parties Coran et adab, aucun extrait du Coran (Tanzil)`, () => {
      const L = lesson as { coran?: unknown; fiqh_adab?: unknown };
      const sacred = new Set(
        strings(L.coran)
          .concat(strings(L.fiqh_adab))
          .filter((s) => /[؀-ۿ]/.test(s))
          .flatMap((s) => [s, unmark(s)]),
      );
      const all = [...allStrings(r.motions), ...(r.condense ? arabicStrings(r.condense) : [])];
      for (const s of all) {
        expect(looksQuranic(s), s).toBe(false);
        expect(sacred.has(s), s).toBe(false);
        if (tanzil) {
          expect(isQuranExcerpt(unmark(s), corpus), s).toBe(false);
          expect(containsQuranRun(unmark(s), runs), s).toBe(false);
        }
      }
    });
  }
});
