/**
 * Effacement définitif des comptes dont la suppression a été demandée il y a plus de N jours (RGPD art. 17 ;
 * CDC §4.6 : sous 30 jours). Profils, tutelles, consentements, sessions, réponses et progression partent en
 * cascade ; le journal d'audit garde l'action sans lien vers la personne.
 */
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from './client.js';
import { leaveClass } from './hifz.js';
import * as t from './schema.js';

/**
 * Suppression demandée (audit MIN-5) : les profils du compte quittent aussitôt toutes leurs classes (liste,
 * registre, réponses libres, copies) et leurs récitations envoyées sont effacées. L'enseignant ne voit plus
 * rien de l'élève pendant les 30 jours qui précèdent l'effacement définitif.
 */
export async function withdrawAccount(db: Db, accountId: string): Promise<void> {
  const profiles = await db
    .select({ id: t.profile.id })
    .from(t.profile)
    .where(eq(t.profile.ownerAccountId, accountId));
  for (const p of profiles) {
    const classes = await db
      .select({ c: t.classMember.classId })
      .from(t.classMember)
      .where(eq(t.classMember.profileId, p.id));
    const pupils = await db
      .select({ c: t.classPupil.classId })
      .from(t.classPupil)
      .where(eq(t.classPupil.profileId, p.id));
    for (const c of new Set([...classes.map((x) => x.c), ...pupils.map((x) => x.c)]))
      await leaveClass(db, c, p.id);
    await db.delete(t.recitationUpload).where(eq(t.recitationUpload.profileId, p.id));
  }
}

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
