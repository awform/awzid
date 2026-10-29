/**
 * Lecteur audio des phrases (leçons, Madjaliss, douas, lectures) : MOTEUR, sans aucune dépendance au DOM de la page.
 * Chargé à la demande avec le lecteur (import dynamique au premier appui sur « Écouter »), jamais dans la coquille.
 *
 * Règles (décision du client) :
 *  - aucune lecture sans geste de l'utilisateur : le moteur ne joue que sur `jouer`, `basculer`, `suivante`… appelés
 *    par un appui (bouton, touche, commande de l'écran verrouillé) ;
 *  - vitesses 0,75 / 1 / 1,25 / 1,5 / 1,75 avec la hauteur de la voix conservée (`preservesPitch`) ;
 *  - répétition en boucle d'une phrase : arrêt AUTOMATIQUE après 10 répétitions ;
 *  - lecture continue : enchaîne les phrases dans l'ordre de la page ou de la séance ;
 *  - mêmes sources audio que l'existant : le moteur reçoit un résolveur (copie de l'appareil d'abord, puis le réseau).
 */

// 29/10/2026 (tarteel-egal-wip) : jusqu'à 1,75× comme Tarteel (la récitation de l'élève qui révise, ou d'Ayyūb)
export const VITESSES = [0.75, 1, 1.25, 1.5, 1.75] as const;
export const MAX_REPETITIONS = 10;
/** la barre de progression n'est affichée que si l'audio dure plus que cela (secondes) */
export const SEUIL_BARRE_S = 20;
export const SAUT_S = 5;

export interface Source {
  url: string;
  /** libère l'URL d'objet quand le fichier n'est plus lu */
  liberer?: () => void;
  /**
   * 26/10/2026 : phrase en PLUSIEURS fichiers (récitation d'Ayyūb : versets enchaînés ; texte mixte : synthèse puis
   * verset) : fichier suivant de la même phrase, joué à la fin de celui-ci (null : la phrase est finie)
   */
  suite?: () => Promise<Source | null>;
}

/** Une phrase de la page ou de la séance : `ref` identifie le fichier, `cle` l'élément qui la déclenche. */
export interface Piste {
  ref: string;
  cle: unknown;
}

/** Ce qu'il faut de `HTMLAudioElement` (simulable en test). */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  playbackRate: number;
  defaultPlaybackRate: number;
  preservesPitch: boolean;
  /** 26/10/2026 : son lancé ailleurs et piloté par le lecteur (`suivre`) */
  readonly paused?: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export interface Reglages<P extends Piste> {
  /** fichier de la phrase (copie de l'appareil d'abord) ; null : indisponible */
  resoudre: (p: P) => Promise<Source | null>;
  /** la phrase en cours change (surlignage, défilement) ; null : lecteur fermé */
  surPiste?: (p: P | null, i: number) => void;
  /** relit la liste des phrases visibles de la page (elle change avec les étapes d'une leçon) */
  relire?: () => P[];
  vitesse?: number;
}

const EVENEMENTS = [
  'play',
  'pause',
  'ended',
  'timeupdate',
  'durationchange',
  'loadedmetadata',
  'error',
] as const;

export class Moteur<P extends Piste> {
  pistes = $state.raw<P[]>([]);
  index = $state(0);
  lecture = $state(false);
  charge = $state(false);
  erreur = $state(false);
  temps = $state(0);
  duree = $state(0);
  vitesse = $state<number>(1);
  boucle = $state(false);
  repetitions = $state(0);
  continu = $state(false);

  courante = $derived(this.pistes[this.index] ?? null);
  barre = $derived(this.duree > SEUIL_BARRE_S);

  #audio: AudioLike;
  #r: Reglages<P>;
  #source: Source | null = null;
  #jeton = 0;
  #ecoutes: Array<[string, () => void]> = [];
  /** la phrase en cours a plusieurs fichiers (sa répétition repart du premier) */
  #parties = false;

  constructor(audio: AudioLike, r: Reglages<P>) {
    this.#audio = audio;
    this.#r = r;
    if (r.vitesse && (VITESSES as readonly number[]).includes(r.vitesse)) this.vitesse = r.vitesse;
    this.#brancher(audio);
  }

  #brancher(audio: AudioLike) {
    audio.preservesPitch = true;
    const sur: Record<(typeof EVENEMENTS)[number], () => void> = {
      play: () => (this.lecture = true),
      pause: () => (this.lecture = false),
      ended: () => this.#fin(),
      timeupdate: () => (this.temps = audio.currentTime || 0),
      durationchange: () => this.#duree(),
      loadedmetadata: () => this.#duree(),
      error: () => {
        if (!audio.src) return;
        this.erreur = true;
        this.charge = false;
        this.lecture = false;
      },
    };
    for (const e of EVENEMENTS) {
      audio.addEventListener(e, sur[e]);
      this.#ecoutes.push([e, sur[e]]);
    }
  }

  #debrancher() {
    for (const [e, f] of this.#ecoutes) this.#audio.removeEventListener(e, f);
    this.#ecoutes = [];
  }

  /**
   * 26/10/2026 : pilote un son lancé AILLEURS (parcours Prière, cahier de lecture, animations) : pause et reprise, ±5 s et
   * vitesse agissent sur lui ; le lecteur ne le relance ni ne le remplace. `p` : la phrase (bouton) qui l'a lancé.
   */
  suivre(audio: AudioLike, p: P) {
    this.#jeton += 1;
    this.#liberer();
    if (audio !== this.#audio) {
      this.#debrancher();
      this.#audio = audio;
      this.#brancher(audio);
    }
    this.pistes = [p];
    this.index = 0;
    this.erreur = false;
    this.charge = false;
    this.repetitions = 0;
    this.#parties = false;
    this.#source = { url: audio.src };
    this.#appliquerVitesse();
    this.lecture = audio.paused === false;
    this.temps = audio.currentTime || 0;
    this.#duree();
  }

  #duree() {
    const d = this.#audio.duration;
    this.duree = Number.isFinite(d) && d > 0 ? d : 0;
  }

  #appliquerVitesse() {
    this.#audio.preservesPitch = true;
    this.#audio.defaultPlaybackRate = this.#audio.playbackRate = this.vitesse;
  }

  #liberer() {
    this.#source?.liberer?.();
    this.#source = null;
  }

  /** Remplace la liste des phrases ; `courante` : la phrase à garder en cours (par sa clé). */
  maj(pistes: P[], cle?: unknown) {
    this.pistes = pistes;
    if (cle !== undefined) {
      const i = pistes.findIndex((p) => p.cle === cle);
      if (i >= 0) this.index = i;
    }
  }

  /** Joue la phrase d'indice `i` depuis le début (geste de l'utilisateur obligatoire côté appelant). */
  async jouer(i: number, garderRepetitions = false): Promise<void> {
    const p = this.pistes[i];
    if (!p) return;
    const jeton = ++this.#jeton;
    this.index = i;
    this.erreur = false;
    this.charge = true;
    if (!garderRepetitions) this.repetitions = 0;
    this.temps = 0;
    this.duree = 0;
    this.#audio.pause();
    this.#r.surPiste?.(p, i);
    let s: Source | null;
    try {
      s = await this.#r.resoudre(p);
    } catch {
      s = null;
    }
    if (jeton !== this.#jeton) {
      s?.liberer?.();
      return;
    }
    this.#liberer();
    this.charge = false;
    if (!s) {
      this.erreur = true;
      this.lecture = false;
      return;
    }
    this.#parties = !!s.suite;
    await this.#poser(s, jeton);
  }

  async #poser(s: Source, jeton: number) {
    this.#source = s;
    this.#audio.src = s.url;
    this.#appliquerVitesse();
    try {
      await this.#audio.play();
    } catch {
      // une autre phrase demandée entre-temps interrompt celle-ci : ce n'est pas une erreur
      if (jeton === this.#jeton) {
        this.erreur = true;
        this.lecture = false;
      }
    }
  }

  /** fichier suivant d'une phrase en plusieurs fichiers */
  async #partie(f: () => Promise<Source | null>) {
    const jeton = this.#jeton;
    let s: Source | null;
    try {
      s = await f();
    } catch {
      s = null;
    }
    if (jeton !== this.#jeton) {
      s?.liberer?.();
      return;
    }
    this.#liberer();
    if (!s) return this.#finPhrase();
    await this.#poser(s, jeton);
  }

  /** Pause, ou reprise au MÊME endroit (relance depuis le début seulement si la phrase est finie). */
  async basculer(): Promise<void> {
    if (this.lecture) {
      this.#audio.pause();
      return;
    }
    const fini = this.duree > 0 && this.temps >= this.duree - 0.05;
    if (this.erreur || !this.#source || fini) return this.jouer(this.index);
    try {
      await this.#audio.play();
    } catch {
      this.erreur = true;
    }
  }

  /** Recule (négatif) ou avance (positif) de `s` secondes, dans les limites de la phrase. */
  decaler(s: number) {
    this.aller(this.#audio.currentTime + s);
  }

  aller(t: number) {
    const fin = this.duree || this.#audio.duration || 0;
    const v = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, fin));
    this.#audio.currentTime = v;
    this.temps = v;
  }

  #relire() {
    const courante = this.courante;
    const l = this.#r.relire?.();
    if (l && l.length) this.maj(l, courante?.cle);
  }

  async suivante(): Promise<void> {
    this.#relire();
    if (this.index + 1 < this.pistes.length) await this.jouer(this.index + 1);
  }

  async precedente(): Promise<void> {
    this.#relire();
    if (this.index > 0) await this.jouer(this.index - 1);
  }

  regler(v: number) {
    if (!(VITESSES as readonly number[]).includes(v)) return;
    this.vitesse = v;
    this.#appliquerVitesse();
  }

  basculerBoucle() {
    this.boucle = !this.boucle;
    this.repetitions = 0;
  }

  basculerContinu() {
    this.continu = !this.continu;
  }

  #fin() {
    const suite = this.#source?.suite;
    if (suite) return void this.#partie(suite);
    this.#finPhrase();
  }

  #finPhrase() {
    if (this.boucle) {
      if (this.repetitions < MAX_REPETITIONS) {
        this.repetitions += 1;
        // phrase en plusieurs fichiers : la répétition repart du premier
        if (this.#parties) return void this.jouer(this.index, true);
        this.#audio.currentTime = 0;
        void this.#audio.play().catch(() => {
          this.lecture = false;
        });
        return;
      }
      // arrêt automatique après 10 répétitions
      this.boucle = false;
      this.repetitions = 0;
      this.lecture = false;
      return;
    }
    if (this.continu) {
      this.#relire();
      if (this.index + 1 < this.pistes.length) {
        void this.jouer(this.index + 1);
        return;
      }
    }
    this.lecture = false;
  }

  /** Arrête et détache tout (fermeture du lecteur). */
  fermer() {
    this.#jeton += 1;
    this.#audio.pause();
    this.#debrancher();
    this.#liberer();
    this.#audio.src = '';
    this.lecture = false;
    this.#r.surPiste?.(null, -1);
  }
}

/** « 1:05 » (minutes:secondes) pour la barre de progression. */
export function horloge(s: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
