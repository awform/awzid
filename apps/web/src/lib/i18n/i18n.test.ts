import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import IntlMessageFormat from 'intl-messageformat';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  _catalogForTests,
  detectLocale,
  fmtBytes,
  loadLocale,
  loadTexts,
  localeInfo,
  SPACE_CATALOGS,
  STAFF_CATALOG,
  LOCALES,
  setLocale,
  t,
} from './index';

const SRC = fileURLToPath(new URL('../..', import.meta.url));

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(svelte|ts)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Arguments ICU de premier niveau d'un message ({n}, {n, plural, …}). */
function args(msg: string): string[] {
  return [...msg.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]!).sort();
}

const fr = _catalogForTests.fr!;

/** catalogues statiques (lot 25) lus sur le disque, comme le navigateur les télécharge */
const STATIC = fileURLToPath(new URL('../../../static/i18n', import.meta.url));
const fromDisk = async (code: string) =>
  JSON.parse(readFileSync(join(STATIC, `${code}.json`), 'utf8')) as Record<string, string>;

beforeAll(async () => {
  for (const l of LOCALES) await loadLocale(l.code, fromDisk);
  // A37 : textes français du personnel (fichier statique) ajoutés au catalogue français, comme sur leurs pages
  for (const n of SPACE_CATALOGS) await loadTexts(n, fromDisk);
});
afterEach(() => setLocale('fr'));

describe('catalogues de messages', () => {
  it('chaque langue a exactement les clés du français, avec les mêmes arguments', () => {
    for (const l of LOCALES) {
      const cat = _catalogForTests[l.code]!;
      expect(Object.keys(cat).sort(), l.code).toEqual(Object.keys(fr).sort());
      for (const k of Object.keys(fr))
        expect(args(cat[k]!), `${l.code}:${k}`).toEqual(args(fr[k]!));
    }
  });

  it('aucune clé en double dans les fichiers (une clé répétée écraserait silencieusement la première)', () => {
    for (const l of LOCALES) {
      const raw = readFileSync(
        l.code === 'fr'
          ? join(SRC, 'lib', 'i18n', 'messages', 'fr.json')
          : join(STATIC, `${l.code}.json`),
        'utf8',
      );
      const keys = [...raw.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]!);
      expect(
        keys.filter((k, i) => keys.indexOf(k) !== i),
        l.code,
      ).toEqual([]);
    }
  });

  it('tous les messages sont du MessageFormat ICU valide', () => {
    for (const l of LOCALES)
      for (const [k, m] of Object.entries(_catalogForTests[l.code]!))
        expect(() => new IntlMessageFormat(m, l.code), `${l.code}:${k}`).not.toThrow();
  });

  it('toute clé littérale utilisée dans le code existe', () => {
    const missing: string[] = [];
    for (const f of files(SRC)) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-z_.0-9]+)'/g))
        if (!(m[1]! in fr)) missing.push(`${f}: ${m[1]}`);
      // clés dynamiques `préfixe.${…}` : le préfixe doit exister
      for (const m of src.matchAll(/\bt\(\s*`([a-z_.0-9]+\.)\$\{/g))
        if (!Object.keys(fr).some((k) => k.startsWith(m[1]!))) missing.push(`${f}: ${m[1]}*`);
    }
    expect(missing).toEqual([]);
  });

  it("aucun texte d'interface en dur dans le balisage des composants", () => {
    const found: string[] = [];
    for (const f of files(SRC).filter((x) => x.endsWith('.svelte'))) {
      let m = readFileSync(f, 'utf8')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      for (const attr of m.matchAll(
        /\s(?:aria-label|title|placeholder|alt)="([^"{]*[A-Za-zÀ-ÿ]{2,}[^"]*)"/g,
      ))
        found.push(`${f}: ${attr[1]}`);
      let prev = '';
      while (prev !== m) {
        prev = m;
        m = m.replace(/\{[^{}]*\}/g, ' ');
      }
      m = m.replace(/<[^>]*>/g, '\n');
      for (const line of m.split('\n'))
        if (/[A-Za-zÀ-ÿ]{2,}/.test(line)) found.push(`${f}: ${line.trim()}`);
    }
    expect(found).toEqual([]);
  });
});

describe('fonctions', () => {
  it('pluriels, repli et formats selon la locale', () => {
    expect(t('entete.attente', { n: 1 })).toBe('1 réponse en attente');
    setLocale('en');
    expect(t('entete.attente', { n: 2 })).toBe('2 answers waiting');
    expect(fmtBytes(2048)).toBe('2 kB');
    expect(t('cle.inexistante')).toBe('⟦cle.inexistante⟧');
  });

  it('seules les langues relues sont proposées par défaut', () => {
    expect(detectLocale(['en-US'])).toBe('fr');
    expect(detectLocale(['en-US'], true)).toBe('en');
    expect(detectLocale(['de'])).toBe('fr');
    // lot 25 : espagnol, allemand, arabe en préparation (à relire par un locuteur natif)
    for (const c of ['es', 'de', 'ar']) {
      expect(LOCALES.find((l) => l.code === c)?.status, c).toBe('preparation');
      expect(detectLocale([c])).toBe('fr');
      expect(detectLocale([c], true)).toBe(c);
    }
  });

  it('lot 25 : interface en arabe de droite à gauche, espagnol et allemand de gauche à droite', () => {
    const root = { lang: '', dir: '' };
    vi.stubGlobal('document', { documentElement: root });
    const frText = t('entete.attente', { n: 2 });
    setLocale('ar');
    expect(root).toEqual({ lang: 'ar', dir: 'rtl' });
    expect(localeInfo('ar').dir).toBe('rtl');
    expect(t('entete.attente', { n: 3 })).toMatch(/3/);
    expect(t('entete.attente', { n: 3 })).toMatch(/[\u0600-\u06FF]/);
    for (const c of ['es', 'de']) {
      setLocale(c);
      expect(root).toEqual({ lang: c, dir: 'ltr' });
      expect(t('entete.attente', { n: 2 })).not.toBe(frText);
    }
    setLocale('fr');
    expect(root.dir).toBe('ltr');
    vi.unstubAllGlobals();
  });

  it('lot 25 : les traductions en préparation sont signalées « à relire par un locuteur natif »', () => {
    const note = readFileSync(join(SRC, 'lib', 'i18n', 'A_RELIRE.md'), 'utf8');
    for (const l of LOCALES.filter((x) => x.status === 'preparation'))
      expect(
        note
          .split('\n')
          .some(
            (line) =>
              line.includes(`/${l.code}.json\``) && line.includes('à relire par un locuteur natif'),
          ),
        l.code,
      ).toBe(true);
    expect(_catalogForTests.fr!['compte.langue_preparation']).toContain(
      'à relire par un locuteur natif',
    );
  });

  it('audit PERF-1 : seul le français est dans la coquille, les autres langues sont chargées à la demande', () => {
    const src = readFileSync(join(SRC, 'lib', 'i18n', 'index.ts'), 'utf8');
    const statics = [...src.matchAll(/^import .* from '\.\/messages\/(\w+)\.json';$/gm)].map(
      (m) => m[1],
    );
    expect(statics).toEqual(['fr']);
    // lot 25 : catalogues hors du paquet JavaScript (fichiers statiques), jamais préchargés par le service worker
    expect(src).toContain('fetch(`/i18n/${code}.json`)');
    for (const l of LOCALES.filter((x) => x.code !== 'fr'))
      expect(statSync(join(STATIC, `${l.code}.json`)).isFile(), l.code).toBe(true);
    const sw = readFileSync(join(SRC, 'service-worker.ts'), 'utf8');
    expect(sw).toContain('!isCatalog(f)');
    // A37 : textes français du personnel hors de la coquille, chargés par les mises en page du personnel ;
    // aucun n'est dans messages/fr.json ni utilisé par une page de l'élève
    const staff = JSON.parse(readFileSync(join(STATIC, `${STAFF_CATALOG}.json`), 'utf8')) as object;
    const shell = JSON.parse(readFileSync(join(SRC, 'lib', 'i18n', 'messages', 'fr.json'), 'utf8'));
    expect(Object.keys(staff).length).toBeGreaterThan(100);
    expect(Object.keys(staff).filter((k) => k in shell)).toEqual([]);
    for (const p of ['enseignant', 'admin'])
      expect(readFileSync(join(SRC, 'routes', p, '+layout.ts'), 'utf8'), p).toContain(
        'loadStaffTexts',
      );
    // espaces de l'élève : chargés par leur mise en page, préchargés par le service worker, jamais en double
    for (const p of ['quotidien', 'vivre']) {
      expect(readFileSync(join(SRC, 'routes', p, '+layout.ts'), 'utf8'), p).toContain(
        `loadTexts('${p}')`,
      );
      expect(sw, p).toContain(`/i18n/fr-${p}.json`);
      const extra = JSON.parse(readFileSync(join(STATIC, `fr-${p}.json`), 'utf8')) as object;
      expect(Object.keys(extra).filter((k) => k in shell || k in staff)).toEqual([]);
    }
    const student = files(join(SRC, 'routes')).filter(
      (f) => !/[\\/]routes[\\/](enseignant|admin)[\\/]/.test(f),
    );
    const used: string[] = [];
    for (const f of student) {
      const src = readFileSync(f, 'utf8');
      for (const k of Object.keys(staff)) if (src.includes(`'${k}'`)) used.push(`${f}: ${k}`);
    }
    expect(used).toEqual([]);
    // police du Coran : plus de préchargement sur toutes les pages
    expect(readFileSync(join(SRC, 'app.html'), 'utf8')).not.toContain('amiri-quran');
  });
});
