import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import IntlMessageFormat from 'intl-messageformat';
import { afterEach, describe, expect, it } from 'vitest';
import { _catalogForTests, detectLocale, fmtBytes, LOCALES, setLocale, t } from './index';

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
  });
});
