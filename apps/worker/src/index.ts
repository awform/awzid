/**
 * Tâches planifiées (pg-boss, file de travaux dans PostgreSQL : aucun service externe) :
 *  - « purge-comptes » chaque nuit à 3 h 15 : effacement définitif des comptes supprimés depuis 30 jours
 *    (RGPD, lot 4) ;
 *  - « battement » toutes les 5 minutes : preuve que le travailleur tourne (lue par status.sh).
 * Les sauvegardes chiffrées sont faites par l'hôte (infra/prod/backup.sh, minuterie systemd) : elles
 * doivent survivre à la perte des conteneurs.
 */
import { PgBoss } from 'pg-boss';
import { connect, purgeDeletedAccounts, purgeTutorLog } from '@awform/db';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL absente');

const h = connect(url, 2);
const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
boss.on('error', (e: unknown) => console.error('[pg-boss]', e));

await boss.start();
for (const q of ['purge-comptes', 'battement']) await boss.createQueue(q);
await boss.schedule('purge-comptes', '15 3 * * *', {}, { tz: process.env.TZ ?? 'Europe/Paris' });
await boss.schedule('battement', '*/5 * * * *');

await boss.work('purge-comptes', async () => {
  const n = await purgeDeletedAccounts(h.db, 30, new Date());
  // journal du tuteur : 12 mois au plus (ARCHITECTURE_V2 § 1.6)
  const j = await purgeTutorLog(h.db, new Date());
  console.log(
    JSON.stringify({
      tache: 'purge-comptes',
      comptes: n,
      journalTuteur: j,
      at: new Date().toISOString(),
    }),
  );
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
