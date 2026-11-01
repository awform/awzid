import { describe, expect, it } from 'vitest';
import { fautCodeParent, profilsAffiches } from './bascule';
import { peutBasculer, type Me, type ProfileInfo } from './session';

const p = (id: string, kind: ProfileInfo['kind'], isOwner = false): ProfileInfo => ({
  id,
  kind,
  pseudonym: id,
  birthYear: null,
  avatar: null,
  levelCode: null,
  isOwner,
});
const me = (kind: Me['account']['kind'], profiles: ProfileInfo[], enfantSession = false) =>
  ({ account: { kind }, profiles, enfantSession }) as unknown as Me;

describe('bascule Moi / enfants (V2-4)', () => {
  it('un parent avec « Moi » et un enfant bascule ; pas un parent d’un seul profil', () => {
    expect(peutBasculer(me('parent', [p('moi', 'adulte', true), p('amina', 'enfant')]))).toBe(true);
    expect(peutBasculer(me('parent', [p('a', 'enfant'), p('b', 'enfant')]))).toBe(true);
    expect(peutBasculer(me('parent', [p('a', 'enfant')]))).toBe(false);
    expect(peutBasculer(null)).toBe(false);
  });
  it('jamais pour un adulte seul, un enseignant, ni la session limitée d’un enfant', () => {
    const deux = [p('a', 'enfant'), p('b', 'enfant')];
    expect(peutBasculer(me('adulte', deux))).toBe(false);
    expect(peutBasculer(me('enseignant', deux))).toBe(false);
    expect(peutBasculer(me('parent', deux, true))).toBe(false);
  });
  it('« Moi » est affiché en premier', () => {
    const l = profilsAffiches([p('a', 'enfant'), p('moi', 'adulte', true), p('b', 'ado')]);
    expect(l.map((x) => x.id)).toEqual(['moi', 'a', 'b']);
  });
  it('code parent : seulement s’il existe et que le profil actif est un enfant ou un ado', () => {
    expect(fautCodeParent(true, p('a', 'enfant'))).toBe(true);
    expect(fautCodeParent(true, p('a', 'ado'))).toBe(true);
    expect(fautCodeParent(true, p('moi', 'adulte', true))).toBe(false);
    expect(fautCodeParent(false, p('a', 'enfant'))).toBe(false);
    expect(fautCodeParent(true, null)).toBe(false);
  });
});
