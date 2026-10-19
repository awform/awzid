/**
 * Vidéos vivantes (19/10/2026) : interrupteur `video_vivante`, arabe sur sa propre ligne, tracés des lettres
 * (seulement les formes validées par le référent, allers-retours superposés exactement).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FONCTIONS,
  etatsAvecDemo,
  fonctionsParDefaut,
  fonctionsPour,
  type ContexteFonction,
} from '@awform/school';
import { VIDEO_NIVEAUX } from '@awform/content/video-niveaux';
import { contenu, superposer, VALIDES } from '../../../scripts/video-traits.mjs';
import { frH } from './lecteur';

const c = String.fromCharCode;
const traits = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../static/video/traits.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, Array<number[][] | null>>;

describe('vidéos vivantes : interrupteur « video_vivante »', () => {
  const ctx: ContexteFonction = {
    roles: ['eleve'],
    age: 'adulte',
    pays: 'FR',
    ecoles: [],
    canal: 'beta',
  };
  it('coupé en production et en bêta, allumé sur la démonstration, réglable par l’administrateur', () => {
    expect(FONCTIONS.video_vivante).toEqual({ defaut: 'off', demo: 'on' });
    expect(fonctionsParDefaut().video_vivante).toBe(false);
    expect(fonctionsParDefaut('beta').video_vivante).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, false), []).video_vivante).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, true), []).video_vivante).toBe(true);
    expect(
      fonctionsPour(ctx, etatsAvecDemo({ video_vivante: 'off' }, true), []).video_vivante,
    ).toBe(false);
    expect(
      fonctionsPour(ctx, {}, [{ cle: 'video_vivante', effet: 'on', canal: 'beta' }]).video_vivante,
    ).toBe(true);
  });
  it('indépendant de la refonte et des animations', () => {
    const v = fonctionsPour(ctx, { design_v4: 'on', animations: 'off' }, []);
    expect(v.video_vivante).toBe(false);
    expect(fonctionsPour(ctx, { video_vivante: 'on', design_v4: 'off' }, []).video_vivante).toBe(
      true,
    );
  });
  it('proposé seulement pour les niveaux dont la garde vidéo est calculée (Adultes 1)', () => {
    expect(VIDEO_NIVEAUX).toEqual(['ad1']);
  });
});

describe('vidéos vivantes : l’arabe sur sa propre ligne', () => {
  const ba = c(0x628);
  const mot = `${c(0x628, 0x64e, 0x64a, 0x652, 0x62a, 0x64c)}`;
  it('une lettre isolée citée reste dans la phrase (police arabe)', () => {
    const h = frH(`la lettre ${ba} se lit b`);
    expect(h).toContain(`<bdi class="lt" lang="ar" dir="rtl">${ba}</bdi>`);
    expect(h).not.toContain('class="ar');
  });
  it('un mot ou une phrase arabe passe sur sa propre ligne, le français autour reste entier', () => {
    const h = frH(`un exemple : ${mot} et la suite`);
    expect(h).toBe(
      `<div class="frh"><span class="fr">un exemple : </span><span class="ar l" lang="ar" dir="rtl">${mot}</span><span class="fr">et la suite</span></div>`,
    );
  });
});

describe('vidéos vivantes : tracés des lettres', () => {
  it('le fichier servi est à jour (scripts/video-traits.mjs)', () => {
    expect(traits).toEqual(JSON.parse(contenu()));
  });
  it('seules les formes validées par le référent sont tracées ; les autres restent complètes', () => {
    const lettres = Object.keys(traits).filter((k) => k !== '_');
    expect(lettres.sort()).toEqual(Object.keys(VALIDES).sort());
    const formes = ['isolee', 'debut', 'milieu', 'fin'];
    // une forme tracée est toujours une forme validée (une forme validée absente du livre, ex. إ au milieu : rien)
    let n = 0;
    for (const l of lettres)
      traits[l]!.forEach((f, i) => {
        if (f) n++;
        if (f) expect(VALIDES[l], `${l} ${formes[i]}`).toContain(formes[i]);
        else if (l !== c(0x625)) expect(VALIDES[l], `${l} ${formes[i]}`).not.toContain(formes[i]);
      });
    expect(n).toBeGreaterThanOrEqual(60);
    // non validées : boucles de و ف ق, م, ي et ى seules, ة, ء, ج ح خ, ع au milieu et à la fin, ه, لا, ك, س ش
    for (const k of [
      0x648, 0x641, 0x642, 0x645, 0x649, 0x629, 0x621, 0x62c, 0x62d, 0x62e, 0x647, 0x643, 0x633,
      0x634,
    ])
      expect(traits[c(k)], k.toString(16)).toBeUndefined();
    expect(traits[c(0x64a)]![0]).toBeNull();
    expect(traits[c(0x64a)]![3]).toBeNull();
    expect(traits[c(0x639)]!.map((f) => !!f)).toEqual([false, true, false, false]);
    expect(traits[c(0x631)]!.map((f) => !!f)).toEqual([true, false, false, false]);
  });
  it('au milieu du mot, la dent fait un aller-retour superposé exactement', () => {
    const p = superposer({
      pts: [
        [1, 0],
        [0.55, 0.01],
        [0.52, 0.4],
        [0.52, 0.05],
        [0, 0],
      ],
      retours: [[2, 3]],
    });
    // le retour est SUR le segment de montée (pts[1] → pts[2]), à sa hauteur
    const [a, b, r] = [p[1]!, p[2]!, p[3]!];
    const cross = (b[0]! - a[0]!) * (r[1]! - a[1]!) - (b[1]! - a[1]!) * (r[0]! - a[0]!);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
    expect(r[1]).toBe(0.05);
  });
});
