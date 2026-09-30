/** Lot 23 — codes d'activation imprimés : format, contrôle, normalisation, empreinte, prolongation, droits. */
import { describe, expect, it } from 'vitest';
import {
  canOpenWithPacks,
  checkChar,
  CODE_ALPHABET,
  entitlementOf,
  generateCode,
  hashCode,
  normalizeCode,
  passEnd,
} from '../src/index.js';

describe('lot 23 — codes d’activation', () => {
  it('generateCode : forme imprimée AWZ-XXXX-XXXX-XXXXC, alphabet sans I, L, O, U', () => {
    const c = generateCode();
    expect(c).toMatch(/^AWZ-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU]/);
    expect(new Set(Array.from({ length: 200 }, () => generateCode())).size).toBe(200);
  });
  it('checkChar : détecte une faute de frappe et une inversion', () => {
    const body = '0123456789AB';
    const ok = body + checkChar(body);
    expect(normalizeCode(ok)).toBe(ok);
    expect(normalizeCode('1123456789AB' + checkChar(body))).toBeNull();
    expect(normalizeCode('1023456789AB' + checkChar(body))).toBeNull();
  });
  it('normalizeCode : minuscules, tirets, espaces, O→0, I/L→1, préfixe', () => {
    const c = generateCode();
    const n = normalizeCode(c)!;
    expect(n).toHaveLength(13);
    expect(normalizeCode(c.toLowerCase().replace(/-/g, ' '))).toBe(n);
    expect(normalizeCode(c.replace(/0/g, 'O'))).toBe(n);
    expect(normalizeCode('AWZ-1234')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });
  it('hashCode : empreinte stable, différente du code', () => {
    expect(hashCode('ABC')).toBe(hashCode('ABC'));
    expect(hashCode('ABC')).not.toContain('ABC');
    expect(hashCode('ABC')).toHaveLength(64);
  });
  it('passEnd : 12 mois, prolongés depuis la fin de l’accès en cours', () => {
    const now = new Date('2026-09-30T00:00:00Z');
    expect(passEnd(null, 12, now).end.toISOString()).toBe('2027-09-30T00:00:00.000Z');
    const cur = new Date('2027-03-01T00:00:00Z');
    expect(passEnd(cur, 12, now)).toEqual({ start: cur, end: new Date('2028-03-01T00:00:00Z') });
    expect(passEnd(new Date('2026-01-01T00:00:00Z'), 1, now).start).toEqual(now);
  });
  it('canOpenWithPacks : le niveau du code s’ouvre en entier, les autres restent en découverte', () => {
    const e = { ...entitlementOf([]), packs: ['en1'] };
    expect(canOpenWithPacks(e, { n: 30, levelCode: 'en1' })).toBe(true);
    expect(canOpenWithPacks(e, { n: 30, levelCode: 'ad1' })).toBe(false);
    expect(canOpenWithPacks(e, { n: 2, levelCode: 'ad1' })).toBe(true);
    expect(canOpenWithPacks(entitlementOf([]), { n: 30 })).toBe(false);
  });
});
