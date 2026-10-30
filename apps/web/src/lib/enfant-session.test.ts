import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTests } from './idb';
import { flushQueue, pendingCount, queueEvent, restreindreEnvoiAuProfil } from './sync-core';
import { fonctionsEtat } from '$lib/fonctions.svelte';
import { lienOuvert } from './enfant-session';
import { navFor } from '$lib/ui/audience';
import { navPourEnfant, pageOuverteAEnfant } from './enfant-session';

describe('interface en session limitée : enfant et ado', () => {
  const FERMEES = [
    '/compte',
    '/compte/securite',
    '/profils',
    '/abonnement',
    '/offres',
    '/famille',
    '/acces/accords',
    '/ecole',
    '/enseignant',
    '/admin',
    '/messages',
    '/ma-classe',
    '/recital',
    '/suivi',
    '/cahier-parler',
    '/inscription',
  ];
  it('réglages, profils, compte, paiements, accords, famille, école, messages : fermés à l’enfant ET à l’ado', () => {
    for (const p of FERMEES) {
      expect(pageOuverteAEnfant(p), `enfant ${p}`).toBe(false);
      expect(pageOuverteAEnfant(p, true), `ado ${p}`).toBe(false);
    }
  });
  it('« Plus » : fermé à l’enfant, ouvert à l’ado ; écriture, révisions, lectures : ouverts aux deux', () => {
    expect(pageOuverteAEnfant('/plus')).toBe(false);
    expect(pageOuverteAEnfant('/plus', true)).toBe(true);
    for (const p of [
      '/',
      '/aujourdhui',
      '/lecons/en1',
      '/coran',
      '/coran/ecouter',
      '/vivre',
      '/sciences',
      '/ecriture',
      '/revisions',
      '/lectures',
      '/hifz',
      '/hors-ligne',
      '/aide',
      '/connexion',
    ]) {
      expect(pageOuverteAEnfant(p), `enfant ${p}`).toBe(true);
      expect(pageOuverteAEnfant(p, true), `ado ${p}`).toBe(true);
    }
  });
  it('navigation : l’ado garde « Plus », l’enfant la version épurée ; jamais d’onglet vers une page fermée', () => {
    expect(navPourEnfant(navFor('enfant')).map((x) => x.id)).toEqual([
      'aujourdhui',
      'arabe',
      'coran',
      'vivre',
      'sciences',
    ]);
    expect(navPourEnfant(navFor('ado'), true).map((x) => x.id)).toContain('plus');
    expect(navPourEnfant(navFor('ado'), false).map((x) => x.id)).not.toContain('plus');
    for (const a of ['enfant', 'ado', 'adulte'] as const)
      for (const ado of [false, true])
        for (const x of navPourEnfant(navFor(a), ado))
          expect(pageOuverteAEnfant(x.href, ado), `${a} ${x.id}`).toBe(true);
  });
});

describe('fonctions en session limitée', () => {
  it('tuteur IA : fermé à l’enfant, fermé à l’ado sans accord parental, ouvert à l’ado avec accord', async () => {
    const { fn, fonctionsEtat } = await import('$lib/fonctions.svelte');
    const ouvertes = (ks: Parameters<typeof fn>[0][]) => ks.map((k) => fn(k));
    fonctionsEtat.restreint = true;
    try {
      for (const [ado, tuteurIa, attendu] of [
        [false, false, false],
        [false, true, false],
        [true, false, false],
        [true, true, true],
      ] as const) {
        fonctionsEtat.ado = ado;
        fonctionsEtat.tuteurIa = tuteurIa;
        // l'ouverture dépend aussi du registre des fonctions (essais fermés par défaut) : si fermée, jamais ouverte
        const [a, b] = ouvertes(['tuteur', 'tuteur_ia']);
        if (!attendu) expect([a, b], `ado=${ado} accord=${tuteurIa}`).toEqual([false, false]);
      }
      // jamais ouvertes pour l'enfant, même avec un accord enregistré
      fonctionsEtat.ado = false;
      fonctionsEtat.tuteurIa = true;
      expect(
        ouvertes(['tuteur', 'tuteur_ia', 'avis', 'khatma_wird', 'shazam_coran', 'hifz_classe']),
      ).toEqual([false, false, false, false, false, false]);
      // le signalement par motifs reste ouvert (ni texte libre, ni extrait : voir Signaler)
      fonctionsEtat.v.signaler = true;
      expect(fn('signaler')).toBe(true);
      // ado + accord : la restriction est levée (le registre décide ensuite)
      fonctionsEtat.ado = true;
      fonctionsEtat.v.tuteur = true;
      fonctionsEtat.v.tuteur_ia = true;
      expect(ouvertes(['tuteur', 'tuteur_ia'])).toEqual([true, true]);
      fonctionsEtat.tuteurIa = false;
      expect(ouvertes(['tuteur', 'tuteur_ia'])).toEqual([false, false]);
    } finally {
      fonctionsEtat.restreint = false;
      fonctionsEtat.ado = false;
      fonctionsEtat.tuteurIa = false;
    }
  });
});

describe('v4, liens et file d’envoi en session limitée', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    _resetDbForTests();
  });
  it('lienOuvert : tout hors session limitée ; enfant épuré ; ado avec Plus réduit (ni suivi, ni compte, ni ma classe)', () => {
    fonctionsEtat.restreint = false;
    for (const h of ['/suivi', '/compte', '/ma-classe', '/plus'])
      expect(lienOuvert(h), h).toBe(true);
    fonctionsEtat.restreint = true;
    try {
      fonctionsEtat.ado = false;
      for (const h of ['/suivi', '/compte', '/ma-classe', '/plus'])
        expect(lienOuvert(h), `enfant ${h}`).toBe(false);
      for (const h of [
        '/lectures',
        '/sciences',
        '/ecriture',
        '/revisions',
        '/hors-ligne',
        '/madjaliss',
      ])
        expect(lienOuvert(h), `enfant ${h}`).toBe(true);
      fonctionsEtat.ado = true;
      expect(lienOuvert('/plus')).toBe(true);
      for (const h of ['/suivi', '/suivi/rapport', '/compte', '/ma-classe'])
        expect(lienOuvert(h), `ado ${h}`).toBe(false);
      for (const h of [
        '/lectures',
        '/sciences',
        '/ecriture',
        '/revisions',
        '/hors-ligne',
        '/madjaliss',
      ])
        expect(lienOuvert(h), `ado ${h}`).toBe(true);
    } finally {
      fonctionsEtat.restreint = false;
      fonctionsEtat.ado = false;
    }
  });
  it('file d’envoi : un enfant connecté n’envoie que SES réponses (le serveur refuserait un lot citant un frère)', async () => {
    const base = {
      unitId: 'en1.l01',
      eventType: 'reponse' as const,
      exerciseId: 'e',
      exerciseHash: 'h',
      itemIndex: 0,
      response: { value: true },
      edition: 'x',
    };
    await queueEvent({ ...base, profileId: 'moi' });
    await queueEvent({ ...base, profileId: 'frere' });
    const vus: string[] = [];
    const serveur = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const evs = (
        JSON.parse(String(init?.body)) as { events: Array<{ id: string; profileId: string }> }
      ).events;
      for (const e of evs) vus.push(e.profileId);
      return new Response(
        JSON.stringify({ accepted: evs.map((e) => ({ id: e.id })), duplicates: [], rejected: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    restreindreEnvoiAuProfil('moi');
    try {
      await flushQueue(serveur);
    } finally {
      restreindreEnvoiAuProfil(null);
    }
    expect(vus).toEqual(['moi']);
    expect(await pendingCount()).toBe(1); // celle du frère reste, pour sa propre session
  });
});
