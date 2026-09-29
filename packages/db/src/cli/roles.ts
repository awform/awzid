#!/usr/bin/env node
/**
 * Comptes PostgreSQL séparés (lot 14) : node dist/cli/roles.js [--test]
 * Exécuté par le PROPRIÉTAIRE (service « outils »). Mots de passe lus dans l'environnement
 * (AWFORM_DB_API_PASSWORD, AWFORM_DB_WORKER_PASSWORD ; jamais en argument) ; préfixe AWFORM_DB_ROLE_PREFIX.
 */
import { connect } from '../client.js';
import { loadRootEnv } from '../env.js';
import { applyRoles, roleNames } from '../roles.js';

loadRootEnv();
const url = process.argv.includes('--test')
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;
const api = process.env.AWFORM_DB_API_PASSWORD ?? '';
const worker = process.env.AWFORM_DB_WORKER_PASSWORD ?? '';
const names = roleNames(process.env.AWFORM_DB_ROLE_PREFIX || 'awform');
const h = connect(url, 1);
try {
  const db = await applyRoles(h.pool, names, { api, worker });
  console.log(`Rôles appliqués sur ${db} : ${names.api}, ${names.worker}.`);
} finally {
  await h.close();
}
