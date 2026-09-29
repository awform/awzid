/**
 * Tâches du travailleur, séparées du démarrage de pg-boss pour être testées (audit QUA-2).
 */
import {
  purgeAuthThrottle,
  purgeCertificateDocuments,
  purgeDeletedAccounts,
  purgeExpiredRecitations,
  purgeRetention,
  purgeTutorLog,
  type Db,
} from '@awform/db';

/** Planification : nom de la file, expression cron, fuseau (heure locale du serveur pour la nuit). */
export const SCHEDULES: ReadonlyArray<{ queue: string; cron: string; nightly?: boolean }> = [
  { queue: 'purge-comptes', cron: '15 3 * * *', nightly: true },
  { queue: 'battement', cron: '*/5 * * * *' },
  // notifications (lot 16) : toutes les 15 minutes ; chaque compte n'en reçoit qu'au bon moment (heure
  // locale, heures calmes, une fois par jour au plus) ; rien si les clés VAPID ne sont pas configurées
  { queue: 'notifications', cron: '*/15 * * * *' },
];

/** Purges de la nuit (RGPD et durées de conservation) ; renvoie les nombres effacés. */
export async function nightlyPurge(db: Db, now = new Date()) {
  return {
    comptes: await purgeDeletedAccounts(db, 30, now),
    // journal du tuteur : 12 mois au plus (ARCHITECTURE_V2 § 1.6)
    journalTuteur: await purgeTutorLog(db, now),
    // registre des certificats : document réduit 30 jours après le départ de l'élève (numéro, nom, niveau,
    // date et mention conservés)
    certificatsReduits: await purgeCertificateDocuments(db, 30, now),
    // récitations envoyées : effacées à l'échéance réglée par la classe (lot 16)
    recitationsEffacees: await purgeExpiredRecitations(db, now),
    // verrous anti-essais : 24 h (ils contiennent des adresses IP ; audit MIN-7)
    verrous: await purgeAuthThrottle(db, now),
    // durées de conservation : tuteur, journal, sessions, paiements abandonnés (audit MIN-8)
    conservation: await purgeRetention(db, now),
  };
}
