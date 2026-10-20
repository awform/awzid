/**
 * Cahier de lecture (20/10/2026) — lecture guidée, règle pure (testée) : la case s'allume, son fichier joue, puis une
 * pause de 1,5 fois sa durée laisse le temps de répéter ; on passe à la suivante. Arrêt à tout moment.
 */

/** pause après chaque élément de la lecture guidée : 1,5 fois la durée du fichier */
export const FACTEUR_PAUSE = 1.5;
/** élément sans fichier (rare) : temps laissé pour le lire quand même */
export const SANS_AUDIO_MS = 2000;

export interface Pas {
  cle: string;
  /** joue l'élément jusqu'au bout et renvoie sa durée (ms), ou null s'il n'a pas de son */
  jouer: (signal: AbortSignal) => Promise<number | null>;
}

/** sourate et verset d'une référence « 112:1 » */
export function refVerset(ref: string | undefined): { s: number; v: number } | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(ref ?? '');
  if (!m) return null;
  const s = Number(m[1]);
  const v = Number(m[2]);
  return s >= 1 && s <= 114 && v >= 1 ? { s, v } : null;
}

/**
 * Pour chaque élément : `surPas(i)` (la case s'allume), son fichier, puis la pause. Renvoie vrai si la lecture est
 * allée jusqu'au bout (`surPas(-1)` à la fin), faux si elle a été arrêtée.
 */
export async function lectureGuidee(
  pas: readonly Pas[],
  o: {
    surPas: (i: number) => void;
    signal: AbortSignal;
    attendre?: (ms: number, signal: AbortSignal) => Promise<void>;
    facteur?: number;
    depuis?: number;
  },
): Promise<boolean> {
  const attendre = o.attendre ?? pause;
  for (let i = o.depuis ?? 0; i < pas.length; i++) {
    if (o.signal.aborted) return false;
    o.surPas(i);
    let d: number | null;
    try {
      d = await pas[i]!.jouer(o.signal);
    } catch {
      if (o.signal.aborted) return false;
      d = null;
    }
    try {
      await attendre(
        d == null ? SANS_AUDIO_MS : Math.round(d * (o.facteur ?? FACTEUR_PAUSE)),
        o.signal,
      );
    } catch {
      return false;
    }
  }
  o.surPas(-1);
  return !o.signal.aborted;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok, ko) => {
    if (signal.aborted) return ko(new Error('arret'));
    const t = setTimeout(ok, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        ko(new Error('arret'));
      },
      { once: true },
    );
  });
}
