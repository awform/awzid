/**
 * « Mots du Coran » — chargement des données et état du lecteur (réseau et IndexedDB simulés) :
 *  - ce que l'élève sait (niveau, leçons faites) + les mots de la sourate → les mots à souligner ;
 *  - interrupteur coupé (403) ou autre filière : rien, et la copie gardée est effacée ;
 *  - sans réseau : la dernière copie gardée sert ;
 *  - le soulignement ne démarre qu'une fois activé (réglage allumé et données prêtes) ;
 *  - redemandé au plus une fois par minute.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kv = new Map<string, unknown>();
vi.mock('$lib/idb', () => ({
  kvGet: async (k: string) => kv.get(k),
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));
vi.mock('$lib/attempts', () => ({
  demoProfileFor: async () => ({ id: 'p1', kind: 'adulte' }),
}));

import { _viderPourTests, chargerRangs, chargerSourate } from './donnees';
import { _reinitialiser, activer, connusFn, demander, etat, initialiser } from './etat.svelte';

const DATA = fileURLToPath(
  new URL('../../../../../packages/coran-mots-data/data/', import.meta.url),
);
const json = (nom: string) => JSON.parse(readFileSync(join(DATA, nom), 'utf8'));
const rangs = json('rangs.json');
const sourate112 = json('sourates/112.json');

interface Reponse {
  status: number;
  body?: unknown;
}
let reponses: Record<string, Reponse | 'reseau'>;
let appels: string[];
const connusAdulte = { disponible: true, piste: 'ad', niveau: 2, unites: ['ad2.l01'], valides: [] };

beforeEach(() => {
  kv.clear();
  _viderPourTests();
  _reinitialiser();
  appels = [];
  reponses = {
    '/api/v1/coran-mots/rangs': { status: 200, body: rangs },
    '/api/v1/coran-mots/sourates/112': { status: 200, body: sourate112 },
    '/api/v1/profiles/p1/coran-mots/connus': { status: 200, body: connusAdulte },
  };
  vi.stubGlobal('fetch', async (url: string) => {
    appels.push(url);
    const r = reponses[url];
    if (!r || r === 'reseau') throw new TypeError('réseau');
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('chargement et état du lecteur', () => {
  it('élève de la filière Adultes : ses rangs connus et les mots de la sourate sont chargés à la demande', async () => {
    expect(await initialiser()).toBe(true);
    expect(etat.pret).toBe(true);
    expect(etat.niveau).toBe(2);
    // niveau 2 : tout ce que le niveau 1 enseigne est connu, rien de plus (aucune leçon du niveau 2 faite sauf l01)
    expect(etat.connus!.size).toBeGreaterThan(40);
    // rien n'est demandé tant qu'on ne les veut pas
    expect(appels).not.toContain('/api/v1/coran-mots/sourates/112');
    demander(112);
    await attendre();
    await attendre();
    expect(etat.suras[112]).toEqual(sourate112.v);
    expect(appels.filter((a) => a.endsWith('/sourates/112'))).toHaveLength(1);
    demander(112); // déjà là : aucune nouvelle demande
    await attendre();
    expect(appels.filter((a) => a.endsWith('/sourates/112'))).toHaveLength(1);
  });

  it('le soulignement ne démarre qu’une fois activé ; sourate non chargée : rien, puis elle est demandée', async () => {
    await initialiser();
    const ws = ['x', 'y', 'z', 'w'];
    expect(connusFn(112, 2, ws)).toBeUndefined(); // pas activé
    activer(true);
    expect(connusFn(112, 1, ws)).toBeUndefined(); // sourate pas encore là
    await attendre();
    await attendre();
    await attendre();
    expect(etat.suras[112]).toBeDefined();
    const mots = sourate112.v[1]!.length; // 112:2 : « ٱللَّهُ ٱلصَّمَدُ »
    const f = connusFn(
      112,
      2,
      Array.from({ length: mots }, (_, i) => `m${i}`),
    );
    expect(f).toHaveLength(mots);
    expect(f!.every((b) => typeof b === 'boolean')).toBe(true);
    // nombre de mots différent de celui des données : rien n'est souligné
    expect(
      connusFn(112, 2, [...Array.from({ length: mots + 1 }, (_, i) => `m${i}`)]),
    ).toBeUndefined();
    activer(false);
    expect(connusFn(112, 2, ws)).toBeUndefined();
  });

  it('interrupteur coupé (403) ou non connecté (401) : fonction indisponible, copie gardée effacée', async () => {
    await initialiser();
    expect(kv.get('cm:rangs')).toBeTruthy();
    reponses['/api/v1/profiles/p1/coran-mots/connus'] = { status: 403 };
    reponses['/api/v1/coran-mots/rangs'] = { status: 403 };
    _viderPourTests();
    _reinitialiser();
    expect(await initialiser()).toBe(false);
    expect(etat.pret).toBe(false);
    expect(kv.get('cm:rangs')).toBeNull();
    expect(kv.get('cm:c:p1')).toBeNull();
  });

  it('autre filière que les livres Adultes ou aucun niveau : indisponible, jamais un chiffre inventé', async () => {
    reponses['/api/v1/profiles/p1/coran-mots/connus'] = {
      status: 200,
      body: { disponible: false, raison: 'filiere', piste: 'en' },
    };
    expect(await initialiser()).toBe(false);
    expect(etat.connus).toBeNull();
  });

  it('sans réseau : la dernière copie gardée sur l’appareil sert', async () => {
    await initialiser();
    demander(112);
    await attendre();
    await attendre();
    // coupure du réseau, nouvelle ouverture du lecteur
    for (const k of Object.keys(reponses)) reponses[k] = 'reseau';
    _viderPourTests();
    _reinitialiser();
    expect(await initialiser()).toBe(true);
    expect(etat.niveau).toBe(2);
    expect((await chargerSourate(112, 'p1'))?.v).toEqual(sourate112.v);
    expect((await chargerRangs('p1'))?.length).toBe(rangs.length);
    // jamais de copie : rien (pas d'erreur)
    kv.clear();
    _viderPourTests();
    _reinitialiser();
    expect(await initialiser()).toBe(false);
  });

  it('redemandé au plus une fois par minute (l’élève qui revient d’une leçon retrouve un chiffre à jour)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    await initialiser();
    await initialiser();
    expect(appels.filter((a) => a.endsWith('/connus'))).toHaveLength(1);
    reponses['/api/v1/profiles/p1/coran-mots/connus'] = {
      status: 200,
      body: { ...connusAdulte, unites: ['ad2.l01', 'ad2.l02', 'ad2.l03'] },
    };
    const avant = etat.connus!.size;
    vi.setSystemTime(new Date('2026-10-25T12:01:30Z'));
    await initialiser();
    expect(appels.filter((a) => a.endsWith('/connus'))).toHaveLength(2);
    expect(etat.connus!.size).toBeGreaterThanOrEqual(avant);
  });
});
