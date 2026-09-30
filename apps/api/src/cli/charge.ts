#!/usr/bin/env node
/**
 * Test de CHARGE (lot 24, V1-h ; CDC : p95 < 500 ms) sans dépendance : fetch en parallèle contre une API
 * lancée localement sur une base de TEST (jamais la production).
 *   AWFORM_CHARGE_URL=http://127.0.0.1:3100 AWFORM_CHARGE_VU=20 AWFORM_CHARGE_SECONDES=20 \
 *     node dist/cli/charge.js
 * L'API doit accepter les inscriptions de test (AWFORM_SIGNUP_PER_HOUR ≥ nombre d'utilisateurs virtuels).
 * Routes chaudes : santé, connexion, /units/:id, /today/:id, synchronisation d'événements (/attempts),
 * messages de la famille. Sortie : un tableau p50 / p95 / max par route, et un code de sortie 1 si une
 * route dépasse l'objectif (AWFORM_CHARGE_P95_MS, 500 par défaut). Scénario k6 équivalent :
 * infra/charge/k6.js.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export interface Summary {
  route: string;
  n: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
  rps: number;
}

/** Percentile (méthode du rang le plus proche) d'une liste TRIÉE ; 0 si vide. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

/** Résumé d'une série de durées (ms) mesurées pendant `seconds` secondes. */
export function summarize(
  route: string,
  durations: number[],
  errors: number,
  seconds: number,
): Summary {
  const s = [...durations].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    route,
    n: s.length,
    errors,
    p50: r(percentile(s, 50)),
    p95: r(percentile(s, 95)),
    max: r(s.at(-1) ?? 0),
    rps: seconds > 0 ? r(s.length / seconds) : 0,
  };
}

/**
 * Lance `vus` boucles en parallèle pendant `ms` millisecondes ; chaque boucle appelle `step(vu)` qui renvoie
 * vrai si la réponse est bonne. Durées mesurées de bout en bout (réseau local compris).
 */
export async function run(
  route: string,
  vus: number,
  ms: number,
  step: (vu: number) => Promise<boolean>,
): Promise<Summary> {
  const durations: number[] = [];
  let errors = 0;
  const end = Date.now() + ms;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: vus }, async (_, vu) => {
      while (Date.now() < end) {
        const s = performance.now();
        const ok = await step(vu).catch(() => false);
        durations.push(performance.now() - s);
        if (!ok) errors++;
      }
    }),
  );
  return summarize(route, durations, errors, (performance.now() - t0) / 1000);
}

/** Tableau lisible (Markdown), prêt à coller dans le journal. */
export function table(rows: Summary[], goal: number): string {
  const head =
    '| route | requêtes | erreurs | req/s | p50 (ms) | p95 (ms) | max (ms) | p95 < objectif |';
  const sep = '|---|---:|---:|---:|---:|---:|---:|---|';
  return [
    head,
    sep,
    ...rows.map(
      (r) =>
        `| ${r.route} | ${r.n} | ${r.errors} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.max} | ${r.p95 < goal ? 'oui' : 'NON'} |`,
    ),
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------- lancement

async function main(): Promise<void> {
  const BASE = (process.env.AWFORM_CHARGE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
  const VU = Number(process.env.AWFORM_CHARGE_VU ?? 20) || 20;
  const MS = (Number(process.env.AWFORM_CHARGE_SECONDES ?? 15) || 15) * 1000;
  const GOAL = Number(process.env.AWFORM_CHARGE_P95_MS ?? 500) || 500;
  const UNIT = process.env.AWFORM_CHARGE_UNITE ?? 'en1.l01';
  // mot de passe tiré au hasard à chaque lancement (comptes jetables d'une base de test)
  const password = `charge ${randomBytes(12).toString('base64url')} phrase`;
  const api = (path: string, init: RequestInit = {}, cookie = '') =>
    fetch(`${BASE}/api/v1${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-awform': '1',
        ...(cookie ? { cookie } : {}),
      },
    });

  const health = await api('/health').catch(() => null);
  if (!health?.ok) throw new Error(`API injoignable : ${BASE}/api/v1/health`);

  // un compte adulte par utilisateur virtuel (inscription par la vraie route, consentement compris)
  const tag = randomBytes(4).toString('hex');
  const users: Array<{ email: string; cookie: string; profileId: string }> = [];
  for (let i = 0; i < VU; i++) {
    const email = `charge-${tag}-${i}@charge.test`;
    const r = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'adulte',
        email,
        password,
        country: 'FR',
        locale: 'fr',
        birthYear: 1990,
        pseudonym: `Charge ${i}`,
        consents: ['cgu'],
      }),
    });
    if (r.status !== 201) throw new Error(`inscription ${i} : ${r.status} ${await r.text()}`);
    const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]!;
    const me = (await (await api('/auth/me', {}, cookie)).json()) as {
      profiles: Array<{ id: string }>;
    };
    users.push({ email, cookie, profileId: me.profiles[0]!.id });
  }

  const ok = async (p: Promise<Response>, want = 200) => {
    const r = await p;
    await r.arrayBuffer();
    return r.status === want;
  };
  const day = new Date().toISOString().slice(0, 10);
  const rows: Summary[] = [];
  rows.push(await run('GET /health', VU, MS, () => ok(api('/health'))));
  rows.push(
    await run('GET /units/:id', VU, MS, (vu) => ok(api(`/units/${UNIT}`, {}, users[vu]!.cookie))),
  );
  rows.push(
    await run('GET /today/:id', VU, MS, (vu) =>
      ok(api(`/today/${users[vu]!.profileId}`, {}, users[vu]!.cookie)),
    ),
  );
  rows.push(
    await run('POST /attempts (5 événements)', VU, MS, (vu) => {
      const u = users[vu]!;
      const events = Array.from({ length: 5 }, () => ({
        id: randomUUID(),
        profileId: u.profileId,
        unitId: UNIT,
        eventType: 'trace',
        response: { item: 'ب', ok: true, day },
        deviceAt: new Date().toISOString(),
      }));
      return ok(api('/attempts', { method: 'POST', body: JSON.stringify({ events }) }, u.cookie));
    }),
  );
  rows.push(
    await run('GET /famille/messages', VU, MS, (vu) =>
      ok(api('/famille/messages', {}, users[vu]!.cookie)),
    ),
  );
  // connexion : argon2id volontairement coûteux ; chaque utilisateur virtuel se connecte à SON compte
  rows.push(
    await run('POST /auth/login', VU, MS, (vu) =>
      ok(
        api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: users[vu]!.email, password }),
        }),
      ),
    ),
  );

  console.log(`Charge : ${VU} utilisateurs virtuels, ${MS / 1000} s par route, ${BASE}\n`);
  console.log(table(rows, GOAL));
  if (rows.some((r) => r.p95 >= GOAL || r.errors > 0)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
