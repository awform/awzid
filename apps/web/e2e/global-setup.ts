import { randomBytes } from 'node:crypto';

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
    email: 'parent@e2e.test',
    password,
    country: 'FR',
    locale: 'fr',
    consents: ['cgu'],
  });
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
}
