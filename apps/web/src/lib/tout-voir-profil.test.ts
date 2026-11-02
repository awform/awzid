import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoProfileFor } from './attempts';
import { kvSet } from './idb';
import type { Me } from './session';

/** Mode « tout voir » : l'exploration se fait SANS profil, donc rien n'est enregistré (progression, tentative, statistique). */
const profil = {
  id: 'p1',
  kind: 'adulte' as const,
  pseudonym: 'Moi',
  birthYear: 1990,
  avatar: null,
  levelCode: 'ad1',
};
const compte = (extra: Partial<Me>): Me =>
  ({
    account: { id: 'a', kind: 'adulte', email: 'a…@x.org' },
    profiles: [profil],
    mfaRequired: false,
    mfaVerified: true,
    ...extra,
  }) as unknown as Me;

describe('demoProfileFor et le mode « tout voir »', () => {
  beforeEach(async () => {
    await kvSet('me', null);
    await kvSet('activeProfile', null);
  });

  it('un adulte autonome garde son profil unique (rien ne change)', async () => {
    await kvSet('me', compte({}));
    expect((await demoProfileFor('ad1'))?.id).toBe('p1');
  });

  it('avec le mode, jamais de profil : même si le compte en avait un', async () => {
    await kvSet('me', compte({ toutVoir: true }));
    expect(await demoProfileFor('ad1')).toBeNull();
  });

  it('le drapeau doit être strictement vrai', async () => {
    await kvSet('me', compte({ toutVoir: false }));
    expect((await demoProfileFor('ad1'))?.id).toBe('p1');
  });
});
