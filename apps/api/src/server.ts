import { connect, loadRootEnv } from '@awform/db';
import { buildApp } from './app.js';
import { secretKeyFromEnv } from './auth/key.js';
import { demoGuard } from './demo-mode.js';

loadRootEnv();
// garde-fou : AWFORM_DEMO=1 (connexion simplifiée) seulement sur une configuration de réseau local
const demoRefus = demoGuard(process.env);
if (demoRefus) {
  console.error(`AWFORM_DEMO=1 refusé, l'API ne démarre pas : ${demoRefus}`);
  process.exit(1);
}
const demo = process.env.AWFORM_DEMO === '1';
const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? 3000);
const h = connect(process.env.DATABASE_URL);
const secretKey = secretKeyFromEnv();
const app = buildApp({
  db: h.db,
  logger: true,
  editionCode: process.env.AWFORM_EDITION_FORCE || undefined,
  // 1 (défaut) : Secure ; 0 : jamais (tests http) ; auto : selon HTTPS derrière le proxy (démonstration)
  cookieSecure: process.env.COOKIE_SECURE === 'auto' ? 'auto' : process.env.COOKIE_SECURE !== '0',
  secretKey,
  demoLogin: demo,
});
if (demo)
  app.log.warn(
    'MODE DÉMONSTRATION : identifiants courts sans second facteur (réseau local seulement)',
  );
if (!secretKey)
  app.log.warn(
    'AWFORM_SECRET_KEY absente : second facteur (enseignants, administrateurs) indisponible',
  );

const stop = async () => {
  await app.close();
  await h.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await app.listen({ host, port });
