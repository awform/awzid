import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Onglet actif au changement de thème (26/10/2026, e2e lot29:42) : un fondu PERMANENT sur le fond de l'onglet faisait
 * glisser ce fond du clair au sombre pendant 0,12 s alors que le texte (vert de la charte) passait tout de suite à sa
 * couleur sombre : un instant de vert sur fond clair, sous 4,5:1, que l'outil d'accessibilité mesurait par intermittence.
 * Le fondu est donc réservé au survol ; les couleurs de la charte (vert / ivoire / or) ne changent pas.
 */
describe('onglets de navigation : pas de fondu au changement de thème', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../routes/+layout.svelte', import.meta.url)),
    'utf8',
  );

  it('la règle de base des onglets n’a aucune transition', () => {
    const base = /\n {2}\.tabs a \{([^}]*)\}/.exec(css);
    expect(base, 'règle « .tabs a » introuvable').not.toBeNull();
    expect(base![1]).not.toMatch(/transition/);
  });

  it('le fondu n’existe qu’au survol', () => {
    const survol = /\n {2}\.tabs a:hover \{([^}]*)\}/.exec(css);
    expect(survol, 'règle « .tabs a:hover » introuvable').not.toBeNull();
    expect(survol![1]).toMatch(/transition: background/);
  });

  it('le texte de l’onglet actif reste en couleur primaire sur son fond doux (paire contrôlée par la charte)', () => {
    const actif = /\n {2}\.tabs a\.active \{([^}]*)\}/.exec(css);
    expect(actif![1]).toMatch(/background: var\(--primary-soft\)/);
    expect(actif![1]).toMatch(/color: var\(--primary\)/);
  });
});
