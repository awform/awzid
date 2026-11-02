/**
 * « Tafsīr du niveau » côté application : la table de correspondance est cohérente avec les juzʾ du Muṣḥaf (une sourate est au niveau du
 * juzʾ où elle commence, N4 = juzʾ 27-25 … N12 = juzʾ 3-1), la progression (sourates lues) est gardée PAR PROFIL, et l'entrée de
 * l'espace du niveau ne coûte rien à la coquille de l'élève.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { juzOf } from '@awform/hifz';
import { NIVEAUX_TAFSIR, souratesDuNiveau } from '@awform/content/tafsir-niveaux';

const kv = new Map<string, unknown>();
vi.mock('$lib/idb', () => ({
  kvGet: async (k: string) => kv.get(k),
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));

import { basculerLue, cleLues, lireLues } from './lues';

describe('table et juzʾ du Muṣḥaf', () => {
  it('N4 à N12 : chaque sourate COMMENCE dans un des trois juzʾ de son niveau (N4 = 27-25 … N12 = 3-1), al-Fātiḥa en N1', () => {
    for (let n = 4; n <= 12; n++) {
      const juz = [30 - 3 * (n - 3), 30 - 3 * (n - 3) - 1, 30 - 3 * (n - 3) - 2];
      for (const s of souratesDuNiveau(n))
        expect(juz, `N${n} sourate ${s} (juzʾ ${juzOf(s, 1)})`).toContain(juzOf(s, 1));
    }
    expect(NIVEAUX_TAFSIR[0]!.sourates[0]).toBe(1);
  });
});

describe('progression (sourates lues)', () => {
  beforeEach(() => kv.clear());
  it('marquer, démarquer, tri ; gardée par profil', async () => {
    expect(await lireLues('p1')).toEqual([]);
    expect(await basculerLue('p1', 112)).toEqual([112]);
    expect(await basculerLue('p1', 93)).toEqual([93, 112]);
    expect(await basculerLue('p1', 112)).toEqual([93]);
    expect(await lireLues('p2')).toEqual([]);
    expect(kv.has(cleLues('p1'))).toBe(true);
    expect(cleLues('p1')).toMatch(/^tf:/); // effacée à la déconnexion (PERSONAL_KV de session.ts)
  });
  it('une valeur gardée abîmée est ignorée', async () => {
    kv.set(cleLues('p1'), [1, 'x', 500, 7.5, 114]);
    expect(await lireLues('p1')).toEqual([1, 114]);
    kv.set(cleLues('p1'), 'pas une liste');
    expect(await lireLues('p1')).toEqual([]);
  });
});

describe('coquille de l’élève', () => {
  it('l’espace du niveau n’ajoute qu’un lien, derrière l’interrupteur (aucun module du tafsīr dans la coquille)', () => {
    const src = readFileSync(
      join(fileURLToPath(new URL('../parcours/', import.meta.url)), 'EspaceNiveau.svelte'),
      'utf8',
    );
    expect(src).toContain("fn('tafsir_sens')");
    expect(src).toContain("resolve('/coran/tafsir')");
    expect(/^\s*import .*\$lib\/tafsir/m.test(src)).toBe(false);
  });
});
