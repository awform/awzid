import { describe, expect, it, vi } from 'vitest';
import { audioFileId } from '@awform/content/audio-cle';

// versets d'Ayyūb servis par notre API (paquet de sourate) ; fichiers de synthèse des leçons
vi.mock('$lib/quran/reciters', () => ({
  loadTracks: vi.fn(async (_p: string | null, reciter: string, s: number) => ({
    pack:
      reciter === 'ayyoub-hafs' && s !== 99
        ? {
            files: [1, 2, 3, 4, 5, 6, 7].map((aya) => ({
              aya,
              url: `/api/v1/quran/audio/file/${reciter}/${s}-${aya}.mp3`,
            })),
          }
        : null,
    code: null,
  })),
}));
vi.mock('$lib/lecons-audio', () => ({
  leconsSource: vi.fn(async (id: string) => ({ url: `/api/v1/lecons-audio/fichiers/${id}.mp3` })),
}));
vi.mock('$lib/idb', () => ({ kvGet: vi.fn(async () => undefined), kvSet: vi.fn(async () => {}) }));

const { chargerTable, fichiersDu, jouerPlan, planDe, RECITATEUR, sourceRecitation } =
  await import('./ayyub');

/** faux lecteur audio : chaque `play` finit aussitôt ; garde les adresses jouées et la vitesse */
function fauxLecteur() {
  const joues: Array<{ src: string; vitesse: number }> = [];
  const a = {
    src: '',
    playbackRate: 1,
    defaultPlaybackRate: 1,
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    onratechange: null as null | (() => void),
    pause: vi.fn(),
    play: vi.fn(async () => {
      joues.push({ src: a.src, vitesse: a.playbackRate });
      queueMicrotask(() => a.onended?.());
    }),
  };
  return { a: a as unknown as HTMLAudioElement, joues };
}

const TEXTE = 'نَصٌّ لِلتَّجْرِبَةِ';
const MIXTE = 'نَصٌّ مُخْتَلِطٌ لِلتَّجْرِبَةِ';
const cle = (t: string) => audioFileId(t)!.slice(0, 12);

describe('récitation d’Ayyūb dans les leçons (26/10/2026)', () => {
  it('Ayyūb seul : le récitateur des leçons est celui du Complexe stocké chez nous', () => {
    expect(RECITATEUR).toBe('ayyoub-hafs');
  });

  it('table chargée à la demande ; plan d’un texte (fragment, versets, partie de synthèse)', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        t: { [cle(TEXTE)]: ['~', '12:4'], [cle(MIXTE)]: [`t:${'a'.repeat(40)}`, '1:1-3'] },
      }),
    }));
    vi.stubGlobal('fetch', f);
    await chargerTable();
    expect(f).toHaveBeenCalledWith('/recitation/ayyub.json');
    expect(await planDe(TEXTE)).toEqual({
      segments: ['12:4'],
      ref: '12:4',
      fragment: true,
      versets: ['12:4'],
      mixte: false,
    });
    expect((await planDe(MIXTE))?.mixte).toBe(true);
    expect(await planDe('نَصٌّ آخَرُ')).toBeNull();
    // une seule demande pour toute la session
    await planDe(TEXTE);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('plusieurs versets : un fichier par verset, dans l’ordre ; Basmala de sourate : le verset 1:1', () => {
    expect(fichiersDu('1:2-4')).toEqual([
      { s: 1, v: 2 },
      { s: 1, v: 3 },
      { s: 1, v: 4 },
    ]);
    expect(fichiersDu('b:2')).toEqual([{ s: 1, v: 1 }]);
    expect(fichiersDu(`t:${'b'.repeat(40)}`)).toEqual([{ t: 'b'.repeat(40) }]);
    expect(fichiersDu('n’importe quoi')).toEqual([]);
  });

  it('texte mixte : synthèse puis versets, avec UN seul lecteur, à la vitesse choisie', async () => {
    const { a, joues } = fauxLecteur();
    const n = await jouerPlan(
      {
        segments: [`t:${'c'.repeat(40)}`, '1:1-2'],
        ref: '',
        fragment: false,
        versets: ['1:1-2'],
        mixte: true,
      },
      { audio: a, vitesse: () => 0.75 },
    );
    expect(n).toBe(3);
    expect(joues.map((x) => x.src)).toEqual([
      `/api/v1/lecons-audio/fichiers/${'c'.repeat(40)}.mp3`,
      '/api/v1/quran/audio/file/ayyoub-hafs/1-1.mp3',
      '/api/v1/quran/audio/file/ayyoub-hafs/1-2.mp3',
    ]);
    expect(joues.every((x) => x.vitesse === 0.75)).toBe(true);
  });

  it('phrase du petit lecteur (« r:<plan> ») : les fichiers du plan enchaînés par `suite`, verset indisponible sauté', async () => {
    const s1 = await sourceRecitation('99:1|12:4-5');
    expect(s1?.url).toBe('/api/v1/quran/audio/file/ayyoub-hafs/12-4.mp3');
    const s2 = await s1!.suite!();
    expect(s2?.url).toBe('/api/v1/quran/audio/file/ayyoub-hafs/12-5.mp3');
    expect(await s2!.suite!()).toBeNull();
    expect(await sourceRecitation('99:1')).toBeNull();
  });

  it('récitateur retiré ou verset indisponible : segment sauté, sans erreur ; arrêt demandé : plus rien', async () => {
    const { a, joues } = fauxLecteur();
    expect(
      await jouerPlan(
        { segments: ['99:1'], ref: '99:1', fragment: false, versets: ['99:1'], mixte: false },
        { audio: a },
      ),
    ).toBe(0);
    expect(joues).toEqual([]);
    const c = new AbortController();
    c.abort();
    expect(
      await jouerPlan(
        { segments: ['1:1'], ref: '1:1', fragment: false, versets: ['1:1'], mixte: false },
        { audio: a, signal: c.signal },
      ),
    ).toBe(0);
  });
});
