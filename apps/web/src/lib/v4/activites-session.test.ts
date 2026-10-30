import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `$app/paths` n'existe que dans SvelteKit : la résolution d'un chemin y est l'identité (ou paramètres substitués)
vi.mock('$app/paths', () => ({
  resolve: (chemin: string, params?: Record<string, string>) =>
    chemin.replace(/\[\[?(\w+)\]?\]/g, (_m, k: string) => params?.[k] ?? ''),
}));

import { fonctionsEtat } from '$lib/fonctions.svelte';
import ActivitesV4 from './ActivitesV4.svelte';

const liens = (html: string) => [...html.matchAll(/data-plus="([^"]+)"/g)].map((m) => m[1]);

afterEach(() => {
  fonctionsEtat.restreint = false;
  fonctionsEtat.ado = false;
});

describe('« Mes activités » (design v4) en session limitée', () => {
  it('hors session limitée : suivi, ma classe et compte présents', () => {
    const l = liens(render(ActivitesV4).body);
    for (const h of ['/suivi', '/ma-classe', '/compte', '/lectures', '/ecriture', '/revisions'])
      expect(l, h).toContain(h);
  });
  it('ado en session limitée : Plus réduit — apprentissage seulement, ni suivi, ni ma classe, ni compte', () => {
    fonctionsEtat.restreint = true;
    fonctionsEtat.ado = true;
    const l = liens(render(ActivitesV4).body);
    for (const h of [
      '/lectures',
      '/sciences',
      '/ecriture',
      '/revisions',
      '/hors-ligne',
      '/madjaliss',
    ])
      expect(l, h).toContain(h);
    for (const h of ['/suivi', '/suivi/rapport', '/ma-classe', '/compte'])
      expect(l, h).not.toContain(h);
  });
  it('enfant en session limitée : la page est fermée, et si elle était rendue aucun lien interdit ne s’afficherait', () => {
    fonctionsEtat.restreint = true;
    const l = liens(render(ActivitesV4).body);
    for (const h of ['/suivi', '/ma-classe', '/compte']) expect(l, h).not.toContain(h);
  });
});
