/**
 * Page d'accueil PUBLIQUE d'Awzid (liste d'attente de la bêta fermée) — logique SERVEUR, sans dépendance à SvelteKit.
 *
 * Pourquoi une page servie par le serveur et non par l'application : un visiteur anonyme ne doit pas télécharger
 * l'application (≈ 110 Ko avant le premier écran) pour lire quelques paragraphes et laisser son adresse. La page pèse
 * quelques Ko (CSS en ligne, logo et icônes SVG en ligne, deux polices de la charte servies par nos serveurs, un petit
 * script) et fonctionne en 3G. Aucune ressource tierce, aucun cookie, aucun suivi.
 *
 * Mise en page (refonte « moderne organique », 16/10/2026) : en-tête (logo, langue, « Se connecter ») ; héros (promesse,
 * sous-titre, UN appel à l'action « Demander une invitation » qui descend au formulaire, lien « J'ai déjà une
 * invitation ») ; les trois univers ; « Pour qui ? » ; « Comment ça marche » ; confiance ; bandeau final avec le
 * formulaire de liste d'attente ; pied de page. Tout est en ligne (SVG, motif étoilé de la charte), sans image,
 * sans visage, sans texte arabe.
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

/**
 * Provenance de la visite : code court de l'adresse des affiches (`?src=affiche`, `?src=mosquee-xxx`). Validation
 * stricte (même règle que l'API et la base) ; toute autre valeur est ignorée. Elle n'est ni un cookie ni un traceur :
 * un champ caché du formulaire, recopié par /accueil.js dans le stockage de SESSION du navigateur (effacé à la
 * fermeture de l'onglet) pour suivre le visiteur jusqu'à /inscription, puis envoyé avec la demande ou l'inscription.
 */
export function sourceAccueil(param: string | null): string | null {
  return param && /^[a-z0-9-]{1,40}$/.test(param) ? param : null;
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

/** Symbole de la marque (vrai dessin de marque/svg/awzid-symbole.svg, non modifié), couleurs par variables de thème. */
const SYMBOLE = `<symbol id="s" viewBox="76 36 168 216"><path d="M114,142 L114,118 Q114,82 150,66 Q158,60 160,46 Q162,60 170,66 Q206,82 206,118 L206,142" fill="none" stroke="var(--or)" stroke-width="11"/><polygon points="160,84 164.5,98.5 179,103 164.5,107.5 160,122 155.5,107.5 141,103 155.5,98.5" fill="var(--or)"/><path d="M160,196 Q118,186 100,146 Q140,148 160,196 Z" fill="var(--feuille)"/><path d="M160,196 Q202,186 220,146 Q180,148 160,196 Z" fill="var(--feuille)"/><path d="M160,196 L160,150" stroke="var(--feuille)" stroke-width="5" stroke-linecap="round"/><path d="M160,214 Q128,188 86,180 L86,198 Q126,204 160,232 Z" fill="var(--aile)"/><path d="M160,214 Q192,188 234,180 L234,198 Q194,204 160,232 Z" fill="var(--aile)"/><path d="M84,206 Q126,214 160,242 Q194,214 236,206" fill="none" stroke="var(--or)" stroke-width="4"/></symbol>`;
/**
 * Motif étoilé fin de la charte (celui des bandeaux de l'accueil élève, --motif-etoile de app.css), en motif SVG en ligne
 * (aucune image, aucune adresse) : blanc très léger sur le vert (#m), or très léger sur le crème du héros (#mo).
 */
const MOTIFS = ['m', 'mo']
  .map(
    (id) =>
      `<pattern id="${id}" width="44" height="44" patternUnits="userSpaceOnUse"><g fill="none" stroke="${id === 'm' ? '#FFFFFF' : '#C9A227'}" stroke-opacity="${id === 'm' ? '.16' : '.26'}"><rect x="14" y="14" width="16" height="16"/><rect x="14" y="14" width="16" height="16" transform="rotate(45 22 22)"/></g></pattern>`,
  )
  .join('');
const motif = (id: string, cls = '') =>
  `<svg class="motif${cls}" aria-hidden="true" focusable="false"><rect width="100%" height="100%" fill="url(#${id})"/></svg>`;

/**
 * Icônes au trait (24 × 24, trait 1,75, couleur du thème), sans visage ni écriture : dessinées pour cette page.
 * arabe : bulle de parole ; coran : livre ouvert sur son pupitre ; islam : arche de mosquée ; famille : maison ;
 * ado : sac à dos ; adulte : horloge (« à votre rythme ») ; ecole : bâtiment à colonnes ; source : livre marqué ;
 * pub : cercle barré ; donnees : bouclier ; ok : coche ; temps : horloge ; suivi : courbe de progrès.
 */
const ICONES: Record<string, string> = {
  arabe: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  coran:
    '<path d="M3.5 6.5c3-1 5.8-.6 8.5 1.6 2.7-2.2 5.5-2.6 8.5-1.6v8.2c-3-1-5.8-.6-8.5 1.6-2.7-2.2-5.5-2.6-8.5-1.6z"/><path d="M12 8.1v8.2M7.5 21l9-4.5M16.5 21l-9-4.5"/>',
  islam:
    '<path d="M5.5 21v-8.5a6.5 6.5 0 0 1 13 0V21M3.5 21h17M12 6V3M9.75 21v-3.5a2.25 2.25 0 0 1 4.5 0V21"/>',
  famille: '<path d="M3.5 11 12 4.5l8.5 6.5"/><path d="M5.5 9.8V20h13V9.8M10 20v-5h4v5"/>',
  ado: '<path d="M7 9.5a5 5 0 0 1 10 0V20H7z"/><path d="M10 4.8V3.5h4v1.3M9.5 13.5h5v3h-5z"/>',
  adulte: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ecole:
    '<path d="M3.5 9.5 12 4.5l8.5 5M4.5 9.5h15M6.5 9.5v8M10 9.5v8M14 9.5v8M17.5 9.5v8M3.5 20h17"/>',
  source:
    '<path d="M6 3.5h11.5v17H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M4.5 17.5A1.5 1.5 0 0 1 6 16h11.5M9 7.5l2 2 3.5-3.5"/>',
  pub: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  donnees:
    '<path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  temps: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5"/>',
  suivi: '<path d="M4 19.5h16"/><path d="m5 15.5 4.5-4.5 3.5 3 6-6.5"/><path d="M15.5 7.5H19V11"/>',
};
const icone = (nom: string, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nom] ?? ''}</svg>`;

/**
 * Charte (marque/project/tokens.json, src/lib/theme/tokens.css) : crème, vert profond, or ; clair par défaut, sombre
 * selon le système. L'or n'est jamais une couleur de texte. Titres en Lexend 600 (police de la marque), texte en
 * Nunito 400 (police de l'application) : deux fichiers de 15-16 Ko servis par nos serveurs, `swap`.
 */
const CSS = `
:root{--fond:#FBF7EE;--surface:#F4EEDF;--carte:#FFFFFF;--em:#0B6E4F;--titre:#084C38;--feuille:#1F9C73;--aile:#0B6E4F;--or:#C9A227;--texte:#1E2B25;--doux:#4A5A52;--filet:#E4DBC6;--tuile:#DDEFE6;--bande:#0B6E4F;--sur-bande:#FBF7EE;--erreur:#A3261E;--bouton:#0B6E4F;--bouton-texte:#FBF7EE;--focus:#0B6E4F;--ombre:0 1px 2px rgba(16,24,40,.05),0 10px 30px -12px rgba(8,76,56,.18);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--fond:#0D1A15;--surface:#112019;--carte:#14261F;--em:#5CC79C;--titre:#E8DFC8;--feuille:#5CC79C;--aile:#E8DFC8;--or:#D9B54A;--texte:#E8DFC8;--doux:#B4C2BA;--filet:#28423A;--tuile:#1B3A2E;--bande:#0F4A38;--sur-bande:#FBF7EE;--erreur:#F2B8B5;--bouton:#1F9C73;--bouton-texte:#0D1A15;--focus:#5CC79C;--ombre:0 1px 2px rgba(0,0,0,.3),0 12px 32px -14px rgba(0,0,0,.6)}}
@font-face{font-family:Lexend;font-weight:600;font-style:normal;font-display:swap;src:local("Lexend SemiBold"),url(/fonts/lexend-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:Nunito;font-weight:400;font-style:normal;font-display:swap;src:local("Nunito Regular"),url(/fonts/nunito-latin-400-normal.woff2) format("woff2")}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--fond);color:var(--texte);font:1.0625rem/1.65 Nunito,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-x:clip}
h1,h2,h3,.marque,.btn,button,label.champ,.etiquette{font-family:Lexend,"Segoe UI",Arial,sans-serif;font-weight:600}
h1,h2,h3{color:var(--titre);line-height:1.2;margin:0;letter-spacing:-.015em}
p{margin:0}
a{color:var(--em);text-underline-offset:.2em}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:8px}
svg.ico{width:1.5rem;height:1.5rem;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex:none}
.saut{position:absolute;left:-999px;top:0;background:var(--fond);color:var(--texte);padding:.75rem 1rem;z-index:9}
.saut:focus{left:1rem;top:1rem}
.conteneur{width:100%;max-width:72rem;margin:0 auto;padding:0 1rem}
header .conteneur{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding-top:.875rem;padding-bottom:.875rem}
.logo{display:flex;align-items:center;gap:.6rem;text-decoration:none;color:var(--titre);min-height:2.75rem}
.logo svg{width:2.2rem;height:2.85rem;display:block;flex:none}
.marque{font-size:1.5rem;letter-spacing:-.02em;line-height:1.1;display:block}
.devise{display:none;font-size:.8125rem;line-height:1.2;color:var(--doux)}
.actions{display:flex;align-items:center;gap:.5rem}
nav.langues{display:flex;gap:.125rem}
nav.langues a{display:inline-flex;align-items:center;justify-content:center;min-width:2.75rem;min-height:2.75rem;padding:0 .5rem;border-radius:999px;text-decoration:none;color:var(--doux);font-weight:700;font-size:.875rem;letter-spacing:.04em}
nav.langues a:hover{background:var(--surface)}
.connexion{display:inline-flex;align-items:center;min-height:2.75rem;padding:0 1rem;border-radius:999px;border:1.5px solid var(--em);text-decoration:none;font-family:Lexend,"Segoe UI",Arial,sans-serif;font-weight:600;font-size:.9375rem;white-space:nowrap}
.connexion:hover{background:var(--tuile)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:3.25rem;padding:.75rem 1.5rem;border-radius:14px;background:var(--bouton);color:var(--bouton-texte);text-decoration:none;font-size:1.0625rem;box-shadow:0 8px 20px -10px rgba(8,76,56,.55);transition:transform .15s ease,box-shadow .15s ease}
.btn:hover{transform:translateY(-1px);box-shadow:0 12px 24px -10px rgba(8,76,56,.6)}
.heros{position:relative;padding:1.5rem 0 3.5rem;overflow:hidden}
.motif{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;clip-path:inset(0 round 28px)}
.heros{isolation:isolate}
.motif-or{inset:0 0 auto auto;width:min(48rem,100%);clip-path:none;-webkit-mask-image:radial-gradient(closest-side at 75% 35%,#000,transparent);mask-image:radial-gradient(closest-side at 75% 35%,#000,transparent)}
.heros .conteneur{position:relative;display:grid;gap:2.5rem;align-items:center}
.pastille{display:inline-flex;align-items:center;gap:.5rem;margin:0 0 1.25rem;padding:.3rem .9rem .3rem .7rem;border-radius:999px;background:var(--carte);box-shadow:inset 0 0 0 1px var(--filet);color:var(--titre);font-weight:700;font-size:.875rem}
.pastille::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:var(--or)}
h1{font-size:clamp(2rem,6.2vw,3.5rem);letter-spacing:-.03em;line-height:1.08;text-wrap:balance}
.lead{font-size:clamp(1.0625rem,2.4vw,1.25rem);margin-top:1.25rem;color:var(--doux);max-width:36rem}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.5rem;margin-top:2rem}
.secondaire{display:inline-flex;align-items:center;min-height:2.75rem;font-weight:700}
.atouts{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;list-style:none;margin:1.75rem 0 0;padding:0;color:var(--doux);font-size:.9375rem}
.atouts li{display:flex;align-items:center;gap:.4rem}
.atouts svg.ico{width:1.125rem;height:1.125rem;color:var(--em);stroke-width:2.25}
.visuel{position:relative;min-height:20rem;border-radius:28px;background:var(--bande);box-shadow:inset 0 -4px 0 var(--or),var(--ombre);display:grid;place-items:center;isolation:isolate}
.disque{width:9.5rem;height:9.5rem;border-radius:50%;background:#FBF7EE;display:grid;place-items:center;box-shadow:0 0 0 10px rgba(251,247,238,.12),0 0 0 22px rgba(251,247,238,.06),0 24px 48px -16px rgba(0,0,0,.45);--or:#C9A227;--feuille:#1F9C73;--aile:#0B6E4F}
.disque svg{width:4.5rem;height:5.8rem}
.puce{position:absolute;display:flex;align-items:center;gap:.6rem;padding:.6rem .9rem .6rem .6rem;border-radius:16px;background:#FFFFFF;color:#1E2B25;font-family:Lexend,"Segoe UI",Arial,sans-serif;font-weight:600;font-size:.875rem;line-height:1.25;box-shadow:0 14px 30px -14px rgba(0,0,0,.45);max-width:13.5rem}
.puce span.t{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:11px;background:#DDEFE6;color:#0B6E4F;flex:none}
.puce svg.ico{width:1.25rem;height:1.25rem}
.p1{top:1.25rem;left:1rem}
.p2{bottom:1.5rem;right:1rem}
section.bloc{padding:3.5rem 0}
section.alt{background:var(--surface)}
.tete{max-width:40rem;margin-bottom:2rem}
.tete h2{font-size:clamp(1.625rem,4.2vw,2.25rem);letter-spacing:-.025em}
.tete p{margin-top:.75rem;color:var(--doux);font-size:1.0625rem}
.tete h2::after{content:"";display:block;width:3rem;height:4px;border-radius:2px;background:var(--or);margin-top:.875rem}
.cartes{display:grid;gap:1rem;margin:0;padding:0;list-style:none}
.carte{background:var(--carte);border-radius:20px;padding:1.5rem;box-shadow:var(--ombre);border:1px solid var(--filet)}
.carte h3{font-size:1.1875rem;margin:1rem 0 .5rem}
.carte p{color:var(--doux)}
.tuile{display:grid;place-items:center;width:3rem;height:3rem;border-radius:14px;background:var(--tuile);color:var(--em)}
.univers .carte{padding:1.75rem;position:relative;overflow:hidden}
.univers .carte::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:linear-gradient(90deg,var(--em),var(--feuille))}
.univers .tuile{width:3.5rem;height:3.5rem;border-radius:16px}
.univers svg.ico{width:1.75rem;height:1.75rem}
.etapes{display:grid;gap:1.75rem;margin:0;padding:0;list-style:none;counter-reset:etape}
.etapes li{display:grid;grid-template-columns:auto 1fr;gap:0 1rem;align-items:start;align-content:start}
.num{display:grid;place-items:center;width:3rem;height:3rem;border-radius:50%;background:var(--carte);color:var(--titre);font-family:Lexend,"Segoe UI",Arial,sans-serif;font-weight:600;font-size:1.25rem;box-shadow:inset 0 0 0 2px var(--or),var(--ombre);grid-row:span 2}
.etapes h3{font-size:1.1875rem;margin:.6rem 0 .4rem}
.etapes p{color:var(--doux)}
.confiance .carte{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;align-items:start;align-content:start}
.confiance .tuile{grid-row:span 2}
.confiance h3{margin:.4rem 0 .25rem}
.inviter{padding:1rem 0 4rem}
.bandeau{position:relative;isolation:isolate;border-radius:28px;background:var(--bande);color:var(--sur-bande);padding:2rem 1.25rem;display:grid;gap:2rem;align-items:center;box-shadow:inset 0 -4px 0 var(--or),var(--ombre);scroll-margin-top:1rem}
.bandeau h2{color:var(--sur-bande);font-size:clamp(1.75rem,4.5vw,2.5rem);letter-spacing:-.025em}
.bandeau .texte p{margin-top:1rem;font-size:1.125rem;opacity:.95}
.bandeau .texte a{color:var(--sur-bande);font-weight:700}
.bandeau .texte a:focus-visible{outline-color:var(--sur-bande)}
.bandeau .texte .code{margin-top:1.5rem;font-size:1rem}
.formulaire{background:var(--carte);color:var(--texte);border-radius:20px;padding:1.5rem;box-shadow:0 24px 48px -20px rgba(0,0,0,.45)}
.formulaire h3{font-size:1.25rem;margin-bottom:1rem}
form{display:grid;gap:1rem}
label.champ{display:grid;gap:.4rem;font-size:.9375rem;color:var(--titre)}
input[type=email]{font:inherit;min-height:3.25rem;padding:.5rem .9rem;border:2px solid var(--doux);border-radius:12px;background:var(--fond);color:var(--texte);width:100%}
.coche{display:flex;gap:.75rem;align-items:flex-start;font-size:.9375rem}
.coche input{width:1.5rem;height:1.5rem;flex:none;margin:.125rem 0 0;accent-color:var(--em)}
button{font-size:1.0625rem;min-height:3.25rem;padding:.5rem 1.25rem;border:0;border-radius:14px;background:var(--bouton);color:var(--bouton-texte);cursor:pointer;width:100%}
button[disabled]{opacity:.7;cursor:progress}
.etat{margin:0;min-height:1.5rem}
.etat.erreur{color:var(--erreur);font-weight:700}
.etat.ok{font-weight:700;color:var(--titre)}
.piege{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.rgpd{margin-top:.5rem;border-top:1px solid var(--filet);padding-top:.25rem;font-size:.9375rem;color:var(--doux)}
.rgpd summary{cursor:pointer;display:flex;align-items:center;min-height:2.75rem;font-weight:700;color:var(--titre)}
.rgpd p{margin:.4rem 0}
.lien{max-width:40rem;padding-top:2rem;padding-bottom:3rem}
.lien .carte{display:grid;gap:1rem}
.lien h1{font-size:clamp(1.5rem,5vw,2rem)}
.sans-js{color:var(--doux)}
footer{border-top:1px solid var(--filet);padding:2rem 0 2.5rem;color:var(--doux);font-size:.9375rem}
footer .conteneur{display:grid;gap:1rem}
footer .logo{display:inline-flex;justify-self:start}
footer .logo svg{width:1.6rem;height:2.1rem}
footer .marque{font-size:1.125rem}
footer ul{display:flex;flex-wrap:wrap;gap:0 1.25rem;list-style:none;margin:0;padding:0}
footer a{display:inline-block;min-height:2.75rem;line-height:2.75rem}
@media (min-width:30rem){.devise{display:block}.p1{left:1.5rem}.p2{right:1.5rem}}
@media (min-width:48rem){.cartes.deux{grid-template-columns:repeat(2,1fr)}.cartes.trois{grid-template-columns:repeat(3,1fr)}.etapes{grid-template-columns:repeat(3,1fr);gap:1.5rem}.etapes li{grid-template-columns:1fr}.num{grid-row:auto}.bandeau{padding:3rem}.formulaire{padding:2rem}section.bloc{padding:5rem 0}}
@media (min-width:64rem){.heros{padding:3rem 0 5.5rem}.heros .conteneur{grid-template-columns:1.1fr .9fr;gap:4rem}.visuel{min-height:30rem}.disque{width:14rem;height:14rem}.disque svg{width:6.5rem;height:8.4rem}.p1{top:2.5rem}.p2{bottom:3rem}.cartes.quatre{grid-template-columns:repeat(4,1fr)}.bandeau{grid-template-columns:1fr 1fr;gap:4rem;padding:4rem}}
@media (min-width:80rem){.p1{left:-1.5rem}.p2{right:-1.5rem}}
@media (min-width:48rem) and (max-width:63.99rem){.cartes.quatre{grid-template-columns:repeat(2,1fr)}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}.btn:hover{transform:none}}
`;

export type Vue = 'accueil' | 'confirmer' | 'desinscription';
export interface OptionsPage {
  /** page affichée : l'accueil, ou la page d'un lien reçu par e-mail (confirmation, désinscription) */
  vue?: Vue;
  lang: string;
  cfg: ConfigAccueil;
  /** provenance validée (sourceAccueil) ; absente : rien n'est ajouté à la page */
  src?: string | null;
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
export function htmlAccueil({ lang, cfg: cfgBase, vue = 'accueil', src }: OptionsPage): string {
  const source = sourceAccueil(src ?? null);
  // les pages de lien (e-mail) ne sont jamais indexables
  const cfg = vue === 'accueil' ? cfgBase : { ...cfgBase, indexable: false };
  const x = CATALOGUES[lang] ?? fr;
  const l = lang in CATALOGUES ? lang : 'fr';
  const tx = (k: string) => esc(x[k as keyof TextesAccueil] ?? '');
  const robots = cfg.indexable ? 'index, follow' : 'noindex, nofollow, noarchive';
  const langues =
    cfg.langues.length > 1
      ? `<nav class="langues" aria-label="${tx('langues')}">${cfg.langues
          .filter((c) => c !== l)
          .map(
            (c) =>
              `<a href="?lang=${c}" lang="${c}" hreflang="${c}" aria-label="${esc(NOMS[c] ?? c)}" title="${esc(NOMS[c] ?? c)}">${c.toUpperCase()}</a>`,
          )
          .join('')}</nav>`
      : '';
  /** cartes : [icône, préfixe de clé] → <li> avec titre h3 et paragraphe */
  const cartes = (liste: Array<[string, string]>, cls: string) =>
    `<ul class="cartes ${cls}">${liste
      .map(
        ([ico, k]) =>
          `<li class="carte"><span class="tuile">${icone(ico)}</span><h3>${tx(`${k}_t`)}</h3><p>${tx(`${k}_p`)}</p></li>`,
      )
      .join('')}</ul>`;
  const tete = (id: string, titre: string, intro?: string) =>
    `<div class="tete"><h2 id="${id}">${tx(titre)}</h2>${intro ? `<p>${tx(intro)}</p>` : ''}</div>`;
  const etapes = [1, 2, 3]
    .map(
      (n) =>
        `<li><span class="num" aria-hidden="true">${n}</span><h3>${tx(`e${n}_t`)}</h3><p>${tx(`e${n}_p`)}</p></li>`,
    )
    .join('');
  const accueilMain = `<main id="contenu">
<section class="heros" aria-labelledby="titre">${motif('mo', ' motif-or')}
<div class="conteneur">
<div>
<p class="pastille">${tx('pastille')}</p>
<h1 id="titre">${tx('h1')}</h1>
<p class="lead">${tx('intro')}</p>
<div class="cta"><a class="btn" href="#inviter">${tx('cta')}</a><a class="secondaire" href="/inscription">${tx('cta_code')}</a></div>
<ul class="atouts">${[1, 2, 3].map((n) => `<li>${icone('ok')}${tx(`atout_${n}`)}</li>`).join('')}</ul>
</div>
<div class="visuel" aria-hidden="true">${motif('m')}
<div class="disque"><svg><use href="#s"/></svg></div>
<div class="puce p1"><span class="t">${icone('temps')}</span>${tx('visuel_1')}</div>
<div class="puce p2"><span class="t">${icone('suivi')}</span>${tx('visuel_2')}</div>
</div>
</div>
</section>
<section class="bloc univers" aria-labelledby="univers"><div class="conteneur">${tete('univers', 'univers_titre', 'univers_intro')}${cartes(
    [
      ['arabe', 'u1'],
      ['coran', 'u2'],
      ['islam', 'u3'],
    ],
    'trois',
  )}</div></section>
<section class="bloc alt" aria-labelledby="pour-qui"><div class="conteneur">${tete('pour-qui', 'public_titre', 'public_intro')}${cartes(
    [
      ['famille', 'p1'],
      ['ado', 'p2'],
      ['adulte', 'p3'],
      ['ecole', 'p4'],
    ],
    'quatre',
  )}</div></section>
<section class="bloc" aria-labelledby="etapes"><div class="conteneur">${tete('etapes', 'etapes_titre')}<ol class="etapes">${etapes}</ol></div></section>
<section class="bloc alt confiance" aria-labelledby="confiance"><div class="conteneur">${tete('confiance', 'confiance_titre')}${cartes(
    [
      ['source', 'c1'],
      ['pub', 'c2'],
      ['donnees', 'c3'],
    ],
    'trois',
  )}</div></section>
<section class="bloc inviter" aria-labelledby="inviter-t"><div class="conteneur">
<div class="bandeau" id="inviter">${motif('m')}
<div class="texte">
<h2 id="inviter-t">${tx('inviter_titre')}</h2>
<p>${tx('inviter_texte')}</p>
<p class="code">${tx('inviter_code')} <a href="/inscription">${tx('inviter_code_lien')}</a></p>
</div>
<div class="formulaire">
<h3 id="form-titre">${tx('form_titre')}</h3>
<form id="attente" method="post" action="/bienvenue" aria-labelledby="form-titre" data-lang="${l}" data-msg="${esc(messagesJs(x))}">
<label class="champ" for="email">${tx('email')}<input id="email" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254"></label>
${source ? `<input type="hidden" name="src" value="${source}">` : ''}
<div class="piege" aria-hidden="true"><label>Site web<input name="site_web" type="text" tabindex="-1" autocomplete="off"></label></div>
<label class="coche"><input id="consent" name="consentement" type="checkbox" required><span>${tx('consent')}</span></label>
<button type="submit">${tx('bouton')}</button>
<p id="etat" class="etat" role="status" aria-live="polite" tabindex="-1"></p>
<noscript><p class="sans-js">${tx('sans_js')}</p></noscript>
</form>
<details class="rgpd">
<summary>${tx('rgpd_titre')}</summary>
<p>${tx('rgpd_resp')}</p>
<p>${tx('rgpd_fin')}</p>
<p>${tx('rgpd_base')}</p>
<p>${tx('rgpd_duree')}</p>
<p>${tx('rgpd_dest')}</p>
<p>${tx('rgpd_droits')}</p>
<p>${tx('rgpd_prov')} <a href="/legal/confidentialite">${tx('rgpd_lien')}</a></p>
</details>
</div>
</div>
</div></section>
</main>`;
  const action = vue === 'desinscription' ? 'desinscrire' : 'confirmer';
  const lienMain = `<main id="contenu"><div class="conteneur lien"><div class="carte">
<h1>${esc(vue === 'confirmer' ? x.confirmer_titre : x.desinscr_titre)}</h1>
<p>${esc(vue === 'confirmer' ? x.confirmer_texte : x.desinscr_texte)}</p>
<form id="lien" method="post" action="/bienvenue" data-action="${action}" data-msg="${esc(messagesJs(x))}">
<button type="submit">${esc(vue === 'confirmer' ? x.confirmer_bouton : x.desinscr_bouton)}</button>
<p id="etat" class="etat" role="status" aria-live="polite" tabindex="-1"></p>
<noscript><p class="sans-js">${tx('sans_js')}</p></noscript>
</form>
<p><a href="/">${tx('retour')}</a></p>
</div></div></main>`;
  return `<!doctype html>
<html lang="${l}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(vue === 'accueil' ? x.titre : vue === 'confirmer' ? x.confirmer_titre : x.desinscr_titre)}</title>
<meta name="description" content="${tx('description')}">
<meta name="robots" content="${robots}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FBF7EE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1A15" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${CSS}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${SYMBOLE}${MOTIFS}</svg>
<a class="saut" href="#contenu">${tx('aller_contenu')}</a>
<header>
<div class="conteneur">
<a class="logo" href="/" aria-label="Awzid"><svg aria-hidden="true" focusable="false"><use href="#s"/></svg><span><span class="marque">Awzid</span><span class="devise">${tx('devise')}</span></span></a>
<div class="actions">${langues}<a class="connexion" href="/connexion">${tx('connexion')}</a></div>
</div>
</header>
${vue === 'accueil' ? accueilMain : lienMain}
<footer>
<div class="conteneur">
<a class="logo" href="/" aria-label="Awzid"><svg aria-hidden="true" focusable="false"><use href="#s"/></svg><span class="marque">Awzid</span></a>
<ul>
<li><a href="/legal/mentions">${tx('pied_mentions')}</a></li>
<li><a href="/legal/confidentialite">${tx('pied_confid')}</a></li>
<li><a href="mailto:${CONTACT}">${tx('pied_contact')}</a></li>
<li><a href="/inscription">${tx('pied_code')}</a></li>
<li><a href="/connexion">${tx('pied_connexion')}</a></li>
</ul>
<p>${tx('pied_note')}</p>
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
