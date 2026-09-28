#!/usr/bin/env node
/** Effacement définitif des comptes supprimés depuis plus de 30 jours (tâche quotidienne). */
import { connect } from '../client.js';
import { loadRootEnv } from '../env.js';
import { purgeDeletedAccounts } from '../purge.js';

loadRootEnv();
const h = connect(
  process.argv.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  2,
);
try {
  console.log(`Comptes effacés définitivement : ${await purgeDeletedAccounts(h.db)}`);
} finally {
  await h.close();
}
