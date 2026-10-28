/**
 * Typographie française à l'affichage (CONVENTIONS §11, comme `frTypo` des livres et `typoFr` des cahiers imprimés) :
 * fine insécable avant ; ! ? et à l'intérieur des guillemets, insécable avant « : ». Ne s'applique qu'à un texte
 * français (aucune lettre arabe) : jamais à l'arabe. Le texte source n'est pas modifié, seul l'affichage l'est.
 */
const FINE = ' ';
const INSECABLE = ' ';
const ARABE = /[؀-ۿ]/;

export function typoFr(s: string): string {
  if (!s || ARABE.test(s)) return s;
  return s
    .replace(/ ([;!?])/g, `${FINE}$1`)
    .replace(/ :(?=\s|$)/g, `${INSECABLE}:`)
    .replace(/« /g, `«${FINE}`)
    .replace(/ »/g, `${FINE}»`);
}

/** Clé de contexte Svelte : les cahiers demandent la typographie française à tous leurs `<Bidi>`. */
export const TYPO_FR = Symbol('typo-fr');
