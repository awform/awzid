import { describe, expect, it } from 'vitest';
import { qrPath, verifyUrl } from './qrsvg';

describe('QR de vérification des certificats', () => {
  it('adresse stable, tracé non vide avec la zone de silence', () => {
    const url = verifyUrl('https://app.exemple.org', 'AWF-EN1-2026-0001', 'ABCDEFGHJKMN');
    expect(url).toBe('https://app.exemple.org/verifier/AWF-EN1-2026-0001?c=ABCDEFGHJKMN');
    const q = qrPath(url);
    expect(q.size).toBeGreaterThanOrEqual(21 + 8);
    expect(q.d).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(qrPath(url)).toEqual(q);
  });
});
