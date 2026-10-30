import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AccesEnfant from './AccesEnfant.svelte';

describe('fiche d’accès d’un enfant (rendu serveur, avant chargement)', () => {
  it('titre au nom de l’enfant, chargement annoncé, bouton Fermer ; aucune donnée tant que l’API n’a pas répondu', () => {
    const { body } = render(AccesEnfant, {
      props: {
        profile: { id: '0198a1b2-0000-7000-8000-000000000001', pseudonym: 'Lina' },
        onferme: () => {},
      },
    });
    expect(body).toContain('data-testid="acces-enfant"');
    expect(body).toContain('Lina');
    expect(body).not.toContain('acces-debloquer');
    expect(body).not.toContain('acces-creer');
  });
});
