import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEdition, type EditionLoad } from '@awform/content';
import type { LanguageExercise } from '@awform/content/types';
import { correctResponse, isLanguageExercise } from '@awform/grading';
import { DEMO, recordAttempts, seedDemo, type AttemptInput } from '../src/attempts.js';
import { connect, resetTestDatabase, runMigrations, type DbHandle } from '../src/client.js';
import { REAL_BOOKS, TEST_CONTENT_DIR } from './content.js';
import { importEdition } from '../src/import.js';
import { illustrationsFor } from '../src/queries.js';

const URL = process.env.TEST_DATABASE_URL;
const READY = !!URL;

describe.skipIf(!READY)('tentatives et progression (awform_test)', () => {
  let h: DbHandle;
  let load: EditionLoad;
  let editionId = '';

  beforeAll(async () => {
    h = connect(URL, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    load = loadEdition({ contentDir: TEST_CONTENT_DIR, levels: ['en1', 'ad1'] });
    editionId = (await importEdition(h.db, load, { code: 'att.1', publish: true })).editionId;
    await seedDemo(h.db);
    await seedDemo(h.db); // idempotent
  });
  afterAll(async () => {
    await h?.close();
  });

  const unit = () => load.levels[0]!.units.find((u) => u.id === 'en1.l02')!;
  const base = (over: Partial<AttemptInput>): AttemptInput => ({
    id: randomUUID(),
    profileId: DEMO.enfant,
    unitId: 'en1.l02',
    eventType: 'reponse',
    response: null,
    deviceAt: new Date().toISOString(),
    ...over,
  });

  // illustrations des livres : seulement avec les vrais livres
  it.skipIf(!REAL_BOOKS)('illustrations importées et servies par clé', async () => {
    const ill = await illustrationsFor(h.db, editionId, ['youssouf', 'door', 'inexistante']);
    expect(Object.keys(ill).sort()).toEqual(['door', 'youssouf']);
    expect(ill.youssouf?.viewBox).toBe('0 0 100 130');
  });

  it('correction recalculée par le serveur ; doublon ignoré ; empreinte et profil contrôlés', async () => {
    const e = unit().exercises.find((x) => x.type === 'vrai_faux' || x.type === 'premiere_lettre')!;
    const ex = e.content as LanguageExercise;
    const good =
      ex.type === 'vrai_faux'
        ? { value: !!ex.items[0]!.vrai }
        : { choice: String((ex as { items: Array<{ reponse: string }> }).items[0]!.reponse) };
    const bad = ex.type === 'vrai_faux' ? { value: !ex.items[0]!.vrai } : { choice: '؟' };
    const a1 = base({ exerciseId: e.id, exerciseHash: e.hash, itemIndex: 0, response: bad });
    const a2 = base({ exerciseId: e.id, exerciseHash: e.hash, itemIndex: 0, response: good });
    const r = await recordAttempts(h.db, editionId, [a1, a2, a1]);
    expect(r.accepted).toEqual([
      { id: a1.id, correct: false },
      { id: a2.id, correct: true },
    ]);
    expect(r.duplicates).toEqual([a1.id]);
    expect(r.progress['en1.l02']?.status).toBe('commencee');
    const again = await recordAttempts(h.db, editionId, [a2]);
    expect(again.duplicates).toEqual([a2.id]);

    const rej = await recordAttempts(h.db, editionId, [
      base({ exerciseId: e.id, exerciseHash: 'x', itemIndex: 0, response: good }),
      base({
        profileId: randomUUID(),
        exerciseId: e.id,
        exerciseHash: e.hash,
        itemIndex: 0,
        response: good,
      }),
      base({ exerciseId: e.id, exerciseHash: e.hash, itemIndex: 0, response: { nimporte: 1 } }),
      base({ id: 'pas-un-uuid' }),
    ]);
    expect(rej.accepted).toEqual([]);
    expect(rej.rejected.map((x) => x.reason)).toEqual([
      'empreinte différente (contenu modifié depuis le téléchargement)',
      'profil inconnu',
      'réponse invalide',
      'identifiant invalide',
    ]);
  });

  it('leçon entière réussie + auto-évaluation → terminée / maîtrisée (profil adulte)', async () => {
    const u = load.levels
      .find((l) => l.code === 'ad1')!
      .units.find((x) => x.id === (REAL_BOOKS ? 'ad1.l03' : 'ad1.l01'))!;
    const events: AttemptInput[] = [];
    for (const e of u.exercises) {
      const ex = e.content as LanguageExercise;
      if (!isLanguageExercise(ex)) continue; // exercices non notés (question, carnet…)
      const r = correctResponse(ex);
      const push = (i: number, response: unknown) =>
        events.push({
          ...base({
            profileId: DEMO.adulte,
            unitId: u.id,
            exerciseId: e.id,
            exerciseHash: e.hash,
            itemIndex: i,
            response,
          }),
        });
      if (r.type === 'vrai_faux') r.answers.forEach((a, i) => push(i, { value: !!a }));
      else if (r.type === 'relier') r.pairs.forEach((p, i) => push(i, { right: p }));
      else if ('selected' in r) r.selected.forEach((k) => push(k, { touched: true }));
      else if (r.type === 'ordre') r.sequences.forEach((s, i) => push(i, { sequence: s }));
      else if ('answers' in r) r.answers.forEach((a, i) => push(i, { choice: a }));
    }
    const r1 = await recordAttempts(h.db, editionId, events);
    expect(r1.rejected).toEqual([]);
    expect(r1.accepted.every((a) => a.correct)).toBe(true);
    expect(r1.progress[u.id]?.status).toBe('commencee');
    const ck = base({
      profileId: DEMO.adulte,
      unitId: u.id,
      eventType: 'checklist',
      response: { checked: 3, total: 3 },
    });
    const r2 = await recordAttempts(h.db, editionId, [ck]);
    expect(r2.progress[u.id]).toMatchObject({ status: 'maitrisee', score: 1, bestScore: 1 });
  });
});
