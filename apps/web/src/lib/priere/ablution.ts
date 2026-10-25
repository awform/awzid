/**
 * « La prière de A à Z » — moteur des gestes des ablutions (SVG, vue de FACE, sans aucun trait du visage).
 * Buste habillé, manches relevées jusqu'aux coudes ; les pieds sont montrés en gros plan de profil. Chaque geste est
 * une boucle d'images clés (poignets + angle des mains) ; les bras sont calculés (cinématique inverse, coudes vers
 * l'extérieur). L'eau coule d'un robinet stylisé, sans excès ; la zone lavée s'éclaire d'un halo d'or, sans dessiner
 * aucun trait. Le grand lavage n'est JAMAIS montré par un corps (pictogrammes seulement). Port du moteur de la
 * maquette validée (maquettes/js/ablution.js).
 */
import type { Genre } from './silhouette';
import { reduit } from './mouvement';

const R = Math.PI / 180;
const NS = 'http://www.w3.org/2000/svg';
type Pt = [number, number];
const dir = (a: number): Pt => [Math.sin(a * R), Math.cos(a * R)];
const pt = (p: Pt, a: number, l: number): Pt => {
  const d = dir(a);
  return [p[0] + d[0] * l, p[1] + d[1] * l];
};
const ang = (p: Pt, q: Pt) => Math.atan2(q[0] - p[0], q[1] - p[1]) / R;
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const n = (v: number) => Math.round(v * 10) / 10;
const P = (p: Pt) => `${n(p[0])},${n(p[1])}`;
function mk(par: Element, tag: string, at: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const k in at) {
    const v = at[k]!;
    if (typeof v === 'string' && v.startsWith('var(')) e.style.setProperty(k, v);
    else e.setAttribute(k, String(v));
  }
  par.appendChild(e);
  return e;
}
function capsule(p0: Pt, p1: Pt, w0: number, w1: number): string {
  const a = ang(p0, p1);
  const nn = dir(a + 90);
  const r0 = w0 / 2;
  const r1 = w1 / 2;
  const A1: Pt = [p0[0] + nn[0] * r0, p0[1] + nn[1] * r0];
  const B1: Pt = [p1[0] + nn[0] * r1, p1[1] + nn[1] * r1];
  const B2: Pt = [p1[0] - nn[0] * r1, p1[1] - nn[1] * r1];
  const A2: Pt = [p0[0] - nn[0] * r0, p0[1] - nn[1] * r0];
  return `M${P(A1)}L${P(B1)}A${n(r1)},${n(r1)} 0 0 1 ${P(B2)}L${P(A2)}A${n(r0)},${n(r0)} 0 0 1 ${P(A1)}Z`;
}
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const SD: Pt = [88, 130];
const SG: Pt = [152, 130];
const LA = 44;
const LB = 40;
const LM = 17;
type Main = [number, number, number];
const REPOS = { D: [92, 222, 4] as Main, G: [148, 222, -4] as Main };
interface Cle {
  D: Main;
  G: Main;
  eau: Pt | null;
  z: string | null;
  d: number;
}
const k = (D: Main, G: Main, eau: Pt | null, z: string | null, d = 650): Cle => ({
  D,
  G,
  eau,
  z,
  d,
});
export type NomGeste =
  | 'intention'
  | 'mains'
  | 'bouche'
  | 'nez'
  | 'visage'
  | 'bras'
  | 'tete'
  | 'oreilles'
  | 'pieds'
  | 'invocation';
const GESTES: Record<NomGeste, { pied?: boolean; cycle: Cle[] }> = {
  intention: {
    cycle: [
      k(REPOS.D, REPOS.G, null, 'coeur', 1400),
      k([94, 220, 4], [146, 220, -4], null, 'coeur', 1400),
    ],
  },
  mains: {
    cycle: [
      k([110, 170, 118], [130, 170, -118], [120, 162], null, 520),
      k([116, 164, 112], [124, 176, -124], [120, 162], null, 520),
      k([110, 172, 122], [130, 166, -114], [120, 162], null, 520),
    ],
  },
  bouche: {
    cycle: [
      k([122, 164, 150], REPOS.G, [124, 156], null, 700),
      k([112, 118, 168], REPOS.G, null, 'bouche', 800),
      k([112, 120, 166], REPOS.G, null, 'bouche', 500),
    ],
  },
  nez: {
    cycle: [
      k([122, 164, 150], REPOS.G, [124, 156], null, 700),
      k([113, 110, 172], REPOS.G, null, 'nez', 800),
      k([98, 168, 120], [127, 110, -172], null, 'nez', 800),
    ],
  },
  visage: {
    cycle: [
      k([122, 166, 150], [118, 166, -150], [120, 158], null, 650),
      k([104, 92, 176], [136, 92, -176], null, 'visage', 600),
      k([104, 122, 178], [136, 122, -178], null, 'visage', 700),
    ],
  },
  bras: {
    cycle: [
      k([146, 158, 92], [156, 142, -112], [150, 150], 'brasD', 700),
      k([146, 158, 92], [102, 150, -100], null, 'brasD', 900),
      k([146, 158, 92], [150, 146, -110], null, 'brasD', 600),
    ],
  },
  tete: {
    cycle: [
      k([104, 72, 160], [136, 72, -160], null, 'tete', 700),
      k([108, 52, 150], [132, 52, -150], null, 'tete', 800),
      k([104, 72, 160], [136, 72, -160], null, 'tete', 800),
    ],
  },
  oreilles: {
    cycle: [
      k([88, 100, 165], [152, 100, -165], null, 'oreilles', 700),
      k([90, 104, 160], [150, 104, -160], null, 'oreilles', 600),
    ],
  },
  pieds: {
    pied: true,
    cycle: [
      k([186, 172, -100], REPOS.G, [176, 176], null, 700),
      k([140, 170, -95], REPOS.G, [160, 178], null, 900),
      k([186, 172, -100], REPOS.G, [176, 176], null, 500),
    ],
  },
  invocation: {
    cycle: [
      k(REPOS.D, REPOS.G, null, 'etoile', 1500),
      k([93, 221, 4], [147, 221, -4], null, 'etoile', 1500),
    ],
  },
};
export const GESTES_CONNUS = Object.keys(GESTES) as NomGeste[];

function ik(S: Pt, W: Pt): Pt {
  const d = Math.min(Math.max(dist(S, W), Math.abs(LA - LB) + 0.01), LA + LB - 0.01);
  const phi = ang(S, W);
  const al = Math.acos((LA * LA + d * d - LB * LB) / (2 * LA * d)) / R;
  const e1 = pt(S, phi + al, LA);
  const e2 = pt(S, phi - al, LA);
  return Math.abs(e1[0] - 120) > Math.abs(e2[0] - 120) ? e1 : e2;
}

interface Mesure {
  D: Main;
  G: Main;
  eau: Pt | null;
  z: string | null;
}
interface Bras {
  manche: SVGElement;
  revers: SVGElement;
  avant: SVGElement;
  main: SVGElement;
}

export interface OptsAblution {
  genre?: Genre;
  geste?: NomGeste;
  /** boucle terminée : nombre de cycles faits */
  surCycle?: (cycles: number) => void;
  statique?: boolean;
}

export class Ablution {
  svg: SVGSVGElement;
  genre: Genre;
  private surCycle: ((c: number) => void) | null;
  private p!: Record<string, SVGElement>;
  private bD!: Bras;
  private bG!: Bras;
  private def = GESTES.intention;
  private i = 0;
  private cycles = 0;
  private raf = 0;
  private etatCourant: Mesure | null = null;
  private statique: boolean;

  constructor(svg: SVGSVGElement, o: OptsAblution = {}) {
    this.svg = svg;
    this.genre = o.genre ?? 'homme';
    this.surCycle = o.surCycle ?? null;
    this.statique = !!o.statique;
    svg.setAttribute('viewBox', '0 0 240 230');
    svg.setAttribute('role', 'img');
    this.construire();
    this.geste(o.geste ?? 'intention');
  }
  private cle(i: number): Cle {
    const c = this.def.cycle;
    return c[((i % c.length) + c.length) % c.length]!;
  }
  private construire() {
    const s = this.svg;
    while (s.firstChild) s.removeChild(s.firstChild);
    const ros = mk(s, 'g', { class: 'rosace-fond', transform: 'translate(120 112)' });
    const r = {
      x: -78,
      y: -78,
      width: 156,
      height: 156,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 0.8,
    };
    mk(ros, 'rect', r);
    mk(ros, 'rect', { ...r, transform: 'rotate(45)' });
    mk(ros, 'circle', { r: 54, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.6 });
    const p = (this.p = {} as Record<string, SVGElement>);
    const rb = (p.robinet = mk(s, 'g', { transform: 'translate(120 0)' }));
    mk(rb, 'path', {
      d: 'M-34 14H-6a8 8 0 0 1 8 8v6',
      fill: 'none',
      stroke: 'var(--or)',
      'stroke-width': 4.5,
      'stroke-linecap': 'round',
    });
    mk(rb, 'rect', { x: -40, y: 6, width: 8, height: 16, rx: 3, fill: 'var(--or)' });
    mk(rb, 'rect', { x: -22, y: 4, width: 10, height: 4, rx: 2, fill: 'var(--or)' });
    p.eau = mk(s, 'path', {
      class: 'filet-eau',
      fill: 'none',
      stroke: 'var(--eau)',
      'stroke-width': 3.6,
      'stroke-linecap': 'round',
      'stroke-dasharray': '7 5',
      opacity: 0.85,
    });
    p.eau2 = mk(s, 'path', {
      class: 'filet-eau lent',
      fill: 'none',
      stroke: 'var(--eau-clair)',
      'stroke-width': 1.4,
      'stroke-linecap': 'round',
      'stroke-dasharray': '3 9',
      opacity: 0.9,
    });
    p.zone = mk(s, 'g', { class: 'zone-lavee' });
    const c = (p.corps = mk(s, 'g', {}));
    p.brasDhaut = mk(c, 'path', { class: 'sil-2' });
    p.brasGhaut = mk(c, 'path', { class: 'sil-2' });
    p.buste = mk(c, 'path', {
      class: 'sil-1',
      d: 'M70,236L74,150Q76,124 100,117L140,117Q164,124 166,150L170,236Z',
    });
    p.col = mk(c, 'path', {
      class: 't-or',
      fill: 'none',
      'stroke-width': 1.6,
      d: 'M104,117Q120,140 136,117',
    });
    p.cheveux = mk(c, 'path', {
      class: 'sil-2',
      d: 'M97,78A23,26 0 1 1 143,78L143,86A23,10 0 0 1 97,86Z M111,46A9,8 0 1 1 129,46A9,8 0 1 1 111,46Z',
    });
    p.cou = mk(c, 'path', { class: 'sil-3', d: capsule([120, 92], [120, 120], 17, 19) });
    p.oreilleD = mk(c, 'ellipse', { class: 'sil-3', cx: 99.5, cy: 79, rx: 4.2, ry: 7 });
    p.oreilleG = mk(c, 'ellipse', { class: 'sil-3', cx: 140.5, cy: 79, rx: 4.2, ry: 7 });
    p.tete = mk(c, 'ellipse', { class: 'sil-3', cx: 120, cy: 75, rx: 20, ry: 24 });
    p.calotte = mk(c, 'path', {
      class: 'sil-calotte',
      d: 'M100.4,66A20,24 0 0 1 139.6,66Q120,58 100.4,66Z',
    });
    p.coeur = mk(c, 'g', { transform: 'translate(120 168)', opacity: 0 });
    mk(p.coeur, 'path', {
      d: 'M0 9s-9-5.6-9-12a5.2 5.2 0 0 1 9-3.5A5.2 5.2 0 0 1 9-3c0 6.4-9 12-9 12z',
      fill: 'var(--or)',
    });
    const bras = (): Bras => ({
      manche: mk(c, 'path', {
        class: 'sil-bras t-trait',
        'stroke-width': 1.6,
        'paint-order': 'stroke',
      }),
      revers: mk(c, 'path', {
        class: 't-or',
        fill: 'none',
        'stroke-width': 2.2,
        'stroke-linecap': 'round',
      }),
      avant: mk(c, 'path', {
        class: 'sil-3 t-trait',
        'stroke-width': 1.6,
        'paint-order': 'stroke',
      }),
      main: mk(c, 'path', { class: 'sil-3 t-trait', 'stroke-width': 1.4, 'paint-order': 'stroke' }),
    });
    this.bG = bras();
    this.bD = bras();
    const pg = (p.gPied = mk(s, 'g', { opacity: 0 }));
    mk(pg, 'path', { class: 'sil-1', d: capsule([112, 70], [118, 130], 30, 28) });
    mk(pg, 'path', { class: 't-or', fill: 'none', 'stroke-width': 2.2, d: 'M102,128L132,126' });
    mk(pg, 'path', { class: 'sil-3', d: capsule([118, 126], [124, 186], 24, 20) });
    mk(pg, 'path', { class: 'sil-3', d: capsule([120, 194], [186, 200], 22, 13) });
    mk(pg, 'line', {
      x1: 60,
      x2: 220,
      y1: 208.5,
      y2: 208.5,
      stroke: 'var(--scene-sol)',
      'stroke-width': 1.2,
    });
    p.avPied = mk(pg, 'path', {
      class: 'sil-bras t-trait',
      'stroke-width': 1.6,
      'paint-order': 'stroke',
    });
    p.mainPied = mk(pg, 'path', {
      class: 'sil-3 t-trait',
      'stroke-width': 1.6,
      'paint-order': 'stroke',
    });
    p.gouttes = mk(s, 'g', { class: 'gouttes' });
    for (let i = 0; i < 3; i++)
      mk(p.gouttes, 'path', {
        d: 'M0,-3.2C1.8,-0.6 2.4,0.8 2.4,1.6A2.4,2.4 0 0 1 -2.4,1.6C-2.4,0.8 -1.8,-0.6 0,-3.2Z',
        fill: 'var(--eau)',
        class: `goutte g${i}`,
      });
    this.appliquerGenre();
  }
  private appliquerGenre() {
    const f = this.genre === 'femme';
    this.p.calotte!.style.display = f ? 'none' : '';
    this.p.cheveux!.style.display = f ? '' : 'none';
  }
  changerGenre(g: Genre) {
    this.genre = g;
    this.appliquerGenre();
    this.rendre(this.etatCourant ?? this.mesureDe(this.cle(0)));
  }
  private mesureDe(c: Cle): Mesure {
    return { D: c.D, G: c.G, eau: c.eau, z: c.z };
  }
  /** Passe à un geste : boucle d'images clés ; figé en mouvement réduit. */
  geste(nom: NomGeste) {
    this.def = GESTES[nom] ?? GESTES.intention;
    this.i = 0;
    this.cycles = 0;
    const pied = !!this.def.pied;
    this.p.gPied!.setAttribute('opacity', pied ? '1' : '0');
    this.p.corps!.setAttribute('opacity', pied ? '0' : '1');
    cancelAnimationFrame(this.raf);
    this.rendre(this.mesureDe(this.cle(this.def.cycle.length > 1 ? 1 : 0)));
    if (this.statique || reduit()) {
      this.svg.classList.add('fige');
      return;
    }
    this.svg.classList.remove('fige');
    let t0 = performance.now();
    const boucle = (ts: number) => {
      let a = this.cle(this.i);
      let b = this.cle(this.i + 1);
      let t = (ts - t0) / b.d;
      if (t >= 1) {
        this.i++;
        t0 = ts;
        t = 0;
        if (this.i % this.def.cycle.length === 0) {
          this.cycles++;
          this.surCycle?.(this.cycles);
        }
        a = this.cle(this.i);
        b = this.cle(this.i + 1);
      }
      const e = ease(t);
      const m3 = (x: Main, y: Main): Main => [
        mix(x[0], y[0], e),
        mix(x[1], y[1], e),
        mix(x[2], y[2], e),
      ];
      this.rendre({
        D: m3(a.D, b.D),
        G: m3(a.G, b.G),
        eau: t < 0.5 ? a.eau : b.eau,
        z: a.z ?? b.z,
      });
      this.raf = requestAnimationFrame(boucle);
    };
    this.raf = requestAnimationFrame(boucle);
  }
  detruire() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  private rendre(m: Mesure) {
    this.etatCourant = m;
    const p = this.p;
    const pied = !!this.def.pied;
    const bras = (b: Bras, S: Pt, W: Pt, a: number, haut: SVGElement): Pt => {
      const E = ik(S, W);
      const M = pt(W, a, LM);
      const cuff: Pt = [mix(S[0], E[0], 0.86), mix(S[1], E[1], 0.86)];
      haut.setAttribute('d', capsule(S, E, 19, 15));
      b.manche.setAttribute('d', capsule(S, cuff, 19, 15.5));
      const av = dir(ang(S, E) + 90);
      b.revers.setAttribute(
        'd',
        `M${P([cuff[0] + av[0] * 8, cuff[1] + av[1] * 8])}L${P([cuff[0] - av[0] * 8, cuff[1] - av[1] * 8])}`,
      );
      b.avant.setAttribute('d', capsule(cuff, W, 13.5, 11));
      b.main.setAttribute('d', capsule(W, M, 12.5, 10.5));
      return M;
    };
    let MD: Pt;
    if (pied) {
      const W: Pt = [m.D[0], m.D[1]];
      p.avPied!.setAttribute('d', capsule([W[0] + 30, W[1] - 46], W, 15, 12.5));
      MD = pt(W, m.D[2], LM);
      p.mainPied!.setAttribute('d', capsule(W, MD, 13, 11));
    } else {
      MD = bras(this.bD, SD, [m.D[0], m.D[1]], m.D[2], p.brasDhaut!);
      bras(this.bG, SG, [m.G[0], m.G[1]], m.G[2], p.brasGhaut!);
    }
    if (m.eau) {
      const [x0, y0] = [122, 30];
      const [x1, y1] = m.eau;
      const d = `M${x0},${y0}C${x0},${n(y0 + (y1 - y0) * 0.5)} ${n(x1)},${n(y1 - (y1 - y0) * 0.35)} ${n(x1)},${n(y1)}`;
      p.eau!.setAttribute('d', d);
      p.eau2!.setAttribute('d', d);
      p.eau!.style.display = p.eau2!.style.display = '';
    } else p.eau!.style.display = p.eau2!.style.display = 'none';
    const src: Pt = m.eau ?? MD;
    p.gouttes!.setAttribute('transform', `translate(${P([src[0], src[1] + 4])})`);
    p.gouttes!.style.display = (m.eau || m.z) && m.z !== 'coeur' && m.z !== 'etoile' ? '' : 'none';
    const z = p.zone!;
    while (z.firstChild) z.removeChild(z.firstChild);
    const ZONES: Record<string, [number, number, number, number]> = {
      bouche: [120, 89, 9, 6],
      nez: [120, 80, 6, 7],
      visage: [120, 75, 23, 27],
      tete: [120, 56, 22, 12],
    };
    if (m.z === 'oreilles') {
      mk(z, 'ellipse', {
        cx: 99.5,
        cy: 79,
        rx: 8,
        ry: 11,
        fill: 'none',
        stroke: 'var(--or)',
        'stroke-width': 2,
        opacity: 0.9,
      });
      mk(z, 'ellipse', {
        cx: 140.5,
        cy: 79,
        rx: 8,
        ry: 11,
        fill: 'none',
        stroke: 'var(--or)',
        'stroke-width': 2,
        opacity: 0.9,
      });
    } else if (m.z === 'brasD') {
      mk(z, 'path', {
        d: capsule([96, 160], [148, 158], 26, 22),
        fill: 'var(--or)',
        opacity: 0.22,
      });
    } else if (m.z === 'etoile') {
      const g = mk(z, 'g', { transform: 'translate(120 30)', opacity: 0.9 });
      const r7 = { x: -7, y: -7, width: 14, height: 14, fill: 'var(--or)' };
      mk(g, 'rect', r7);
      mk(g, 'rect', { ...r7, transform: 'rotate(45)' });
    } else if (m.z && ZONES[m.z]) {
      const q = ZONES[m.z]!;
      mk(z, 'ellipse', {
        cx: q[0],
        cy: q[1],
        rx: q[2] + 3,
        ry: q[3] + 3,
        fill: 'none',
        stroke: 'var(--or)',
        'stroke-width': 2.2,
        opacity: 0.95,
        'stroke-dasharray': m.z === 'visage' ? 'none' : '3 3',
      });
    }
    p.coeur!.setAttribute('opacity', m.z === 'coeur' ? '1' : '0');
    if (m.z && m.z !== 'brasD' && m.z !== 'coeur') this.svg.appendChild(z);
    else this.svg.insertBefore(z, p.corps!);
  }
}
