/**
 * Lecteur du Coran — enchaînement sans coupure (30/10/2026, retour du client : récitation d'as-Sudays saccadée sur
 * les versets courts du Juz ʿAmma). Cause : un seul élément audio, `preload="none"`, et le fichier du verset suivant
 * n'était demandé (puis décodé) qu'APRÈS la fin du précédent : un silence de la durée du chargement entre deux
 * versets, proportionnellement énorme sur un verset d'une seconde.
 * Règle : pendant qu'un verset est lu, le suivant est chargé dans un SECOND élément audio ; à la fin du premier,
 * le second démarre aussitôt (même logique pour tous les récitateurs, Ayyūb compris). Fonctions pures, testées.
 */

/** Prochain élément jouable de la file après `idx` (les versets sans fichier sont sautés, comme à la lecture). */
export function prochainJouable<F extends { url: string }>(
  queue: readonly number[],
  idx: number,
  fichier: (aya: number) => F | null | undefined,
): { i: number; aya: number; f: F } | null {
  for (let i = Math.max(-1, idx) + 1; i < queue.length; i++) {
    const aya = queue[i]!;
    const f = fichier(aya);
    if (f) return { i, aya, f };
  }
  return null;
}

/** Fichier déjà chargé dans l'élément de réserve : retenu pour la position `i` de la file. */
export interface Reserve {
  i: number;
  aya: number;
  /** adresse réellement posée sur l'élément (peut être un blob hors ligne) */
  url: string;
}

/** Réserve d'un seul verset d'avance (un deuxième élément audio suffit : jamais plus d'un fichier chargé d'avance). */
export class Prechargeur {
  private r: Reserve | null = null;
  /** jeton : une préparation lancée avant `vider()` ne remplit plus la réserve */
  private n = 0;
  debut(): number {
    return this.n;
  }
  /** range le fichier prêt ; refusé si la file a changé entre-temps */
  ranger(jeton: number, r: Reserve): boolean {
    if (jeton !== this.n) return false;
    this.r = r;
    return true;
  }
  /** la réserve si elle correspond exactement à la position et au verset demandés ; elle est alors consommée */
  prendre(i: number, aya: number): Reserve | null {
    const r = this.r;
    if (!r || r.i !== i || r.aya !== aya) return null;
    this.r = null;
    return r;
  }
  /** déjà prêt (ou en cours) pour cette position */
  a(i: number): boolean {
    return this.r?.i === i;
  }
  /** abandonne la réserve et les préparations en cours ; renvoie l'ancienne réserve (adresse à libérer) */
  vider(): Reserve | null {
    this.n++;
    const r = this.r;
    this.r = null;
    return r;
  }
}
