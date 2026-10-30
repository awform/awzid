import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Session limitée (enfant, ado) : « choisir son niveau » et « passer au niveau suivant » sont des décisions du parent
 * (le serveur les refuse). Les écrans les masquent au lieu de laisser un bouton qui mène à une erreur.
 */
const lire = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe('parcours par niveau en session limitée', () => {
  it('« choisir mon niveau » absent de l’espace du niveau', () => {
    const s = lire('EspaceNiveau.svelte');
    const i = s.indexOf('data-testid="choisir-niveau"');
    expect(i).toBeGreaterThan(0);
    expect(s.slice(Math.max(0, i - 220), i)).toContain('!fonctionsEtat.restreint');
  });
  it('« niveau suivant » (mode serein) remplacé par un mot pour l’enfant', () => {
    const s = lire('Recap.svelte');
    expect(s).toMatch(/fonctionsEtat\.restreint && r\.mode === 'serein'/);
    expect(s).toContain('niveau-avec-parent');
    // l'appel refusé n'est atteignable que dans l'autre branche
    expect(s.indexOf('niveau-avec-parent')).toBeLessThan(s.indexOf('continuer-quand-meme'));
  });
});
