/**
 * Lot 26 (angle mort trouvé pendant les captures) : dans un composant Svelte, `pattern="[0-9]{4}"` est lu
 * comme une EXPRESSION `{4}` → l'attribut devient « [0-9]4 » et le navigateur refuse tout code à 4 chiffres
 * (formulaire du code parent, second facteur). Toute accolade d'un motif doit être écrite `pattern={'…'}`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.svelte') ? [p] : [];
  });

describe('attributs pattern des formulaires', () => {
  it('aucun pattern="…{n}…" (accolades interprétées par Svelte)', () => {
    const bad: string[] = [];
    for (const f of walk(SRC))
      for (const m of readFileSync(f, 'utf8').matchAll(/pattern="[^"]*\{[^"]*"/g))
        bad.push(`${f.slice(SRC.length)} : ${m[0]}`);
    expect(bad).toEqual([]);
  });
});
