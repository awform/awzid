import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expect as must, it } from 'vitest';
import {
  CONDENSE_MAX_MS,
  CONDENSE_MIN_MS,
  MOTION_MAX_MS,
  MOTION_MIN_MS,
  arabicStrings,
  buildVivante,
  gardeKey,
  matchRoot,
  schemaParts,
  type VivBeat,
  type VivMotion,
} from '../src/vivante.js';
import { GARDE } from '../src/vivante-garde.js';
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
/** livres d'arabe (A21b : toutes les leçons d'élève de tous les niveaux) */
const LIVRES = [
  ...['en1', 'en2', 'en3', 'en4', 'en5'],
  ...['ado1', 'ado2', 'ado3', 'ado4'],
  ...Array.from({ length: 10 }, (_, i) => `ad${i + 1}`),
];

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
/** lettre ou signe arabe : un morceau du livre ne commence ni ne finit au milieu d'un mot */
const IN_WORD = /[ء-ٰٟٱ]/;
/** s est-il une chaîne du livre, ou un morceau d'une chaîne du livre coupé entre deux mots ? */
function fromBook(s: string, book: string[]): boolean {
  if (book.includes(s) || book.some((b) => unmark(b) === s)) return true;
  for (const b of book)
    for (const t of [b, unmark(b)]) {
      for (let i = t.indexOf(s); i >= 0; i = t.indexOf(s, i + 1)) {
        const before = i > 0 ? t[i - 1]! : ' ';
        const after = t[i + s.length] ?? ' ';
        if (!IN_WORD.test(before) && !IN_WORD.test(after)) return true;
      }
    }
  return false;
}
/** chaque temps a quelque chose à montrer */
function shows(b: VivBeat): boolean {
  switch (b.k) {
    case 'lettre':
      return !!b.l;
    case 'mot':
    case 'phrase':
    case 'bulle':
    case 'heure':
      return !!b.ar;
    case 'harakat':
      return b.items.length > 0;
    case 'schema':
      return b.parts.length > 0 && b.parts.every((p) => !!p.fixe);
    case 'regle':
      return !!(b.ar || b.signe || b.l);
    case 'racine':
      return !!(b.mot && b.moule && b.racine.every(Boolean));
    case 'conj':
      return b.rows.length > 0;
    case 'nombre':
      return !!(b.chiffre && b.mot);
    case 'question':
      return true;
  }
}

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

  it('A21b — schéma des notes longues : séparateurs du livre (— · • ●), 4 parties au plus, parties à plusieurs cases gardées telles quelles', () => {
    expect(
      schemaParts('A … — B … C — D…؟ · E • F ● G', [{ ar: 'A «mot»؟' }, { ar: 'D x' }]),
    ).toEqual([
      { fixe: 'A', slot: 'mot' },
      { fixe: 'B … C' },
      { fixe: 'D', slot: 'x' },
      { fixe: 'E' },
    ]);
  });

  // lettres désignées par leur code (fa, ʿayn, lām ; kāf, tāʾ, bāʾ ; mīm, wāw, alif ; ḥarakāt)
  const c = String.fromCharCode;
  const [FA, AY, LA, KA, TA, BA, MI, WA, AL] = [
    0x641, 0x639, 0x644, 0x643, 0x62a, 0x628, 0x645, 0x648, 0x627,
  ].map((x) => c(x));
  const [a, i, u] = [0x64e, 0x650, 0x64f].map((x) => c(x));
  const faail = `${FA}${a}${AL}${AY}${i}${LA}`; // schème « celui qui fait »
  const kaatib = `${KA}${a}${AL}${TA}${i}${BA}`;
  const mafuul = `${MI}${a}${FA}${AY}${u}${WA}${LA}`;
  const maktuub = `${MI}${a}${KA}${TA}${u}${WA}${BA}`;

  it('A21b — racine et schème : décomposition montrée seulement si elle se vérifie lettre à lettre', () => {
    const r = matchRoot(kaatib, faail, [KA!, TA!, BA!])!;
    expect(r.pos.map(([s, e]) => kaatib.slice(s, e))).toEqual([`${KA}${a}`, `${TA}${i}`, BA]);
    expect(r.mpos.map(([s, e]) => faail.slice(s, e))).toEqual([`${FA}${a}`, `${AY}${i}`, LA]);
    expect(matchRoot(maktuub, mafuul, [KA!, TA!, BA!])).not.toBeNull();
    expect(matchRoot(maktuub, faail, [KA!, TA!, BA!])).toBeNull(); // autre schème
    expect(matchRoot(kaatib, faail, [KA!, BA!, TA!])).toBeNull(); // autre racine
    const lesson = {
      notion: { texte_ar: `${KA} ${TA} ${BA} ← ${kaatib} · ${maktuub}` },
      retiens: [{ ar: `${faail} ← ${kaatib}` }, { ar: `${mafuul} ← ${maktuub}` }],
    };
    const m = buildVivante(lesson, { unitId: 'u' }).motions.find((x) => x.model === 'racine')!;
    expect(
      m.beats.map((b) => (b.k === 'racine' ? [b.mot, b.moule, b.racine.join('')] : 0)),
    ).toEqual([
      [kaatib, faail, KA! + TA! + BA!],
      [maktuub, mafuul, KA! + TA! + BA!],
    ]);
  });

  it('A21b — conjugaison : un seul verbe, terminaison balisée par le livre, 3 lignes au moins', () => {
    const P = (...x: number[]) => c(...x);
    const ana = P(0x623, 0x64e, 0x646, 0x64e, 0x627);
    const anta = P(0x623, 0x64e, 0x646, 0x652, 0x62a, 0x64e);
    const huwa = P(0x647, 0x64f, 0x648, 0x64e);
    const v = `${KA}${a}${TA}${a}${BA}`;
    const ok = {
      notion: { texte_ar: `${ana} ${v}[${TA}${u}] | ${anta} ${v}[${TA}${a}] | ${huwa} ${v}${a}` },
    };
    const m = buildVivante(ok, { unitId: 'u' }).motions.find((x) => x.model === 'conjugaison')!;
    expect(m.beats.flatMap((b) => (b.k === 'conj' ? b.rows.map((r) => r.p) : []))).toEqual([
      ana,
      anta,
      huwa,
    ]);
    // sans balisage de la terminaison : rien (on n'invente pas où elle commence)
    const sans = { notion: { texte_ar: ok.notion.texte_ar.replace(/[[\]]/g, '') } };
    expect(buildVivante(sans, { unitId: 'u' }).motions.some((x) => x.model === 'conjugaison')).toBe(
      false,
    );
  });

  it('A21b — nombres : paires « chiffre ← mot » du livre (3 au moins) ; heure : traduction du livre', () => {
    const d = (n: number) => c(0x660 + n);
    const w = [`${TA}${a}`, `${BA}${a}`, `${KA}${a}`];
    const lesson = {
      titre_fr: "L'heure",
      lecture: {
        ligne: [`${d(3)} ← ${w[0]}`, `[${d(7)}] ${w[1]}`, `${w[2]} = ${d(9)}`, `${d(1)} ${d(2)}`],
        phrases: [
          { ar: w[0], fr: 'à 8 h 30' },
          { ar: w[1], fr: 'à 6 h' },
          { ar: w[2], fr: 'sans heure' },
        ],
      },
    };
    const r = buildVivante(lesson, { unitId: 'u' }).motions;
    const n = r.find((x) => x.model === 'nombre')!;
    expect(n.beats.map((b) => (b.k === 'nombre' ? [b.n, b.chiffre, b.mot] : 0))).toEqual([
      [3, d(3), w[0]],
      [7, d(7), w[1]],
      [9, d(9), w[2]],
    ]);
    const h = r.find((x) => x.model === 'heure')!;
    expect(h.beats.map((b) => (b.k === 'heure' ? [b.h, b.m] : 0))).toEqual([
      [8, 30],
      [6, 0],
    ]);
    // pas une leçon sur l'heure : pas d'horloge
    const autre = buildVivante({ ...lesson, titre_fr: 'Ma journée' }, { unitId: 'u' }).motions;
    expect(autre.some((x) => x.model === 'heure')).toBe(false);
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
      const all = [...allStrings(r.motions), ...(r.condense ? arabicStrings(r.condense) : [])];
      expect(all.length).toBeGreaterThan(20);
      for (const s of all) expect(fromBook(s, book), `non trouvé dans le livre : ${s}`).toBe(true);
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

/**
 * A21b — TOUTES les leçons d'élève des 19 livres d'arabe (en1–en5, ado1–ado4, ad1–ad10) : les animations
 * sont générées sans erreur, chaque chaîne arabe vient du livre, rien du Coran ni de l'adab/fiqh, 10 à 20 s,
 * aucun modèle vide.
 */
describe.skipIf(!HAS_CONTENT)('A21b — toutes les leçons des livres d’arabe (vrais livres)', () => {
  const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;
  const verses = tanzil ? [...tanzil.values()] : [];
  const corpus = tanzil ? quranCorpus(verses) : '';
  const runs = tanzil ? quranRuns(verses) : new Set<string>();

  it('garde coranique à jour : toute citation du Coran (Tanzil) que les générateurs montreraient est écartée', () => {
    if (!tanzil) return;
    const flagged = new Set<string>();
    const memo = new Map<string, boolean>();
    const cite = (u: string) => {
      if (!memo.has(u)) memo.set(u, isQuranExcerpt(u, corpus) || containsQuranRun(u, runs));
      return memo.get(u)!;
    };
    for (let pass = 0; pass < 8; pass++) {
      let added = false;
      for (const book of LIVRES) {
        const dir = join(CONTENT_DIR, 'data', book);
        for (const f of existsSync(dir)
          ? readdirSync(dir).filter((x) => /^l\d+\.js$/.test(x))
          : []) {
          const unit = `${book}.${f.slice(0, 3)}`;
          const lesson = studentProjection(readLesson(unit), book) as Record<string, unknown>;
          if ((lesson.type ?? 'lecon') !== 'lecon') continue;
          const r = buildVivante(lesson, { unitId: unit, hasAudio: () => true, garde: flagged });
          for (const s of [
            ...allStrings(r.motions),
            ...(r.condense ? arabicStrings(r.condense) : []),
          ]) {
            const u = unmark(s);
            if (!cite(u)) continue;
            if (flagged.has(gardeKey(s))) continue;
            flagged.add(gardeKey(s));
            added = true;
          }
        }
      }
      if (!added) break;
    }
    const want = [...flagged].sort().join(' ');
    if (process.env.VIVANTE_GARDE === 'ecrire') {
      const f = new URL('../src/vivante-garde.ts', import.meta.url);
      const src = readFileSync(f, 'utf8').replace(
        /export const GARDE = [^;]*;/,
        `export const GARDE =\n  '${want}';`,
      );
      writeFileSync(f, src);
      return;
    }
    must(
      GARDE.split(' ').filter(Boolean).sort().join(' '),
      'VIVANTE_GARDE=ecrire pour mettre à jour',
    ).toBe(want);
  }, 300_000);
  for (const book of LIVRES) {
    const dir = join(CONTENT_DIR, 'data', book);
    const files = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => /^l\d+\.js$/.test(f))
          .sort()
      : [];
    it(`${book} : chaque leçon d’élève a ses animations, toutes conformes`, () => {
      must(files.length).toBeGreaterThan(0);
      let lecons = 0;
      const errs: string[] = [];
      const expect = (v: unknown, msg?: string) => {
        const chk = (ok: boolean, what: string) => {
          if (!ok) errs.push(`${msg ?? ''} — ${what} (${JSON.stringify(v)?.slice(0, 160)})`);
        };
        return {
          toBe: (x: unknown) => chk(v === x, `≠ ${String(x)}`),
          toBeGreaterThan: (x: number) => chk((v as number) > x, `≤ ${x}`),
          toBeGreaterThanOrEqual: (x: number) => chk((v as number) >= x, `< ${x}`),
          toBeLessThanOrEqual: (x: number) => chk((v as number) <= x, `> ${x}`),
          toContain: (x: unknown) => chk((v as unknown[]).includes(x), `sans ${String(x)}`),
          not: {
            toBeNull: () => chk(v !== null, 'null'),
            toThrow: () => {
              try {
                (v as () => void)();
              } catch (e) {
                chk(false, `erreur ${String(e)}`);
              }
            },
          },
        };
      };
      for (const f of files) {
        const unit = `${book}.${f.slice(0, 3)}`;
        const lesson = studentProjection(readLesson(unit), book) as Record<string, unknown>;
        if ((lesson.type ?? 'lecon') !== 'lecon') continue;
        lecons++;
        const images = new Set(strings(lesson.mots).concat(strings(lesson.exercices)));
        let r: ReturnType<typeof buildVivante>;
        expect(() => {
          r = buildVivante(lesson, { unitId: unit, images, hasAudio: () => true });
        }, unit).not.toThrow();
        r = r!;
        expect(r.motions.length, `${unit} : aucune animation`).toBeGreaterThan(0);
        expect(r.condense, unit).not.toBeNull();
        const ids = r.motions.map((m) => m.id);
        expect(new Set(ids).size, unit).toBe(ids.length);
        for (const m of r.motions) {
          expect(m.ms, m.id).toBeGreaterThanOrEqual(MOTION_MIN_MS);
          expect(m.ms, m.id).toBeLessThanOrEqual(MOTION_MAX_MS);
          expect(
            m.beats.reduce((s, b) => s + b.ms, 0),
            m.id,
          ).toBe(m.ms);
          expect(m.beats.length, m.id).toBeGreaterThan(0);
          for (const b of m.beats) expect(shows(b), `${m.id} : temps vide (${b.k})`).toBe(true);
        }
        expect(r.condense!.ms, unit).toBeLessThanOrEqual(CONDENSE_MAX_MS);
        const available = r.motions.reduce((s, m) => s + m.ms, 0);
        if (available >= CONDENSE_MIN_MS)
          expect(r.condense!.ms, unit).toBeGreaterThanOrEqual(CONDENSE_MIN_MS);
        // le livre SANS ses parties Coran et adab/fiqh : chaque chaîne animée vient de là
        const { coran, fiqh_adab, ...profane } = lesson;
        const book_ = strings(profane);
        const words = (s: string) => s.trim().split(/\s+/).length;
        const sacred = strings(coran)
          .concat(strings(fiqh_adab))
          .filter((s) => /[؀-ۿ]/.test(s))
          .map((s) => unmark(s).trim());
        const all = [...allStrings(r.motions), ...arabicStrings(r.condense!)];
        for (const s of all) {
          const u = unmark(s);
          expect(fromBook(s, book_), `${unit} : non trouvé dans le livre : ${s}`).toBe(true);
          expect(looksQuranic(s) || /[﴾﴿]/.test(s), `${unit} : ${s}`).toBe(false);
          // ni un texte des parties Coran et adab/fiqh, ni un morceau d'un tel texte, ni ne le contient
          if (words(u) >= 2)
            expect(
              sacred.some(
                (t) =>
                  t === u || (words(u) >= 3 && t.includes(u)) || (words(t) >= 3 && u.includes(t)),
              ),
              `${unit} : texte des parties Coran / adab : ${s}`,
            ).toBe(false);
          if (tanzil) {
            expect(isQuranExcerpt(u, corpus), `${unit} : extrait du Coran : ${s}`).toBe(false);
            expect(containsQuranRun(u, runs), `${unit} : citation du Coran : ${s}`).toBe(false);
          }
        }
        for (const m of r.motions)
          for (const b of m.beats) for (const s of b.say ?? []) expect(book_, unit).toContain(s);
      }
      must(errs.slice(0, 40)).toEqual([]);
      must(lecons).toBeGreaterThan(0);
    });
  }
});
