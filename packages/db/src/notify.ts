/**
 * Notifications respectueuses (lot 16) : web push, TOUT désactivé par défaut, jamais pendant les heures
 * calmes (heure locale du compte), au plus une notification « devoirs » par jour (veille de l'échéance, après
 * 17 h) et un « rapport » le dimanche après 17 h ; les profils mineurs (enfant, ado) ne comptent que si le
 * parent l'a accepté (`enfants`). Textes neutres, sans culpabilisation (ni « retard », ni série, ni urgence),
 * sans nom ni donnée d'enfant dans la notification.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function localParts(now: Date, tz: string): { day: string; hour: number; weekday: number } {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
  } catch {
    return localParts(now, 'UTC');
  }
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday ?? '') + 1;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: wd };
}

/** Heures calmes [début, fin[ ; début > fin : elles passent minuit (ex. 20 h → 8 h). */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

const TEXTS = {
  fr: {
    title: 'Awzid',
    devoirs: (n: number) =>
      n === 1
        ? 'Un devoir est prévu pour demain. Bonne séance !'
        : `${n} devoirs sont prévus pour demain. Bonne séance !`,
    rapport: 'Le rapport de la semaine est prêt.',
  },
  en: {
    title: 'Awzid',
    devoirs: (n: number) =>
      n === 1
        ? 'One piece of homework is planned for tomorrow. Enjoy your session!'
        : `${n} pieces of homework are planned for tomorrow. Enjoy your session!`,
    rapport: 'This week’s report is ready.',
  },
};

export function message(locale: string, kind: 'devoirs' | 'rapport', n = 0): PushPayload {
  const T = locale === 'en' ? TEXTS.en : TEXTS.fr;
  return kind === 'devoirs'
    ? { title: T.title, body: T.devoirs(n), url: '/aujourdhui', tag: 'devoirs' }
    : { title: T.title, body: T.rapport, url: '/suivi/rapport', tag: 'rapport' };
}

const addDay = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export interface DueNotification {
  accountId: string;
  kind: 'devoirs' | 'rapport';
  day: string;
  payload: PushPayload;
  subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
}

/** Notifications à envoyer maintenant (aucun envoi ici : le travailleur envoie puis appelle `markSent`). */
export async function dueNotifications(db: Db, now = new Date()): Promise<DueNotification[]> {
  const prefs = await db.select().from(t.notificationPref);
  const active = prefs.filter((p) => p.devoirs || p.rapport);
  if (!active.length) return [];
  const subs = await db
    .select()
    .from(t.pushSubscription)
    .where(
      inArray(
        t.pushSubscription.accountId,
        active.map((p) => p.accountId),
      ),
    );
  const out: DueNotification[] = [];
  for (const p of active) {
    const mine = subs.filter((s) => s.accountId === p.accountId);
    if (!mine.length) continue;
    const L = localParts(now, p.tz);
    if (inQuietHours(L.hour, p.quietStart, p.quietEnd) || L.hour < 17) continue;
    const profiles = (
      await db
        .select({ id: t.profile.id, kind: t.profile.kind })
        .from(t.profile)
        .where(eq(t.profile.ownerAccountId, p.accountId))
    ).filter((x) => x.kind === 'adulte' || p.enfants);
    if (!profiles.length) continue;
    const s = mine.map((x) => ({ id: x.id, endpoint: x.endpoint, p256dh: x.p256dh, auth: x.auth }));
    if (p.devoirs && p.lastDevoirs !== L.day) {
      const n = await dueTomorrow(
        db,
        profiles.map((x) => x.id),
        addDay(L.day),
      );
      if (n > 0)
        out.push({
          accountId: p.accountId,
          kind: 'devoirs',
          day: L.day,
          payload: message(p.locale, 'devoirs', n),
          subscriptions: s,
        });
    }
    if (p.rapport && L.weekday === 7 && p.lastRapport !== L.day)
      out.push({
        accountId: p.accountId,
        kind: 'rapport',
        day: L.day,
        payload: message(p.locale, 'rapport'),
        subscriptions: s,
      });
  }
  return out;
}

/** Devoirs à rendre `day` pour ces profils (groupe respecté), hors ceux déjà cochés « fait ». */
async function dueTomorrow(db: Db, profileIds: string[], day: string): Promise<number> {
  const pupils = await db
    .select({
      id: t.classPupil.id,
      classId: t.classPupil.classId,
      groupId: t.classPupil.groupId,
    })
    .from(t.classPupil)
    .where(inArray(t.classPupil.profileId, profileIds));
  if (!pupils.length) return 0;
  const asg = await db
    .select()
    .from(t.classAssignment)
    .where(
      and(
        inArray(
          t.classAssignment.classId,
          pupils.map((x) => x.classId),
        ),
        eq(t.classAssignment.dueDay, day),
      ),
    );
  if (!asg.length) return 0;
  const marks = await db
    .select()
    .from(t.assignmentMark)
    .where(
      inArray(
        t.assignmentMark.assignmentId,
        asg.map((a) => a.id),
      ),
    );
  let n = 0;
  for (const pu of pupils)
    for (const a of asg)
      if (
        a.classId === pu.classId &&
        (!a.groupId || a.groupId === pu.groupId) &&
        !marks.some((m) => m.assignmentId === a.id && m.pupilId === pu.id && m.done)
      )
        n++;
  return n;
}

export async function markSent(
  db: Db,
  accountId: string,
  kind: 'devoirs' | 'rapport',
  day: string,
) {
  await db
    .update(t.notificationPref)
    .set(kind === 'devoirs' ? { lastDevoirs: day } : { lastRapport: day })
    .where(eq(t.notificationPref.accountId, accountId));
}

/** Abonnement refusé par le service de notification (410/404) : supprimé. */
export async function dropSubscription(db: Db, id: string) {
  await db.delete(t.pushSubscription).where(eq(t.pushSubscription.id, id));
}
