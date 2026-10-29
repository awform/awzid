/**
 * V2-0 — mesure ANONYME des étapes atteintes dans l'inscription et la connexion : un compteur par étape, rien d'autre.
 * Envoyé sans cookie (`credentials: 'omit'`), sans identifiant, sans adresse e-mail, sans compte ; seulement l'étape,
 * la plateforme (téléphone ou ordinateur) et la langue de l'interface. Chaque étape n'est comptée qu'une fois par
 * ouverture de page (sauf l'échec du mot de passe, compté à chaque échec). Aucune erreur n'est montrée si l'envoi échoue.
 */
import { locale } from '$lib/i18n';

const vues = new Set<string>();
const LANGUES = ['fr', 'en', 'es', 'de', 'ar'];

export function mesure(etape: string): void {
  if (typeof window === 'undefined') return;
  if (etape !== 'connexion_echec_mdp') {
    if (vues.has(etape)) return;
    vues.add(etape);
  }
  const l = locale();
  void fetch('/api/v1/mesure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-awform': '1' },
    credentials: 'omit',
    keepalive: true,
    body: JSON.stringify({
      etape,
      plateforme: matchMedia('(pointer: coarse), (max-width: 767px)').matches ? 'mobile' : 'bureau',
      langue: LANGUES.includes(l) ? l : 'autre',
    }),
  }).catch(() => undefined);
}
