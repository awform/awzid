/**
 * Activation APRÈS écoute (deux temps) : un import « importe » (tous contrôles passés, non activé) peut être
 * activé ensuite sans relire les fichiers, à condition que ce soit le DERNIER import du récitateur et que ses
 * pistes en base correspondent au compte attendu (muṣḥaf complet) — sinon refus motivé.
 */
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as t from '../schema.js';

export async function activateReciter(
  db: Db,
  id: string,
  o: { reactivate?: boolean; partialOk?: boolean } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [rec] = await db.select().from(t.quranReciter).where(eq(t.quranReciter.id, id));
  if (!rec) return { ok: false, reason: 'récitateur inconnu' };
  if (rec.status === 'actif') return { ok: true };
  if (rec.status === 'retire' && !o.reactivate)
    return { ok: false, reason: 'récitateur retiré : --reactiver obligatoire' };
  const [last] = await db
    .select()
    .from(t.quranAudioImport)
    .where(eq(t.quranAudioImport.reciterId, id))
    .orderBy(desc(t.quranAudioImport.finishedAt))
    .limit(1);
  if (!last) return { ok: false, reason: 'aucun import' };
  if (last.status === 'bloque') return { ok: false, reason: 'dernier import bloqué' };
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.quranTrack)
    .where(sql`${t.quranTrack.reciterId} = ${id} and ${t.quranTrack.aya} > 0`);
  if (n !== rec.expectedVerses && !o.partialOk)
    return { ok: false, reason: `${n} versets en base, ${rec.expectedVerses} attendus` };
  await db
    .update(t.quranReciter)
    .set({ status: 'actif', activatedAt: new Date(), retiredAt: null, retiredReason: null })
    .where(eq(t.quranReciter.id, id));
  return { ok: true };
}
