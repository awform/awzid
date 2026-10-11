/**
 * F5 — modules chargés À LA DEMANDE (Muṣḥaf exact, avis, capture, image du verset, tuteur, réglages…) : un
 * réseau faible coupe parfois une requête. Le chargement est RETENTÉ automatiquement (après 0,6 s puis 1,5 s) ;
 * s'il échoue encore, l'appelant montre « Connexion nécessaire pour cette fonction » (ConnexionNecessaire.svelte)
 * — jamais un écran figé ni une erreur muette.
 *
 * Chromium MÉMORISE l'échec d'un import dynamique pour une adresse (vérifié : un second `import()` de la même
 * adresse échoue sans requête) : chaque nouvelle tentative charge donc le fichier sous une adresse NEUVE
 * (`?essai=n`), lue dans le message d'erreur du navigateur (c'est toujours l'adresse du module demandé, jamais
 * celle d'une dépendance). Sans adresse dans le message (Safari), la même fonction d'import est rappelée.
 */
export const ATTENTES_MODULE = [600, 1500];

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Adresse du module qui n'a pas pu être chargé (message de Chromium ou de Firefox), sans paramètre. */
export function adresseEchec(e: unknown): string | null {
  const m = /(https?:\/\/[^\s'"?]+?\.js)\b/.exec(String((e as Error)?.message ?? e));
  return m ? m[1]! : null;
}

let essai = 0;

/** Charge un module (fonction `() => import('…')`), avec nouvelles tentatives ; rejette si tout échoue. */
export async function chargerModule<T>(
  imp: () => Promise<T>,
  attentes: readonly number[] = ATTENTES_MODULE,
  importer: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url),
): Promise<T> {
  let err: unknown;
  let url: string | null = null;
  for (let i = 0; i <= attentes.length; i++) {
    try {
      return url ? ((await importer(`${url}?essai=${++essai}`)) as T) : await imp();
    } catch (e) {
      err = e;
      url ??= adresseEchec(e);
      if (i < attentes.length) await pause(attentes[i]!);
    }
  }
  throw err;
}
