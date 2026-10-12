import { describe, expect, it } from 'vitest';
import {
  alignRtl,
  clampVue,
  clampZoom,
  isDoubleTap,
  tapZone,
  toggleZoom,
  zoomAt,
  zoomRtl,
  ZOOM_CONFORT,
  ZOOM_MAX,
} from './zoom';

describe('zoom de la page', () => {
  it('borne le zoom entre 1× et 3×', () => {
    expect(clampZoom(0.4)).toBe(1);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(1.234)).toBe(1.23);
  });
  it('garde la page dans son cadre (aucun bord vide)', () => {
    expect(clampVue({ z: 2, x: 50, y: 10 }, 300, 500)).toEqual({ z: 2, x: 0, y: 0 });
    expect(clampVue({ z: 2, x: -900, y: -900 }, 300, 500)).toEqual({ z: 2, x: -300, y: -500 });
    expect(clampVue({ z: 1, x: -20, y: -20 }, 300, 500)).toEqual({ z: 1, x: 0, y: 0 });
  });
  it('zoome autour du point touché (le point reste sous le doigt)', () => {
    const v = zoomAt({ z: 1, x: 0, y: 0 }, 2, 150, 250, 300, 500);
    expect(v).toEqual({ z: 2, x: -150, y: -250 });
    // le point (150, 250) de l'écran montre toujours le même point de la page
    expect((150 - v.x) / v.z).toBe(150);
  });
  it('double-toucher : page entière ↔ zoom confortable', () => {
    const a = toggleZoom({ z: 1, x: 0, y: 0 }, 0, 0, 300, 500);
    expect(a.z).toBe(ZOOM_CONFORT);
    expect(toggleZoom(a, 10, 10, 300, 500)).toEqual({ z: 1, x: 0, y: 0 });
  });
  it('double-toucher sur une ligne : zoom calé à DROITE (début de la ligne), ligne touchée au centre', () => {
    // toucher à gauche de la page (x = 20) : la vue montre quand même le bord droit
    const a = toggleZoom({ z: 1, x: 0, y: 0 }, 20, 300, 300, 500);
    expect(a.x).toBe(300 - 300 * ZOOM_CONFORT);
    // la ligne touchée (y = 300 de la page) est au milieu du cadre (250)
    expect(300 * a.z + a.y).toBeCloseTo(250, 0);
    // milieu de la partie VISIBLE donné par le lecteur
    const b = toggleZoom({ z: 1, x: 0, y: 0 }, 20, 200, 300, 500, 150);
    expect(200 * b.z + b.y).toBeCloseTo(150, 0);
    // ligne du haut : jamais de bord vide (vue bornée)
    expect(toggleZoom({ z: 1, x: 0, y: 0 }, 0, 10, 300, 500).y).toBe(0);
  });
  it('zoom (curseur, clavier, fin du pincement) calé sur le début de la ligne (à droite)', () => {
    const v = zoomRtl({ z: 1, x: 0, y: 0 }, 2, 250, 300, 500);
    expect(v).toEqual({ z: 2, x: -300, y: -250 });
    expect(alignRtl({ z: 2, x: -40, y: -100 }, 300, 500)).toEqual({ z: 2, x: -300, y: -100 });
    expect(alignRtl({ z: 1, x: 0, y: 0 }, 300, 500)).toEqual({ z: 1, x: 0, y: 0 });
  });
  it('toucher simple : bords pour tourner (gauche = suivante), milieu pour les commandes', () => {
    expect(tapZone(10, 400, false)).toBe('suivante');
    expect(tapZone(390, 400, false)).toBe('precedente');
    expect(tapZone(200, 400, false)).toBe('commandes');
    // zoomée : jamais de changement de page
    expect(tapZone(10, 400, true)).toBe('commandes');
  });
  it('double-toucher reconnu seulement s’il est rapide et au même endroit', () => {
    const a = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(a, { t: 1200, x: 110, y: 105 })).toBe(true);
    expect(isDoubleTap(a, { t: 1500, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(a, { t: 1100, x: 200, y: 100 })).toBe(false);
    expect(isDoubleTap(null, a)).toBe(false);
  });
});
