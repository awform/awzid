/**
 * Import d'une édition en base (CDC §5.3, étapes 4-5) : idempotent, atomique (une transaction),
 * refusé s'il existe une erreur bloquante (verset ≠ Tanzil, corrigé impossible, fichier illisible).
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  blockingIssues,
  blockMadhhabs,
  levelMadhhab,
  maskTree,
  registryMadhhab,
  unmaskedHadithRefs,
  studentProjection,
  verifiedHadiths,
  type EditionLoad,
} from '@awform/content';
import { answerHashOf, refreshProgress } from './attempts.js';
import type { Db } from './client.js';
import * as t from './schema.js';

export interface ImportOptions {
  /** code de l'édition, ex. `2027.1` ou `dev` */
  code: string;
  /** publier l'édition (une seule édition publiée à la fois) */
  publish?: boolean;
  /** remplacer le contenu d'une édition BROUILLON de même code si la source a changé (développement) */
  replace?: boolean;
}

export interface ImportResult {
  editionId: string;
  status: 'cree' | 'inchange' | 'remplace';
  units: number;
  exercises: number;
}

export class ImportRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportRefusedError';
  }
}

const TRACKS: Array<[RegExp, string]> = [
  [/^ado\d+$/, 'ados'],
  [/^ad\d+$/, 'adultes'],
  [/^en\d+$/, 'enfants'],
  [/^re\d+$/, 'religion'],
  [/^ra\d+$/, 'religion-ra'],
  [/^qc\d+$/, 'coran'],
];

export function trackOf(code: string): string {
  return TRACKS.find(([re]) => re.test(code))?.[1] ?? 'autre';
}

/** `en1.l05` → `en1-05` (URL courte des QR codes). */
export function qrSlug(unitId: string): string {
  return unitId.replace('.l', '-');
}

async function insertChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function importEdition(
  db: Db,
  load: EditionLoad,
  opts: ImportOptions,
): Promise<ImportResult> {
  const blocking = blockingIssues(load);
  if (blocking.length)
    throw new ImportRefusedError(
      `${blocking.length} erreur(s) bloquante(s) : ` +
        blocking
          .slice(0, 5)
          .map((i) => `${i.unit ?? i.file ?? ''} ${i.message}`)
          .join(' ; '),
    );

  const unitsCount = load.levels.reduce((s, l) => s + l.units.length, 0);
  const exCount = load.levels.reduce(
    (s, l) => s + l.units.reduce((s2, u) => s2 + u.exercises.length, 0),
    0,
  );

  // numéros de hadiths : visibles seulement s'ils sont VERIFIE au registre (lot 8) ; sans registre, AUCUN
  // numéro n'est montré (audit CON-3) ; une référence restée visible bloque l'import
  const verified = load.registry ? verifiedHadiths(load.registry.hadiths) : new Set<string>();
  let masked = 0;
  const forStudent = <T>(v: T): T => {
    const r = maskTree(v, verified);
    masked += r.masked;
    const left = unmaskedHadithRefs(r.value, verified);
    if (left.length)
      throw new ImportRefusedError(
        `référence(s) de hadith non vérifiée(s) visibles de l'élève : ${left.slice(0, 5).join(' ; ')}`,
      );
    return r.value;
  };

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(t.edition).where(eq(t.edition.code, opts.code));
    let editionId: string;
    let status: ImportResult['status'] = 'cree';
    const report = {
      verseStats: load.verseStats,
      issues: load.issues,
      levels: load.levels.map((l) => ({ code: l.code, units: l.units.length })),
      hifz: load.hifz.map((h) => h.code),
    };

    if (existing[0]) {
      const ed = existing[0];
      if (ed.sourceSha256 === load.sourceSha256) {
        // lot F1 : empreintes de corrigé, écoles et lignée posées aussi sur une édition déjà importée
        await backfillContent(tx as unknown as Db);
        await insertLineage(tx, load, ed.id);
        if (opts.publish && ed.status !== 'publiee') await publish(tx, ed.id);
        return { editionId: ed.id, status: 'inchange', units: unitsCount, exercises: exCount };
      }
      if (!opts.replace || ed.status !== 'brouillon')
        throw new ImportRefusedError(
          `l'édition ${opts.code} existe avec une autre source (${ed.status}) : choisir un nouveau code d'édition`,
        );
      // édition brouillon remplacée (développement) : on efface ses versions
      await tx.delete(t.unitVersion).where(eq(t.unitVersion.editionId, ed.id));
      await tx.delete(t.exerciseVersion).where(eq(t.exerciseVersion.editionId, ed.id));
      await tx.delete(t.levelVersion).where(eq(t.levelVersion.editionId, ed.id));
      await tx.delete(t.hifzBook).where(eq(t.hifzBook.editionId, ed.id));
      await tx.delete(t.registryEntry).where(eq(t.registryEntry.editionId, ed.id));
      await tx.delete(t.illustration).where(eq(t.illustration.editionId, ed.id));
      await tx.delete(t.booklet).where(eq(t.booklet.editionId, ed.id));
      await tx.delete(t.evalDoc).where(eq(t.evalDoc.editionId, ed.id));
      await tx.delete(t.exerciseLineage).where(eq(t.exerciseLineage.editionId, ed.id));
      await tx
        .update(t.edition)
        .set({ sourceSha256: load.sourceSha256, report })
        .where(eq(t.edition.id, ed.id));
      editionId = ed.id;
      status = 'remplace';
    } else {
      const [ed] = await tx
        .insert(t.edition)
        .values({ code: opts.code, sourceSha256: load.sourceSha256, report })
        .returning({ id: t.edition.id });
      if (!ed) throw new Error('insertion de l’édition impossible');
      editionId = ed.id;
    }

    // Coran de référence (lecture seule) : inséré une fois, puis vérifié octet par octet
    const [{ n: quranCount } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(t.quranVerse);
    if (quranCount === 0) {
      const rows = [...load.tanzil.entries()].map(([k, text]) => {
        const [s, a] = k.split(':').map(Number);
        return { sura: s ?? 0, aya: a ?? 0, text };
      });
      await insertChunks(rows, 1000, (c) => tx.insert(t.quranVerse).values(c));
    } else {
      const stored = await tx.select().from(t.quranVerse);
      const diff = stored.filter((r) => load.tanzil.get(`${r.sura}:${r.aya}`) !== r.text);
      if (diff.length || stored.length !== load.tanzil.size)
        throw new ImportRefusedError(
          `le texte coranique de référence en base diffère de Tanzil (${diff.length} versets)`,
        );
    }

    // divisions officielles (juzʾ, quarts de ḥizb, pages de Médine, manzil) : remplacées si différentes
    if (load.quranData) {
      const d = load.quranData;
      const rows = [
        ...d.juz.map(([s, a], i) => ({ kind: 'juz', n: i + 1, sura: s, aya: a })),
        ...d.quarters.map(([s, a], i) => ({ kind: 'quart', n: i + 1, sura: s, aya: a })),
        ...d.pages.map(([s, a], i) => ({ kind: 'page', n: i + 1, sura: s, aya: a })),
        ...d.manzil.map(([s, a], i) => ({ kind: 'manzil', n: i + 1, sura: s, aya: a })),
      ];
      const stored = await tx.select().from(t.quranDivision);
      const key = (r: { kind: string; n: number; sura: number; aya: number }) =>
        `${r.kind}.${r.n}=${r.sura}:${r.aya}`;
      const same =
        stored.length === rows.length &&
        new Set(stored.map(key)).size === rows.length &&
        rows.every((r) => stored.some((x) => key(x) === key(r)));
      if (!same) {
        await tx.delete(t.quranDivision);
        await insertChunks(rows, 500, (c) => tx.insert(t.quranDivision).values(c));
      }
    }
    // documents d'évaluation des livres (espace école) : modèles de certificats, règles, niveaux du référentiel
    for (const [key, raw] of Object.entries(load.evalDocs ?? {})) {
      let content = raw;
      if (key === 'referentiel') {
        const niveaux = ((raw as { niveaux?: Array<Record<string, unknown>> }).niveaux ?? []).map(
          (n) => ({
            code: n.code,
            filiere: n.filiere,
            n: n.n,
            titre_fr: n.titre_fr,
            titre_ar: n.titre_ar,
            cecrl: n.cecrl,
            heures: n.heures,
            mots_coran: n.mots_coran,
            sourates: n.sourates,
          }),
        );
        content = { niveaux };
      }
      await tx.insert(t.evalDoc).values({ editionId, key, content: content as object });
    }
    for (const lv of load.levels) {
      const rank = Number(/\d+$/.exec(lv.code)?.[0] ?? 0);
      const madhhab = levelMadhhab(lv.code, lv.book as unknown as Record<string, unknown>);
      await tx
        .insert(t.level)
        .values({
          code: lv.code,
          track: trackOf(lv.code),
          rank,
          titleFr: lv.book.titre_fr ?? null,
          madhhab,
        })
        .onConflictDoUpdate({
          target: t.level.code,
          set: { titleFr: lv.book.titre_fr ?? null, madhhab },
        });
      await tx.insert(t.levelVersion).values({ editionId, levelCode: lv.code, book: lv.book });

      for (const u of lv.units) {
        await tx
          .insert(t.unit)
          .values({ id: u.id, levelCode: lv.code, n: u.n, kind: u.kind })
          .onConflictDoUpdate({ target: t.unit.id, set: { n: u.n, kind: u.kind } });
        await tx.insert(t.unitVersion).values({
          editionId,
          unitId: u.id,
          numLecon: u.numLecon,
          numBilan: u.numBilan,
          titleAr: u.titreAr,
          titleFr: u.titreFr,
          sha256: u.sha256,
          strictJson: u.strict,
          content: u.content,
          student: forStudent(studentProjection(u.content, lv.code)),
          madhhabBlocks: blockMadhhabs(u.content),
        });
        await tx
          .insert(t.qrRedirect)
          .values({ slug: qrSlug(u.id), unitId: u.id })
          .onConflictDoNothing();
        for (const e of u.exercises) {
          await tx
            .insert(t.exercise)
            .values({
              id: e.id,
              unitId: u.id,
              position: e.position,
              type: e.type,
              graded: e.graded,
            })
            .onConflictDoUpdate({
              target: t.exercise.id,
              set: { type: e.type, graded: e.graded, position: e.position },
            });
        }
        if (u.exercises.length)
          await tx.insert(t.exerciseVersion).values(
            u.exercises.map((e) => ({
              editionId,
              exerciseId: e.id,
              hash: e.hash,
              // lot F1 : empreinte du CORRIGÉ (seule sa modification invalide des réponses) et rang par édition
              answerHash: answerHashOf(e.content),
              position: e.position,
              itemCount: e.itemCount,
              content: e.content,
            })),
          );
      }
    }

    if (load.illustrations?.size) {
      const rows = [...load.illustrations.values()].map((i) => ({
        editionId,
        key: i.key,
        viewBox: i.viewBox,
        svg: i.svg,
        sourceFile: i.file,
      }));
      await insertChunks(rows, 500, (c) => tx.insert(t.illustration).values(c));
    }

    if (load.booklets?.length) {
      const rankOf = new Map((load.catalogue ?? []).map((c, i) => [String(c.code), i]));
      const rows = load.booklets.map((b) => ({
        editionId,
        code: b.code,
        levelCode: b.level,
        rank: rankOf.get(b.code) ?? 999,
        catalogue: (load.catalogue ?? []).find((c) => c.code === b.code) ?? {},
        content: forStudent(studentProjection(b.content)),
      }));
      await insertChunks(rows, 50, (c) => tx.insert(t.booklet).values(c));
    }

    if (load.hifz.length)
      await tx
        .insert(t.hifzBook)
        .values(load.hifz.map((h) => ({ editionId, code: h.code, content: h })));
    for (const [code, content] of Object.entries(load.hifzShared))
      await tx.insert(t.hifzBook).values({ editionId, code: `_${code}`, content });

    if (load.registry) {
      const kinds: Array<['coran' | 'hadith' | 'fiqh', Record<string, Record<string, unknown>>]> = [
        ['coran', load.registry.coran],
        ['hadith', load.registry.hadiths],
        ['fiqh', load.registry.fiqh],
      ];
      for (const [kind, entries] of kinds) {
        const rows = Object.entries(entries).map(([id, data]) => ({
          editionId,
          kind,
          id,
          statut: typeof data.statut === 'string' ? data.statut : null,
          validationHumaine: data.validation_humaine === true,
          madhhab: registryMadhhab(kind, id, data),
          data,
        }));
        await insertChunks(rows, 500, (c) => tx.insert(t.registryEntry).values(c));
      }
    }

    if (verified)
      await tx
        .update(t.edition)
        .set({
          report: { ...report, numerosHadithsMasques: masked, lignee: load.lineage.length },
        })
        .where(eq(t.edition.id, editionId));
    await insertLineage(tx, load, editionId);
    await backfillContent(tx as unknown as Db);
    if (opts.publish) await publish(tx, editionId);
    return { editionId, status, units: unitsCount, exercises: exCount };
  });
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Lignée déclarée par cette édition (idempotent : une même correspondance n'est gardée qu'une fois). */
async function insertLineage(tx: Tx, load: EditionLoad, editionId: string): Promise<void> {
  if (!load.lineage?.length) return;
  await insertChunks(load.lineage, 500, (c) =>
    tx
      .insert(t.exerciseLineage)
      .values(c.map((l) => ({ fromId: l.from, toId: l.to, kind: l.kind, note: l.note, editionId })))
      .onConflictDoNothing(),
  );
}

export interface BackfillResult {
  exercices: number;
  lecons: number;
  reponses: number;
}

/**
 * Lot F1 : complète ce que les migrations ne savent pas calculer en SQL — empreinte du CORRIGÉ des versions
 * d'exercices (`answer_hash`), blocs de fiqh étiquetés (`madhhab_blocks`), puis empreinte du corrigé des
 * réponses déjà enregistrées (retrouvée par l'empreinte du texte qu'elles portent). Idempotent ; lancé à
 * chaque import (y compris « inchangé ») : un déploiement migre donc les données existantes sans perte.
 */
export async function backfillContent(db: Db): Promise<BackfillResult> {
  const out: BackfillResult = { exercices: 0, lecons: 0, reponses: 0 };
  // exercices : édition par édition (la démo garde des dizaines d'éditions, plus de 100 000 versions),
  // par paquets de 500 (une requête par paquet)
  const xeds = await db
    .selectDistinct({ id: t.exerciseVersion.editionId })
    .from(t.exerciseVersion)
    .where(isNull(t.exerciseVersion.answerHash));
  for (const ed of xeds) {
    const xs = await db
      .select({
        editionId: t.exerciseVersion.editionId,
        exerciseId: t.exerciseVersion.exerciseId,
        content: t.exerciseVersion.content,
      })
      .from(t.exerciseVersion)
      .where(and(eq(t.exerciseVersion.editionId, ed.id), isNull(t.exerciseVersion.answerHash)));
    await insertChunks(xs, 500, async (c) => {
      const values = sql.join(
        c.map((x) => sql`(${x.editionId}::uuid, ${x.exerciseId}, ${answerHashOf(x.content)})`),
        sql`, `,
      );
      await db.execute(sql`
        UPDATE exercise_version xv SET answer_hash = v.h
        FROM (VALUES ${values}) AS v(e, x, h)
        WHERE xv.edition_id = v.e AND xv.exercise_id = v.x`);
      out.exercices += c.length;
    });
  }
  // leçons : édition par édition (le JSON complet des livres est lourd)
  const eds = await db
    .selectDistinct({ id: t.unitVersion.editionId })
    .from(t.unitVersion)
    .where(isNull(t.unitVersion.madhhabBlocks));
  for (const ed of eds) {
    const us = await db
      .select({
        editionId: t.unitVersion.editionId,
        unitId: t.unitVersion.unitId,
        content: t.unitVersion.content,
      })
      .from(t.unitVersion)
      .where(and(eq(t.unitVersion.editionId, ed.id), isNull(t.unitVersion.madhhabBlocks)));
    await insertChunks(us, 200, async (c) => {
      const values = sql.join(
        c.map(
          (u) =>
            sql`(${u.editionId}::uuid, ${u.unitId}, ${JSON.stringify(blockMadhhabs(u.content))}::jsonb)`,
        ),
        sql`, `,
      );
      await db.execute(sql`
      UPDATE unit_version uv SET madhhab_blocks = v.m
      FROM (VALUES ${values}) AS v(e, u, m)
      WHERE uv.edition_id = v.e AND uv.unit_id = v.u`);
      out.lecons += c.length;
    });
  }
  const r = await db.execute(sql`
    UPDATE attempt a SET answer_hash = v.answer_hash
    FROM (SELECT DISTINCT ON (exercise_id, hash) exercise_id, hash, answer_hash
          FROM exercise_version WHERE answer_hash IS NOT NULL) v
    WHERE a.answer_hash IS NULL AND a.event_type = 'reponse'
      AND a.exercise_id = v.exercise_id AND a.exercise_hash = v.hash`);
  out.reponses = r.rowCount ?? 0;
  return out;
}

/**
 * Publication. Lot F1 : la progression des élèves est recalculée pour les leçons dont un CORRIGÉ a changé
 * (ou dont un exercice noté a été ajouté ou retiré) par rapport à l'édition jusque-là publiée — et pour elles
 * seulement : une édition qui ne corrige que des coquilles ne touche aucune progression.
 */
async function publish(tx: Tx, editionId: string): Promise<void> {
  const [prev] = await tx
    .select({ id: t.edition.id })
    .from(t.edition)
    .where(and(eq(t.edition.status, 'publiee'), ne(t.edition.id, editionId)))
    .limit(1);
  await tx
    .update(t.edition)
    .set({ status: 'retiree' })
    .where(and(eq(t.edition.status, 'publiee'), ne(t.edition.id, editionId)));
  await tx
    .update(t.edition)
    .set({ status: 'publiee', publishedAt: new Date() })
    .where(eq(t.edition.id, editionId));
  if (prev) await reconcileProgress(tx as unknown as Db, prev.id, editionId);
}

/** Leçons dont l'ensemble (exercice noté, corrigé) diffère entre deux éditions. */
export async function unitsWithChangedKeys(
  db: Db,
  fromEdition: string,
  toEdition: string,
): Promise<string[]> {
  const r = await db.execute<{ unit_id: string }>(sql`
    WITH s AS (
      SELECT xv.edition_id, e.unit_id,
             string_agg(xv.exercise_id || ':' || coalesce(xv.answer_hash, ''), ',' ORDER BY xv.exercise_id) AS sig
      FROM exercise_version xv JOIN exercise e ON e.id = xv.exercise_id
      WHERE xv.edition_id IN (${fromEdition}, ${toEdition}) AND e.graded
      GROUP BY xv.edition_id, e.unit_id)
    SELECT coalesce(a.unit_id, b.unit_id) AS unit_id
    FROM (SELECT * FROM s WHERE edition_id = ${fromEdition}) a
    FULL JOIN (SELECT * FROM s WHERE edition_id = ${toEdition}) b ON a.unit_id = b.unit_id
    WHERE a.sig IS DISTINCT FROM b.sig`);
  return r.rows.map((x) => x.unit_id);
}

/** Recalcule la progression des élèves pour les leçons dont le corrigé a changé ; renvoie le nombre recalculé. */
export async function reconcileProgress(
  db: Db,
  fromEdition: string,
  toEdition: string,
): Promise<number> {
  const units = await unitsWithChangedKeys(db, fromEdition, toEdition);
  if (!units.length) return 0;
  const pairs = await db
    .selectDistinct({ profileId: t.progress.profileId, unitId: t.progress.unitId })
    .from(t.progress)
    .where(inArray(t.progress.unitId, units));
  for (const p of pairs) await refreshProgress(db, toEdition, p.profileId, p.unitId);
  return pairs.length;
}
