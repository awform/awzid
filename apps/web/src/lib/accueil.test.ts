/**
 * Page d'accueil publique (liste d'attente) : réglages, choix de la langue, quand elle remplace l'accueil de l'application,
 * contenu (message principal, un seul bouton, mention RGPD, « provisoire »), interdits (promesses, arabe, ressources tierces),
 * poids et parité des catalogues FR / EN.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  afficherAccueil,
  CATALOGUES,
  configAccueil,
  htmlAccueil,
  langueAccueil,
  reponseAccueil,
  sansSession,
} from './server/accueil';
import { EN_TETE_ROBOTS } from './server/acces-serveur';

const STATIC = join(__dirname, '..', '..', 'static');
const cfg = configAccueil({});

describe('réglages', () => {
  it('défauts prudents : automatique, non indexable, français et anglais', () => {
    expect(cfg).toEqual({ public: 'auto', indexable: false, langues: ['fr', 'en'] });
  });
  it('valeurs inconnues : repli prudent (jamais indexable par erreur)', () => {
    expect(configAccueil({ ACCUEIL_PUBLIC: 'peut-être', ACCUEIL_INDEXABLE: 'oui' })).toMatchObject({
      public: 'auto',
      indexable: false,
    });
    expect(configAccueil({ ACCUEIL_LANGUES: 'xx, yy' }).langues).toEqual(['fr']);
    expect(configAccueil({ ACCUEIL_LANGUES: 'en,fr,en' }).langues).toEqual(['en', 'fr']);
    expect(configAccueil({ ACCUEIL_PUBLIC: 'off' }).public).toBe('off');
    expect(configAccueil({ ACCUEIL_INDEXABLE: 'on' }).indexable).toBe(true);
  });
});

describe('langue de la page', () => {
  it('?lang= d’abord, puis Accept-Language, puis français ; jamais une langue non permise', () => {
    expect(langueAccueil('en', 'fr-FR', ['fr', 'en'])).toBe('en');
    expect(langueAccueil(null, 'en-GB,en;q=0.9', ['fr', 'en'])).toBe('en');
    expect(langueAccueil(null, 'de-DE,de;q=0.9', ['fr', 'en'])).toBe('fr');
    expect(langueAccueil('es', null, ['fr', 'en'])).toBe('fr');
    expect(langueAccueil('en', 'en', ['fr'])).toBe('fr');
  });
});

describe('quand la page remplace l’accueil de l’application', () => {
  const inv = 'invitation';
  it('sans session sur « / » en bêta sur invitation : oui ; connecté : non', () => {
    expect(afficherAccueil(cfg, '/', null, inv)).toBe(true);
    expect(afficherAccueil(cfg, '/', 'autre=1', inv)).toBe(true);
    expect(afficherAccueil(cfg, '/', 'awform_session=abc', inv)).toBe(false);
    expect(sansSession('x=1; awform_session=abc')).toBe(false);
    expect(sansSession('mon_awform_session=abc')).toBe(true);
  });
  it('mode ouvert ou statut inconnu : l’application reste l’accueil, sauf réglage « on »', () => {
    expect(afficherAccueil(cfg, '/', null, 'ouvert')).toBe(false);
    expect(afficherAccueil(cfg, '/', null, null)).toBe(false);
    expect(afficherAccueil(configAccueil({ ACCUEIL_PUBLIC: 'on' }), '/', null, 'ouvert')).toBe(
      true,
    );
  });
  it('autres pages : jamais ; /bienvenue : toujours (sauf « off ») même connecté', () => {
    for (const p of ['/inscription', '/connexion', '/legal/cgu', '/coran'])
      expect(afficherAccueil(cfg, p, null, inv)).toBe(false);
    expect(afficherAccueil(cfg, '/bienvenue', 'awform_session=abc', 'ouvert')).toBe(true);
    const off = configAccueil({ ACCUEIL_PUBLIC: 'off' });
    expect(afficherAccueil(off, '/', null, inv)).toBe(false);
    expect(afficherAccueil(off, '/bienvenue', null, inv)).toBe(false);
  });
});

describe('contenu de la page', () => {
  const fr = htmlAccueil({ lang: 'fr', cfg });
  const en = htmlAccueil({ lang: 'en', cfg });

  it('promesse, mention de la bêta, un seul appel à l’action (vers le formulaire), un seul bouton', () => {
    expect(fr).toContain(
      '<h1 id="titre">Apprendre l’arabe, le Coran et les bases de la religion, pas à pas, en famille</h1>',
    );
    expect(fr).toContain('Bêta fermée sur invitation');
    expect(fr.match(/<button/g)).toHaveLength(1);
    expect(fr).toContain('<button type="submit">Demander une invitation</button>');
    expect(en).toContain('<button type="submit">Request an invitation</button>');
    expect(fr.match(/<h1/g)).toHaveLength(1);
    // un seul appel principal (classe « btn »), qui descend au formulaire ; lien secondaire vers la saisie du code
    expect(fr.match(/class="btn"/g)).toHaveLength(1);
    expect(fr).toContain('<a class="btn" href="#inviter">Demander une invitation</a>');
    expect(fr).toContain('<a class="secondaire" href="/inscription">J’ai déjà une invitation</a>');
    expect(fr).toContain('id="inviter"');
    // en-tête : « Se connecter »
    expect(fr).toMatch(
      /<header>[\s\S]*<a class="connexion" href="\/connexion">Se connecter<\/a>[\s\S]*<\/header>/,
    );
  });
  it('structure : trois univers, quatre publics, trois étapes, trois engagements ; titres hiérarchisés', () => {
    const titres = (bloc: string) =>
      [
        ...(fr.match(new RegExp(`aria-labelledby="${bloc}"[\\s\\S]*?</section>`)) ?? [
          '',
        ])[0].matchAll(/<h3>([^<]+)<\/h3>/g),
      ].map((m) => m[1]);
    expect(titres('univers')).toEqual(['Arabe', 'Coran', 'Vivre l’islam']);
    expect(titres('pour-qui')).toEqual([
      'Parents et enfants',
      'Adolescents',
      'Adultes',
      'Écoles et mosquées',
    ]);
    expect(titres('etapes')).toHaveLength(3);
    expect(fr).toContain('De 10 à 20 minutes');
    expect(titres('confiance')).toEqual([
      'Un contenu sérieux',
      'Sans publicité',
      'Vos données protégées',
    ]);
    expect(fr).toContain('école malékite');
    expect(fr).toContain('relecture par des savants');
    expect(fr).toContain('hébergées en France');
    // ordre des titres : h1 puis h2, jamais de h3 avant le premier h2 ni de niveau sauté
    const niveaux = [...fr.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));
    expect(niveaux[0]).toBe(1);
    for (let i = 1; i < niveaux.length; i++)
      expect(niveaux[i]! - niveaux[i - 1]!).toBeLessThanOrEqual(1);
    // icônes et motif : SVG en ligne seulement
    expect(fr.match(/<svg class="ico"/g)!.length).toBeGreaterThanOrEqual(13);
    expect(fr).toContain('<pattern id="m"');
  });
  it('langue de la page, sens d’écriture, étiquettes de formulaire, champ piège caché', () => {
    expect(fr).toContain('<html lang="fr" dir="ltr">');
    expect(en).toContain('<html lang="en" dir="ltr">');
    expect(fr).toMatch(/<label class="champ" for="email">/);
    expect(fr).toContain('autocomplete="email"');
    expect(fr).toMatch(/<input id="consent" name="consentement" type="checkbox" required>/);
    expect(fr).toMatch(
      /class="piege" aria-hidden="true"[^>]*><label>[^<]*<input name="site_web"[^>]*tabindex="-1"/,
    );
    expect(fr).toContain('<a class="saut" href="#contenu">');
    expect(fr).toContain('<main id="contenu">');
  });
  it('mention RGPD : finalité, base légale, durée, destinataires, droits, contact, « provisoire », crochets non tranchés', () => {
    for (const mot of ['Finalité', 'Base légale', 'Durée : 12 mois', 'Destinataires', 'Vos droits'])
      expect(fr).toContain(mot);
    expect(fr).toContain('contact@awzid.com');
    expect(fr).toContain('Texte provisoire, en attente d’une relecture juridique.');
    expect(fr).toContain('[raison sociale et adresse : à compléter par le client]');
    expect(en).toContain('Provisional text, awaiting legal review.');
    expect(en).toContain('contact@awzid.com');
  });
  it('vouvoiement sur la page publique (français) ; accordéon RGPD fermé par défaut ; paragraphe d’introduction court', () => {
    const texte = fr.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
    expect(texte).not.toMatch(/(?<!\p{L})(tu|toi|ton|ta|tes)(?!\p{L})|(?<!\p{L})t’\p{L}/iu);
    expect(texte).toMatch(/\bvotre\b/);
    expect(fr).toContain('<details class="rgpd">');
    expect(fr).not.toMatch(/<details[^>]* open/);
    expect(fr).toContain('<summary>Ce que nous faisons de votre adresse</summary>');
    expect(CATALOGUES.fr!.intro.length).toBeLessThan(160);
    for (const v of Object.values(CATALOGUES.fr!))
      expect(v).not.toMatch(/(?<!\p{L})(tu|ton|ta|tes)(?!\p{L})/iu);
  });
  it('pages des liens de l’e-mail : bouton explicite, jamais indexables, aucun jeton dans la page', () => {
    for (const vue of ['confirmer', 'desinscription'] as const) {
      const h = htmlAccueil({ lang: 'fr', cfg: configAccueil({ ACCUEIL_INDEXABLE: 'on' }), vue });
      expect(h).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
      expect(h.match(/<button/g)).toHaveLength(1);
      expect(h).toContain('id="lien"');
      expect(h).not.toMatch(/#t=|token/);
      expect(
        reponseAccueil({
          lang: 'fr',
          cfg: configAccueil({ ACCUEIL_INDEXABLE: 'on' }),
          vue,
        }).headers.get('x-robots-tag'),
      ).toBe(EN_TETE_ROBOTS);
    }
    const js = readFileSync(join(STATIC, 'accueil.js'), 'utf8');
    expect(js).toContain('/api/v1/acces/liste-attente/');
    expect(js).toContain('location.hash');
  });
  it('pied de page : mentions légales, confidentialité, contact', () => {
    expect(fr).toContain('href="/legal/mentions"');
    expect(fr).toContain('href="/legal/confidentialite"');
    expect(fr).toContain('href="mailto:contact@awzid.com"');
  });
  it('aucune promesse chiffrée, datée ou « validée », aucune comparaison, aucun arabe, aucun visage', () => {
    for (const html of [fr, en]) {
      const texte = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
      expect(texte).not.toMatch(/valid[ée]+ par|validated by|approved by/i);
      expect(texte).not.toMatch(/\d+\s*%/);
      expect(texte).not.toMatch(
        /\b(20\d\d|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/i,
      );
      expect(texte).not.toMatch(/\b(gratuit|free forever|garanti|guaranteed|meilleur|best)\b/i);
      expect(texte).not.toMatch(/\b(duolingo|babbel|quranly|ayat|comparé|compared)\b/i);
      expect(texte).not.toMatch(/\b(verset|hadith|fiqh|sourate)\b/i);
      expect(html).not.toMatch(/[؀-ۿ]/);
      expect(html).not.toMatch(/<img/i);
    }
  });
  it('le sélecteur de langue ne propose que les autres langues, avec leur nom complet', () => {
    expect(fr).toContain('<a href="?lang=en" lang="en" hreflang="en" aria-label="English"');
    expect(fr).not.toContain('hreflang="fr"');
    expect(en).toContain('aria-label="Français"');
  });
});

describe('indexation et sécurité', () => {
  it('par défaut : noindex en balise et en en-tête ; ACCUEIL_INDEXABLE=on : la page seule perd son noindex', () => {
    const h = htmlAccueil({ lang: 'fr', cfg });
    expect(h).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    expect(reponseAccueil({ lang: 'fr', cfg }).headers.get('x-robots-tag')).toBe(EN_TETE_ROBOTS);
    const ouvert = configAccueil({ ACCUEIL_INDEXABLE: 'on' });
    const h2 = htmlAccueil({ lang: 'fr', cfg: ouvert });
    expect(h2).toContain('<meta name="robots" content="index, follow">');
    expect(h2).not.toContain('og:'); // l'aperçu social viendra avec la décision d'ouverture
    expect(reponseAccueil({ lang: 'fr', cfg: ouvert }).headers.get('x-robots-tag')).toBeNull();
  });
  it('aucune ressource tierce, aucun cookie, CSP stricte, un seul script de notre domaine', () => {
    const h = htmlAccueil({ lang: 'fr', cfg });
    expect(h).not.toMatch(/https?:\/\//);
    expect(h.match(/<script/g)).toHaveLength(1);
    expect(h).toContain('<script src="/accueil.js" defer></script>');
    expect(h).not.toMatch(/<link[^>]+(stylesheet|preconnect|dns-prefetch)/);
    expect(h).not.toMatch(/@import|googleapis|gstatic/);
    const r = reponseAccueil({ lang: 'en', cfg });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBeNull();
    const csp = r.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
    expect(r.headers.get('content-language')).toBe('en');
    expect(r.headers.get('cache-control')).toBe('private, no-cache');
  });
  it('le sélecteur de langue n’existe que s’il y a plusieurs langues', () => {
    expect(htmlAccueil({ lang: 'fr', cfg })).toContain('hreflang="en"');
    const seul = configAccueil({ ACCUEIL_LANGUES: 'fr' });
    expect(htmlAccueil({ lang: 'fr', cfg: seul })).not.toContain('class="langues"');
  });
});

describe('poids et catalogues', () => {
  it('page ≤ 32 Ko (≤ 10 Ko compressée), script ≤ 8 Ko, deux polices de la charte seulement (≤ 20 Ko chacune)', () => {
    const h = Buffer.from(htmlAccueil({ lang: 'fr', cfg }));
    expect(h.length).toBeLessThan(32 * 1024);
    expect(gzipSync(h).length).toBeLessThan(10 * 1024);
    expect(readFileSync(join(STATIC, 'accueil.js')).length).toBeLessThan(8 * 1024);
    const polices = [...h.toString().matchAll(/url\(\/fonts\/([^)]+)\)/g)].map((m) => m[1]!);
    expect(polices).toEqual(['lexend-latin-600-normal.woff2', 'nunito-latin-400-normal.woff2']);
    for (const p of polices)
      expect(readFileSync(join(STATIC, 'fonts', p)).length, p).toBeLessThan(20 * 1024);
  });
  it('FR et EN : mêmes clés, aucune valeur vide, mêmes liens (contact, crochets)', () => {
    const fr = CATALOGUES.fr!;
    const en = CATALOGUES.en!;
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const [k, v] of Object.entries({ ...fr })) expect(v.trim(), k).not.toBe('');
    for (const k of ['sans_js', 'rgpd_droits']) {
      expect(fr[k as keyof typeof fr]).toContain('contact@awzid.com');
      expect(en[k as keyof typeof en]).toContain('contact@awzid.com');
    }
  });
  it('le script d’envoi appelle le mécanisme existant (jeton, liste d’attente, consentement, piège)', () => {
    const js = readFileSync(join(STATIC, 'accueil.js'), 'utf8');
    expect(js).toContain('/api/v1/acces/jeton');
    expect(js).toContain('/api/v1/acces/liste-attente');
    expect(js).toContain('consentement');
    expect(js).toContain('site_web');
    expect(js).toContain("'x-awform': '1'");
    expect(js).not.toMatch(/localStorage|sessionStorage|document\.cookie|analytics|gtag|fbq/);
  });
});
