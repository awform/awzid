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

  it('message principal, mention de la bêta, un seul bouton « Rejoindre la liste d’attente »', () => {
    expect(fr).toContain(
      '<h1>Apprends l’arabe pas à pas, avec la méthode des écoles, sources citées.</h1>',
    );
    expect(fr).toContain('Bêta fermée sur invitation');
    expect(fr.match(/<button/g)).toHaveLength(1);
    expect(fr).toContain('Rejoindre la liste d’attente</button>');
    expect(en).toContain('<button type="submit">Join the waiting list</button>');
    expect(fr.match(/<h1/g)).toHaveLength(1);
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
    for (const mot of ['Finalité', 'Base légale', 'Durée : 12 mois', 'Destinataires', 'Tes droits'])
      expect(fr).toContain(mot);
    expect(fr).toContain('contact@awzid.com');
    expect(fr).toContain('Texte provisoire, en attente d’une relecture juridique.');
    expect(fr).toContain('[raison sociale et adresse : à compléter par le client]');
    expect(en).toContain('Provisional text, awaiting legal review.');
    expect(en).toContain('contact@awzid.com');
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
  it('ce qui existe / bientôt : cinq lignes chacune, sans date', () => {
    expect(fr.match(/<li>Des leçons d’arabe par niveau/g)).toHaveLength(1);
    expect(
      (fr.match(/<div class="bientot">[\s\S]*?<\/ul>/) ?? [''])[0].match(/<li>/g),
    ).toHaveLength(5);
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
  it('page ≤ 20 Ko (≤ 8 Ko compressée), script ≤ 4 Ko, une seule police de la marque', () => {
    const h = Buffer.from(htmlAccueil({ lang: 'fr', cfg }));
    expect(h.length).toBeLessThan(20 * 1024);
    expect(gzipSync(h).length).toBeLessThan(8 * 1024);
    expect(readFileSync(join(STATIC, 'accueil.js')).length).toBeLessThan(4 * 1024);
    expect(
      readFileSync(join(STATIC, 'fonts', 'lexend-latin-600-normal.woff2')).length,
    ).toBeLessThan(20 * 1024);
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
