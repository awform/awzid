import { describe, expect, it, vi } from 'vitest';
import {
  activiteEnCours,
  appliquerMaj,
  DELAI_ANTI_BOUCLE_MS,
  DELAI_AUTO_MS,
  doitAfficher,
  doitAppliquerSeul,
  majRecente,
  mediaEnCours,
  MSG_ACTIVE,
  MSG_RECHARGER,
  noterMaj,
  occuper,
  pageEnCours,
  suivreNouvelleVersion,
  surveillerMaj,
  VERIF_MIN_MS,
} from './maj';
import { cachesARetirer } from './maj-caches';

const base = { prete: true, occupe: false, enLigne: true, recente: false };

describe('« Mettre à jour » : quand montrer le bandeau', () => {
  it('montré (sans « Plus tard » : persistant) si une version attend, en ligne, hors leçon/écoute, non récent', () => {
    expect(doitAfficher(base)).toBe(true);
    expect(doitAfficher({ ...base, prete: false })).toBe(false);
    expect(doitAfficher({ ...base, occupe: true })).toBe(false);
    expect(doitAfficher({ ...base, enLigne: false })).toBe(false);
    expect(doitAfficher({ ...base, recente: true })).toBe(false);
  });

  it('application automatique : à froid ou après le délai, jamais occupé, hors ligne, ni juste après une mise à jour', () => {
    const a = { ...base, dejaLaAuDemarrage: false, depuisMs: 0 };
    expect(doitAppliquerSeul(a)).toBe(false);
    expect(doitAppliquerSeul({ ...a, dejaLaAuDemarrage: true })).toBe(true);
    expect(doitAppliquerSeul({ ...a, depuisMs: DELAI_AUTO_MS - 1 })).toBe(false);
    expect(doitAppliquerSeul({ ...a, depuisMs: DELAI_AUTO_MS })).toBe(true);
    for (const bloque of [
      { occupe: true },
      { enLigne: false },
      { recente: true },
      { prete: false },
    ])
      expect(
        doitAppliquerSeul({ ...a, dejaLaAuDemarrage: true, depuisMs: DELAI_AUTO_MS, ...bloque }),
        JSON.stringify(bloque),
      ).toBe(false);
  });

  it('occupation (panneau d’écoute, enregistrement) : comptée, libérée une seule fois', () => {
    expect(activiteEnCours()).toBe(false);
    const l1 = occuper();
    const l2 = occuper();
    expect(activiteEnCours()).toBe(true);
    l1();
    l1(); // double libération sans effet
    expect(activiteEnCours()).toBe(true);
    l2();
    expect(activiteEnCours()).toBe(false);
  });

  it('leçons, épreuves, révisions, hifẓ, récital : en cours ; accueil, Plus, compte : non', () => {
    for (const p of [
      '/lecons/en1.l03',
      '/epreuves/abc',
      '/epreuve-passage',
      '/positionnement',
      '/revisions',
      '/hifz',
      '/recital',
      '/ecriture/lettre-ba',
      '/coran/memoriser',
      '/activites/racines',
      '/lectures/abc',
    ])
      expect(pageEnCours(p), p).toBe(true);
    for (const p of ['/', '/aujourdhui', '/plus', '/compte', '/aide', '/lecons', '/niveaux/en1'])
      expect(pageEnCours(p), p).toBe(false);
  });

  it('une écoute en cours bloque ; en pause ou terminée, non', () => {
    const doc = (medias: Array<{ paused: boolean; ended: boolean }>) =>
      ({ querySelectorAll: () => medias }) as unknown as Pick<Document, 'querySelectorAll'>;
    expect(mediaEnCours(doc([]))).toBe(false);
    expect(mediaEnCours(doc([{ paused: true, ended: false }]))).toBe(false);
    expect(mediaEnCours(doc([{ paused: false, ended: true }]))).toBe(false);
    expect(
      mediaEnCours(
        doc([
          { paused: true, ended: false },
          { paused: false, ended: false },
        ]),
      ),
    ).toBe(true);
  });
});

describe('garde anti-boucle', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  it('une mise à jour appliquée il y a moins de 2 minutes en bloque une autre', () => {
    const s = mem();
    expect(majRecente(1_000_000, s)).toBe(false);
    noterMaj(1_000_000, s);
    expect(majRecente(1_000_000 + DELAI_ANTI_BOUCLE_MS - 1, s)).toBe(true);
    expect(majRecente(1_000_000 + DELAI_ANTI_BOUCLE_MS + 1, s)).toBe(false);
  });
  it('stockage indisponible : jamais d’erreur', () => {
    const casse = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    };
    expect(majRecente(5, casse)).toBe(false);
    expect(() => noterMaj(5, casse)).not.toThrow();
  });
});

type Ecouteur = (e?: unknown) => void;
function faux() {
  const ecouteurs = new Map<string, Ecouteur[]>();
  const cible = () => ({
    addEventListener: (n: string, f: Ecouteur) =>
      ecouteurs.set(n, [...(ecouteurs.get(n) ?? []), f]),
    removeEventListener: () => {},
  });
  const reg = {
    waiting: null as unknown,
    installing: null as unknown,
    update: vi.fn(async () => {}),
    ...cible(),
  };
  const conteneur = { controller: {} as unknown, ready: Promise.resolve(reg), ...cible() };
  const emit = (n: string) => (ecouteurs.get(n) ?? []).forEach((f) => f());
  return { reg, conteneur, emit };
}

describe('surveillance du service worker', () => {
  const doc = () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible' as DocumentVisibilityState,
  });

  it('un worker déjà en attente est signalé', async () => {
    const f = faux();
    const w = { state: 'installed' };
    f.reg.waiting = w;
    const onPrete = vi.fn();
    surveillerMaj(f.conteneur as never, onPrete, doc());
    await f.conteneur.ready;
    await Promise.resolve();
    expect(onPrete).toHaveBeenCalledWith(w, true); // déjà là au démarrage : démarrage à froid
  });

  it('un worker installé plus tard est signalé ; une première installation (sans contrôleur) non', async () => {
    const f = faux();
    const onPrete = vi.fn();
    surveillerMaj(f.conteneur as never, onPrete, doc());
    await Promise.resolve();
    await Promise.resolve();
    const handlers = new Map<string, Ecouteur>();
    const w = {
      state: 'installing',
      addEventListener: (n: string, h: Ecouteur) => handlers.set(n, h),
    };
    f.reg.installing = w;
    f.emit('updatefound');
    w.state = 'installed';
    handlers.get('statechange')!();
    expect(onPrete).toHaveBeenCalledTimes(1);
    expect(onPrete).toHaveBeenCalledWith(w, false); // installée pendant la visite : pas « à froid »

    const g = faux();
    g.conteneur.controller = null; // première visite : pas de mise à jour à proposer
    const onPrete2 = vi.fn();
    surveillerMaj(g.conteneur as never, onPrete2, doc());
    await Promise.resolve();
    await Promise.resolve();
    const h2 = new Map<string, Ecouteur>();
    const w2 = { state: 'installed', addEventListener: (n: string, h: Ecouteur) => h2.set(n, h) };
    g.reg.installing = w2;
    g.emit('updatefound');
    h2.get('statechange')?.();
    expect(onPrete2).not.toHaveBeenCalled();
  });
});

describe('application de la mise à jour', () => {
  it('skipWaiting demandé, rechargement UNE seule fois (changement de contrôleur puis secours)', () => {
    vi.useFakeTimers();
    const post = vi.fn();
    let ctrl: Ecouteur = () => {};
    const conteneur = { addEventListener: (_n: string, f: Ecouteur) => (ctrl = f) };
    const recharger = vi.fn();
    appliquerMaj({ postMessage: post } as never, conteneur, recharger, 1000);
    expect(post).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    ctrl();
    vi.advanceTimersByTime(5000);
    expect(recharger).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('sans changement de contrôleur, le secours recharge une fois', () => {
    vi.useFakeTimers();
    const recharger = vi.fn();
    appliquerMaj(
      { postMessage: () => {} } as never,
      { addEventListener: () => {} },
      recharger,
      1000,
    );
    vi.advanceTimersByTime(1500);
    expect(recharger).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('retour au premier plan', () => {
  it('visibilitychange : vérification de nouvelle version (au plus une par minute)', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const f = faux();
    let retour: Ecouteur = () => {};
    let horloge = 1_000_000;
    const doc = {
      addEventListener: (_n: string, h: Ecouteur) => (retour = h),
      removeEventListener: () => {},
      visibilityState: 'visible' as DocumentVisibilityState,
    };
    const stop = surveillerMaj(
      f.conteneur as never,
      () => {},
      doc,
      () => horloge,
    );
    await f.conteneur.ready;
    await Promise.resolve();
    horloge += VERIF_MIN_MS + 1;
    retour();
    expect(f.reg.update).toHaveBeenCalledTimes(1);
    retour(); // trop tôt
    expect(f.reg.update).toHaveBeenCalledTimes(1);
    horloge += VERIF_MIN_MS + 1;
    doc.visibilityState = 'hidden';
    retour(); // passage à l'arrière-plan : rien
    expect(f.reg.update).toHaveBeenCalledTimes(1);
    stop();
    vi.unstubAllGlobals();
  });
});

describe('tous les onglets suivent la nouvelle version', () => {
  const cible = () => {
    const h = new Map<string, Ecouteur[]>();
    return {
      h,
      addEventListener: (n: string, f: Ecouteur) => h.set(n, [...(h.get(n) ?? []), f]),
      removeEventListener: (n: string, f: Ecouteur) =>
        h.set(
          n,
          (h.get(n) ?? []).filter((g) => g !== f),
        ),
      emit: (n: string, e?: unknown) => (h.get(n) ?? []).forEach((f) => f(e)),
    };
  };
  const attendre = () => new Promise((r) => setTimeout(r, 0));

  it('changement de contrôleur vers une autre version : signalé une seule fois', async () => {
    const c = { ...cible(), controller: {} as unknown };
    const on = vi.fn();
    suivreNouvelleVersion(c as never, 'v1', on, null, async () => 'v2');
    c.emit('controllerchange');
    c.emit('message', { data: { type: MSG_ACTIVE, version: 'v2' } });
    await attendre();
    expect(on).toHaveBeenCalledTimes(1);
  });

  it('même version (page déjà neuve) ou première installation : rien', async () => {
    const c = { ...cible(), controller: {} as unknown };
    const on = vi.fn();
    suivreNouvelleVersion(c as never, 'v2', on, null, async () => 'v2');
    c.emit('controllerchange');
    c.emit('message', { data: { type: MSG_ACTIVE, version: 'v2' } });
    await attendre();
    expect(on).not.toHaveBeenCalled();

    const premier = { ...cible(), controller: null as unknown };
    const on2 = vi.fn();
    suivreNouvelleVersion(premier as never, 'v1', on2, null, async () => 'v2');
    premier.controller = {};
    premier.emit('controllerchange');
    await attendre();
    expect(on2).not.toHaveBeenCalled();
  });

  it('message du worker activé, ou d’un autre onglet (BroadcastChannel)', async () => {
    const c = { ...cible(), controller: null as unknown };
    const canal = cible();
    const on = vi.fn();
    const stop = suivreNouvelleVersion(c as never, 'v1', on, canal as never);
    canal.emit('message', { data: { type: MSG_RECHARGER } });
    expect(on).toHaveBeenCalledTimes(1);
    stop();
    const on2 = vi.fn();
    suivreNouvelleVersion(c as never, 'v1', on2, null);
    c.emit('message', { data: { type: MSG_ACTIVE, version: 'v1' } });
    expect(on2).not.toHaveBeenCalled();
    c.emit('message', { data: { type: MSG_ACTIVE, version: 'v3' } });
    expect(on2).toHaveBeenCalledTimes(1);
  });
});

describe('mise à jour sans perte : caches retirés à l’activation', () => {
  it('seuls les anciens fichiers partent ; coquille précédente, sourates, Muṣḥaf, polices gardés', () => {
    const cles = [
      'awform-shell-1',
      'awzid-coran-audio-v1',
      'awform-shell-2',
      'awzid-mushaf-exact-pages',
      'awzid-riwayat-polices',
      'autre-ancien-cache',
      'awform-shell-3',
    ];
    expect(cachesARetirer(cles, 'awform-shell-3')).toEqual([
      'awform-shell-1',
      'autre-ancien-cache',
    ]);
    // première version : rien à retirer
    expect(cachesARetirer(['awform-shell-1'], 'awform-shell-1')).toEqual([]);
    // les signets, la progression et les réglages ne sont pas dans des caches (IndexedDB, localStorage) :
    // aucune clé de ce genre n'est jamais retirée
    expect(cachesARetirer(cles, 'awform-shell-3').some((k) => /awform$|kv|reglage/.test(k))).toBe(
      false,
    );
  });
});
