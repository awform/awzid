/**
 * Effacement définitif des comptes dont la suppression a été demandée il y a plus de N jours (RGPD art. 17 ;
 * CDC §4.6 : sous 30 jours). Profils, tutelles, consentements, sessions, réponses et progression partent en
 * cascade ; le journal d'audit garde l'action sans lien vers la personne.
 */
import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
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
  const due = (
    await db
      .select({ id: t.account.id })
      .from(t.account)
      .where(and(isNotNull(t.account.deletedAt), lt(t.account.deletedAt, limit)))
  ).map((a) => a.id);
  if (!due.length) return 0;
  const profiles = (
    await db
      .select({ id: t.profile.id })
      .from(t.profile)
      .where(inArray(t.profile.ownerAccountId, due))
  ).map((p) => p.id);
  const gone = await db
    .delete(t.account)
    .where(inArray(t.account.id, due))
    .returning({ id: t.account.id });
  // audit MIN-7 : les lignes du journal qui visaient ces comptes ou profils sont pseudonymisées (l'action
  // et la date restent, plus rien ne désigne la personne ni ne dit son âge ou son pays)
  await db
    .update(t.auditLog)
    .set({ target: null, before: null, after: null })
    .where(inArray(t.auditLog.target, [...due, ...profiles]));
  if (gone.length)
    await db
      .insert(t.auditLog)
      .values({ action: 'compte.effacement_definitif', after: { nombre: gone.length } });
  return gone.length;
}

/**
 * Verrous anti-essais (audit MIN-7, MIN-8) : ils contiennent des adresses IP ; effacés 24 h après le dernier
 * essai, sauf verrou encore actif.
 */
export async function purgeAuthThrottle(db: Db, now = new Date(), hours = 24): Promise<number> {
  const limit = new Date(now.getTime() - hours * 3600_000);
  const gone = await db
    .delete(t.authThrottle)
    .where(
      and(
        lt(t.authThrottle.updatedAt, limit),
        or(isNull(t.authThrottle.lockedUntil), lt(t.authThrottle.lockedUntil, now)),
      ),
    )
    .returning({ k: t.authThrottle.key });
  return gone.length;
}

const DAY = 86400_000;

/**
 * Durées de conservation (audit MIN-8), appliquées chaque nuit par le travailleur :
 * - questions et alertes du tuteur : 12 mois une fois traitées, 24 mois au plus sinon ;
 * - journal d'audit : 12 mois (durée provisoire, décision D9) ;
 * - sessions expirées ou révoquées depuis plus de 30 jours ;
 * - paiements abandonnés (non payés) de plus de 30 jours ; les paiements réussis restent (comptabilité).
 */
export async function purgeRetention(
  db: Db,
  now = new Date(),
): Promise<{
  questionsTuteur: number;
  alertesTuteur: number;
  journal: number;
  sessions: number;
  paiements: number;
  messages: number;
}> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const count = (r: { rowCount: number | null }) => r.rowCount ?? 0;
  const questionsTuteur = count(
    await db
      .delete(t.tutorQuestion)
      .where(
        or(
          and(eq(t.tutorQuestion.status, 'repondue'), lt(t.tutorQuestion.createdAt, ago(365))),
          lt(t.tutorQuestion.createdAt, ago(730)),
        ),
      ),
  );
  const alertesTuteur = count(
    await db
      .delete(t.tutorAlert)
      .where(
        or(
          and(isNotNull(t.tutorAlert.handledAt), lt(t.tutorAlert.createdAt, ago(365))),
          lt(t.tutorAlert.createdAt, ago(730)),
        ),
      ),
  );
  const journal = count(await db.delete(t.auditLog).where(lt(t.auditLog.at, ago(365))));
  const sessions = count(
    await db
      .delete(t.session)
      .where(or(lt(t.session.expiresAt, ago(30)), lt(t.session.revokedAt, ago(30)))),
  );
  const paiements = count(
    await db
      .delete(t.billingCheckout)
      .where(
        and(
          inArray(t.billingCheckout.status, ['ouverte', 'echouee', 'expiree']),
          lt(t.billingCheckout.createdAt, ago(30)),
        ),
      ),
  );
  // messagerie (lot 21, §2.12.7) : 12 mois après la fin de l'année scolaire (31 juillet) — décision D11
  const y = now.getUTCFullYear();
  const cutoff = new Date(Date.UTC(now.getTime() >= Date.UTC(y, 7, 1) ? y - 1 : y - 2, 7, 1));
  const messages = count(await db.delete(t.message).where(lt(t.message.createdAt, cutoff)));
  return { questionsTuteur, alertesTuteur, journal, sessions, paiements, messages };
}
