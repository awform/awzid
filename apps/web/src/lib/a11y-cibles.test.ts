/**
 * Audit A11Y-1 : cibles tactiles d'au moins 44 px (règle du projet : 44 à 48 px pour les enfants). Toute hauteur
 * minimale déclarée dans un composant respecte ce plancher.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (n.endsWith('.svelte') || n === 'app.css') out.push(p);
  }
  return out;
};

describe('audit A11Y-1 — cibles tactiles', () => {
  it('aucune hauteur minimale sous 44 px', () => {
    const bad: string[] = [];
    for (const f of files(SRC))
      for (const m of readFileSync(f, 'utf8').matchAll(/min-height:\s*(\d+)px/g))
        if (Number(m[1]) < 44) bad.push(`${f.slice(SRC.length)} : ${m[0]}`);
    expect(bad).toEqual([]);
  });
  it('la case de l’auto-évaluation est dans une ligne cliquable de 48 px', () => {
    const s = readFileSync(join(SRC, 'routes/lecons/[id]/+page.svelte'), 'utf8');
    expect(s).toMatch(/\.check label \{[^}]*min-height: 48px/);
  });
});
