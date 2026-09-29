/** Bibliothèque des livrets gradués (lot 8) : catalogue et livret en projection élève. */
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export async function listBooklets(db: Db, editionId: string) {
  const rows = await db
    .select({
      code: t.booklet.code,
      levelCode: t.booklet.levelCode,
      rank: t.booklet.rank,
      catalogue: t.booklet.catalogue,
    })
    .from(t.booklet)
    .where(eq(t.booklet.editionId, editionId))
    .orderBy(asc(t.booklet.rank), asc(t.booklet.code));
  return rows.map((r) => {
    const c = r.catalogue as Record<string, unknown>;
    return {
      code: r.code,
      level: r.levelCode,
      titreAr: (c.titre_ar as string) ?? null,
      titreFr: (c.titre_fr as string) ?? null,
      resumeFr: (c.resume_fr as string) ?? null,
      placeFr: (c.place_fr as string) ?? null,
      genreFr: (c.genre_fr as string) ?? null,
      pages: Number(c.pages ?? 0) || null,
      mentionFr: (c.mention_fr as string) ?? null,
    };
  });
}

export async function getBooklet(db: Db, editionId: string, code: string) {
  const [b] = await db
    .select()
    .from(t.booklet)
    .where(and(eq(t.booklet.editionId, editionId), eq(t.booklet.code, code)));
  return b ?? null;
}
