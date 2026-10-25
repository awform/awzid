/**
 * Mouvement réduit (`prefers-reduced-motion`) : les positions changent sans interpolation, l'index ne bouge plus,
 * l'eau est figée, plus d'ondes ; la vidéo vivante enchaîne toujours les étapes et la voix.
 */
export const reduit = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Retour tactile court si l'appareil le permet (jamais sans geste préalable de la personne). */
export function vibrer(motif: number | number[]): void {
  try {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (!ua || ua.hasBeenActive) navigator.vibrate(motif);
  } catch {
    /* appareil sans vibration */
  }
}

/** Attente (ms) qui s'interrompt avec le signal. */
export const attendre = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((ok) => {
    if (signal?.aborted) return ok();
    const t = setTimeout(ok, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        ok();
      },
      { once: true },
    );
  });
