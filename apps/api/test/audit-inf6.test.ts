/**
 * Audit INF-6 : `X-Forwarded-For` falsifiable. Derrière UN mandataire (Caddy), l'adresse du client est la
 * DERNIÈRE ajoutée par Caddy ; un en-tête forgé par le client (à gauche) ne change plus l'adresse vue par
 * l'API : la limite de 20 inscriptions par heure et par adresse tient. Caddy en bordure ne fait confiance à
 * aucun en-tête reçu (`trusted_proxies` retiré).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit INF-6 — adresse du client derrière le mandataire', () => {
  let c: Ctx;
  const before = process.env.TRUST_PROXY;
  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    if (before === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = before;
    await c?.app.close();
    await c?.h.close();
  });

  it('un en-tête forgé à chaque appel ne contourne plus la limite d’inscriptions', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 23; i++) {
      const r = await c.app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        headers: { 'x-awform': '1', 'x-forwarded-for': `203.0.113.${i}, 198.51.100.7` },
        payload: {
          kind: 'parent',
          birthYear: 1985,
          email: `inf6-${i}@exemple.org`,
          password: PW,
          country: 'FR',
          consents: ['cgu'],
        },
      });
      statuses.push(r.statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it('Caddy (bordure) ne fait confiance à aucun X-Forwarded-For reçu', () => {
    const caddy = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'infra', 'prod', 'Caddyfile'),
      'utf8',
    );
    expect(caddy).not.toMatch(/trusted_proxies/);
  });
});
