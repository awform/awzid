import { describe, expect, it } from 'vitest';
import { certQr, qrPath, verifyUrl } from '../src/qr.js';

describe('QR de vérification des certificats (calculé par l’API)', () => {
  it('adresse stable, tracé non vide avec la zone de silence', () => {
    const url = verifyUrl('https://app.exemple.org', 'AWF-EN1-2026-0001', 'ABCDEFGHJKMN');
    expect(url).toBe('https://app.exemple.org/verifier/AWF-EN1-2026-0001?c=ABCDEFGHJKMN');
    const q = qrPath(url);
    expect(q.size).toBeGreaterThanOrEqual(21 + 8);
    expect(q.d).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(qrPath(url)).toEqual(q);
  });
  it('origine contrôlée ; sans code de vérification, pas de QR', () => {
    const c = { number: 'AWF-EN1-2026-0001', verifCode: 'ABCDEFGHJKMN' };
    expect(certQr('https://app.exemple.org', c)?.d).toBeTruthy();
    expect(certQr('http://192.168.50.10:8080', c)).not.toBeNull();
    expect(certQr('javascript:alert(1)', c)).toBeNull();
    expect(certQr(undefined, c)).toBeNull();
    expect(certQr('https://app.exemple.org', { ...c, verifCode: null })).toBeNull();
  });
});
