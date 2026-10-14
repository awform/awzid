/**
 * Bêta fermée — crochets serveur de l'application web :
 *  - INVISIBLE : `X-Robots-Tag` sur toutes les réponses de l'application, `robots.txt` strict, aucun sitemap ;
 *  - MODE FERMÉ : si l'API annonce « site fermé », toute navigation (sauf connexion, administration, état du
 *    service) reçoit la page de maintenance sobre (503), sauf pour un administrateur connecté ;
 *  - SONDE `/healthz` (réponse minimale, 503 si l'API ou la base ne répond pas) ;
 *  - journal d'erreurs sans donnée personnelle.
 * La page de maintenance de Caddy (API arrêtée) reste le filet de dernier recours.
 */
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
  doitFermer,
  EN_TETE_ROBOTS,
  estNavigation,
  nettoyer,
  pageMaintenance,
  ROBOTS_TXT,
  type StatutSite,
} from '$lib/server/acces-serveur';
import { afficherAccueil, configAccueil, langueAccueil, reponseAccueil } from '$lib/server/accueil';

const api = () => env.API_URL ?? 'http://127.0.0.1:3000';
/** Page d'accueil publique (liste d'attente) : réglages lus à chaque requête (ACCUEIL_PUBLIC, ACCUEIL_INDEXABLE, ACCUEIL_LANGUES). */
const accueil = () => configAccueil(env);

async function lireStatut(cookie: string | null): Promise<StatutSite | null> {
  try {
    const r = await fetch(`${api()}/api/v1/acces/statut`, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(1500),
    });
    return r.ok ? ((await r.json()) as StatutSite) : null;
  } catch {
    return null; // API arrêtée : la page de maintenance de Caddy prend le relais, l'application ne bloque pas
  }
}

/** Statut du site SANS session, gardé 5 s (une seule requête pour beaucoup de visiteurs). */
let cache: { at: number; v: StatutSite | null } | null = null;
async function statutSite(): Promise<StatutSite | null> {
  if (cache && Date.now() - cache.at < 5000) return cache.v;
  const v = await lireStatut(null);
  cache = { at: Date.now(), v };
  return v;
}

const securise = (r: Response, indexable = false): Response => {
  try {
    // seule la page d'accueil publique peut être rendue indexable (ACCUEIL_INDEXABLE=on) ; tout le reste reste interdit
    if (!indexable) r.headers.set('X-Robots-Tag', EN_TETE_ROBOTS);
    if (!r.headers.has('referrer-policy')) r.headers.set('Referrer-Policy', 'no-referrer');
    if (!r.headers.has('x-content-type-options'))
      r.headers.set('X-Content-Type-Options', 'nosniff');
    return r;
  } catch {
    // en-têtes figés (réponse relayée) : copie
    const h = new Headers(r.headers);
    h.set('X-Robots-Tag', EN_TETE_ROBOTS);
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }
};

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  if (pathname === '/robots.txt')
    return securise(
      new Response(ROBOTS_TXT, { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    );
  if (pathname === '/sitemap.xml' || pathname === '/sitemap_index.xml')
    return securise(new Response('introuvable', { status: 404 }));
  if (pathname === '/healthz') {
    try {
      const r = await fetch(`${api()}/healthz`, { signal: AbortSignal.timeout(3000) });
      return securise(
        new Response(JSON.stringify({ status: r.ok ? 'ok' : 'degrade' }), {
          status: r.ok ? 200 : 503,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        }),
      );
    } catch {
      return securise(
        new Response(JSON.stringify({ status: 'injoignable' }), {
          status: 503,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        }),
      );
    }
  }

  // sans JavaScript, le formulaire de la page d'accueil arrive ici : rien n'est lu ni gardé, retour à la page
  if (pathname.startsWith('/bienvenue') && event.request.method === 'POST')
    return securise(
      new Response(null, {
        status: 303,
        headers: { location: '/bienvenue', 'cache-control': 'no-store' },
      }),
    );

  const nav = estNavigation(event.request.method, event.request.headers.get('accept'), pathname);
  const base = nav ? await statutSite() : null;
  if (doitFermer(base, pathname, nav)) {
    // l'administrateur connecté passe : on le demande à l'API avec son cookie (jamais mis en cache)
    const cookie = event.request.headers.get('cookie');
    const perso = cookie ? await lireStatut(cookie) : null;
    if (doitFermer(perso ?? base, pathname, nav))
      return pageMaintenance(event.request.headers.get('accept-language'));
  }
  // page d'accueil publique : visiteur sans session sur « / » (bêta sur invitation) ou adresse /bienvenue
  const lecture = event.request.method === 'GET' || event.request.method === 'HEAD';
  // pages des liens reçus par e-mail (confirmation, désinscription) : toujours servies, jamais indexables
  const lien =
    lecture && (pathname === '/bienvenue/confirmer' || pathname === '/bienvenue/desinscription');
  if (lien) {
    const cfg = accueil();
    return securise(
      reponseAccueil({
        cfg,
        vue: pathname.endsWith('confirmer') ? 'confirmer' : 'desinscription',
        lang: langueAccueil(
          event.url.searchParams.get('lang'),
          event.request.headers.get('accept-language'),
          cfg.langues,
        ),
      }),
    );
  }
  if (nav || (lecture && pathname === '/bienvenue')) {
    const cfg = accueil();
    const cookie = event.request.headers.get('cookie');
    const mode = cfg.public === 'off' ? null : ((await statutSite())?.mode ?? null);
    if (afficherAccueil(cfg, pathname, cookie, mode))
      return securise(
        reponseAccueil({
          cfg,
          lang: langueAccueil(
            event.url.searchParams.get('lang'),
            event.request.headers.get('accept-language'),
            cfg.langues,
          ),
        }),
        cfg.indexable,
      );
  }
  return securise(await resolve(event));
};

/** Journal d'erreurs : chemin sans paramètres, message nettoyé (adresses, identifiants, jetons, codes). */
export const handleError: HandleServerError = ({ error, event, status }) => {
  const message = nettoyer(String((error as Error | undefined)?.message ?? '')).slice(0, 300);
  console.error(
    JSON.stringify({
      level: 50,
      msg: 'erreur web',
      status,
      route: event.route.id,
      type: (error as Error | undefined)?.name ?? 'Error',
      message,
    }),
  );
  return { message: 'erreur interne' };
};
