import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from './symbols';

describe('SHA-256 de secours (pages en HTTP simple, sans crypto.subtle)', () => {
  it('identique à la référence pour des tailles variées', () => {
    for (const s of [
      '',
      'abc',
      'x'.repeat(55),
      'y'.repeat(56),
      'z'.repeat(64),
      'profil:etoile-lune-soleil-goutte',
      'é'.repeat(200),
    ]) {
      const data = new TextEncoder().encode(s);
      const ref = createHash('sha256').update(data).digest('hex');
      const got = [...sha256(data)].map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(got, s.slice(0, 10)).toBe(ref);
    }
  });
});
