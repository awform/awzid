import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTests, getAll, kvGet, kvSet } from './idb';
import {
  flushQueue,
  pendingCount,
  queueEvent,
  quarantined,
  reportSetAside,
  restreindreEnvoiAuProfil,
  retrySetAside,
  setAside,
} from './sync-core';
import fr from './i18n/messages/fr.json';
import en from '../../static/i18n/en.json';
import ar from '../../static/i18n/ar.json';
import es from '../../static/i18n/es.json';
import de from '../../static/i18n/de.json';

const base = {
  unitId: 'en1.l01',
  eventType: 'reponse' as const,
  exerciseId: 'e',
  exerciseHash: 'h',
  itemIndex: 0,
  response: { value: true },
  edition: 'x',
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });

describe('appareil partagé : la session limitée d’un enfant ne voit que SON profil (file IndexedDB)', () => {
  beforeEach(() => {
    restreindreEnvoiAuProfil(null);
    globalThis.indexedDB = new IDBFactory();
    _resetDbForTests();
  });

  it('file, mises de côté et quarantaine : ni comptées ni montrées pour les autres ; tout est intact au retour', async () => {
    const moi = await queueEvent({ ...base, profileId: 'moi' });
    const frere = await queueEvent({ ...base, profileId: 'frere' });
    // le serveur refuse les deux réponses : mises de côté (sans restriction, avant la session de l'enfant)
    await flushQueue((async (_u: RequestInfo | URL, init?: RequestInit) => {
      const evs = (JSON.parse(String(init?.body)) as { events: Array<{ id: string }> }).events;
      return json({
        accepted: [],
        duplicates: [],
        rejected: evs.map((e) => ({ id: e.id, reason: 'empreinte', code: 'version_inconnue' })),
      });
    }) as typeof fetch);
    await queueEvent({ ...base, profileId: 'frere' });
    await queueEvent({ ...base, profileId: 'moi' });
    await kvSet('syncQuarantine', [
      { ...frere, id: 'q-frere' },
      { ...moi, id: 'q-moi' },
    ]);
    const avant = {
      aside: JSON.stringify(await kvGet('syncSetAside')),
      quarantine: JSON.stringify(await kvGet('syncQuarantine')),
      events: (await getAll<{ id: string }>('events')).map((e) => e.id).sort(),
    };
    expect((await setAside()).map((s) => s.ev.profileId).sort()).toEqual(['frere', 'moi']);

    restreindreEnvoiAuProfil('moi');
    expect(await pendingCount()).toBe(1);
    expect((await setAside()).map((s) => s.ev.profileId)).toEqual(['moi']);
    expect((await quarantined()).map((e) => e.id)).toEqual(['q-moi']);
    // envoi et renvois : seul le profil de l'enfant part, le serveur voit un seul profil
    const vus: string[] = [];
    const serveur = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const evs = (
        JSON.parse(String(init?.body)) as { events: Array<{ id: string; profileId: string }> }
      ).events;
      for (const e of evs) vus.push(e.profileId);
      return json({ accepted: [], duplicates: [], rejected: [] });
    }) as typeof fetch;
    const r = await flushQueue(serveur);
    expect(r).toMatchObject({ remaining: 1, setAside: 1 });
    await retrySetAside(serveur, '', true);
    expect(await reportSetAside((async () => json({})) as unknown as typeof fetch)).toBe(true);
    expect(new Set(vus)).toEqual(new Set(['moi']));

    // retour à une autre session : les entrées du frère n'ont rien perdu ni changé (pas de « signalé » à sa place)
    restreindreEnvoiAuProfil('frere');
    const aside = await setAside();
    expect(aside).toHaveLength(1);
    expect(aside[0]?.ev.id).toBe(frere.id);
    expect(aside[0]?.reported).toBeUndefined();
    expect(aside[0]?.tries).toBe(1);
    restreindreEnvoiAuProfil(null);
    expect(await setAside()).toHaveLength(2);
    expect(await quarantined()).toHaveLength(2);
    expect(await pendingCount()).toBe(2);
    expect((await getAll<{ id: string }>('events')).map((e) => e.id).sort()).toEqual(avant.events);
    expect(JSON.stringify(await kvGet('syncQuarantine'))).toBe(avant.quarantine);
    expect(avant.aside).toContain(frere.id);
  });

  it('une mise de côté pendant la session de l’enfant ne supprime pas celles du frère', async () => {
    await queueEvent({ ...base, profileId: 'frere' });
    const refuse = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const evs = (JSON.parse(String(init?.body)) as { events: Array<{ id: string }> }).events;
      return json({
        accepted: [],
        duplicates: [],
        rejected: evs.map((e) => ({ id: e.id, reason: 'x', code: 'version_inconnue' })),
      });
    }) as typeof fetch;
    await flushQueue(refuse);
    restreindreEnvoiAuProfil('moi');
    await queueEvent({ ...base, profileId: 'moi' });
    await flushQueue(refuse);
    expect((await setAside()).map((s) => s.ev.profileId)).toEqual(['moi']);
    restreindreEnvoiAuProfil(null);
    expect((await setAside()).map((s) => s.ev.profileId).sort()).toEqual(['frere', 'moi']);
  });
});

describe('retrait de l’accès d’un enfant : textes dans les 5 langues', () => {
  it('chaque langue a les quatre textes, avec le nom de l’enfant dans la confirmation', () => {
    const cles = [
      'profils.acces_retirer',
      'profils.acces_retirer_confirm',
      'profils.acces_retirer_oui',
      'profils.acces_retire',
    ];
    for (const [langue, m] of Object.entries({ fr, en, ar, es, de }) as Array<
      [string, Record<string, string>]
    >)
      for (const c of cles) {
        expect(m[c], `${langue} ${c}`).toBeTruthy();
        if (c.endsWith('_confirm')) expect(m[c], langue).toContain('{nom}');
      }
  });
});
