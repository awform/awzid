/**
 * Lot F1 (revue d'architecture E5, G2) — progression robuste aux corrections des livres, de bout en bout :
 * vrai importeur, vraie base, éditions successives d'une copie du contenu SYNTHÉTIQUE (sans texte religieux)
 * dont les exercices portent des identifiants GELÉS :
 *  - corriger le TEXTE d'un exercice (consigne, traduction) ne fait perdre aucune maîtrise ;
 *  - changer son CORRIGÉ n'invalide que cet exercice (signalé « à refaire ») ;
 *  - insérer un exercice ne décale plus l'identité des autres ;
 *  - une réponse donnée sur une édition antérieure est acceptée et corrigée avec le contenu de cette édition ;
 *  - lignée déclarée par les livres (remplacement) ; reprise des données d'avant la migration (backfill).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { blockingIssues, loadEdition } from '@awform/content';
import type { LanguageExercise } from '@awform/content/types';
import { correctResponse, isLanguageExercise } from '@awform/grading';
import {
  computeProgress,
  DEMO,
  recordAttempts,
  REJECT_CODES,
  seedDemo,
  type AttemptInput,
} from '../src/attempts.js';
import { connect, resetTestDatabase, runMigrations, type DbHandle } from '../src/client.js';
import { backfillContent, importEdition } from '../src/import.js';
import * as t from '../src/schema.js';

const URL = process.env.TEST_DATABASE_URL;
const SYNTH = join(import.meta.dirname, '..', '..', '..', 'infra', 'ci', 'contenu-synthetique');
const UNIT = 'en1.l01';

type Obj = Record<string, unknown>;
type Ex = Obj & { type: string; id?: string; items?: Obj[] };

/** Lit / réécrit un fichier de leçon `AW.lesson({...});` (format des livres). */
function edit(dir: string, file: string, fn: (L: Obj & { exercices: Ex[] }) => void) {
  const p = join(dir, 'data', file);
  const s = readFileSync(p, 'utf8');
  const L = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)) as Obj & {
    exercices: Ex[];
  };
  fn(L);
  writeFileSync(p, `AW.lesson(${JSON.stringify(L, null, 1)});\n`);
}

/** Copie gelée : chaque exercice reçoit son id (comme l'outil gel-ids des livres) + table de correspondance. */
function frozenCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'f1-livres-'));
  cpSync(SYNTH, dir, { recursive: true });
  const map: Record<string, string> = {};
  for (const lv of ['en1', 'ad1'])
    for (const n of ['01', '02', '03', '04', '05']) {
      try {
        edit(dir, `${lv}/l${n}.js`, (L) =>
          L.exercices.forEach((e, i) => {
            e.id = `${lv}.l${n}.ex${i + 1}`;
            map[e.id] = e.id;
          }),
        );
      } catch {
        /* unité absente du contenu synthétique */
      }
    }
  mkdirSync(join(dir, 'ids'), { recursive: true });
  writeFileSync(
    join(dir, 'ids', 'en1-ad1-correspondance.json'),
    JSON.stringify({ correspondance: map }),
  );
  return dir;
}

describe.skipIf(!URL)(
  'lot F1 — identifiants gelés, corrigé distinct du texte (awform_test)',
  () => {
    let h: DbHandle;
    const dir = frozenCopy();
    const editions: Record<string, string> = {};

    async function publishEdition(code: string) {
      const load = loadEdition({ contentDir: dir, levels: ['en1', 'ad1'], withRegistry: false });
      expect(blockingIssues(load), code).toEqual([]);
      const r = await importEdition(h.db, load, { code, publish: true });
      editions[code] = r.editionId;
      return load;
    }
    const versions = async (code: string) =>
      h.db.select().from(t.exerciseVersion).where(eq(t.exerciseVersion.editionId, editions[code]!));
    const ev = (o: Partial<AttemptInput>): AttemptInput => ({
      id: randomUUID(),
      profileId: DEMO.enfant,
      unitId: UNIT,
      eventType: 'reponse',
      response: null,
      deviceAt: new Date().toISOString(),
      ...o,
    });
    /** toutes les bonnes réponses d'un exercice (premier essai) */
    function goodAnswers(e: { id: string; hash: string; content: unknown }, edition: string) {
      const out: AttemptInput[] = [];
      const ex = e.content as LanguageExercise;
      if (!isLanguageExercise(ex)) return out;
      const r = correctResponse(ex);
      const push = (i: number, response: unknown) =>
        out.push(ev({ exerciseId: e.id, exerciseHash: e.hash, itemIndex: i, response, edition }));
      if (r.type === 'vrai_faux') r.answers.forEach((a, i) => push(i, { value: !!a }));
      else if (r.type === 'relier') r.pairs.forEach((p, i) => push(i, { right: p }));
      else if ('selected' in r) r.selected.forEach((k) => push(k, { touched: true }));
      else if (r.type === 'ordre') r.sequences.forEach((s, i) => push(i, { sequence: s }));
      else if ('answers' in r) r.answers.forEach((a, i) => push(i, { choice: a }));
      return out;
    }
    const unitEx = async (code: string) =>
      (await versions(code))
        .filter((v) => v.exerciseId.startsWith(`${UNIT}.`))
        .map((v) => ({ id: v.exerciseId, hash: v.hash, content: v.content, position: v.position }));
    const progressRow = async () =>
      (
        await h.db
          .select()
          .from(t.progress)
          .where(and(eq(t.progress.profileId, DEMO.enfant), eq(t.progress.unitId, UNIT)))
      )[0];

    beforeAll(async () => {
      h = connect(URL, 4);
      await resetTestDatabase(h.pool);
      await runMigrations(h.db);
      await publishEdition('f1.A');
      await seedDemo(h.db);
    });
    afterAll(async () => {
      await h?.close();
    });

    it('édition A : identifiants explicites ; maîtrise obtenue', async () => {
      const exs = await unitEx('f1.A');
      expect(exs.map((e) => e.id)).toContain(`${UNIT}.ex5`);
      const events = exs.flatMap((e) => goodAnswers(e, 'f1.A'));
      events.push(
        ev({ eventType: 'checklist', response: { checked: 1, total: 1 }, edition: 'f1.A' }),
      );
      const r = await recordAttempts(h.db, editions['f1.A']!, events);
      expect(r.rejected).toEqual([]);
      expect(r.progress[UNIT]).toMatchObject({ status: 'maitrisee', revised: [] });
      // chaque réponse porte l'édition et l'empreinte du corrigé
      const a = await h.db.select().from(t.attempt).where(eq(t.attempt.unitId, UNIT));
      expect(a.every((x) => x.editionId === editions['f1.A'])).toBe(true);
      expect(a.filter((x) => x.eventType === 'reponse').every((x) => !!x.answerHash)).toBe(true);
    });

    it('édition B (coquilles : consigne et traduction) : texte changé, corrigé identique, maîtrise gardée', async () => {
      edit(dir, 'en1/l01.js', (L) => {
        const vf = L.exercices.find((e) => e.type === 'vrai_faux')!;
        vf.consigne_fr = 'Vrai ou faux ? (coquille corrigée)';
        const rel = L.exercices.find((e) => e.type === 'relier')!;
        rel.items![0]!.fr = `${String(rel.items![0]!.fr)} (traduction corrigée)`;
      });
      await publishEdition('f1.B');
      const [a, b] = [await versions('f1.A'), await versions('f1.B')];
      const vfId = `${UNIT}.ex5`;
      const va = a.find((v) => v.exerciseId === vfId)!;
      const vb = b.find((v) => v.exerciseId === vfId)!;
      expect(vb.hash).not.toBe(va.hash); // texte changé…
      expect(vb.answerHash).toBe(va.answerHash); // …corrigé identique
      expect((await progressRow())?.status).toBe('maitrisee');
      const p = await computeProgress(h.db, editions['f1.B']!, DEMO.enfant, UNIT);
      expect(p).toMatchObject({ status: 'maitrisee', revised: [] });
    });

    it('édition C (corrigé du vrai/faux changé) : seul cet exercice est à refaire, les autres restent acquis', async () => {
      edit(dir, 'en1/l01.js', (L) => {
        const vf = L.exercices.find((e) => e.type === 'vrai_faux')!;
        vf.items![1]!.vrai = true;
        vf.items![1]!.fr = 'un stylo';
      });
      await publishEdition('f1.C');
      // la publication a recalculé la progression : plus « maîtrisée », exercice signalé
      expect((await progressRow())?.status).toBe('commencee');
      const p = await computeProgress(h.db, editions['f1.C']!, DEMO.enfant, UNIT);
      expect(p.revised).toEqual([`${UNIT}.ex5`]);
      for (const x of p.exercises)
        if (x.id === `${UNIT}.ex5`) expect(x.found).toBe(0);
        else expect(x.found, x.id).toBe(x.total);
      // refaire l'exercice corrigé suffit à retrouver la maîtrise
      const vfC = (await unitEx('f1.C')).find((e) => e.id === `${UNIT}.ex5`)!;
      const r = await recordAttempts(h.db, editions['f1.C']!, goodAnswers(vfC, 'f1.C'));
      expect(r.progress[UNIT]).toMatchObject({ status: 'maitrisee', revised: [] });
    });

    it('réponse hors ligne sur une édition ANTÉRIEURE : acceptée, corrigée avec son contenu ; gardée sans compter si son corrigé a changé', async () => {
      const chA = (await unitEx('f1.A')).find((e) => e.id === `${UNIT}.ex2`)!; // chasse, inchangée
      const vfB = (await unitEx('f1.B')).find((e) => e.id === `${UNIT}.ex5`)!; // ancien corrigé
      const [good] = goodAnswers(chA, 'f1.A');
      const old = ev({
        exerciseId: vfB.id,
        exerciseHash: vfB.hash,
        itemIndex: 1,
        response: { value: false }, // juste selon l'édition B
        edition: 'f1.B',
      });
      const r = await recordAttempts(h.db, editions['f1.C']!, [good!, old]);
      expect(r.rejected).toEqual([]);
      expect(r.accepted).toEqual([
        { id: good!.id, correct: true },
        { id: old.id, correct: true, stale: true },
      ]);
      const [stored] = await h.db.select().from(t.attempt).where(eq(t.attempt.id, old.id));
      expect(stored?.editionId).toBe(editions['f1.B']);
      // appareil ancien (sans édition) : retrouvée par l'empreinte du texte
      const noEd = ev({
        exerciseId: chA.id,
        exerciseHash: chA.hash,
        itemIndex: 0,
        response: { touched: true },
      });
      expect((await recordAttempts(h.db, editions['f1.C']!, [noEd])).accepted).toHaveLength(1);
      // version jamais publiée : refus avec un code stable (l'appareil la met de côté)
      const bad = await recordAttempts(h.db, editions['f1.C']!, [
        ev({
          exerciseId: chA.id,
          exerciseHash: 'inconnue',
          itemIndex: 0,
          response: { touched: true },
        }),
      ]);
      expect(bad.rejected[0]?.code).toBe(REJECT_CODES.perime);
    });

    it('édition D (exercice INSÉRÉ en tête) : identités inchangées, réponses gardées, rang par édition', async () => {
      edit(dir, 'en1/l01.js', (L) => {
        L.exercices.unshift({
          id: `${UNIT}.nouveau1`,
          type: 'vrai_faux',
          items: [{ ar: 'بَيْتٌ', fr: 'une maison', vrai: true }],
        });
      });
      await publishEdition('f1.D');
      const d = await unitEx('f1.D');
      expect(d.find((e) => e.id === `${UNIT}.ex1`)?.position).toBe(2);
      expect(d.find((e) => e.id === `${UNIT}.nouveau1`)?.position).toBe(1);
      const p = await computeProgress(h.db, editions['f1.D']!, DEMO.enfant, UNIT);
      expect(p.revised).toEqual([]);
      for (const x of p.exercises)
        expect(x.found, x.id).toBe(x.id === `${UNIT}.nouveau1` ? 0 : x.total);
    });

    it('édition E (lignée déclarée : exercice renommé) : les réponses suivent la lignée', async () => {
      edit(dir, 'en1/l01.js', (L) => {
        const ch = L.exercices.find((e) => e.id === `${UNIT}.ex2`)!;
        ch.id = `${UNIT}.chasse`;
      });
      writeFileSync(
        join(dir, 'ids', 'lignee.json'),
        JSON.stringify({
          lignee: [
            { de: `${UNIT}.ex2`, vers: `${UNIT}.chasse`, nature: 'remplace', motif: 'test' },
          ],
        }),
      );
      const load = await publishEdition('f1.E');
      expect(load.lineage).toEqual([
        { from: `${UNIT}.ex2`, to: `${UNIT}.chasse`, kind: 'remplace', note: 'test' },
      ]);
      const rows = await h.db.select().from(t.exerciseLineage);
      expect(rows.map((r) => [r.fromId, r.toId, r.kind])).toEqual([
        [`${UNIT}.ex2`, `${UNIT}.chasse`, 'remplace'],
      ]);
      const p = await computeProgress(h.db, editions['f1.E']!, DEMO.enfant, UNIT);
      const ch = p.exercises.find((x) => x.id === `${UNIT}.chasse`)!;
      expect(ch.found).toBe(ch.total);
    });

    it('données d’avant la migration : empreintes du corrigé recalculées à l’identique, progression inchangée', async () => {
      const before = await computeProgress(h.db, editions['f1.E']!, DEMO.enfant, UNIT);
      const keys = new Map(
        (await h.db.select().from(t.exerciseVersion)).map((v) => [
          `${v.editionId}|${v.exerciseId}`,
          v.answerHash,
        ]),
      );
      await h.db.execute(sql`UPDATE exercise_version SET answer_hash = NULL`);
      await h.db.execute(sql`UPDATE attempt SET answer_hash = NULL`);
      await h.db.execute(sql`UPDATE unit_version SET madhhab_blocks = NULL`);
      const r = await backfillContent(h.db);
      expect(r.exercices).toBe(keys.size);
      expect(r.reponses).toBeGreaterThan(10);
      for (const v of await h.db.select().from(t.exerciseVersion))
        expect(v.answerHash).toBe(keys.get(`${v.editionId}|${v.exerciseId}`));
      expect(await computeProgress(h.db, editions['f1.E']!, DEMO.enfant, UNIT)).toEqual(before);
      // réimporter une édition existante (déploiement) refait le même travail sans rien changer
      expect((await backfillContent(h.db)).exercices).toBe(0);
    });

    it('école juridique : niveaux d’arabe « commun », blocs étiquetés à l’import', async () => {
      const lv = await h.db.select().from(t.level);
      expect(lv.map((l) => [l.code, l.madhhab]).sort()).toEqual([
        ['ad1', 'commun'],
        ['en1', 'commun'],
      ]);
      const uv = await h.db
        .select({ m: t.unitVersion.madhhabBlocks })
        .from(t.unitVersion)
        .where(eq(t.unitVersion.editionId, editions['f1.E']!));
      expect(uv.every((u) => u.m !== null)).toBe(true);
    });
  },
);
