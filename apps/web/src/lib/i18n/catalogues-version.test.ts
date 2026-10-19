import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { versionner } from '../../../scripts/catalogues.mjs';

/**
 * 19/10/2026 — incident de la mise en ligne de 61060e7 : un téléphone resté sur l'ancienne version affichait les
 * nouveaux écrans avec des clés brutes (⟦id.google⟧, ⟦id.google_aide⟧, ⟦id.email⟧).
 *
 * CAUSE : le navigateur reçoit la nouvelle page (navigation « réseau d'abord ») et son nouveau code, mais le service
 * worker de l'ANCIENNE version (la nouvelle n'est appliquée qu'à « Mettre à jour ») répond aux catalogues
 * `/i18n/fr-*.json` depuis SON cache, cherché par adresse : l'ancien catalogue, sans les clés du nouveau code.
 *
 * CORRECTION : une version de l'application demande ses catalogues à l'adresse de SA version (`/i18n/<version>/…`,
 * copiés à la construction) — un ancien cache ne peut plus répondre — et, à défaut d'une clé, le texte français par
 * défaut remplace la clé brute (production).
 */
const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const STATIC = join(WEB, 'static', 'i18n');
const source = (...p: string[]) => readFileSync(join(WEB, 'src', ...p), 'utf8');
const lire = (f: string) =>
  JSON.parse(readFileSync(join(STATIC, f), 'utf8')) as Record<string, string>;

const FRAIS = lire('fr-rares.json');
/** le catalogue de la version précédente : mêmes textes, SANS les écrans d'identité de 61060e7 */
const ANCIEN = Object.fromEntries(Object.entries(FRAIS).filter(([k]) => !k.startsWith('id.')));
const CLES_VUES = ['id.google', 'id.google_aide', 'id.email'];

/**
 * L'ancien service worker (lib du 18/10) : « cache d'abord par ADRESSE, puis réseau ». Son cache contient les
 * catalogues de l'ancienne version ; le réseau (le serveur de la nouvelle version) sert aussi les adresses versionnées.
 */
function ancienWorker(version: string) {
  const cache = new Map<string, Record<string, string>>([['/i18n/fr-rares.json', ANCIEN]]);
  const reseau = new Map<string, Record<string, string>>([
    ['/i18n/fr-rares.json', FRAIS],
    [`/i18n/${version}/fr-rares.json`, FRAIS],
  ]);
  const demandes: string[] = [];
  const fetcher = async (adresse: string) => {
    const chemin = new URL(adresse, 'https://awzid.test').pathname;
    demandes.push(chemin);
    const rep = cache.get(chemin) ?? reseau.get(chemin);
    if (!rep) throw new Error(`404 ${chemin}`);
    return rep;
  };
  return { fetcher, demandes };
}

async function neuf() {
  vi.resetModules();
  return import('./index');
}
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('catalogues de textes : une version charge TOUJOURS son catalogue', () => {
  it('le catalogue gardé par l’ancienne version n’a pas les clés du nouveau code (cas réel du 19/10)', () => {
    for (const k of CLES_VUES) {
      expect(k in FRAIS, k).toBe(true);
      expect(k in ANCIEN, k).toBe(false);
    }
  });

  it('SANS versionnement (avant la correction) : l’ancien worker sert l’ancien catalogue, les clés s’affichent brutes', async () => {
    const i = await neuf();
    i.setCatalogVersion(null);
    const w = ancienWorker('v2');
    await i.loadTexts('rares', (code) => w.fetcher(i.catalogUrl(code)));
    expect(w.demandes).toEqual(['/i18n/fr-rares.json']);
    expect(i.t('id.google')).toBe('⟦id.google⟧');
  });

  it('AVEC versionnement : un ancien catalogue en cache n’est jamais servi au nouveau code', async () => {
    const i = await neuf();
    i.setCatalogVersion('v2');
    expect(i.catalogUrl('fr-rares')).toBe('/i18n/v2/fr-rares.json');
    const w = ancienWorker('v2');
    await i.loadTexts('rares', (code) => w.fetcher(i.catalogUrl(code)));
    // l'adresse versionnée n'est dans aucun ancien cache : elle va au serveur
    expect(w.demandes).toEqual(['/i18n/v2/fr-rares.json']);
    for (const k of CLES_VUES) {
      expect(i.t(k), k).toBe(FRAIS[k]);
      expect(i.t(k), k).not.toContain('⟦');
    }
    expect(i.clesManquantes()).toEqual([]);
  });

  it('adresses : versionnées en production, simples en développement et en test ; legal et langues suivent', async () => {
    const i = await neuf();
    expect(i.catalogUrl('en')).toBe('/i18n/en.json');
    i.setCatalogVersion('1792397213427');
    expect(i.catalogUrl('en')).toBe('/i18n/1792397213427/en.json');
    expect(i.catalogUrl('legal/fr')).toBe('/i18n/1792397213427/legal/fr.json');
    i.setCatalogVersion(null);
    expect(i.catalogUrl('fr-rares')).toBe('/i18n/fr-rares.json');
    expect(source('lib', 'legal', 'pages.ts')).toContain('catalogUrl(`legal/${lang}`)');
  });
});

describe('à défaut d’une clé : le texte français, jamais une clé brute (production)', () => {
  it('développement et tests : la clé manquante reste visible (pour la corriger)', async () => {
    const i = await neuf();
    expect(i.t('inconnue.cle')).toBe('⟦inconnue.cle⟧');
  });

  it('production : aucune clé brute, la clé est notée ; le catalogue est rechargé et le texte français apparaît', async () => {
    const reseau = vi.fn(
      async (_adresse: string) => ({ ok: true, json: async () => FRAIS }) as Response,
    );
    vi.stubGlobal('fetch', reseau);
    const i = await neuf();
    i.setStrictKeys(false);
    i.setCatalogVersion('v2');
    // catalogue ancien déjà chargé (cas d'un cache qui aurait quand même répondu) : clés absentes
    await i.loadTexts('rares', async () => ANCIEN);
    for (const k of CLES_VUES) expect(i.t(k), k).toBe('');
    expect(i.clesManquantes()).toEqual(expect.arrayContaining(CLES_VUES));
    // UNE seule récupération (adresse de la version) : les catalogues demandés sont rechargés, les textes frais l'emportent
    await i.guerir();
    // tous les espaces sont rechargés : la clé manquante peut appartenir à un espace non chargé par la page
    expect(reseau).toHaveBeenCalledTimes(i.SPACE_CATALOGS.length);
    expect(reseau).toHaveBeenCalledWith('/i18n/v2/fr-rares.json');
    for (const k of CLES_VUES) {
      expect(i.t(k), k).toBe(FRAIS[k]);
      expect(i.t(k), k).not.toContain('⟦');
    }
  });

  it('production : une clé absente de tous les catalogues ne montre jamais ⟦ ⟧', async () => {
    const i = await neuf();
    i.setStrictKeys(false);
    expect(i.t('rien.du.tout')).toBe('');
    expect(i.clesManquantes()).toContain('rien.du.tout');
  });

  it('le texte français par défaut sert aux autres langues quand la clé manque dans leur catalogue', async () => {
    const i = await neuf();
    i.setStrictKeys(false);
    await i.loadTexts('rares', async () => FRAIS);
    await i.loadLocale('en', async () => ({ 'app.nom': 'Awzid' }));
    i.setLocale('en');
    expect(i.t('id.google')).toBe(FRAIS['id.google']);
    i.setLocale('fr');
  });

  it('hooks.client : la version de l’application est donnée aux catalogues, les clés brutes cachées hors développement', () => {
    const h = source('hooks.client.ts');
    expect(h).toContain('setCatalogVersion(dev ? null : version)');
    expect(h).toContain('setStrictKeys(dev)');
  });
});

describe('service worker et construction : catalogues versionnés', () => {
  const sw = source('service-worker.ts');

  it('le worker précharge et garde les catalogues DE SA version (jamais l’adresse fixe)', () => {
    expect(sw).toContain("const vers = (p: string) => p.replace('/i18n/', `/i18n/${version}/`)");
    expect(sw).toContain('...STUDENT_TEXTS.map(vers)');
    expect(sw).toMatch(/LEGAL = \[[^\]]*\]\.map\(vers\)/); // textes légaux
    // les catalogues de l'adresse fixe ne sont plus dans la liste préchargée
    expect(sw).toContain('!isCatalog(f) &&');
  });

  it('la construction copie les catalogues sous i18n/<version>/ (hors accueil), identiques aux sources', () => {
    const sortie = mkdtempSync(join(tmpdir(), 'awzid-cat-'));
    try {
      mkdirSync(join(sortie, '_app'), { recursive: true });
      writeFileSync(join(sortie, '_app', 'version.json'), JSON.stringify({ version: '12345' }));
      expect(versionner(sortie)).toBe('12345');
      const copie = (f: string) => join(sortie, 'i18n', '12345', f);
      for (const f of ['fr-rares.json', 'fr-lecteur.json', 'en.json', 'legal/fr.json'])
        expect(readFileSync(copie(f), 'utf8'), f).toBe(readFileSync(join(STATIC, f), 'utf8'));
      expect(existsSync(copie('accueil'))).toBe(false);
      // pas de dossier de construction : rien n'est inventé
      const vide = mkdtempSync(join(tmpdir(), 'awzid-cat-'));
      expect(versionner(vide)).toBeNull();
      rmSync(vide, { recursive: true, force: true });
    } finally {
      rmSync(sortie, { recursive: true, force: true });
    }
  });

  it('le script de construction exécute la copie après groupes.mjs', () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toMatch(/groupes\.mjs && node scripts\/catalogues\.mjs$/);
  });
});
