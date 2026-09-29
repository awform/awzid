/**
 * Tâches planifiées (pg-boss, file de travaux dans PostgreSQL : aucun service externe) :
 *  - « purge-comptes » chaque nuit à 3 h 15 : effacement définitif des comptes supprimés depuis 30 jours
 *    (RGPD, lot 4) ;
 *  - « battement » toutes les 5 minutes : preuve que le travailleur tourne (lue par status.sh).
 * Les sauvegardes chiffrées sont faites par l'hôte (infra/prod/backup.sh, minuterie systemd) : elles
 * doivent survivre à la perte des conteneurs.
 */
import { PgBoss } from 'pg-boss';
import webpush from 'web-push';
import { connect, dropSubscription, dueNotifications, markSent } from '@awform/db';
import { nightlyPurge, SCHEDULES } from './tasks.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL absente');

const h = connect(url, 2);
const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
boss.on('error', (e: unknown) => console.error('[pg-boss]', e));

await boss.start();
for (const s of SCHEDULES) {
  await boss.createQueue(s.queue);
  await boss.schedule(
    s.queue,
    s.cron,
    {},
    s.nightly ? { tz: process.env.TZ ?? 'Europe/Paris' } : undefined,
  );
}
const VAPID_PUBLIC = process.env.AWFORM_VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.AWFORM_VAPID_PRIVATE;
if (VAPID_PUBLIC && VAPID_PRIVATE)
  webpush.setVapidDetails(
    process.env.AWFORM_VAPID_SUBJECT ?? 'https://localhost',
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  );
await boss.work('notifications', async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  let sent = 0;
  for (const n of await dueNotifications(h.db, new Date())) {
    for (const s of n.subscriptions)
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(n.payload),
          { TTL: 6 * 3600, urgency: 'low' },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await dropSubscription(h.db, s.id);
      }
    await markSent(h.db, n.accountId, n.kind, n.day);
  }
  if (sent)
    console.log(
      JSON.stringify({ tache: 'notifications', envoyees: sent, at: new Date().toISOString() }),
    );
});

await boss.work('purge-comptes', async () => {
  const n = await nightlyPurge(h.db, new Date());
  console.log(JSON.stringify({ tache: 'purge-comptes', ...n, at: new Date().toISOString() }));
});
await boss.work('battement', async () => {
  console.log(JSON.stringify({ tache: 'battement', at: new Date().toISOString() }));
});
console.log(JSON.stringify({ worker: 'demarre', at: new Date().toISOString() }));

const stop = async () => {
  await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
  await h.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
