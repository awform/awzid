/**
 * Effacement définitif des comptes dont la suppression a été demandée il y a plus de N jours (RGPD art. 17 ;
 * CDC §4.6 : sous 30 jours). Profils, tutelles, consentements, sessions, réponses et progression partent en
 * cascade ; le journal d'audit garde l'action sans lien vers la personne.
 */
import { and, isNotNull, lt } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export async function purgeDeletedAccounts(db: Db, days = 30, now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - days * 86400_000);
  const gone = await db
    .delete(t.account)
    .where(and(isNotNull(t.account.deletedAt), lt(t.account.deletedAt, limit)))
    .returning({ id: t.account.id });
  if (gone.length)
    await db
      .insert(t.auditLog)
      .values({ action: 'compte.effacement_definitif', after: { nombre: gone.length } });
  return gone.length;
}
