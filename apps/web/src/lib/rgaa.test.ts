/**
 * Lot 24 (V1-h) — contrôles RGAA 4.1 vérifiables sans navigateur (grille : docs/projet/RGAA.md) :
 * 5.4 titre des tableaux, 8.3 langue par défaut, 8.5 titre de page, 10.7 focus visible, 12.7 lien d'évitement.
 * Les contrôles dans le navigateur (axe-core) sont dans e2e/a11y.spec.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

function files(dir: string, keep: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p, keep);
    return keep(f) ? [p] : [];
  });
}
const pages = (dir: string) => files(dir, (f) => f === '+page.svelte');

describe('RGAA — contrôles statiques', () => {
  it('8.3 : langue et sens de lecture déclarés sur la page', () => {
    expect(read('app.html')).toMatch(/<html lang="fr" dir="ltr"/);
  });

  it('8.5 : chaque page a un titre', () => {
    const all = pages(join(SRC, 'routes'));
    expect(all.length).toBeGreaterThan(30);
    const sans = all.filter((p) => !/<svelte:head>[\s\S]*?<title>/.test(readFileSync(p, 'utf8')));
    expect(sans).toEqual([]);
  });

  it('12.7 : lien d’évitement vers le contenu principal, premier élément de la page', () => {
    const layout = read('routes/+layout.svelte');
    const markup = layout.slice(layout.indexOf('</script>'));
    const link = markup.indexOf('href="#contenu"');
    expect(link).toBeGreaterThan(0);
    expect(link).toBeLessThan(markup.indexOf('<header'));
    expect(markup).toMatch(/<main id="contenu" tabindex="-1">/);
  });

  it('10.7 : focus visible sur tous les éléments interactifs', () => {
    const css = read('app.css');
    for (const el of ['button', 'a', 'input', 'select', 'textarea', 'summary', '[tabindex]'])
      expect(css).toContain(`${el}:focus-visible`);
  });

  it('5.4 : chaque tableau de données a un titre associé (hors tableaux repris des livres)', () => {
    // les tableaux des leçons de religion reprennent les colonnes du livre (titre selon le livre : à vérifier)
    const svelte = files(SRC, (f) => f.endsWith('.svelte')).filter(
      (p) => !p.includes('/religion/'),
    );
    const sans: string[] = [];
    for (const p of svelte)
      for (const m of readFileSync(p, 'utf8').matchAll(/<table\b[^>]*>/g))
        if (!/aria-label(ledby)?=/.test(m[0])) sans.push(`${p.slice(SRC.length)} ${m[0]}`);
    expect(sans).toEqual([]);
  });
});
