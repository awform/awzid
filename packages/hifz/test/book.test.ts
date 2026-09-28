import { describe, expect, it } from 'vitest';
import {
  bookConfig,
  bookParts,
  bookVerseRefs,
  buildMeta,
  replay,
  verseRange,
  weekOf,
  weekTasks,
  type HifzEvent,
} from '../src/index.js';
import { HAS_BOOKS, HAS_TANZIL, loadBook, loadTanzil } from './helpers.js';

describe('versets du carnet', () => {
  it('lit « 1-4 », « 255 », « 285-286 »', () => {
    expect(verseRange('1-4')).toEqual([1, 4]);
    expect(verseRange('255')).toEqual([255, 255]);
    expect(verseRange('285-286')).toEqual([285, 286]);
    expect(() => verseRange('1,4')).toThrow();
  });
});

describe.skipIf(!HAS_BOOKS || !HAS_TANZIL)('carnets E1 et N1 (fichiers des livres)', () => {
  const tanzil = HAS_TANZIL ? loadTanzil() : new Map<string, string>();
  const meta = buildMeta(tanzil);

  it('E1 : 6 sourates du socle, roue de 3 parts, 10 min dont 3 de nouveau', () => {
    const en1 = loadBook('en1');
    const parts = bookParts(en1, meta);
    expect(parts.map((p) => p.key)).toEqual([
      '112:1-4',
      '1:1-7',
      '114:1-6',
      '108:1-3',
      '113:1-5',
      '103:1-3',
    ]);
    expect(bookConfig(en1)).toEqual({ dailyMinutes: 10, newMinutes: 3, cycle: 3 });
    expect(weekTasks(en1, 2)).toEqual([
      {
        part: '112:1-4',
        sura: 112,
        from: 1,
        to: 2,
        kind: 'nouveau',
        label: 'religion leçon 2',
        track: 'socle',
      },
    ]);
    expect(weekTasks(en1, 6).map((t) => [t.part, t.kind])).toEqual([
      ['112:1-4', 'recitation'],
      ['1:1-7', 'recitation'],
    ]);
    // tous les versets cités existent dans Tanzil
    for (const r of bookVerseRefs(en1)) expect(tanzil.has(r), r).toBe(true);
  });

  it('N1 : socle + parcours renforcé (Āyat al-Kursī, fin d’Al-Baqara), versets jumeaux', () => {
    const ad1 = loadBook('ad1');
    const parts = bookParts(ad1, meta);
    expect(parts.map((p) => p.key)).toEqual([
      '1:1-7',
      '112:1-4',
      '113:1-5',
      '114:1-6',
      '2:255',
      '2:285-286',
    ]);
    expect(parts.find((p) => p.key === '113:1-5')!.twin).toBe(true);
    expect(parts.find((p) => p.key === '2:255')!.track).toBe('renforce');
    expect(bookConfig(ad1).cycle).toBe(4);
    const w1 = weekTasks(ad1, 1);
    expect(w1.map((t) => t.part)).toEqual(['1:1-7', '2:255']);
    for (const r of bookVerseRefs(ad1)) expect(tanzil.has(r), r).toBe(true);
  });

  it('semaines : du début du carnet à la semaine 30, puis on reste en 30', () => {
    const en1 = loadBook('en1');
    expect(weekOf(en1, 1000, 1000)).toBe(1);
    expect(weekOf(en1, 1000, 1013)).toBe(2);
    expect(weekOf(en1, 1000, 1000 + 7 * 40)).toBe(30);
  });

  it('une année de carnet : les sourates apprises entrent dans la roue', () => {
    const en1 = loadBook('en1');
    const parts = bookParts(en1, meta);
    const cfg = bookConfig(en1);
    const events: HifzEvent[] = [];
    let n = 0;
    const start = 20000;
    for (let w = 1; w <= 30; w++)
      for (const task of weekTasks(en1, w)) {
        const d = start + (w - 1) * 7;
        if (task.kind === 'nouveau')
          events.push({
            day: d,
            id: String(n++).padStart(6, '0'),
            part: task.part,
            kind: 'appris',
            source: 'auto',
          });
      }
    // révisions faites chaque jour où elles sont dues
    let day = start;
    const all = [...events];
    for (; day < start + 210; day++) {
      const { plan } = replay(parts, all, day, cfg, start);
      for (const it of [...plan.recent, ...plan.manzil])
        all.push({
          day,
          id: `r${String(n++).padStart(6, '0')}`,
          part: it.key,
          kind: 'revision',
          q: 3,
          source: 'auto',
        });
    }
    const { state } = replay(parts, all, day, cfg, start);
    for (const p of state.parts.values()) expect(p.learnedDay, p.key).not.toBeNull();
    expect([...state.parts.values()].filter((p) => p.stage === 6).length).toBeGreaterThanOrEqual(4);
  });
});
