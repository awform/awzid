/**
 * Chantier A37 — « Vivre l'islam », bon comportement : rubriques des livres de l'édition (rangées par cercle et
 * par lieu), fiches du livret « Bon comportement » et leçons qu'un élève a déjà atteintes.
 * Rien n'est inventé : les rubriques sont lues dans la projection élève des leçons, les fiches dans les documents
 * de l'édition (`akhlaq.fiches`, importés depuis `data/akhlaq/` des livres).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { levelParts } from '@awform/content';
import type { AdabEntry, Fiche } from '@awform/content/adab';
import { applyRangement, entriesOfLesson, readAdabIndex } from '@awform/content/adab-classer';
import { readFiches } from '@awform/content/akhlaq';
import type { Db } from './client.js';
import { currentLevelOf, trackLevels } from './parcours.js';
import * as t from './schema.js';

/** Rubriques de bon comportement de l'édition, rangées (index officiel > corrections > automatique). */
export async function adabEntries(db: Db, editionId: string): Promise<AdabEntry[]> {
  const rows = await db
    .select({
      id: t.unit.id,
      level: t.unit.levelCode,
      n: t.unit.n,
      fa: sql<unknown>`${t.unitVersion.student}->'fiqh_adab'`,
      rub: sql<unknown>`${t.unitVersion.student}->'rubriques'`,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(
      and(
        eq(t.unitVersion.editionId, editionId),
        eq(t.unit.kind, 'lecon'),
        sql`(${t.unitVersion.student} ? 'fiqh_adab' OR ${t.unitVersion.student} ? 'rubriques')`,
      ),
    );
  const entries = rows
    .flatMap((r) =>
      entriesOfLesson(r.id, r.level, r.n, {
        ...(r.fa ? { fiqh_adab: r.fa } : {}),
        ...(r.rub ? { rubriques: r.rub } : {}),
      }),
    )
    .sort((a, b) => a.level.localeCompare(b.level) || a.n - b.n || a.path.localeCompare(b.path));
  const [idx] = await db
    .select({ content: t.evalDoc.content })
    .from(t.evalDoc)
    .where(and(eq(t.evalDoc.editionId, editionId), eq(t.evalDoc.key, 'akhlaq.index')));
  return applyRangement(entries, idx ? readAdabIndex(idx.content).map : null);
}

/** Fiches du livret « Bon comportement » importées avec l'édition (contrôlées de nouveau à la lecture). */
export async function akhlaqFiches(db: Db, editionId: string): Promise<Fiche[]> {
  const [doc] = await db
    .select({ content: t.evalDoc.content })
    .from(t.evalDoc)
    .where(and(eq(t.evalDoc.editionId, editionId), eq(t.evalDoc.key, 'akhlaq.fiches')));
  const list = (doc?.content as { fiches?: unknown[] } | undefined)?.fiches ?? [];
  return readFiches(list.map((raw, i) => ({ file: `akhlaq.fiches[${i}]`, raw }))).fiches.filter(
    (f) => !f.test,
  );
}

/**
 * Leçons (arabe et sciences) que l'élève a déjà atteintes : tous les livres des niveaux précédents de sa filière,
 * et dans son niveau courant les leçons faites ou commencées et la leçon où il en est.
 */
export async function reachedUnits(
  db: Db,
  editionId: string,
  profileId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const subject of ['arabe', 'sciences'] as const) {
    const cur = await currentLevelOf(db, profileId, subject);
    const parts = cur ? levelParts(cur.levelCode) : null;
    if (!cur || !parts) continue;
    const levels = (await trackLevels(db, editionId, parts.prefix)).filter((l) => l.n <= parts.n);
    if (!levels.length) continue;
    const units = await db
      .select({ id: t.unit.id, level: t.unit.levelCode, n: t.unit.n, kind: t.unit.kind })
      .from(t.unitVersion)
      .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
      .where(
        and(
          eq(t.unitVersion.editionId, editionId),
          inArray(
            t.unit.levelCode,
            levels.map((l) => l.code),
          ),
        ),
      );
    const here = units.filter((u) => u.level === cur.levelCode).sort((a, b) => a.n - b.n);
    const prog = here.length
      ? await db
          .select({ unitId: t.progress.unitId, status: t.progress.status })
          .from(t.progress)
          .where(
            and(
              eq(t.progress.profileId, profileId),
              inArray(
                t.progress.unitId,
                here.map((u) => u.id),
              ),
            ),
          )
      : [];
    const st = new Map(prog.map((p) => [p.unitId, p.status]));
    const done = (id: string) => ['terminee', 'maitrisee'].includes(st.get(id) ?? '');
    // leçon où il en est : la première qui n'est pas faite (hors examen)
    const at = here.find((u) => !done(u.id) && u.kind !== 'examen');
    for (const u of units)
      if (u.level !== cur.levelCode || st.has(u.id) || (at ? u.n <= at.n : true)) out.add(u.id);
  }
  return out;
}
