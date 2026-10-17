/**
 * Provenance d'une visite (code QR des affiches : `https://awzid.com/?src=affiche`, plus tard `?src=mosquee-xxx`).
 * Validation stricte (même règle que la page d'accueil, l'API et la base) ; toute autre valeur est ignorée.
 * Gardée dans le stockage de SESSION de l'onglet (effacé à sa fermeture) : ni cookie ni traceur, aucune autre donnée.
 * La page d'accueil publique (/accueil.js) écrit la même clé ; l'inscription la lit et l'envoie avec la demande.
 */
export const SOURCE_RE = /^[a-z0-9-]{1,40}$/;
const CLE = 'awzid_src';

export function sourceValide(v: unknown): string | null {
  return typeof v === 'string' && SOURCE_RE.test(v) ? v : null;
}

/** Retient la provenance de l'adresse (?src=) si elle est valide ; rend la provenance retenue pour la session. */
export function retenirSource(search: URLSearchParams): string | null {
  const s = sourceValide(search.get('src'));
  try {
    if (s) sessionStorage.setItem(CLE, s);
    return s ?? sourceValide(sessionStorage.getItem(CLE));
  } catch {
    return s; // stockage indisponible (navigation privée stricte) : seule l'adresse compte
  }
}
