/**
 * Import d'une édition en base (CDC §5.3, étapes 4-5) : idempotent, atomique (une transaction),
 * refusé s'il existe une erreur bloquante (verset ≠ Tanzil, corrigé impossible, fichier illisible).
 */
import { and, eq, ne, sql } from 'drizzle-orm';
import { blockingIssues, studentProjection, type EditionLoad } from '@awform/content';
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

async function insertChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function importEdition(db: Db, load: EditionLoad, opts: ImportOptions): Promise<ImportResult> {
  const blocking = blockingIssues(load);
  if (blocking.length)
    throw new ImportRefusedError(
      `${blocking.length} erreur(s) bloquante(s) : ` + blocking.slice(0, 5).map((i) => `${i.unit ?? i.file ?? ''} ${i.message}`).join(' ; '),
    );

  const unitsCount = load.levels.reduce((s, l) => s + l.units.length, 0);
  const exCount = load.levels.reduce((s, l) => s + l.units.reduce((s2, u) => s2 + u.exercises.length, 0), 0);

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
      await tx.update(t.edition).set({ sourceSha256: load.sourceSha256, report }).where(eq(t.edition.id, ed.id));
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
    const [{ n: quranCount } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(t.quranVerse);
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
        throw new ImportRefusedError(`le texte coranique de référence en base diffère de Tanzil (${diff.length} versets)`);
    }

    for (const lv of load.levels) {
      const rank = Number(/\d+$/.exec(lv.code)?.[0] ?? 0);
      await tx
        .insert(t.level)
        .values({ code: lv.code, track: trackOf(lv.code), rank, titleFr: lv.book.titre_fr ?? null })
        .onConflictDoUpdate({ target: t.level.code, set: { titleFr: lv.book.titre_fr ?? null } });
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
          student: studentProjection(u.content),
        });
        await tx.insert(t.qrRedirect).values({ slug: qrSlug(u.id), unitId: u.id }).onConflictDoNothing();
        for (const e of u.exercises) {
          await tx
            .insert(t.exercise)
            .values({ id: e.id, unitId: u.id, position: e.position, type: e.type, graded: e.graded })
            .onConflictDoUpdate({ target: t.exercise.id, set: { type: e.type, graded: e.graded } });
        }
        if (u.exercises.length)
          await tx.insert(t.exerciseVersion).values(
            u.exercises.map((e) => ({
              editionId,
              exerciseId: e.id,
              hash: e.hash,
              itemCount: e.itemCount,
              content: e.content,
            })),
          );
      }
    }

    if (load.hifz.length)
      await tx.insert(t.hifzBook).values(load.hifz.map((h) => ({ editionId, code: h.code, content: h })));
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
          data,
        }));
        await insertChunks(rows, 500, (c) => tx.insert(t.registryEntry).values(c));
      }
    }

    if (opts.publish) await publish(tx, editionId);
    return { editionId, status, units: unitsCount, exercises: exCount };
  });
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function publish(tx: Tx, editionId: string): Promise<void> {
  await tx
    .update(t.edition)
    .set({ status: 'retiree' })
    .where(and(eq(t.edition.status, 'publiee'), ne(t.edition.id, editionId)));
  await tx.update(t.edition).set({ status: 'publiee', publishedAt: new Date() }).where(eq(t.edition.id, editionId));
}
