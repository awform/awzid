import { connect, loadRootEnv } from '@awform/db';
import { buildApp } from './app.js';

loadRootEnv();
const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? 3000);
const h = connect(process.env.DATABASE_URL);
const app = buildApp({
  db: h.db,
  logger: true,
  editionCode: process.env.AWFORM_EDITION_FORCE || undefined,
  devAttempts: process.env.AWFORM_DEV_ATTEMPTS === '1',
});

const stop = async () => {
  await app.close();
  await h.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await app.listen({ host, port });
