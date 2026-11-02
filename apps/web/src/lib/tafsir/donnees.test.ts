/**
 * « Sens et explication » — chargement d'une sourate à la demande (réseau et IndexedDB simulés) :
 *  - une requête par sourate et par profil, avec le profil dans l'en-tête `x-profil` ;
 *  - la copie gardée porte le PROFIL dans sa clé : sans réseau, un autre profil ne reçoit jamais la copie d'un adulte ;
 *  - interrupteur coupé ou non connecté (401, 403) : rien, et la copie gardée est effacée ;
 *  - sans réseau et sans copie : « hors_ligne » ; réponse inattendue : « indisponible » ;
 *  - le client ne filtre rien : il rend tel quel ce que le serveur a envoyé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kv = new Map<string, unknown>();
vi.mock('$lib/idb', () => ({
  kvGet: async (k: string) => kv.get(k),
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));

import { _viderPourTests, chargerSourate, cleCopie, type SourateTafsir } from './donnees';

const fictive = (s: number, extra = ''): SourateTafsir => ({
  v: 1,
  s,
  nom_ar: '[TEST]',
  nom_fr: '[TEST]',
  points: [],
  versets: [
    { a: 1, ar: 'اختبار', mots: [['اختبار', `[TEST] mot${extra}`]], sens: '[TEST]', p: [] },
  ],
});

interface Reponse {
  status: number;
  body?: unknown;
}
let reponses: Record<string, Reponse | 'reseau'>;
let appels: Array<{ url: string; init: RequestInit }>;

beforeEach(() => {
  kv.clear();
  _viderPourTests();
  appels = [];
  reponses = { '/api/v1/tafsir/sourates/112': { status: 200, body: fictive(112) } };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    const r = reponses[url];
    if (!r || r === 'reseau') throw new TypeError('réseau');
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('chargement à la demande', () => {
  it('une sourate à la fois, profil dans l’en-tête, cookie de session, copie gardée sous une clé qui porte le profil', async () => {
    const r = await chargerSourate(112, 'profil-adulte');
    expect(r).toEqual({ etat: 'ok', data: fictive(112) });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe('/api/v1/tafsir/sourates/112');
    expect(appels[0]!.init.credentials).toBe('same-origin');
    expect(appels[0]!.init.headers).toMatchObject({ 'x-profil': 'profil-adulte' });
    expect(kv.get(cleCopie(112, 'profil-adulte'))).toEqual(fictive(112));
    expect(cleCopie(112, 'profil-adulte')).not.toBe(cleCopie(112, 'profil-enfant'));
    expect(cleCopie(112)).toBe('tf:compte:112');
    // deuxième demande : en mémoire, aucune requête
    await chargerSourate(112, 'profil-adulte');
    expect(appels).toHaveLength(1);
  });

  it('demandes simultanées de la même sourate : une seule requête', async () => {
    await Promise.all([
      chargerSourate(112, 'p'),
      chargerSourate(112, 'p'),
      chargerSourate(112, 'p'),
    ]);
    expect(appels).toHaveLength(1);
  });

  it('sans réseau : la copie gardée pour CE profil sert ; jamais celle d’un autre profil', async () => {
    await chargerSourate(112, 'profil-adulte');
    _viderPourTests();
    reponses['/api/v1/tafsir/sourates/112'] = 'reseau';
    expect(await chargerSourate(112, 'profil-adulte')).toEqual({ etat: 'ok', data: fictive(112) });
    _viderPourTests();
    expect(await chargerSourate(112, 'profil-enfant')).toEqual({ etat: 'hors_ligne', data: null });
    expect(await chargerSourate(112)).toEqual({ etat: 'hors_ligne', data: null });
  });

  it('401 ou 403 : fermé, et la copie gardée est effacée (interrupteur coupé ou déconnexion)', async () => {
    await chargerSourate(112, 'p');
    expect(kv.get(cleCopie(112, 'p'))).toBeTruthy();
    for (const status of [401, 403]) {
      _viderPourTests();
      kv.set(cleCopie(112, 'p'), fictive(112));
      reponses['/api/v1/tafsir/sourates/112'] = { status };
      expect(await chargerSourate(112, 'p')).toEqual({ etat: 'ferme', data: null });
      expect(kv.get(cleCopie(112, 'p'))).toBeNull();
    }
    // la copie effacée ne ressert pas hors ligne
    _viderPourTests();
    reponses['/api/v1/tafsir/sourates/112'] = 'reseau';
    expect((await chargerSourate(112, 'p')).etat).toBe('hors_ligne');
  });

  it('404 ou erreur du serveur : indisponible (la copie gardée reste)', async () => {
    await chargerSourate(112, 'p');
    _viderPourTests();
    reponses['/api/v1/tafsir/sourates/112'] = { status: 404 };
    expect(await chargerSourate(112, 'p')).toEqual({ etat: 'indisponible', data: null });
    expect(kv.get(cleCopie(112, 'p'))).toEqual(fictive(112));
  });

  it('le client ne filtre rien : il rend tel quel ce que le serveur a envoyé', async () => {
    const x = fictive(112);
    x.points = [{ id: 0, titre: 't', texte: 'x', sources: [], plage: [[1, 1]] }];
    x.versets[0]!.p = [0];
    reponses['/api/v1/tafsir/sourates/112'] = { status: 200, body: x };
    expect((await chargerSourate(112, 'p')).data).toEqual(x);
  });
});
