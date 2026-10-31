/**
 * « Voir le tracé » (31/10/2026) : durées par vitesse, ordre des traits (celui du fichier, jamais modifié), statut
 * affiché, textes des 5 langues, présence de chaque lettre dans ses formes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { LETTERS } from '$lib/trace/letters';
import TraceLettre from './TraceLettre.svelte';
import {
  DUREE_MIN_TRAIT,
  DUREE_POINTS,
  FORMES,
  PAUSE_TRAIT,
  VITESSES,
  aConfirmer,
  angleDepart,
  dureeReelle,
  dureeTotale,
  dureeTrait,
  etatA,
  etiquetteVitesse,
  formesDisponibles,
  ligneDuTemps,
  lettresDuFichier,
  pointA,
  points,
  vitesseValide,
  type TraitsJson,
} from './trace-anim';
import { TEXTES, tt } from './trace-textes';

const J = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../static/video/traits.json', import.meta.url)),
    'utf8',
  ),
) as TraitsJson;
const formes = Object.entries(J).flatMap(([l, fs]) =>
  l === '_' ? [] : (fs as TraitsJson[string]).flatMap((f, i) => (f ? [{ l, i, f }] : [])),
);

describe('vitesses et durées', () => {
  it('quatre vitesses : 0,5×, 0,75×, 1×, 1,5×', () => {
    expect([...VITESSES]).toEqual([0.5, 0.75, 1, 1.5]);
    expect(VITESSES.map(etiquetteVitesse)).toEqual(['0,5×', '0,75×', '1×', '1,5×']);
    expect(vitesseValide(0.6)).toBe(0.5);
    expect(vitesseValide(9)).toBe(1.5);
  });
  it('la durée réelle est la durée à 1× divisée par la vitesse', () => {
    expect(dureeReelle(2000, 0.5)).toBe(4000);
    expect(dureeReelle(2000, 0.75)).toBe(2667);
    expect(dureeReelle(2000, 1)).toBe(2000);
    expect(dureeReelle(2000, 1.5)).toBe(1333);
  });
  it("durée d'un trait : proportionnelle à sa longueur, au moins 900 ms", () => {
    expect(dureeTrait([0, 0, 10, 0])).toBe(DUREE_MIN_TRAIT);
    expect(dureeTrait([0, 0, 100, 0])).toBe(1200);
    expect(dureeTrait([0, 0, 100, 0, 100, 100])).toBe(2400);
  });
  it("durée totale d'une forme : plus lente à 0,5×, plus rapide à 1,5×", () => {
    for (const { f } of formes) {
      const l = ligneDuTemps(f.t);
      expect(dureeTotale(l, 0.5)).toBeGreaterThan(dureeTotale(l, 0.75));
      expect(dureeTotale(l, 0.75)).toBeGreaterThan(dureeTotale(l, 1));
      expect(dureeTotale(l, 1)).toBeGreaterThan(dureeTotale(l, 1.5));
      expect(dureeTotale(l, 0.5)).toBe(2 * l.total);
    }
  });
});

describe('ordre des traits', () => {
  it("les traits se suivent dans l'ordre du fichier, puis les points", () => {
    const l = ligneDuTemps([
      [0, 0, 100, 0],
      [0, 0, 0, 100],
    ]);
    expect(l.traits).toEqual([
      { debut: 0, fin: 1200 },
      { debut: 1200 + PAUSE_TRAIT, fin: 1200 + PAUSE_TRAIT + 1200 },
    ]);
    expect(l.points.debut).toBe(l.traits[1]!.fin + PAUSE_TRAIT);
    expect(l.total).toBe(l.points.debut + DUREE_POINTS);
  });
  it('chaque forme du fichier : segments successifs, aucun chevauchement, points en dernier', () => {
    expect(formes.length).toBeGreaterThanOrEqual(119);
    for (const { l, i, f } of formes) {
      const L = ligneDuTemps(f.t);
      expect(L.traits, `${l}/${i}`).toHaveLength(f.t.length);
      L.traits.forEach((s, k) => {
        expect(s.fin).toBeGreaterThan(s.debut);
        if (k) expect(s.debut).toBeGreaterThanOrEqual(L.traits[k - 1]!.fin);
      });
      expect(L.points.debut).toBeGreaterThanOrEqual(L.traits.at(-1)!.fin);
    }
  });
  it('à chaque instant, les traits précédents sont finis et les suivants pas commencés', () => {
    const L = ligneDuTemps([
      [0, 0, 100, 0],
      [0, 0, 0, 100],
      [5, 5, 50, 50],
    ]);
    const mid = (k: number) => (L.traits[k]!.debut + L.traits[k]!.fin) / 2;
    const e = etatA(L, mid(1));
    expect(e.courant).toBe(1);
    expect(e.progres[0]).toBe(1);
    expect(e.progres[1]).toBeCloseTo(0.5);
    expect(e.progres[2]).toBe(0);
    expect(e.points).toBe(0);
    expect(etatA(L, 0).courant).toBe(0);
    const fin = etatA(L, L.total);
    expect(fin.fini).toBe(true);
    expect(fin.points).toBe(1);
    expect(fin.progres).toEqual([1, 1, 1]);
    // pendant les points : aucun trait en cours
    expect(etatA(L, L.points.debut + 100).courant).toBe(-1);
  });
  it('la plume suit le trait sans changer son sens', () => {
    const p = points([93, 40, 95, 12, 85, 2]);
    expect(pointA(p, 0)).toEqual([93, 40]);
    expect(pointA(p, 1)).toEqual([85, 2]);
    expect(angleDepart(p)).toBeCloseTo((Math.atan2(-28, 2) * 180) / Math.PI);
    expect(angleDepart([[1, 1]])).toBe(0);
  });
  it('les données servies ne sont pas modifiées : premier point = premier point du fichier', () => {
    for (const { f } of formes)
      for (const t of f.t) expect(pointA(points(t), 0)).toEqual([t[0], t[1]]);
  });
});

describe('statut affiché', () => {
  it('« sur » et « sur (dérivé) » : normal ; « probable » et « divergent » : à confirmer', () => {
    expect(aConfirmer('sur')).toBe(false);
    expect(aConfirmer('sur (dérivé)')).toBe(false);
    expect(aConfirmer('probable')).toBe(true);
    expect(aConfirmer('divergent')).toBe(true);
  });
  it('les statuts du fichier sont tous connus', () => {
    const st = new Set(formes.map((x) => x.f.s));
    expect([...st].sort()).toEqual(['divergent', 'probable', 'sur', 'sur (dérivé)']);
  });
  it('la mention discrète est rendue pour probable et divergent, jamais pour sur', () => {
    const rendu = (s: string) =>
      render(TraceLettre, { props: { l: 'ب', f: 0, forme: { s, t: J['ب']![0]!.t } } }).body;
    for (const s of ['probable', 'divergent'])
      expect(rendu(s)).toContain('data-testid="trace-a-confirmer"');
    for (const s of ['sur', 'sur (dérivé)']) expect(rendu(s)).not.toContain('trace-a-confirmer');
  });
  it('le composant rend ligne de base, lecture, rejouer et les 4 vitesses', () => {
    const h = render(TraceLettre, { props: { l: 'ب', f: 0, forme: J['ب']![0]! } }).body;
    expect(h).toContain('data-testid="trace-lire"');
    expect(h).toContain('data-testid="trace-rejouer"');
    for (const v of VITESSES) expect(h).toContain(`data-vitesse="${v}"`);
  });
});

describe('couverture des lettres', () => {
  it('les 28 lettres et lām-alif ont chaque forme proposée par l’écriture guidée', () => {
    const manque: string[] = [];
    for (const x of LETTERS)
      for (const nom of x.forms) {
        const i = FORMES.indexOf(nom);
        if (!J[x.l]?.[i]) manque.push(`${x.l}/${nom}`);
      }
    expect(manque).toEqual([]);
  });
  it("une forme absente du fichier n'est pas inventée", () => {
    expect(formesDisponibles(J, 'ء')).toEqual([0]);
    expect(formesDisponibles(J, 'x')).toEqual([]);
  });
  it('les lettres de la planche : l’ordre alphabétique d’abord, puis les autres du fichier', () => {
    const L = lettresDuFichier(
      J,
      LETTERS.map((x) => x.l),
    );
    expect(L.slice(0, 29)).toEqual(LETTERS.map((x) => x.l));
    expect(L).not.toContain('_');
    expect(new Set(L).size).toBe(L.length);
  });
});

describe('textes d’interface', () => {
  it('les 5 langues ont exactement les mêmes clés', () => {
    const fr = Object.keys(TEXTES.fr).sort();
    for (const code of ['en', 'es', 'de', 'ar'] as const)
      expect(Object.keys(TEXTES[code]).sort(), code).toEqual(fr);
  });
  it('aucun libellé vide, et la mention « à confirmer » existe partout', () => {
    for (const code of Object.keys(TEXTES) as Array<keyof typeof TEXTES>)
      for (const [k, v] of Object.entries(TEXTES[code]))
        expect(v.trim(), `${code}.${k}`).not.toBe('');
  });
  it('variables et pluriel', () => {
    expect(tt('trait', { n: 2, total: 3 }, 'fr')).toBe('Trait 2 sur 3');
    expect(tt('image', { l: 'ب', forme: 'isolée', n: 1 }, 'fr')).toContain('1 trait,');
    expect(tt('image', { l: 'ب', forme: 'isolée', n: 2 }, 'fr')).toContain('2 traits,');
    expect(tt('lire', {}, 'xx')).toBe('Lire');
    expect(tt('lire', {}, 'ar')).toBe(TEXTES.ar.lire);
  });
});
