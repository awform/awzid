import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PARENT_PIN, totp } from './totp';

/**
 * Comptes de TEST (base de test remise à zéro à chaque lancement) : un adulte autonome et un parent avec
 * deux enfants. Mot de passe tiré au hasard à chaque lancement (jamais écrit dans le dépôt), transmis aux
 * tests par l'environnement. Adresses en .test (domaine réservé, aucune donnée réelle).
 */
const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}/api/v1`;

async function post(
  path: string,
  body: unknown,
  cookie = '',
): Promise<{ cookie: string; json: unknown }> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-awform': '1', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json: unknown = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(json)}`);
  const set = r.headers.get('set-cookie') ?? '';
  return { cookie: set.split(';')[0] ?? cookie, json };
}

export default async function globalSetup(): Promise<void> {
  const password = `e2e ${randomBytes(12).toString('base64url')} phrase`;
  process.env.E2E_PASSWORD = password;
  const year = new Date().getFullYear();
  await post('/auth/signup', {
    kind: 'adulte',
    email: 'adulte@e2e.test',
    password,
    country: 'FR',
    locale: 'fr',
    birthYear: 1990,
    pseudonym: 'Adulte',
    consents: ['cgu'],
  });
  const parent = await post('/auth/signup', {
    kind: 'parent',
    birthYear: 1985,
    email: 'parent@e2e.test',
    password,
    country: 'FR',
    locale: 'fr',
    consents: ['cgu'],
  });
  // code parent (réglages du mode école, écoute du parent)
  await post('/account/pin', { pin: PARENT_PIN, password }, parent.cookie);
  // enseignant : créé par la ligne de commande (pas d'inscription publique), second facteur configuré ici
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'enseignant', '--email', 'maitre@e2e.test', '--test'],
    {
      env: { ...process.env, AWFORM_STAFF_PASSWORD: password },
      stdio: 'ignore',
    },
  );
  const teacher = await post('/auth/login', { email: 'maitre@e2e.test', password });
  const setup = (await post('/auth/totp/setup', {}, teacher.cookie)).json as { secret: string };
  const counter = Math.floor(Date.now() / 30_000);
  await post('/auth/totp/confirm', { code: totp(setup.secret, counter) }, teacher.cookie);
  process.env.E2E_TOTP_SECRET = setup.secret;
  process.env.E2E_TOTP_LAST = String(counter);
  writeFileSync(join(tmpdir(), 'awform-e2e-totp-counter'), String(counter));
  for (const [pseudonym, avatar, age] of [
    ['Amina', 'etoile', 8],
    ['Yanis', 'soleil', 10],
  ] as const)
    await post(
      '/profiles',
      {
        pseudonym,
        avatar,
        birthYear: year - 1 - age,
        levelCode: 'en1',
        password,
        consents: ['compte_suivi'],
      },
      parent.cookie,
    );
  // Paquets hors ligne préparés AVANT les tests : le manifeste construit et compresse (Brotli 11) les
  // paquets de tous les niveaux au premier appel, ≈ 50 s avec les 31 livres. Sans ce préchauffage, le
  // premier test qui ouvre « Téléchargements » (captures du lot 3, sur téléphone) payait ces 50 s dans son
  // délai de 60 s : cause de son échec intermittent.
  const t0 = Date.now();
  const r = await fetch(`${API}/packs`);
  if (!r.ok) throw new Error(`/packs → ${r.status}`);
  console.log(`paquets hors ligne préparés en ${Math.round((Date.now() - t0) / 1000)} s`);
}
