/**
 * Essai de charge et scan de sécurité du 14/10/2026 : outils de mesure (parcours, paliers) et garde-fous (démonstration
 * locale seulement), scan ZAP actif limité à la démonstration, CSP stricte des documents statiques (règle ZAP 10038).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const lire = (p: string) => readFileSync(join(ROOT, p), 'utf8');
type Parcours = {
  percentile: (s: number[], p: number) => number;
  resume: (
    d: number[],
    e: number,
  ) => { n: number; erreurs: number; p50: number; p95: number; p99: number; max: number };
  cibleAutorisee: (u: string) => boolean;
};
const charger = async () =>
  (await import(join(ROOT, 'infra/charge/parcours.mjs'))) as unknown as Parcours;

describe('charge par parcours (14/10/2026)', () => {
  it('percentile et résumé : rang le plus proche, p99, erreurs', async () => {
    const { percentile, resume } = await charger();
    const s = Array.from({ length: 200 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(100);
    expect(percentile(s, 99)).toBe(198);
    expect(percentile([], 95)).toBe(0);
    expect(resume([30, 10, 20, 40], 1)).toEqual({
      n: 4,
      erreurs: 1,
      p50: 20,
      p95: 40,
      p99: 40,
      max: 40,
    });
    expect(resume([], 0)).toMatchObject({ n: 0, p99: 0, max: 0 });
  });

  it('garde-fou : la démonstration locale seulement, jamais une adresse externe ni la bêta', async () => {
    const { cibleAutorisee } = await charger();
    expect(cibleAutorisee('http://127.0.0.1')).toBe(true);
    expect(cibleAutorisee('http://localhost:3000')).toBe(true);
    expect(cibleAutorisee('http://[::1]')).toBe(true);
    for (const u of [
      'https://awzid.com',
      'http://10.0.0.4',
      'http://127.0.0.1.evil.example',
      'pas une adresse',
    ])
      expect(cibleAutorisee(u), u).toBe(false);
  });

  it('les outils refusent une cible externe et ne contiennent aucun secret', () => {
    const p = lire('infra/charge/parcours.mjs');
    expect(p).toContain('refusé');
    for (const f of [
      'parcours.mjs',
      'echantillon.mjs',
      'ecoute.mjs',
      'semis-comptes.mjs',
      'analyse.mjs',
    ]) {
      const t = lire(`infra/charge/${f}`);
      expect(t, f).not.toMatch(/AWFORM_[A-Z_]*(KEY|SECRET)\s*=\s*['"][^'"]{8,}/);
      expect(t, f).not.toMatch(
        /https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.(com|org|net|io|fr)/,
      );
    }
    // les comptes fictifs sont de la démonstration, jamais une vraie adresse
    expect(lire('infra/charge/semis-comptes.mjs')).toContain('@demo.awform.test');
    expect(lire('infra/charge/semis-comptes.mjs')).toContain("AWFORM_DEMO !== '1'");
  });

  it('les récitants externes (qf-*) ne sont jamais appelés par la charge', () => {
    expect(lire('infra/charge/parcours.mjs')).toContain("!id.startsWith('qf-')");
    expect(lire('infra/charge/parcours.mjs')).toContain("f.startsWith('/api/v1/')");
  });
});

describe('scan ZAP actif de la démonstration', () => {
  const z = lire('infra/securite/zap-actif.sh');
  it('cible locale fixe, compte fictif, routes destructrices et calcul coûteux exclus', () => {
    expect(z).toContain('CIBLE="http://127.0.0.1"');
    expect(z).toContain('@demo.awform.test');
    for (const exclu of [
      'auth/logout',
      'auth/password',
      'account/(delete|suppression',
      'ecoute/',
      '(admin|teacher|ecole|staff|relais|support|billing)',
    ])
      expect(z, exclu).toContain(exclu);
    expect(z).toContain('threadPerHost: 2');
    // le jeton de session est expurgé du journal du scan
    expect(z).toMatch(/sed .*awform_session=/);
  });
  it('le Caddyfile pose une CSP stricte sur /documents/* (ZAP 10038)', () => {
    const c = lire('infra/prod/Caddyfile');
    expect(c).toContain('@documents path /documents/*');
    expect(c).toContain('@apiracine path /api');
    expect(c).toMatch(
      /handle @api \{[^}]*Content-Security-Policy "default-src 'none'; frame-ancestors 'none'"/,
    );
    expect(c).toMatch(
      /header @documents Content-Security-Policy "default-src 'none'; style-src 'self';.*frame-ancestors 'none'"/,
    );
  });
});
