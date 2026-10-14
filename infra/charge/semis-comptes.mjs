// Semis de comptes FICTIFS de charge (démo seulement) : exécuté DANS le conteneur api par `node --input-type=module -`.
// Mot de passe : variable AWFORM_CHARGE_PW (jamais affiché). Adresses : charge-<n>@demo.awform.test.
import { connect, setBeta, schema as t } from '@awform/db';
import { buildApp } from '/app/dist/app.js';
import { secretKeyFromEnv } from '/app/dist/auth/key.js';
import { setupTutor } from '@awform/tutor';
import { eq } from 'drizzle-orm';
if (process.env.AWFORM_DEMO !== '1') throw new Error('démo seulement');
const N = Number(process.env.AWFORM_CHARGE_N ?? 50);
const PW = process.env.AWFORM_CHARGE_PW ?? '';
if (PW.length < 16) throw new Error('mot de passe de charge absent');
const h = connect(process.env.DATABASE_URL, 2);
const app = buildApp({
  db: h.db,
  secretKey: secretKeyFromEnv(),
  cookieSecure: false,
  tutor: setupTutor({ AWFORM_TUTEUR: 'simule' }),
});
await app.ready();
let crees = 0,
  deja = 0,
  beta = 0;
for (let i = 0; i < N; i++) {
  const email = `charge-${i}@demo.awform.test`;
  const [ex] = await h.db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, email));
  let accountId = ex?.id;
  if (!accountId) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      remoteAddress: `10.77.${Math.floor(i / 200)}.${(i % 200) + 1}`,
      headers: { 'x-awform': '1' },
      payload: {
        kind: 'adulte',
        email,
        password: PW,
        country: 'FR',
        locale: 'fr',
        birthYear: 1990,
        pseudonym: `Charge ${i}`,
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    });
    if (r.statusCode !== 201) {
      console.log(`échec ${i}: ${r.statusCode} ${r.body.slice(0, 160)}`);
      continue;
    }
    const [a] = await h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, email));
    accountId = a.id;
    crees++;
  } else deja++;
  if (i % 2 === 0) {
    await setBeta(h.db, { type: 'compte', id: accountId }, true, null);
    beta++;
  }
}
console.log(JSON.stringify({ crees, deja, beta, total: N }));
await app.close();
await h.client?.end?.();
process.exit(0);
