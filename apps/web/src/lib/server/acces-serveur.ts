/**
 * Bêta fermée — logique SERVEUR de l'application web, sans dépendance à SvelteKit (testée seule) :
 *  - invisibilité : en-tête X-Robots-Tag et robots.txt stricts (aucun moteur de recherche, aucune archive) ;
 *  - mode fermé : décision (page de maintenance pour les navigations, sauf les pages ouvertes) et page sobre en cinq
 *    langues, servie avec le code 503 ;
 *  - journal d'erreurs sans donnée personnelle.
 */

export const EN_TETE_ROBOTS = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

/** Chemins jamais fermés : outils d'exploitation, connexion de l'administrateur, administration, ressources. */
const OUVERT =
  /^\/(_app\/|api\/|connexion(\/|$)|admin(\/|$)|acces(\/|$)|etat|healthz|robots\.txt|i18n\/|favicon|icons\/)/;
export function cheminOuvert(pathname: string): boolean {
  return OUVERT.test(pathname);
}

/** Navigation vers une page (et non une ressource ou un appel de données). */
export function estNavigation(method: string, accept: string | null, pathname: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (pathname.includes('__data.json')) return false;
  return (accept ?? '').includes('text/html');
}

export interface StatutSite {
  site: 'ouvert' | 'ferme';
  /** mode d'accès annoncé par l'API : ferme | invitation | ouvert */
  mode?: string;
  admin?: boolean;
}

/** Faut-il répondre par la page de maintenance ? (site fermé, personne non administratrice, page non ouverte) */
export function doitFermer(
  statut: StatutSite | null,
  pathname: string,
  navigation: boolean,
): boolean {
  if (!navigation || cheminOuvert(pathname)) return false;
  return statut?.site === 'ferme' && statut.admin !== true;
}

type Langue = 'fr' | 'en' | 'es' | 'de' | 'ar';
const TEXTES: Record<Langue, { titre: string; texte: string }> = {
  fr: {
    titre: 'Awzid est momentanément fermé',
    texte:
      'Nous faisons une pause pour améliorer l’application. Merci de votre patience : revenez un peu plus tard.',
  },
  en: {
    titre: 'Awzid is temporarily closed',
    texte:
      'We are taking a short break to improve the app. Thank you for your patience: please come back a little later.',
  },
  es: {
    titre: 'Awzid está cerrado temporalmente',
    texte:
      'Hacemos una pausa para mejorar la aplicación. Gracias por su paciencia: vuelva un poco más tarde.',
  },
  de: {
    titre: 'Awzid ist vorübergehend geschlossen',
    texte:
      'Wir machen eine kurze Pause, um die App zu verbessern. Danke für Ihre Geduld: Bitte kommen Sie etwas später wieder.',
  },
  ar: {
    titre: 'Awzid مغلق مؤقتًا',
    texte: 'نتوقف قليلًا لتحسين التطبيق. شكرًا لصبرك، عد بعد قليل.',
  },
};

/** Langue de la page de maintenance d'après l'en-tête Accept-Language (repli : français). */
export function langueDe(acceptLanguage: string | null): Langue {
  for (const part of (acceptLanguage ?? '').split(',')) {
    const base = part.trim().toLowerCase().split(/[-;]/)[0] ?? '';
    if (base in TEXTES) return base as Langue;
  }
  return 'fr';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Page de maintenance sobre : aucune ressource externe, aucun script, aucune donnée. */
export function pageMaintenance(acceptLanguage: string | null): Response {
  const lang = langueDe(acceptLanguage);
  const x = TEXTES[lang];
  const html = `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Awzid</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4ee;color:#1b2a26;font:18px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:34rem;padding:2rem;text-align:center}
h1{font-size:1.4rem;margin:0 0 .75rem}
p{margin:0}
@media (prefers-color-scheme:dark){body{background:#13211d;color:#e9efe9}}
</style>
</head>
<body>
<main data-testid="maintenance-serveur" role="status">
<h1>${esc(x.titre)}</h1>
<p>${esc(x.texte)}</p>
</main>
</body>
</html>
`;
  return new Response(html, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '600',
      'x-robots-tag': EN_TETE_ROBOTS,
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

const EMAIL_DANS_TEXTE = /[^\s@"'<>()[\]{},;]+@[^\s@"'<>()[\]{},;]+\.[^\s@"'<>()[\]{},;]+/g;
const JETON_LONG = /\b[A-Za-z0-9_-]{32,}\b/g;
const UUID_DANS_TEXTE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const CODE_INVITATION = /AWZ-[A-Z0-9]{5}-[A-Z0-9]{5}/gi;
/** Message d'erreur sans adresse e-mail, identifiant, jeton ni code d'invitation. */
export function nettoyer(texte: string): string {
  return texte
    .replace(EMAIL_DANS_TEXTE, '[adresse]')
    .replace(UUID_DANS_TEXTE, ':id')
    .replace(CODE_INVITATION, '[code]')
    .replace(JETON_LONG, '[jeton]');
}
/** Chemin d'une requête sans paramètres ni fragments (aucun code d'invitation, aucun jeton). */
export function cheminSur(url: string): string {
  return nettoyer((url.split('?')[0] ?? '').split('#')[0] ?? '');
}
