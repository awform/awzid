/**
 * « Réécouter ma récitation » (tarteel-egal-wip, 29/10/2026) — COMPTE ADULTE SEULEMENT (enfant et ado : jamais, voir
 * `reecoutePermise` dans progres.ts, et le serveur n'envoie les instants qu'à un profil adulte).
 *
 * L'enregistrement reste EN MÉMOIRE sur l'appareil, le temps du panneau : il est décodé en mémoire (Web Audio) et un
 * extrait du verset est joué. Rien n'est envoyé (aucune requête), rien n'est écrit (ni IndexedDB, ni cache, ni fichier,
 * ni adresse d'objet `blob:`) ; tout est libéré à la fermeture (`fermer`). Module chargé à la demande avec la fiche.
 */
import type { MotAttendu } from '@awform/hifz';

/** secondes gardées avant et après le verset (le mot est rarement coupé net) */
export const MARGE_AVANT = 0.35;
export const MARGE_APRES = 0.5;

/** Extrait [début, fin] (secondes) du verset dans l'enregistrement, d'après les instants des mots reconnus ; null si aucun. */
export function plageDuVerset(
  att: readonly MotAttendu[],
  instants: ReadonlyArray<readonly [number, number] | null> | null | undefined,
  s: number,
  a: number,
): [number, number] | null {
  if (!instants) return null;
  let d = Infinity;
  let f = -Infinity;
  for (const m of att) {
    if (m.s !== s || m.a !== a) continue;
    const x = instants[m.i];
    if (!x) continue;
    d = Math.min(d, x[0]);
    f = Math.max(f, x[1]);
  }
  if (!Number.isFinite(d) || !Number.isFinite(f)) return null;
  return [Math.max(0, d - MARGE_AVANT), f + MARGE_APRES];
}

export class Reecoute {
  private ctx: AudioContext | null = null;
  private tampon: AudioBuffer | null = null;
  private src: AudioBufferSourceNode | null = null;
  jeton = 0;

  constructor(private audio: Blob) {}

  /** Joue l'extrait ; `fin` est appelé à la fin ou à l'arrêt. Renvoie false si l'enregistrement n'a pas pu être lu. */
  async jouer(t0: number, t1: number, fin: () => void): Promise<boolean> {
    this.arreter();
    const mon = ++this.jeton;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx ??= new AC();
      this.tampon ??= await this.ctx.decodeAudioData(await this.audio.arrayBuffer());
      if (mon !== this.jeton) return true;
      // un seul son à la fois : le lecteur de l'application (Ayyūb, leçons) se tait
      document.dispatchEvent(new Event('awzid-son'));
      await this.ctx.resume();
      const n = this.ctx.createBufferSource();
      n.buffer = this.tampon;
      n.connect(this.ctx.destination);
      n.onended = () => {
        if (this.src === n) this.src = null;
        if (mon === this.jeton) fin();
      };
      this.src = n;
      const debut = Math.min(Math.max(0, t0), Math.max(0, this.tampon.duration - 0.1));
      n.start(0, debut, Math.max(0.3, Math.min(t1, this.tampon.duration) - debut));
      return true;
    } catch {
      return false;
    }
  }

  arreter(): void {
    this.jeton++;
    const n = this.src;
    this.src = null;
    if (n) {
      n.onended = null;
      try {
        n.stop();
      } catch {
        /* déjà arrêté */
      }
    }
  }

  /** Libère tout (décodage en mémoire compris). */
  fermer(): void {
    this.arreter();
    this.tampon = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
