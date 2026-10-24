import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { textesDeRoute } from './espaces';
import { SPACE_CATALOGS } from './index';

/**
 * 19/10/2026 — découpage du catalogue français par espaces : la coquille (`messages/fr.json`, dans le morceau commun)
 * ne garde que les textes affichables sur toutes les pages ou par plusieurs espaces ; les autres sont dans le
 * catalogue de LEUR espace (`static/i18n/fr-<espace>.json`), chargé par la mise en page de l'espace.
 *
 * Contrôle : pour CHAQUE page, on suit les imports (statiques et dynamiques) depuis ses fichiers de route (mises en
 * page, page, page d'erreur racine) ; chaque clé citée par un fichier atteint doit être dans la coquille ou dans un
 * catalogue chargé sur le chemin (mises en page et pages de la route, ou le module lui-même qui charge ses textes).
 * Aucune clé ne peut donc manquer à l'écran faute de catalogue chargé.
 */
const SRC = fileURLToPath(new URL('../..', import.meta.url));
const ROUTES = join(SRC, 'routes');
const STATIC = fileURLToPath(new URL('../../../static/i18n', import.meta.url));
const lire = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(lire(p)) as Record<string, string>;

const coquille = json(join(SRC, 'lib', 'i18n', 'messages', 'fr.json'));
/** textes embarqués dans le morceau d'un module chargé à la demande (`ajouterTextes`) */
const EMBARQUES = [
  join(SRC, 'lib', 'vivante', 'textes-fr.json'),
  join(SRC, 'lib', 'cahier', 'textes-fr.json'),
  join(SRC, 'lib', 'cahier-parler', 'textes-fr.json'),
];
const catalogues: Record<string, Record<string, string>> = Object.fromEntries([
  ...SPACE_CATALOGS.map((n) => [n, json(join(STATIC, `fr-${n}.json`))]),
  ...EMBARQUES.map((p) => [p, json(p)]),
]);
const toutes = new Set([
  ...Object.keys(coquille),
  ...Object.values(catalogues).flatMap((c) => Object.keys(c)),
]);
const toutesListe = [...toutes];

/** catalogues chargés par un fichier (`loadTexts('x')`, `loadStaffTexts()`, `ajouterTextes(<json importé>)`) */
function charges(f: string, src: string): string[] {
  const out = [...src.matchAll(/\bloadTexts\(\s*'([a-z-]+)'/g)].map((m) => m[1]!);
  if (/\bloadStaffTexts\(/.test(src)) out.push('personnel');
  for (const m of src.matchAll(/^import (\w+) from '([^']+\.json)';$/gm))
    if (new RegExp(`\\bajouterTextes\\(${m[1]}\\)`).test(src)) {
      const p = m[2]!.startsWith('$lib/')
        ? join(SRC, 'lib', m[2]!.slice(5))
        : join(dirname(f), m[2]!);
      expect(EMBARQUES, f).toContain(p);
      out.push(p);
    }
  return out;
}

/** clés citées : littéraux exacts, et préfixes dynamiques (`pre.${…}`, 'pre.' + …) */
const clesCache = new Map<string, { lit: Set<string>; dyn: Set<string> }>();
function clesDe(f: string, src: string): { lit: Set<string>; dyn: Set<string> } {
  let c = clesCache.get(f);
  if (c) return c;
  const lit = new Set<string>();
  const dyn = new Set<string>();
  for (const m of src.matchAll(/['"`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)['"`]/g))
    if (toutes.has(m[1]!)) lit.add(m[1]!);
  for (const m of src.matchAll(
    /[`'"]([a-z][a-z0-9_]*\.(?:[a-z0-9_]+\.)*[a-z0-9_]*)(?:\$\{|['"`]\s*\+)/g,
  ))
    for (const k of toutesListe) if (k.startsWith(m[1]!) && !lit.has(k)) dyn.add(k);
  c = { lit, dyn };
  clesCache.set(f, c);
  return c;
}
/**
 * Messages d'erreur renvoyés par le serveur (`fr-erreurs`) : jamais cités littéralement, affichés par `erreur.${code}`
 * après une réponse en erreur, dont le message est chargé par `call` (lib/session.ts) avant le retour.
 */
const erreurs = catalogues['erreurs'] ?? {};

/** imports (statiques, dynamiques) résolus vers des fichiers de src/ ; les paquets sont ignorés */
const importsCache = new Map<string, string[]>();
function imports(f: string, src: string): string[] {
  let r = importsCache.get(f);
  if (r) return r;
  const specs = [
    ...src.matchAll(/(?:import|export)\s[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
  ].map((m) => m[1]!);
  r = [];
  for (const s of specs) {
    let base: string | null = null;
    if (s.startsWith('$lib/')) base = join(SRC, 'lib', s.slice(5));
    else if (s === '$lib') base = join(SRC, 'lib', 'index');
    else if (s.startsWith('.')) base = join(dirname(f), s);
    if (!base) continue;
    const c = [
      base,
      `${base}.ts`,
      `${base}.js`,
      `${base}.svelte`,
      `${base}.svelte.ts`,
      join(base, 'index.ts'),
    ].find((p) => existsSync(p) && statSync(p).isFile() && /\.(ts|js|svelte)$/.test(p));
    if (c) r.push(c);
  }
  importsCache.set(f, r);
  return r;
}

/** pages : +page.svelte et la chaîne de leurs mises en page */
function pages(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (n === '+page.svelte') out.push(dir);
  }
  return out;
}
function chaine(dir: string): string[] {
  const dirs: string[] = [];
  for (let d = dir; ; d = dirname(d)) {
    dirs.unshift(d);
    if (d === ROUTES) break;
  }
  const f: string[] = [join(ROUTES, '+error.svelte')];
  for (const d of dirs)
    for (const n of ['+layout.ts', '+layout.svelte'])
      if (existsSync(join(d, n))) f.push(join(d, n));
  for (const n of ['+page.ts', '+page.svelte']) if (existsSync(join(dir, n))) f.push(join(dir, n));
  return f;
}

describe('catalogue français découpé par espaces', () => {
  it('chaque clé utilisée par une page est dans la coquille ou dans un catalogue chargé par cette page', () => {
    const manques: string[] = [];
    const lp = pages(ROUTES);
    expect(lp.length).toBeGreaterThan(50);
    for (const dir of lp) {
      const ch = chaine(dir);
      // identifiant de route (`/lecons/[id]`) : catalogue de l'espace chargé par la mise en page racine
      const id = `/${relative(ROUTES, dir).split(/[\\/]/).join('/')}`;
      const espace = textesDeRoute(id);
      const dispo0 = new Set([
        ...ch.flatMap((f) => charges(f, lire(f))),
        ...(espace ? [espace] : []),
      ]);
      const vus = new Set<string>();
      const pile: [string, Set<string>][] = ch.map((f) => [f, dispo0]);
      while (pile.length) {
        const [f, d0] = pile.pop()!;
        const src = lire(f);
        const dispo = new Set([...d0, ...charges(f, src)]);
        const cle = `${f}|${[...dispo].sort().join(',')}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const { lit, dyn } = clesDe(f, src);
        for (const k of [...lit, ...dyn])
          if (
            !(k in coquille) &&
            !(dyn.has(k) && k in erreurs) &&
            ![...dispo].some((n) => k in (catalogues[n] ?? {}))
          )
            manques.push(`${relative(ROUTES, dir) || '/'} → ${relative(SRC, f)} : ${k}`);
        for (const i of imports(f, src)) pile.push([i, dispo]);
      }
    }
    expect([...new Set(manques)]).toEqual([]);
  });

  it('côté serveur (+server.ts, *.server.ts) : seulement des textes de la coquille (aucun catalogue chargé)', () => {
    const racines: string[] = [];
    const tous = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) tous(p);
        else if (/^\+server\.ts$|\.server\.ts$/.test(n)) racines.push(p);
      }
    };
    tous(SRC);
    expect(racines.length).toBeGreaterThan(0);
    const manques: string[] = [];
    const vus = new Set<string>();
    const pile = [...racines];
    while (pile.length) {
      const f = pile.pop()!;
      if (vus.has(f)) continue;
      vus.add(f);
      const src = lire(f);
      const { lit, dyn } = clesDe(f, src);
      for (const k of [...lit, ...dyn])
        if (!(k in coquille)) manques.push(`${relative(SRC, f)} : ${k}`);
      pile.push(...imports(f, src));
    }
    expect(manques).toEqual([]);
  });

  it("messages d'erreur du serveur : chargés à la réponse en erreur, jamais cités littéralement", () => {
    expect(Object.keys(erreurs).length).toBeGreaterThan(100);
    expect(Object.keys(erreurs).every((k) => k.startsWith('erreur.'))).toBe(true);
    // les codes produits par l'appareil lui-même restent dans la coquille (hors ligne)
    expect(coquille['erreur.reseau']).toBeTruthy();
    expect(lire(join(SRC, 'lib', 'session.ts'))).toMatch(
      /if \(!r\.ok && err\?\.code\) await loadTexts\('erreurs'\);/,
    );
    const cites: string[] = [];
    const tous = (d: string, o: string[] = []): string[] => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) tous(p, o);
        else if (/\.(ts|svelte)$/.test(n) && !n.endsWith('.test.ts')) o.push(p);
      }
      return o;
    };
    for (const f of tous(SRC))
      for (const k of clesDe(f, lire(f)).lit) if (k in erreurs) cites.push(`${f}: ${k}`);
    expect(cites).toEqual([]);
  });

  it('une clé dans un seul catalogue français ; coquille allégée', () => {
    const vues = new Map<string, string>();
    const doubles: string[] = [];
    for (const [n, c] of [['coquille', coquille] as const, ...Object.entries(catalogues)])
      for (const k of Object.keys(c)) {
        if (vues.has(k)) doubles.push(`${k} : ${vues.get(k)} et ${n}`);
        vues.set(k, n);
      }
    expect(doubles).toEqual([]);
    // 19/10/2026 : 1 333 clés avant le découpage ; la coquille ne doit pas regrossir sans raison
    expect(Object.keys(coquille).length).toBeLessThan(600);
  });

  it("espaces de l'élève découpés : chargés par leurs mises en page et gardés hors ligne dès l'installation", () => {
    const sw = lire(join(SRC, 'service-worker.ts'));
    for (const [n, ids] of [
      [
        'arabe',
        ['/', '/lecons/[id]', '/lectures/[code]', '/sciences', '/revisions', '/ecriture/fiche'],
      ],
      ['suivi', ['/suivi/rapport', '/aujourdhui', '/plus', '/profils', '/hors-ligne', '/aide']],
    ] as const) {
      expect(sw, n).toContain(`'/i18n/fr-${n}.json'`);
      for (const id of ids) expect(textesDeRoute(id), id).toBe(n);
    }
    for (const id of ['/coran/lecteur', '/enseignant', '/compte', '/madjaliss/[[texte]]/[[n]]'])
      expect(textesDeRoute(id), id).toBeNull();
    // chargés au premier affichage (mise en page racine) ET avant chaque navigation
    expect(lire(join(ROUTES, '+layout.ts'))).toMatch(
      /untrack\(\(\) => textesDeRoute\(route\.id\)\)/,
    );
    expect(lire(join(ROUTES, '+layout.svelte'))).toMatch(
      /onNavigate\([\s\S]*?textesDeRoute\(n\.to\?\.route\.id\)[\s\S]*?loadTexts\(espace\)/,
    );
  });
});
