/**
 * Lot 24 (V1-h) — lanceur de charge : percentiles, résumé, boucle parallèle, tableau (sans base).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { percentile, run, summarize, table } from '../src/cli/charge.js';

describe('lot 24 — lanceur de charge', () => {
  it('percentile : rang le plus proche, bornes, liste vide', () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(95);
    expect(percentile(s, 100)).toBe(100);
    expect(percentile(s, 0)).toBe(1);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBe(0);
  });

  it('summarize : trie, arrondit, débit par seconde', () => {
    const r = summarize('x', [30, 10, 20, 40], 1, 2);
    expect(r).toEqual({ route: 'x', n: 4, errors: 1, p50: 20, p95: 40, max: 40, rps: 2 });
    expect(summarize('vide', [], 0, 0)).toMatchObject({ n: 0, p95: 0, rps: 0 });
  });

  it('run : boucles parallèles contre un serveur local, erreurs comptées', async () => {
    let hits = 0;
    const srv = createServer((req, res) => {
      hits++;
      res.statusCode = req.url === '/ko' ? 500 : 200;
      res.end('ok');
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const good = await run('ok', 4, 200, async () => (await fetch(`${base}/ok`)).status === 200);
      expect(good.n).toBeGreaterThan(4);
      expect(good.errors).toBe(0);
      expect(good.p95).toBeGreaterThanOrEqual(good.p50);
      const bad = await run('ko', 2, 100, async () => (await fetch(`${base}/ko`)).ok);
      expect(bad.errors).toBe(bad.n);
      const thrown = await run('exception', 1, 50, () => Promise.reject(new Error('réseau')));
      expect(thrown.errors).toBe(thrown.n);
      expect(hits).toBe(good.n + bad.n);
    } finally {
      srv.close();
    }
  });

  it('table : une ligne par route, objectif signalé', () => {
    const t = table(
      [
        { route: 'a', n: 10, errors: 0, p50: 5, p95: 9, max: 12, rps: 100 },
        { route: 'b', n: 10, errors: 0, p50: 400, p95: 700, max: 900, rps: 3 },
      ],
      500,
    );
    const lines = t.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatch(/\| a \|.*\| oui \|$/);
    expect(lines[3]).toMatch(/\| b \|.*\| NON \|$/);
  });
});
