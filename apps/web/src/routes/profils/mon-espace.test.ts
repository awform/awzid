import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MonEspace from './MonEspace.svelte';

describe('« Mon espace » du parent', () => {
  it('un bouton d’abord ; le formulaire (année de naissance, prénom facultatif) ne s’ouvre qu’au toucher', () => {
    const { body } = render(MonEspace, { props: { oncree: () => {} } });
    expect(body).toContain('data-testid="moi-ouvrir"');
    expect(body).not.toContain('moi-form');
  });
});
