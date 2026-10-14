/**
 * Page d'accueil PUBLIQUE d'Awzid (liste d'attente de la bêta fermée) — logique SERVEUR, sans dépendance à SvelteKit.
 *
 * Pourquoi une page servie par le serveur et non par l'application : un visiteur anonyme ne doit pas télécharger
 * l'application (≈ 110 Ko avant le premier écran) pour lire trois paragraphes et laisser son adresse. La page pèse
 * quelques Ko (CSS en ligne, logo SVG en ligne, une seule police de la marque, un petit script de 2 Ko) et fonctionne
 * en 3G. Aucune ressource tierce, aucun cookie, aucun suivi.
 *
 * Réglages (variables d'environnement du service web, documentés dans docs/projet/EXPLOITATION.md § « Page d'accueil ») :
 *  - ACCUEIL_PUBLIC = auto (défaut) | on | off
 *      auto : la page remplace l'accueil de l'application POUR LES VISITEURS SANS SESSION quand le site est en mode
 *             « sur invitation » ; on : pour tout visiteur sans session, quel que soit le mode ; off : jamais.
 *      L'adresse /bienvenue montre toujours la page (sauf off) : relecture, captures, lien à partager.
 *  - ACCUEIL_INDEXABLE = off (défaut) | on : off = « noindex » partout ; on = la page seule perd son « noindex » (en-tête
 *      et balise ; le reste du site reste interdit). robots.txt et l'en-tête X-Robots-Tag du proxy Caddy sont des réglages
 *      d'infrastructure à changer aussi (docs/projet/EXPLOITATION.md, § « Page d'accueil publique ») : tant qu'ils
 *      interdisent tout, la page n'est pas indexée, même avec ACCUEIL_INDEXABLE=on.
 *  - ACCUEIL_LANGUES = fr,en (défaut) : langues proposées (catalogues dans static/i18n/accueil/<langue>.json).
 * Le formulaire envoie la demande au mécanisme EXISTANT (POST /api/v1/acces/liste-attente : consentement, limites par
 * adresse IP, jeton anti-robots signé et champ piège) ; rien n'est réécrit ici.
 */
import fr from '../../../static/i18n/accueil/fr.json';
import en from '../../../static/i18n/accueil/en.json';
import { EN_TETE_ROBOTS } from './acces-serveur';

export type TextesAccueil = typeof fr;
export const CATALOGUES: Record<string, TextesAccueil> = { fr, en };
const NOMS: Record<string, string> = { fr: 'Français', en: 'English' };
export const CONTACT = 'contact@awzid.com';
export const COOKIE_SESSION = 'awform_session';

export interface ConfigAccueil {
  public: 'auto' | 'on' | 'off';
  indexable: boolean;
  langues: string[];
}

/** Lecture des réglages (valeurs inconnues : repli prudent — page non indexable, langues connues seulement). */
export function configAccueil(env: Record<string, string | undefined>): ConfigAccueil {
  const p = (env.ACCUEIL_PUBLIC ?? 'auto').trim().toLowerCase();
  const langues = (env.ACCUEIL_LANGUES ?? 'fr,en')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x, i, a) => x in CATALOGUES && a.indexOf(x) === i);
  return {
    public: p === 'on' || p === 'off' ? p : 'auto',
    indexable: (env.ACCUEIL_INDEXABLE ?? 'off').trim().toLowerCase() === 'on',
    langues: langues.length ? langues : ['fr'],
  };
}

/** Langue de la page : ?lang= si permise, sinon Accept-Language, sinon français. */
export function langueAccueil(
  param: string | null,
  acceptLanguage: string | null,
  permises: string[],
): string {
  const p = (param ?? '').toLowerCase();
  if (permises.includes(p)) return p;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const base = part.trim().toLowerCase().split(/[-;]/)[0] ?? '';
    if (permises.includes(base)) return base;
  }
  return permises.includes('fr') ? 'fr' : (permises[0] ?? 'fr');
}

/** Un visiteur « sans session » n'a pas le cookie de session (il n'est pas connecté). */
export function sansSession(cookie: string | null): boolean {
  return !new RegExp(`(?:^|;\\s*)${COOKIE_SESSION}=`).test(cookie ?? '');
}

/**
 * Faut-il servir la page d'accueil publique à cette navigation ?
 *  - /bienvenue : toujours (sauf réglage « off ») ;
 *  - / : seulement pour un visiteur sans session, et selon le réglage (voir en-tête du module).
 */
export function afficherAccueil(
  cfg: ConfigAccueil,
  pathname: string,
  cookie: string | null,
  modeSite: string | null | undefined,
): boolean {
  if (cfg.public === 'off') return false;
  if (pathname === '/bienvenue' || pathname === '/bienvenue/') return true;
  if (pathname !== '/') return false;
  if (!sansSession(cookie)) return false;
  return cfg.public === 'on' || modeSite === 'invitation';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Symbole de la marque (vrai dessin de marque/svg/awzid-symbole.svg), couleurs par variables de thème. */
const SYMBOLE = `<symbol id="s" viewBox="76 36 168 216"><path d="M114,142 L114,118 Q114,82 150,66 Q158,60 160,46 Q162,60 170,66 Q206,82 206,118 L206,142" fill="none" stroke="var(--or)" stroke-width="11"/><polygon points="160,84 164.5,98.5 179,103 164.5,107.5 160,122 155.5,107.5 141,103 155.5,98.5" fill="var(--or)"/><path d="M160,196 Q118,186 100,146 Q140,148 160,196 Z" fill="var(--feuille)"/><path d="M160,196 Q202,186 220,146 Q180,148 160,196 Z" fill="var(--feuille)"/><path d="M160,196 L160,150" stroke="var(--feuille)" stroke-width="5" stroke-linecap="round"/><path d="M160,214 Q128,188 86,180 L86,198 Q126,204 160,232 Z" fill="var(--aile)"/><path d="M160,214 Q192,188 234,180 L234,198 Q194,204 160,232 Z" fill="var(--aile)"/><path d="M84,206 Q126,214 160,242 Q194,214 236,206" fill="none" stroke="var(--or)" stroke-width="4"/></symbol>`;

/** Charte (marque/project/tokens.json) : clair par défaut, sombre selon le système. L'or n'est jamais une couleur de texte. */
const CSS = `
:root{--fond:#FBF7EE;--surface:#F2EBDA;--em:#0B6E4F;--titre:#084C38;--feuille:#1F9C73;--aile:#0B6E4F;--or:#C9A227;--texte:#1E2B25;--doux:#4A5A52;--filet:#DDD3BD;--erreur:#A3261E;--bouton-texte:#FBF7EE;--focus:#0B6E4F;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--fond:#0D1A15;--surface:#14261F;--em:#1F9C73;--titre:#E8DFC8;--feuille:#5CC79C;--aile:#E8DFC8;--or:#D9B54A;--texte:#E8DFC8;--doux:#B4C2BA;--filet:#28423A;--erreur:#F2B8B5;--bouton-texte:#0D1A15;--focus:#5CC79C}}
@font-face{font-family:Lexend;font-weight:600;font-style:normal;font-display:swap;src:local("Lexend SemiBold"),url(/fonts/lexend-latin-600-normal.woff2) format("woff2")}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fond);color:var(--texte);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
h1,h2,h3,.marque{font-family:Lexend,"Segoe UI",Arial,sans-serif;font-weight:600;color:var(--titre);line-height:1.2;margin:0}
a{color:var(--em)}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:6px}
.saut{position:absolute;left:-999px;top:0;background:var(--fond);color:var(--texte);padding:.75rem 1rem;z-index:9}
.saut:focus{left:1rem;top:1rem}
.conteneur{width:100%;max-width:70rem;margin:0 auto;padding:0 1rem}
header .conteneur{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-top:1rem;padding-bottom:1rem}
.logo{display:flex;align-items:center;gap:.6rem;text-decoration:none;color:var(--titre)}
.logo svg{width:2.4rem;height:3.1rem;display:block}
.marque{font-size:1.6rem;letter-spacing:-.02em}
.devise{display:block;font:400 .8125rem/1.2 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:var(--doux);letter-spacing:0}
nav.langues{display:flex;gap:.25rem}
nav.langues a{display:inline-block;padding:.5rem .75rem;border-radius:999px;text-decoration:none;color:var(--doux);min-height:2.75rem;line-height:1.75rem}
nav.langues a[aria-current=true]{background:var(--surface);color:var(--titre);font-weight:700;border:1px solid var(--filet)}
.heros{padding:1.5rem 0 2.5rem;display:grid;gap:2rem}
.pastille{display:inline-block;margin:0 0 1rem;padding:.25rem .875rem;border-radius:999px;background:var(--surface);border:1px solid var(--filet);color:var(--titre);font-weight:700;font-size:.9375rem}
h1{font-size:clamp(1.75rem,6vw,2.75rem);letter-spacing:-.02em}
.lead{font-size:1.1875rem;margin:1rem 0 0}
.beta{color:var(--doux);margin:1rem 0 0}
.filet{height:4px;width:4.5rem;background:var(--or);border-radius:2px;margin:1.5rem 0 0}
.carte{background:var(--surface);border:1px solid var(--filet);border-radius:12px;padding:1.25rem}
.carte h2{font-size:1.3125rem;margin-bottom:1rem}
form{display:grid;gap:1rem}
label.champ{display:grid;gap:.375rem;font-weight:600}
input[type=email]{font:inherit;min-height:3rem;padding:.5rem .75rem;border:2px solid var(--doux);border-radius:6px;background:var(--fond);color:var(--texte);width:100%}
.coche{display:flex;gap:.75rem;align-items:flex-start;font-weight:400}
.coche input{width:1.5rem;height:1.5rem;flex:none;margin:.125rem 0 0;accent-color:var(--em)}
button{font:inherit;font-weight:700;min-height:3rem;padding:.5rem 1.25rem;border:0;border-radius:12px;background:var(--em);color:var(--bouton-texte);cursor:pointer}
button[disabled]{opacity:.7;cursor:progress}
.etat{margin:0;min-height:1.5rem}
.etat.erreur{color:var(--erreur);font-weight:600}
.etat.ok{font-weight:600;color:var(--titre)}
.piege{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.rgpd{margin-top:1rem;border-top:1px solid var(--filet);padding-top:.25rem;font-size:.9375rem;color:var(--doux)}
.rgpd summary{cursor:pointer;display:flex;align-items:center;min-height:2.75rem;font-weight:600;color:var(--titre)}
.rgpd[open] summary{margin-bottom:.25rem}
.rgpd p{margin:.375rem 0}
.lien{max-width:40rem;padding-top:2rem;padding-bottom:3rem}
.lien h1{font-size:clamp(1.5rem,5vw,2rem);margin-bottom:1rem}
.sans-js{color:var(--doux)}
section.bloc{padding:2rem 0;border-top:1px solid var(--filet)}
section.bloc>.conteneur>h2{font-size:1.5rem;margin-bottom:1.25rem}
.grille{display:grid;gap:1rem;margin:0;padding:0;list-style:none}
.grille li{background:var(--surface);border:1px solid var(--filet);border-radius:12px;padding:1.25rem}
.grille h3{font-size:1.125rem;margin-bottom:.5rem}
.grille p{margin:0}
.etats{display:grid;gap:1.5rem}
.etats h3{font-size:1.125rem;margin-bottom:.75rem}
.etats ul{margin:0;padding:0;list-style:none;display:grid;gap:.625rem}
.etats li{padding-inline-start:1.75rem;position:relative}
.etats li::before{content:"";position:absolute;inset-inline-start:0;top:.55rem;width:.75rem;height:.75rem;background:var(--em);transform:rotate(45deg);border-radius:2px}
.etats .bientot li::before{background:transparent;border:2px solid var(--em)}
footer{border-top:1px solid var(--filet);padding:1.5rem 0 2.5rem;color:var(--doux);font-size:.9375rem}
footer ul{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;list-style:none;margin:0 0 1rem;padding:0}
footer a{display:inline-block;min-height:2.75rem;line-height:2.75rem}
footer p{margin:0}
@media (min-width:48rem){.grille{grid-template-columns:repeat(2,1fr)}.etats{grid-template-columns:repeat(2,1fr)}}
@media (min-width:64rem){.heros{grid-template-columns:1.15fr 1fr;align-items:start;padding:3rem 0 4rem;gap:3rem}.grille{grid-template-columns:repeat(4,1fr)}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
`;

export type Vue = 'accueil' | 'confirmer' | 'desinscription';
export interface OptionsPage {
  /** page affichée : l'accueil, ou la page d'un lien reçu par e-mail (confirmation, désinscription) */
  vue?: Vue;
  lang: string;
  cfg: ConfigAccueil;
}

/** Textes envoyés au script du formulaire (messages d'erreur, pas de contenu libre). */
const messagesJs = (x: TextesAccueil) =>
  JSON.stringify({
    ok: x.ok,
    envoi: x.envoi,
    e_email: x.e_email,
    e_consent: x.e_consent,
    e_trop: x.e_trop,
    e_robot: x.e_robot,
    e_ferme: x.e_ferme,
    e_reseau: x.e_reseau,
    deja: x.confirmer_deja,
    confirmer_ok: x.confirmer_ok,
    desinscr_ok: x.desinscr_ok,
    invalide: x.lien_invalide,
    attente: x.lien_attente,
  });

/** HTML de la page (chaîne complète). */
export function htmlAccueil({ lang, cfg: cfgBase, vue = 'accueil' }: OptionsPage): string {
  // les pages de lien (e-mail) ne sont jamais indexables
  const cfg = vue === 'accueil' ? cfgBase : { ...cfgBase, indexable: false };
  const x = CATALOGUES[lang] ?? fr;
  const l = lang in CATALOGUES ? lang : 'fr';
  const robots = cfg.indexable ? 'index, follow' : 'noindex, nofollow, noarchive';
  const langues =
    cfg.langues.length > 1
      ? `<nav class="langues" aria-label="${esc(x.langues)}">${cfg.langues
          .map(
            (c) =>
              `<a href="?lang=${c}" lang="${c}" hreflang="${c}"${c === l ? ' aria-current="true"' : ''}>${esc(NOMS[c] ?? c)}</a>`,
          )
          .join('')}</nav>`
      : '';
  const forts = [1, 2, 3, 4]
    .map(
      (n) =>
        `<li><h3>${esc(x[`f${n}_t` as keyof TextesAccueil])}</h3><p>${esc(x[`f${n}_p` as keyof TextesAccueil])}</p></li>`,
    )
    .join('');
  const liste = (pre: string, n: number) =>
    Array.from(
      { length: n },
      (_, i) => `<li>${esc(x[`${pre}_${i + 1}` as keyof TextesAccueil])}</li>`,
    ).join('');
  const accueilMain = `<main id="contenu">
<div class="conteneur heros">
<div>
<p class="pastille">${esc(x.pastille)}</p>
<h1>${esc(x.h1)}</h1>
<p class="lead">${esc(x.intro)}</p>
<p class="beta">${esc(x.beta)}</p>
<div class="filet" aria-hidden="true"></div>
</div>
<div class="carte">
<h2 id="form-titre">${esc(x.form_titre)}</h2>
<form id="attente" method="post" action="/bienvenue" aria-labelledby="form-titre" data-lang="${l}" data-msg="${esc(messagesJs(x))}">
<label class="champ" for="email">${esc(x.email)}<input id="email" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254"></label>
<div class="piege" aria-hidden="true"><label>Site web<input name="site_web" type="text" tabindex="-1" autocomplete="off"></label></div>
<label class="coche"><input id="consent" name="consentement" type="checkbox" required><span>${esc(x.consent)}</span></label>
<button type="submit">${esc(x.bouton)}</button>
<p id="etat" class="etat" role="status" aria-live="polite" tabindex="-1"></p>
<noscript><p class="sans-js">${esc(x.sans_js)}</p></noscript>
</form>
<details class="rgpd">
<summary>${esc(x.rgpd_titre)}</summary>
<p>${esc(x.rgpd_resp)}</p>
<p>${esc(x.rgpd_fin)}</p>
<p>${esc(x.rgpd_base)}</p>
<p>${esc(x.rgpd_duree)}</p>
<p>${esc(x.rgpd_dest)}</p>
<p>${esc(x.rgpd_droits)}</p>
<p>${esc(x.rgpd_prov)} <a href="/legal/confidentialite">${esc(x.rgpd_lien)}</a></p>
</details>
</div>
</div>
<section class="bloc" aria-labelledby="forts"><div class="conteneur"><h2 id="forts">${esc(x.forts_titre)}</h2><ul class="grille">${forts}</ul></div></section>
<section class="bloc" aria-labelledby="etat-t"><div class="conteneur"><h2 id="etat-t">${esc(x.etat_titre)}</h2>
<div class="etats">
<div><h3>${esc(x.dispo_t)}</h3><ul>${liste('dispo', 5)}</ul></div>
<div class="bientot"><h3>${esc(x.bientot_t)}</h3><ul>${liste('bientot', 5)}</ul></div>
</div></div></section>
</main>`;
  const action = vue === 'desinscription' ? 'desinscrire' : 'confirmer';
  const lienMain = `<main id="contenu"><div class="conteneur lien"><div class="carte">
<h1>${esc(vue === 'confirmer' ? x.confirmer_titre : x.desinscr_titre)}</h1>
<p>${esc(vue === 'confirmer' ? x.confirmer_texte : x.desinscr_texte)}</p>
<form id="lien" method="post" action="/bienvenue" data-action="${action}" data-msg="${esc(messagesJs(x))}">
<button type="submit">${esc(vue === 'confirmer' ? x.confirmer_bouton : x.desinscr_bouton)}</button>
<p id="etat" class="etat" role="status" aria-live="polite" tabindex="-1"></p>
<noscript><p class="sans-js">${esc(x.sans_js)}</p></noscript>
</form>
<p><a href="/">${esc(x.retour)}</a></p>
</div></div></main>`;
  return `<!doctype html>
<html lang="${l}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(vue === 'accueil' ? x.titre : vue === 'confirmer' ? x.confirmer_titre : x.desinscr_titre)}</title>
<meta name="description" content="${esc(x.description)}">
<meta name="robots" content="${robots}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FBF7EE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1A15" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${CSS}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${SYMBOLE}</svg>
<a class="saut" href="#contenu">${esc(x.aller_contenu)}</a>
<header>
<div class="conteneur">
<a class="logo" href="/" aria-label="Awzid"><svg aria-hidden="true" focusable="false"><use href="#s"/></svg><span><span class="marque">Awzid</span><span class="devise">${esc(x.devise)}</span></span></a>
${langues}
</div>
</header>
${vue === 'accueil' ? accueilMain : lienMain}
<footer>
<div class="conteneur">
<ul>
<li><a href="/legal/mentions">${esc(x.pied_mentions)}</a></li>
<li><a href="/legal/confidentialite">${esc(x.pied_confid)}</a></li>
<li><a href="mailto:${CONTACT}">${esc(x.pied_contact)}</a></li>
<li><a href="/inscription">${esc(x.pied_code)}</a></li>
<li><a href="/connexion">${esc(x.pied_connexion)}</a></li>
</ul>
<p>${esc(x.pied_note)}</p>
</div>
</footer>
<script src="/accueil.js" defer></script>
</body>
</html>
`;
}

/** Réponse HTTP de la page : aucune ressource tierce (CSP stricte), pas de cookie, pas de mise en cache partagée. */
export function reponseAccueil(opts: OptionsPage): Response {
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-cache',
    vary: 'Accept-Language, Cookie',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-language': opts.lang,
  };
  if (!opts.cfg.indexable || (opts.vue ?? 'accueil') !== 'accueil')
    headers['x-robots-tag'] = EN_TETE_ROBOTS;
  return new Response(htmlAccueil(opts), { status: 200, headers });
}
