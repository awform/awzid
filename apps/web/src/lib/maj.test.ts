import { describe, expect, it, vi } from 'vitest';
import {
  appliquerMaj,
  DELAI_ANTI_BOUCLE_MS,
  doitAfficher,
  majRecente,
  mediaEnCours,
  noterMaj,
  pageEnCours,
  surveillerMaj,
} from './maj';

const base = { prete: true, occupe: false, enLigne: true, plusTard: false, recente: false };

describe('« Mettre à jour » : quand montrer le bandeau', () => {
  it('montré seulement si la version est prête, en ligne, hors leçon/écoute, non reporté, non récent', () => {
    expect(doitAfficher(base)).toBe(true);
    expect(doitAfficher({ ...base, prete: false })).toBe(false);
    expect(doitAfficher({ ...base, occupe: true })).toBe(false);
    expect(doitAfficher({ ...base, enLigne: false })).toBe(false);
    expect(doitAfficher({ ...base, plusTard: true })).toBe(false);
    expect(doitAfficher({ ...base, recente: true })).toBe(false);
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
    expect(onPrete).toHaveBeenCalledWith(w);
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
