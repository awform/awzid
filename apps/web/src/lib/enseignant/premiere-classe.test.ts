import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import CreerMaClasse from '../../routes/enseignant/CreerMaClasse.svelte';
import { doitCreerMaClasse } from './premiere-classe';

const base = { charge: true, enseignant: true, bloque: false, classes: 0 };

describe('enseignant sans classe : « Créer ma classe »', () => {
  it('affiché seulement pour un enseignant vérifié, page chargée, sans aucune classe', () => {
    expect(doitCreerMaClasse(base)).toBe(true);
    expect(doitCreerMaClasse({ ...base, classes: 1 })).toBe(false);
    expect(doitCreerMaClasse({ ...base, bloque: true })).toBe(false); // second facteur pas encore vérifié
    expect(doitCreerMaClasse({ ...base, enseignant: false })).toBe(false);
    expect(doitCreerMaClasse({ ...base, charge: false })).toBe(false);
  });
  it('un seul champ : le nom de la classe', () => {
    const { body } = render(CreerMaClasse, { props: { oncree: () => {} } });
    expect(body.match(/<input/g)).toHaveLength(1);
    expect(body).toContain('id="nom-classe"');
    expect(body).toContain('data-testid="creer-classe-envoi"');
  });
});
