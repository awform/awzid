/**
 * Bêta fermée (application) : bandeau « Version bêta » (fermable, traduit, sans la formule bannie), mode fermé
 * (pages restées ouvertes), invisibilité (noindex, robots.txt strict, ni sitemap ni aperçu social), page de
 * maintenance, journal d'erreurs sans donnée personnelle.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bandeauAffiche,
  bandeauFerme,
  CLE_BANDEAU,
  fermerBandeau,
  accueilVisiteur,
  maintenance,
  ouverteSiFerme,
  pageDeVerification,
  VERSION_BANDEAU,
  type AccesStatut,
  type StockageSimple,
} from './acces';
import {
  cheminOuvert,
  cheminSur,
  doitFermer,
  EN_TETE_ROBOTS,
  estNavigation,
  langueDe,
  nettoyer,
  pageMaintenance,
  ROBOTS_TXT,
} from './server/acces-serveur';

const WEB = join(import.meta.dirname, '..', '..');
const STATIC = join(WEB, 'static');
const SRC = join(WEB, 'src');

const memoire = (): StockageSimple & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const statut = (p: Partial<AccesStatut> = {}): AccesStatut => ({
  mode: 'invitation',
  inscription: 'invitation',
  site: 'ouvert',
  bandeau: 'on',
  verification: 'souple',
  antibot: 'off',
  admin: false,
  ...p,
});

describe('trois modes, plafond, vérification de l’adresse (application)', () => {
  it('accueil du visiteur : seulement en mode « sur invitation », hors connexion, inscription et pages légales', () => {
    const inv = statut({ mode: 'invitation' });
    expect(accueilVisiteur(inv, false, '/')).toBe(true);
    expect(accueilVisiteur(inv, false, '/lecons/en1.l01')).toBe(true);
    expect(accueilVisiteur(inv, false, '/coran/lecteur')).toBe(true);
    for (const p of [
      '/connexion',
      '/inscription',
      '/acces/verification',
      '/legal/cgu',
      '/aide',
      '/etat',
      '/errata',
    ])
      expect(accueilVisiteur(inv, false, p), p).toBe(false);
    expect(accueilVisiteur(inv, true, '/')).toBe(false); // connecté
    expect(accueilVisiteur(statut({ mode: 'ouvert' }), false, '/')).toBe(false);
    expect(accueilVisiteur(statut({ mode: 'ferme', site: 'ferme' }), false, '/')).toBe(false); // la maintenance s'applique
    expect(accueilVisiteur(null, false, '/')).toBe(false);
  });
  it('le poids de cette logique n’alourdit pas l’appareil de l’élève : modules chargés à la demande, en ligne seulement', () => {
    const g = readFileSync(join(WEB, 'scripts', 'groupes.mjs'), 'utf8');
    expect(g).toContain('BandeauBeta');
    expect(g).toContain('acces\\.ts');
    expect(g).toContain('AccueilBeta');
    const layout = readFileSync(join(SRC, 'routes', '+layout.svelte'), 'utf8');
    expect(layout).toContain("import('$lib/acces')");
    expect(layout).toContain("import('./inscription/AccueilBeta.svelte')");
    expect(layout).not.toMatch(/^\s*import \{[^}]*\} from '\$lib\/acces';/m);
  });
  it('l’accueil et la maintenance n’ont aucune phrase en dur et leurs textes existent dans les cinq langues', () => {
    const comp = readFileSync(join(SRC, 'routes', 'inscription', 'AccueilBeta.svelte'), 'utf8');
    for (const k of [
      'acc.presentation',
      'acc.beta',
      'acc.beta_texte',
      'acc.code',
      'acc.demander',
      'acc.connexion',
      'ferme.titre',
    ])
      expect(comp, k).toContain(`'${k}'`);
    for (const l of ['en', 'es', 'de', 'ar']) {
      const m = JSON.parse(readFileSync(join(STATIC, 'i18n', `${l}.json`), 'utf8')) as Record<
        string,
        string
      >;
      for (const k of ['acc.presentation', 'acc.beta', 'acc.code', 'acc.demander', 'ferme.titre'])
        expect(m[k], `${l} ${k}`).toBeTruthy();
    }
    const rares = JSON.parse(readFileSync(join(STATIC, 'i18n', 'fr-rares.json'), 'utf8')) as Record<
      string,
      string
    >;
    expect(rares['acc.beta']).toBe('Bêta sur invitation');
    const shell = JSON.parse(
      readFileSync(join(SRC, 'lib', 'i18n', 'messages', 'fr.json'), 'utf8'),
    ) as Record<string, string>;
    expect(shell['ferme.titre']).toBeUndefined(); // hors de la coquille de l'élève
  });
  it('l’adresse à vérifier renvoie vers la page dédiée, sauf compte, aide et pages légales', () => {
    const r = statut({ verification: 'requise' });
    expect(pageDeVerification(r, false, 'adulte', '/')).toBe('/acces/verification');
    expect(pageDeVerification(r, false, 'parent', '/lecons/en1.l01')).toBe('/acces/verification');
    for (const p of ['/acces/verification', '/compte', '/aide', '/legal/cgu', '/connexion'])
      expect(pageDeVerification(r, false, 'adulte', p), p).toBeNull();
    expect(pageDeVerification(r, true, 'adulte', '/')).toBeNull();
    expect(pageDeVerification(r, undefined, 'adulte', '/')).toBeNull();
    expect(pageDeVerification(r, false, 'admin', '/')).toBeNull();
    expect(pageDeVerification(statut({ verification: 'souple' }), false, 'adulte', '/')).toBeNull();
    expect(pageDeVerification(null, false, 'adulte', '/')).toBeNull();
  });
  it('les textes des trois modes, du plafond et du tableau existent dans les cinq langues', () => {
    const catalogues: Record<string, Record<string, string>> = {};
    for (const l of ['en', 'es', 'de', 'ar'])
      catalogues[l] = JSON.parse(readFileSync(join(STATIC, 'i18n', `${l}.json`), 'utf8'));
    for (const k of [
      'acces.mode_ferme',
      'acces.mode_invitation',
      'acces.mode_ouvert',
      'acces.plafond',
      'tab.comptes_val',
      'tab.al_plafond_atteint',
      'inv.complet',
      'ver.titre',
      'erreur.plafond_atteint',
      'erreur.antibot_echec',
    ])
      for (const l of Object.keys(catalogues)) expect(catalogues[l]![k], `${l} ${k}`).toBeTruthy();
  });
});

describe('bandeau « Version bêta »', () => {
  it('affiché par défaut (serveur injoignable compris), masquable par l’administrateur', () => {
    expect(bandeauAffiche(null, memoire())).toBe(true);
    expect(bandeauAffiche(statut(), memoire())).toBe(true);
    expect(bandeauAffiche(statut({ bandeau: 'off' }), memoire())).toBe(false);
  });
  it('fermable : la fermeture est retenue sur l’appareil, jusqu’à un changement de texte', () => {
    const s = memoire();
    expect(bandeauFerme(s)).toBe(false);
    fermerBandeau(s);
    expect(s.m.get(CLE_BANDEAU)).toBe(VERSION_BANDEAU);
    expect(bandeauFerme(s)).toBe(true);
    expect(bandeauAffiche(statut(), s)).toBe(false);
    s.m.set(CLE_BANDEAU, 'ancienne-version');
    expect(bandeauAffiche(statut(), s)).toBe(true);
  });
  it('stockage indisponible : jamais d’exception', () => {
    const casse: StockageSimple = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(() => fermerBandeau(casse)).not.toThrow();
    expect(bandeauFerme(casse)).toBe(false);
    expect(bandeauFerme(null)).toBe(false);
  });
  it('texte traduit en français, anglais, espagnol, allemand et arabe, sans « validation humaine »', () => {
    const fr = JSON.parse(
      readFileSync(join(SRC, 'lib', 'i18n', 'messages', 'fr.json'), 'utf8'),
    ) as Record<string, string>;
    expect(fr['bandeau.texte']).toBe(
      'Version bêta — le contenu religieux est tranché par le référent selon l’école mālikite, sources citées, en attente de relecture.',
    );
    const textes = [fr['bandeau.texte']!];
    for (const l of ['en', 'es', 'de', 'ar']) {
      const m = JSON.parse(readFileSync(join(STATIC, 'i18n', `${l}.json`), 'utf8')) as Record<
        string,
        string
      >;
      expect(m['bandeau.texte'], l).toBeTruthy();
      expect(m['bandeau.texte'], l).not.toBe(fr['bandeau.texte']);
      expect(m['bandeau.fermer'], l).toBeTruthy();
      expect(m['bandeau.aria'], l).toBeTruthy();
      textes.push(m['bandeau.texte']!);
    }
    // l’arabe est un texte arabe entier, qui ne se mêle pas au latin (il occupe sa propre ligne)
    expect(textes[4]).toMatch(/^[؀-ۿ]/);
    expect(textes[4]).not.toMatch(/[A-Za-z]/);
    for (const x of textes) expect(x).not.toMatch(/validation humaine|validated by a human/i);
  });
  it('le composant est chargé après le démarrage et ne porte aucune phrase en dur', () => {
    const layout = readFileSync(join(SRC, 'routes', '+layout.svelte'), 'utf8');
    expect(layout).toContain("import('$lib/BandeauBeta.svelte')");
    expect(layout).not.toMatch(/^\s*import BandeauBeta/m);
    const comp = readFileSync(join(SRC, 'lib', 'BandeauBeta.svelte'), 'utf8');
    expect(comp).toContain("t('bandeau.texte')");
    expect(comp).toContain('role="note"');
    expect(comp).toMatch(/min-height: 44px/);
  });
});

describe('mode fermé (côté application)', () => {
  it('seules la connexion, l’administration et l’état du service restent ouverts', () => {
    for (const p of ['/connexion', '/admin', '/admin/x', '/acces', '/etat'])
      expect(ouverteSiFerme(p), p).toBe(true);
    for (const p of ['/', '/lecons/en1.l01', '/inscription', '/compte', '/administration'])
      expect(ouverteSiFerme(p), p).toBe(false);
  });
  it('la maintenance ne concerne ni les administrateurs ni un site ouvert ni un serveur muet', () => {
    expect(maintenance(statut({ site: 'ferme' }), '/')).toBe(true);
    expect(maintenance(statut({ site: 'ferme' }), '/connexion')).toBe(false);
    expect(maintenance(statut({ site: 'ferme', admin: true }), '/')).toBe(false);
    expect(maintenance(statut({ site: 'ouvert' }), '/')).toBe(false);
    expect(maintenance(null, '/')).toBe(false);
  });
});

describe('mode fermé (côté serveur web)', () => {
  it('décision : navigation seulement, hors pages ouvertes, sauf administrateur', () => {
    const f = { site: 'ferme' as const };
    expect(doitFermer(f, '/', true)).toBe(true);
    expect(doitFermer(f, '/lecons/en1.l01', true)).toBe(true);
    expect(doitFermer(f, '/', false)).toBe(false); // ressource, pas une page
    expect(doitFermer(f, '/connexion', true)).toBe(false);
    expect(doitFermer(f, '/admin', true)).toBe(false);
    expect(doitFermer({ ...f, admin: true }, '/', true)).toBe(false);
    expect(doitFermer({ site: 'ouvert' }, '/', true)).toBe(false);
    expect(doitFermer(null, '/', true)).toBe(false);
  });
  it('seules les requêtes de page sont des navigations', () => {
    expect(estNavigation('GET', 'text/html,application/xhtml+xml', '/')).toBe(true);
    expect(estNavigation('POST', 'text/html', '/')).toBe(false);
    expect(estNavigation('GET', 'application/json', '/api/v1/x')).toBe(false);
    expect(estNavigation('GET', 'text/html', '/__data.json')).toBe(false);
    expect(cheminOuvert('/_app/immutable/x.js')).toBe(true);
    expect(cheminOuvert('/api/v1/health')).toBe(true);
    expect(cheminOuvert('/healthz')).toBe(true);
    expect(cheminOuvert('/lecons')).toBe(false);
  });
  it('page de maintenance : 503, sobre, sans ressource externe ni script, dans la langue demandée', async () => {
    const r = pageMaintenance('ar-SA,ar;q=0.9,fr;q=0.8');
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-robots-tag')).toBe(EN_TETE_ROBOTS);
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await r.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Awzid مغلق مؤقتًا');
    expect(html).not.toMatch(/<script|<link|https?:\/\//i);
    expect(html.length).toBeLessThan(2500);
    for (const [al, mot] of [
      ['en', 'temporarily closed'],
      ['es', 'cerrado temporalmente'],
      ['de', 'vorübergehend geschlossen'],
      ['fr', 'momentanément fermé'],
      [null, 'momentanément fermé'],
      ['it', 'momentanément fermé'],
    ] as const)
      expect(await pageMaintenance(al).text(), String(al)).toContain(mot);
    expect(langueDe('de-DE,de;q=0.9')).toBe('de');
  });
  it('les textes de la page serveur sont ceux du catalogue', () => {
    const fr = JSON.parse(readFileSync(join(STATIC, 'i18n', 'fr-rares.json'), 'utf8')) as Record<
      string,
      string
    >;
    const src = readFileSync(join(SRC, 'lib', 'server', 'acces-serveur.ts'), 'utf8');
    expect(src).toContain(fr['ferme.titre']);
    expect(src).toContain(fr['ferme.texte']);
  });
});

describe('invisible : ni moteurs de recherche, ni sitemap, ni aperçu social', () => {
  it('robots.txt interdit tout à tous, et le serveur sert le même', () => {
    expect(readFileSync(join(STATIC, 'robots.txt'), 'utf8')).toBe(ROBOTS_TXT);
    expect(ROBOTS_TXT).toBe('User-agent: *\nDisallow: /\n');
  });
  it('aucun sitemap, aucune balise d’aperçu social (Open Graph, Twitter) dans l’application', () => {
    expect(existsSync(join(STATIC, 'sitemap.xml'))).toBe(false);
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : walk(p);
        return /\.(svelte|html|ts)$/.test(n) && !n.endsWith('.test.ts') ? [p] : [];
      });
    const bad = [...walk(SRC), ...walk(STATIC)].filter((f) =>
      /property=["']og:|name=["']twitter:|rel=["']sitemap/i.test(readFileSync(f, 'utf8')),
    );
    expect(bad.map((f) => f.slice(WEB.length))).toEqual([]);
  });
  it('chaque page de départ demande à ne pas être indexée', () => {
    const app = readFileSync(join(SRC, 'app.html'), 'utf8');
    expect(app).toMatch(/<meta name="robots" content="noindex, nofollow/);
    expect(readFileSync(join(STATIC, 'etat.html'), 'utf8')).toMatch(/noindex/);
    expect(EN_TETE_ROBOTS).toBe('noindex, nofollow, noarchive, nosnippet, noimageindex');
  });
  it('le hook serveur pose l’en-tête sur toutes les réponses et sert robots.txt sans sitemap', () => {
    const h = readFileSync(join(SRC, 'hooks.server.ts'), 'utf8');
    expect(h).toContain('X-Robots-Tag');
    expect(h).toContain("pathname === '/robots.txt'");
    expect(h).toContain('/sitemap.xml');
  });
});

describe('journal d’erreurs sans donnée personnelle (web)', () => {
  it('adresses, identifiants, jetons et codes d’invitation disparaissent', () => {
    const s = nettoyer(
      'échec pour prenom@exemple.org (0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b) avec AWZ-ABCDE-FGHJK ' +
        'et le jeton abcdefghijklmnopqrstuvwxyz0123456789ABCDEF',
    );
    expect(s).not.toMatch(/@|0190a1b2|AWZ-ABCDE|abcdefghijklmnop/);
  });
  it('le chemin journalisé ne garde ni paramètres ni fragment', () => {
    expect(cheminSur('/inscription?code=AWZ-ABCDE-FGHJK#x')).toBe('/inscription');
  });
});
