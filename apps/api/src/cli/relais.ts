#!/usr/bin/env node
/**
 * Relais d'école — enregistrement par l'équipe (lot 17) :
 *   node dist/cli/relais.js creer "École pilote Dakar" ecole-dakar-01.relais.awzid.org
 *   node dist/cli/relais.js revoquer ecole-dakar-01.relais.awzid.org
 *   node dist/cli/relais.js liste
 * Le jeton n'est affiché qu'UNE fois (à saisir dans l'installation du relais) ; seul son hachage est gardé.
 */
import { connect, createRelay, listRelays, loadRootEnv, revokeRelay } from '@awform/db';

loadRootEnv();
const [cmd, a, b] = process.argv.slice(2);
const h = connect(process.env.DATABASE_URL, 1);
try {
  if (cmd === 'creer' && a && b) {
    const r = await createRelay(h.db, a, b);
    console.log(JSON.stringify({ relais: r.host, jeton: r.token }));
  } else if (cmd === 'revoquer' && a) {
    console.log(JSON.stringify({ relais: a, revoque: await revokeRelay(h.db, a) }));
  } else if (cmd === 'liste') {
    console.log(JSON.stringify(await listRelays(h.db), null, 2));
  } else {
    console.error('usage : relais.js creer <nom> <sous-domaine> | revoquer <sous-domaine> | liste');
    process.exitCode = 2;
  }
} finally {
  await h.close();
}
