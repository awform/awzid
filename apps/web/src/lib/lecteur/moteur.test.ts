import { describe, expect, it, vi } from 'vitest';
import {
  horloge,
  MAX_REPETITIONS,
  Moteur,
  SAUT_S,
  SEUIL_BARRE_S,
  VITESSES,
  type AudioLike,
  type Piste,
  type Source,
} from './moteur.svelte';

/** Audio simulé : mêmes événements que `HTMLAudioElement` (play, pause, ended, durationchange…). */
class FauxAudio implements AudioLike {
  currentTime = 0;
  duration = NaN;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  paused = true;
  lectures = 0;
  #src = '';
  #l = new Map<string, Set<() => void>>();
  // comme un vrai élément : un nouveau fichier remet la vitesse à la valeur par défaut
  get src() {
    return this.#src;
  }
  set src(v: string) {
    this.#src = v;
    this.playbackRate = this.defaultPlaybackRate;
    this.currentTime = 0;
  }
  addEventListener(t: string, f: () => void) {
    if (!this.#l.has(t)) this.#l.set(t, new Set());
    this.#l.get(t)!.add(f);
  }
  removeEventListener(t: string, f: () => void) {
    this.#l.get(t)?.delete(f);
  }
  emit(t: string) {
    for (const f of this.#l.get(t) ?? []) f();
  }
  play() {
    this.lectures += 1;
    this.paused = false;
    this.emit('play');
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.emit('pause');
  }
  /** la phrase arrive à sa fin */
  fin() {
    this.paused = true;
    this.emit('pause');
    this.emit('ended');
  }
  duree(d: number) {
    this.duration = d;
    this.emit('durationchange');
  }
  avancer(t: number) {
    this.currentTime = t;
    this.emit('timeupdate');
  }
}

const pistes = (n: number): Piste[] =>
  Array.from({ length: n }, (_, i) => ({ ref: `f${i + 1}`, cle: `k${i + 1}` }));

function creer(n = 4, extra: Partial<ConstructorParameters<typeof Moteur<Piste>>[1]> = {}) {
  const audio = new FauxAudio();
  const liberees: string[] = [];
  const vues: Array<string | null> = [];
  const m = new Moteur<Piste>(audio, {
    resoudre: async (p) => ({ url: `blob:${p.ref}`, liberer: () => liberees.push(p.ref) }),
    surPiste: (p) => vues.push(p?.ref ?? null),
    ...extra,
  });
  m.maj(pistes(n));
  return { audio, m, liberees, vues };
}

describe('lecteur audio — moteur', () => {
  it('jouer : charge la phrase, joue, garde la hauteur de la voix, jamais de lecture avant un geste', async () => {
    const { audio, m, vues } = creer();
    // rien ne joue tant qu'aucune méthode n'est appelée
    expect(audio.lectures).toBe(0);
    expect(m.lecture).toBe(false);
    await m.jouer(0);
    expect(audio.src).toBe('blob:f1');
    expect(audio.lectures).toBe(1);
    expect(m.lecture).toBe(true);
    expect(audio.preservesPitch).toBe(true);
    expect(vues).toEqual(['f1']);
  });

  it('pause puis lecture : reprise au MÊME endroit (sans recharger ni repartir du début)', async () => {
    const { audio, m } = creer();
    await m.jouer(0);
    audio.duree(8);
    audio.avancer(3.2);
    await m.basculer();
    expect(m.lecture).toBe(false);
    expect(audio.paused).toBe(true);
    await m.basculer();
    expect(m.lecture).toBe(true);
    expect(audio.currentTime).toBe(3.2);
    expect(audio.src).toBe('blob:f1');
    expect(audio.lectures).toBe(2);
  });

  it('phrase terminée : « Lire » la relance depuis le début', async () => {
    const { audio, m } = creer();
    await m.jouer(1);
    audio.duree(2);
    audio.avancer(2);
    audio.fin();
    expect(m.lecture).toBe(false);
    await m.basculer();
    expect(m.lecture).toBe(true);
    expect(audio.currentTime).toBe(0);
  });

  it('reculer et avancer de 5 secondes, dans les limites de la phrase', async () => {
    const { audio, m } = creer();
    await m.jouer(0);
    audio.duree(30);
    audio.avancer(12);
    m.decaler(SAUT_S);
    expect(audio.currentTime).toBe(17);
    m.decaler(-SAUT_S);
    m.decaler(-SAUT_S);
    expect(audio.currentTime).toBe(7);
    m.decaler(-SAUT_S * 3);
    expect(audio.currentTime).toBe(0);
    audio.avancer(28);
    m.decaler(SAUT_S);
    expect(audio.currentTime).toBe(30);
    expect(m.temps).toBe(30);
  });

  it('barre de progression : seulement si l’audio dure plus de 20 s ; glissable', async () => {
    const { audio, m } = creer();
    await m.jouer(0);
    audio.duree(SEUIL_BARRE_S);
    expect(m.barre).toBe(false);
    audio.duree(SEUIL_BARRE_S + 0.5);
    expect(m.barre).toBe(true);
    m.aller(9);
    expect(audio.currentTime).toBe(9);
    m.aller(-4);
    expect(audio.currentTime).toBe(0);
    m.aller(999);
    expect(audio.currentTime).toBe(SEUIL_BARRE_S + 0.5);
    // durée inconnue (flux) : pas de barre
    audio.duree(NaN);
    expect(m.barre).toBe(false);
  });

  it('phrase suivante et précédente : ordre de la page, bornes respectées, ancien fichier libéré', async () => {
    const { audio, m, liberees } = creer(3);
    await m.jouer(0);
    await m.precedente();
    expect(m.index).toBe(0);
    await m.suivante();
    expect(m.index).toBe(1);
    expect(audio.src).toBe('blob:f2');
    await m.suivante();
    await m.suivante();
    expect(m.index).toBe(2);
    expect(audio.src).toBe('blob:f3');
    await m.precedente();
    expect(m.index).toBe(1);
    expect(liberees).toEqual(['f1', 'f2', 'f3']);
  });

  it('la liste est relue à chaque changement de phrase (étapes d’une leçon) et la phrase en cours est gardée', async () => {
    let courante = pistes(3);
    const { m } = creer(3, { relire: () => courante });
    await m.jouer(1);
    // une phrase apparaît avant : la phrase en cours (k2) garde sa place dans la nouvelle liste
    courante = [{ ref: 'neuf', cle: 'kN' }, ...pistes(3)];
    await m.suivante();
    expect(m.pistes).toHaveLength(4);
    expect(m.courante?.cle).toBe('k3');
  });

  it('vitesse 0,75 / 1 / 1,25 / 1,5 / 1,75 avec la hauteur conservée, aussi après un changement de phrase', async () => {
    const { audio, m } = creer();
    expect([...VITESSES]).toEqual([0.75, 1, 1.25, 1.5, 1.75]);
    await m.jouer(0);
    for (const v of VITESSES) {
      m.regler(v);
      expect(audio.playbackRate).toBe(v);
      expect(audio.preservesPitch).toBe(true);
    }
    m.regler(1.25);
    await m.suivante();
    expect(audio.playbackRate).toBe(1.25);
    m.regler(1.75);
    expect(audio.playbackRate).toBe(1.75);
    m.regler(3);
    expect(m.vitesse).toBe(1.75);
  });

  it('boucle : la phrase se répète, arrêt AUTOMATIQUE après 10 répétitions', async () => {
    const { audio, m } = creer();
    await m.jouer(0);
    m.basculerBoucle();
    expect(m.boucle).toBe(true);
    for (let i = 1; i <= MAX_REPETITIONS; i++) {
      audio.fin();
      expect(m.repetitions).toBe(i);
      expect(m.lecture).toBe(true);
      expect(audio.currentTime).toBe(0);
    }
    expect(audio.lectures).toBe(1 + MAX_REPETITIONS);
    // la onzième fin ne relance plus rien : le lecteur s'arrête et la boucle se désactive
    audio.fin();
    expect(audio.lectures).toBe(1 + MAX_REPETITIONS);
    expect(m.lecture).toBe(false);
    expect(m.boucle).toBe(false);
    expect(m.repetitions).toBe(0);
  });

  it('boucle : changer de phrase remet le compteur à zéro ; sans boucle, une phrase finie s’arrête', async () => {
    const { audio, m } = creer();
    await m.jouer(0);
    m.basculerBoucle();
    audio.fin();
    audio.fin();
    expect(m.repetitions).toBe(2);
    await m.suivante();
    expect(m.repetitions).toBe(0);
    m.basculerBoucle();
    audio.fin();
    expect(m.lecture).toBe(false);
    expect(m.index).toBe(1);
  });

  it('lecture continue : enchaîne les phrases de la page, puis s’arrête à la dernière', async () => {
    const { audio, m, vues } = creer(3);
    await m.jouer(0);
    m.basculerContinu();
    audio.fin();
    await vi.waitFor(() => expect(audio.src).toBe('blob:f2'));
    expect(m.index).toBe(1);
    audio.fin();
    await vi.waitFor(() => expect(audio.src).toBe('blob:f3'));
    expect(m.index).toBe(2);
    audio.fin();
    expect(m.lecture).toBe(false);
    expect(m.index).toBe(2);
    expect(vues).toEqual(['f1', 'f2', 'f3']);
  });

  it('lecture continue éteinte : une phrase terminée ne lance JAMAIS la suivante toute seule', async () => {
    const { audio, m } = creer(3);
    await m.jouer(0);
    audio.fin();
    expect(m.index).toBe(0);
    expect(audio.lectures).toBe(1);
  });

  it('fichier introuvable (hors ligne, droit retiré) : erreur affichable, pas de lecture', async () => {
    const { audio, m } = creer(2, { resoudre: async () => null as Source | null });
    await m.jouer(0);
    expect(m.erreur).toBe(true);
    expect(m.lecture).toBe(false);
    expect(audio.lectures).toBe(0);
  });

  it('une phrase demandée entre-temps l’emporte sur celle qui se charge encore (pas de double lecture)', async () => {
    const attentes: Array<(s: Source) => void> = [];
    const liberees: string[] = [];
    const { audio, m } = creer(3, {
      resoudre: (p) =>
        new Promise<Source>((ok) =>
          attentes.push((s) =>
            ok({ ...s, url: `blob:${p.ref}`, liberer: () => liberees.push(p.ref) }),
          ),
        ),
    });
    const a = m.jouer(0);
    const b = m.jouer(1);
    attentes[1]!({ url: '' });
    await b;
    attentes[0]!({ url: '' });
    await a;
    expect(audio.src).toBe('blob:f2');
    expect(audio.lectures).toBe(1);
    expect(liberees).toEqual(['f1']);
  });

  it('fermer : arrête, libère le fichier, détache les écouteurs, prévient le surlignage', async () => {
    const { audio, m, liberees, vues } = creer();
    await m.jouer(0);
    m.fermer();
    expect(audio.paused).toBe(true);
    expect(liberees).toEqual(['f1']);
    expect(vues.at(-1)).toBeNull();
    // l'audio détaché ne pilote plus le moteur
    audio.emit('play');
    expect(m.lecture).toBe(false);
  });

  it('horloge : minutes et secondes', () => {
    expect(horloge(0)).toBe('0:00');
    expect(horloge(65.9)).toBe('1:05');
    expect(horloge(NaN)).toBe('0:00');
    expect(horloge(-3)).toBe('0:00');
  });
});
