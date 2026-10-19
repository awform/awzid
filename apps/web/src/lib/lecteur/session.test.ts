import { afterEach, describe, expect, it, vi } from 'vitest';
import { Moteur, type AudioLike, type Piste } from './moteur.svelte';
import { brancherSession, etatSession, titrePage } from './session';

class MediaMetadataFaux {
  constructor(public init: { title: string; artist: string; album: string }) {}
}

function fauxNavigateur() {
  const gestionnaires = new Map<string, (() => void) | null>();
  const ms = {
    metadata: null as MediaMetadataFaux | null,
    playbackState: 'none',
    setActionHandler: (a: string, f: (() => void) | null) => void gestionnaires.set(a, f),
  };
  return { nav: { mediaSession: ms } as unknown as Navigator, ms, gestionnaires };
}

function moteur() {
  const audio = {
    src: '',
    currentTime: 10,
    duration: 30,
    playbackRate: 1,
    defaultPlaybackRate: 1,
    preservesPitch: true,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as AudioLike;
  const m = new Moteur<Piste>(audio, { resoudre: async (p) => ({ url: `blob:${p.ref}` }) });
  m.maj([
    { ref: 'a', cle: 1 },
    { ref: 'b', cle: 2 },
  ]);
  return { m, audio };
}

afterEach(() => vi.unstubAllGlobals());

describe('lecteur audio — écran verrouillé et écouteurs (Media Session)', () => {
  it('branche lecture, pause, piste précédente et suivante, reculer et avancer, avec le titre de la leçon', async () => {
    vi.stubGlobal('MediaMetadata', MediaMetadataFaux);
    const { nav, ms, gestionnaires } = fauxNavigateur();
    const { m, audio } = moteur();
    const debrancher = brancherSession(m, 'Leçon 3 — Les salutations', nav);
    expect([...gestionnaires.keys()].sort()).toEqual(
      ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward'].sort(),
    );
    expect(ms.metadata?.init.title).toBe('Leçon 3 — Les salutations');
    // « phrase suivante » de l'écran verrouillé joue la phrase 2
    gestionnaires.get('nexttrack')!();
    await vi.waitFor(() => expect(m.index).toBe(1));
    // avancer de 5 s
    gestionnaires.get('seekforward')!();
    expect(audio.currentTime).toBe(15);
    gestionnaires.get('seekbackward')!();
    expect(audio.currentTime).toBe(10);
    // fermeture du lecteur : tout est retiré
    debrancher();
    expect([...gestionnaires.values()].every((f) => f === null)).toBe(true);
    expect(ms.metadata).toBeNull();
  });

  it('navigateur sans Media Session : aucune erreur', () => {
    const { m } = moteur();
    expect(() => brancherSession(m, 'x', {} as Navigator)()).not.toThrow();
    expect(() => etatSession(true, {} as Navigator)).not.toThrow();
  });

  it('état lecture / pause de l’écran verrouillé', () => {
    const { nav, ms } = fauxNavigateur();
    etatSession(true, nav);
    expect(ms.playbackState).toBe('playing');
    etatSession(false, nav);
    expect(ms.playbackState).toBe('paused');
  });

  it('titre : le titre de la page, à défaut celui du document', () => {
    const doc = (h1: string | null, title: string) =>
      ({
        title,
        querySelector: () => (h1 === null ? null : { textContent: h1 }),
      }) as unknown as Document;
    expect(titrePage(doc('  Séance   12 ', 'Awzid'))).toBe('Séance 12');
    expect(titrePage(doc(null, 'Madjaliss — Awzid'))).toBe('Madjaliss — Awzid');
    expect(titrePage(doc('', ''))).toBe('Awzid');
  });
});
