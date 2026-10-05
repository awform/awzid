import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADHKAR_CATEGORIES,
  ADHKAR_ORDER,
  ADHKAR_PICKS,
  atPath,
  buildAdhkar,
  parseVerseRef,
  readPick,
} from '../src/adhkar.js';
import { canonicalCollection, loadTanzil, parseDataFile } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
const REG = join(CONTENT_DIR, 'registre', 'hadiths.json');
const lessonFile = (unit: string) => {
  const [book, l] = unit.split('.');
  return join(CONTENT_DIR, 'data', book!, `${l}.js`);
};
const readLesson = (unit: string) => {
  const f = lessonFile(unit);
  return existsSync(f) ? parseDataFile(readFileSync(f, 'utf8'), f).value : null;
};

describe('A12 — sélection des adhkār (aucun texte, seulement des chemins dans les livres)', () => {
  it('identifiants uniques, chaque moment ordonné ne cite que des sélections existantes', () => {
    const ids = ADHKAR_PICKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ADHKAR_CATEGORIES)
      for (const id of ADHKAR_ORDER[c]) expect(ids, `${c}:${id}`).toContain(id);
    // chaque sélection sert au moins à un moment
    for (const id of ids)
      expect(
        ADHKAR_CATEGORIES.some((c) => ADHKAR_ORDER[c].includes(id)),
        id,
      ).toBe(true);
  });

  it('le module ne contient aucun texte arabe (rien de retapé)', () => {
    const src = readFileSync(new URL('../src/adhkar.ts', import.meta.url), 'utf8');
    expect(/\p{sc=Arabic}/u.test(src)).toBe(false);
  });

  it('lecture : chaîne du livre recopiée telle quelle ; chemin absent → null', () => {
    const lesson = {
      rubriques: [
        { duas: [{ ar: 'x̄ y', fr: 'essai', moment_fr: 'm', source_fr: 's', grade: 'g' }] },
      ],
    };
    expect(atPath(lesson, 'rubriques.0.duas.0.fr')).toBe('essai');
    const it1 = readPick(
      { id: 'a', kind: 'dua', unit: 'u', path: 'rubriques.0.duas.0', repetitions: 3 },
      lesson,
    );
    expect(it1?.dua?.ar).toBe('x̄ y');
    expect(it1?.repetitions).toBe(3);
    expect(readPick({ id: 'b', kind: 'dua', unit: 'u', path: 'rubriques.1.duas.0' }, lesson)).toBe(
      null,
    );
    expect(parseVerseRef('Al-Isrāʾ 17:24 (fin du verset)')).toEqual({ s: 17, a: 24 });
  });

  it.skipIf(!HAS_CONTENT)(
    'livres gelés : chaque sélection existe, moment cohérent, versets = Tanzil, hadiths VERIFIE',
    async () => {
      const set = await buildAdhkar(readLesson);
      expect(set.missing).toEqual([]);
      const tanzil = loadTanzil(readFileSync(TSV, 'utf8'));
      const reg = Object.values(
        JSON.parse(readFileSync(REG, 'utf8')) as Record<string, Record<string, unknown>>,
      );
      const verified = (recueil: string, numero: number) =>
        reg.some(
          (h) =>
            h.statut === 'VERIFIE' &&
            canonicalCollection(String(h.recueil)) === canonicalCollection(recueil) &&
            h.numero === numero,
        );
      // moment annoncé par le livre (mot-clé) pour chaque catégorie
      const KEY: Record<string, RegExp> = {
        matin: /matin|réveille/i,
        soir: /soir/i,
        apres_priere: /prière|salutation finale|ensuite|compte sur mes doigts|pour faire 100/i,
        adhan: /muezzin|appel/i,
        coucher: /dormir|couche|lit|soir/i,
      };
      for (const c of set.categories)
        for (const it of c.items) {
          const text = it.dua?.moment_fr ?? it.recitation?.note_fr ?? '';
          expect(KEY[c.id]!.test(text), `${c.id}:${it.id} « ${text} »`).toBe(true);
          if (it.dua?.coranique) {
            const r = parseVerseRef(it.dua.ref_fr || it.dua.source_fr);
            expect(r, it.id).not.toBe(null);
            const near = [0, 1, 2]
              .map((k) => tanzil.get(`${r!.s}:${r!.a + k}`))
              .filter(Boolean)
              .join(' ');
            expect(near.includes(it.dua.ar), `${it.id} : texte Tanzil octet par octet`).toBe(true);
          }
          const pick = ADHKAR_PICKS.find((p) => p.id === it.id)!;
          if (pick.kind === 'recitation')
            for (const h of pick.hadiths)
              expect(verified(h.recueil, h.numero), `${it.id} : ${h.recueil} ${h.numero}`).toBe(
                true,
              );
        }
      // répétitions : celles que dit le livre
      const rep = (id: string) => set.categories.flatMap((c) => c.items).find((x) => x.id === id)!;
      expect(rep('bismillah-la-yadurr').dua!.moment_fr).toMatch(/trois fois/);
      expect(rep('subhanallah-wa-bihamdih').dua!.moment_fr).toMatch(/Cent fois/);
      expect(rep('tasbih-33').dua!.moment_fr).toMatch(/33/);
      expect(rep('istighfar-apres-salam').dua!.moment_fr).toMatch(/3 fois/);
      expect(rep('trois-sourates-matin-soir').recitation!.note_fr).toMatch(/trois fois/);
    },
  );
});
