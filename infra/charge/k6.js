/* global __ENV, __VU */
// Scénario k6 (lot 24, V1-h ; CDC : p95 < 500 ms) — routes chaudes de l'API, contre une instance de TEST.
//   k6 run -e BASE=http://127.0.0.1:3100 -e PASSWORD='…' -e VU=20 infra/charge/k6.js
// Les comptes « charge-<n>@charge.test » (n = 0 … VU-1) sont créés par setup() s'ils n'existent pas
// (l'API de test doit accepter VU inscriptions : AWFORM_SIGNUP_PER_HOUR). Mot de passe : variable PASSWORD,
// jamais écrit ici. Équivalent sans k6 : apps/api/dist/cli/charge.js (voir infra/charge/README.md).
import http from 'k6/http';
import { check } from 'k6';

const BASE = (__ENV.BASE || 'http://127.0.0.1:3100') + '/api/v1';
const VU = Number(__ENV.VU || 20);
const UNIT = __ENV.UNIT || 'en1.l01';
const PASSWORD = __ENV.PASSWORD;
const H = { 'content-type': 'application/json', 'x-awform': '1' };

export const options = {
  scenarios: {
    routes: { executor: 'constant-vus', vus: VU, duration: __ENV.DUREE || '1m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{route:health}': ['p(95)<500'],
    'http_req_duration{route:login}': ['p(95)<500'],
    'http_req_duration{route:unit}': ['p(95)<500'],
    'http_req_duration{route:today}': ['p(95)<500'],
    'http_req_duration{route:attempts}': ['p(95)<500'],
    'http_req_duration{route:messages}': ['p(95)<500'],
  },
};

export function setup() {
  if (!PASSWORD) throw new Error('PASSWORD requis');
  const users = [];
  for (let i = 0; i < VU; i++) {
    const email = `charge-${i}@charge.test`;
    http.post(
      `${BASE}/auth/signup`,
      JSON.stringify({
        kind: 'adulte',
        email,
        password: PASSWORD,
        country: 'FR',
        locale: 'fr',
        birthYear: 1990,
        pseudonym: `Charge ${i}`,
        consents: ['cgu'],
      }),
      { headers: H },
    );
    users.push(email);
  }
  return { users };
}

function uuid() {
  // identifiant d'événement suffisamment unique pour un test de charge
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

export default function (data) {
  const email = data.users[(__VU - 1) % data.users.length];
  check(http.get(`${BASE}/health`, { tags: { route: 'health' } }), {
    santé: (r) => r.status === 200,
  });
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: H,
    tags: { route: 'login' },
  });
  check(login, { connexion: (r) => r.status === 200 });
  const me = http.get(`${BASE}/auth/me`, { headers: H });
  const profileId = me.json('profiles.0.id');
  check(http.get(`${BASE}/units/${UNIT}`, { headers: H, tags: { route: 'unit' } }), {
    leçon: (r) => r.status === 200,
  });
  check(http.get(`${BASE}/today/${profileId}`, { headers: H, tags: { route: 'today' } }), {
    'séance du jour': (r) => r.status === 200,
  });
  const day = new Date().toISOString().slice(0, 10);
  const events = [];
  for (let i = 0; i < 5; i++)
    events.push({
      id: uuid(),
      profileId,
      unitId: UNIT,
      eventType: 'trace',
      response: { item: 'ب', ok: true, day },
      deviceAt: new Date().toISOString(),
    });
  check(
    http.post(`${BASE}/attempts`, JSON.stringify({ events }), {
      headers: H,
      tags: { route: 'attempts' },
    }),
    { synchronisation: (r) => r.status === 200 },
  );
  check(http.get(`${BASE}/famille/messages`, { headers: H, tags: { route: 'messages' } }), {
    messages: (r) => r.status === 200,
  });
}
