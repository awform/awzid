import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoProfileFor } from './attempts';
import { kvGet, kvSet } from './idb';
import { cachedMe, fetchMe, toutVoirEnLigne, type Me } from './session';

/**
 * Mode « tout voir » : l'exploration se fait SANS profil (rien n'est enregistré), et le mode ne vient JAMAIS de la copie de
 * l'appareil (hors ligne) : seulement d'une réponse du réseau.
 */
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
const reseau = (corps: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(corps), { status })),
  );
const hors = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Promise.reject(new TypeError('hors ligne'))),
  );

describe('demoProfileFor, fetchMe et le mode « tout voir »', () => {
  beforeEach(async () => {
    await kvSet('me', null);
    await kvSet('activeProfile', null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('un adulte autonome garde son profil unique (rien ne change)', async () => {
    await kvSet('me', compte({}));
    expect((await demoProfileFor('ad1'))?.id).toBe('p1');
  });

  it('réponse du réseau avec le mode : jamais de profil, même si le compte en avait un', async () => {
    reseau(compte({ toutVoir: true }));
    await fetchMe();
    expect(toutVoirEnLigne()).toBe(true);
    expect(await demoProfileFor('ad1')).toBeNull();
  });

  it('le drapeau doit être strictement vrai', async () => {
    reseau(compte({ toutVoir: false }));
    await fetchMe();
    expect(toutVoirEnLigne()).toBe(false);
    expect((await demoProfileFor('ad1'))?.id).toBe('p1');
  });

  it('hors ligne : la copie de l’appareil ne donne JAMAIS le mode, même si elle le disait', async () => {
    await kvSet('me', compte({ toutVoir: true }));
    expect((await cachedMe())?.toutVoir).toBe(false);
    hors();
    const me = await fetchMe();
    expect(me?.toutVoir).toBe(false);
    expect(toutVoirEnLigne()).toBe(false);
  });

  it('dès que le réseau ne donne plus le mode (déconnexion, autre compte) : la copie des séances sensibles est effacée', async () => {
    await kvSet('madjaliss-differe:risala:tout', { v: 2 });
    await kvSet('madjaliss-differe:risala:p3', { v: 2 });
    reseau(compte({ toutVoir: true }));
    await fetchMe();
    expect(await kvGet('madjaliss-differe:risala:tout')).toBeDefined();
    reseau(compte({ toutVoir: false }));
    await fetchMe();
    expect(await kvGet('madjaliss-differe:risala:tout')).toBeUndefined();
    expect(await kvGet('madjaliss-differe:risala:p3')).toBeDefined(); // le différé ordinaire n'est pas concerné ici
    await kvSet('madjaliss-differe:risala:tout', { v: 2 });
    reseau({ anonyme: true });
    await fetchMe();
    expect(await kvGet('madjaliss-differe:risala:tout')).toBeUndefined();
  });
});
