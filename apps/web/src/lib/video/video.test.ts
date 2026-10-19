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
import {
  STATUTS_VALIDES,
  contenu,
  forme,
  source,
  superposer,
} from '../../../scripts/video-traits.mjs';
import { frH } from './lecteur';

const c = String.fromCharCode;
const traits = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../static/video/traits.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, Array<{ s: string; t: number[][] } | null>>;

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
    // décision du référent (19/10/2026, 2ᵉ passe) : statuts « sur », « probable », « divergent » tracés ; « insuffisant » non
    expect(STATUTS_VALIDES).toEqual(['sur', 'probable', 'divergent']);
    const j = source();
    const formes = ['isolee', 'debut', 'milieu', 'fin'];
    let n = 0;
    for (const [l, def] of Object.entries(j.lettres))
      formes.forEach((f, i) => {
        const ref = def.formes[f];
        const x = ref ? forme(j, ref, f) : undefined;
        const t = traits[l]![i];
        if (t) n++;
        // le statut reste lisible dans le fichier servi (plus tard : n'afficher que les formes « sur »)
        expect(t?.s, `${l} ${f}`).toBe(
          x && STATUTS_VALIDES.includes(x.statut) ? x.statut : undefined,
        );
      });
    expect(n).toBeGreaterThanOrEqual(100);
    // ـلا après liaison (« insuffisant ») : montré complet, en attendant la vidéo d'un enseignant
    const lamalif = c(0x644, 0x627);
    expect(traits[lamalif]![0]?.s).toBe('sur');
    expect(traits[lamalif]![3]).toBeNull();
    // ع au milieu et à la fin : sens horaire (2ᵉ passe) ; لا : deux traits ; كـ : le corps d'abord, la barre ensuite
    expect(traits[lamalif]![0]!.t).toHaveLength(2);
    const kaf = traits[c(0x643)]![1]!.t;
    expect(kaf).toHaveLength(2);
    expect(kaf[1]!.slice(0, 2)).toEqual([98, 98]);
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
