/**
 * Activation APRÈS écoute (deux temps) : un import « importe » (tous contrôles passés, non activé) peut être
 * activé ensuite sans relire les fichiers, à condition que ce soit le DERNIER import du récitateur et que ses
 * pistes en base correspondent au compte attendu (muṣḥaf complet) — sinon refus motivé.
 */
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as t from '../schema.js';
import { HAFS_SURA_VERSES, riwayaSuraVerses } from './suras.js';

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
  // versets couverts : pistes par verset + versets des sourates servies par leur fichier entier (piste 0 seule)
  const rows = await db
    .select({
      sura: t.quranTrack.sura,
      v: sql<number>`count(*) filter (where ${t.quranTrack.aya} > 0)::int`,
      z: sql<boolean>`bool_or(${t.quranTrack.aya} = 0)`,
    })
    .from(t.quranTrack)
    .where(eq(t.quranTrack.reciterId, id))
    .groupBy(t.quranTrack.sura);
  const table = riwayaSuraVerses(rec.riwaya) ?? HAFS_SURA_VERSES;
  const n = rows.reduce((s, r) => s + (r.v > 0 ? r.v : r.z ? (table[r.sura - 1] ?? 0) : 0), 0);
  if (n !== rec.expectedVerses && !o.partialOk)
    return { ok: false, reason: `${n} versets en base, ${rec.expectedVerses} attendus` };
  await db
    .update(t.quranReciter)
    .set({ status: 'actif', activatedAt: new Date(), retiredAt: null, retiredReason: null })
    .where(eq(t.quranReciter.id, id));
  return { ok: true };
}
