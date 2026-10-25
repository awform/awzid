/**
 * « La prière de A à Z » — moteur des silhouettes de la prière (SVG, SANS VISAGE).
 * Le corps est un squelette articulé vu de profil (face à la qibla, à droite). Chaque position est un jeu d'angles ;
 * une transition interpole les angles (et non les dessins) : le mouvement reste naturel et sans déformation.
 * Conventions : angle absolu en degrés, 0 = vers le bas, 90 = vers l'avant (qibla), 180 = vers le haut.
 * Formes pleines, mains et pieds en capsules, visage = ovale clair SANS AUCUN TRAIT (il sert seulement à montrer de
 * quel côté la tête est tournée, pour la salutation). Port du moteur de la maquette validée (maquettes/js/silhouette.js).
 */
import { reduit } from './mouvement';

const R = Math.PI / 180;
type Pt = [number, number];
type Quad = [number, number, number, number];
const dir = (a: number): Pt => [Math.sin(a * R), Math.cos(a * R)];
const pt = (p: Pt, a: number, l: number): Pt => {
  const d = dir(a);
  return [p[0] + d[0] * l, p[1] + d[1] * l];
};
const ang = (p: Pt, q: Pt) => Math.atan2(q[0] - p[0], q[1] - p[1]) / R;
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixP = (p: Pt, q: Pt, t: number): Pt => [mix(p[0], q[0], t), mix(p[1], q[1], t)];
const n = (v: number) => Math.round(v * 10) / 10;
const P = (p: Pt) => `${n(p[0])},${n(p[1])}`;
const ligne = (pts: Pt[]) => `M${pts.map(P).join('L')}`;

// proportions (unités du viewBox 240 × 230 ; une silhouette debout mesure ~172)
const L = {
  torse: 46,
  cou: 7,
  tete: 11.2,
  bras: 29,
  avbras: 25,
  main: 10,
  cuisse: 42,
  tibia: 41,
  pied: 17,
  talon: 4,
};
const EP = { tibia: 11.5 };
const SOL = 205;
const X0 = 86; // ligne du sol ; abscisse des orteils (fixes pendant toute la prière)

interface Bras {
  a?: [number, number];
  m?: number;
  cible?: string;
  rac?: number;
  coude?: 'avant' | 'arriere' | 'haut';
}
interface Pose {
  tronc: number;
  tete: number;
  jP: Quad;
  jL: Quad;
  bP: Bras;
  bL: Bras;
  regard: number;
  index: number;
  assis: number;
}
interface Etat {
  tronc: number;
  tete: number;
  jP: Quad;
  jL: Quad;
  bP: Quad;
  bL: Quad;
  regard: number;
  index: number;
  assis: number;
}

export type NomPose =
  'debout' | 'takbir' | 'ruku' | 'releve' | 'sujud' | 'assise' | 'tashahhud' | 'salam';
export type Genre = 'homme' | 'femme';

const BASE: Pose = {
  tronc: 180,
  tete: 181,
  jP: [0, 0, 90, 1],
  jL: [0, 0, 90, 1],
  bP: { a: [3, 1], m: 2 },
  bL: { a: [1, -1], m: 0 },
  regard: 0,
  index: 0,
  assis: 0,
};
const pose = (o: Partial<Pose>): Pose => ({ ...BASE, ...o });
const ASSISE = {
  tronc: 177,
  tete: 179,
  jP: [80, -105, -4, 1] as Quad,
  jL: [78, -92, -92, 0.55] as Quad,
  bP: { cible: 'cuisseP', m: 84 },
  bL: { cible: 'cuisseL', m: 84 },
  assis: 1,
};
const POSES: Record<NomPose, Pose> = {
  debout: pose({}),
  takbir: pose({ bP: { a: [34, 176], m: 179 }, bL: { a: [28, 172], m: 176 } }),
  ruku: pose({
    tronc: 99,
    tete: 106,
    jP: [3, 0, 90, 1],
    jL: [3, 0, 90, 1],
    bP: { cible: 'genouP', m: 8 },
    bL: { cible: 'genouL', m: 8 },
  }),
  releve: pose({}),
  sujud: pose({
    tronc: 61,
    tete: 34,
    jP: [16, -106, -6, 1],
    jL: [16, -106, -6, 1],
    bP: { cible: 'solP', m: 94, rac: 0.62, coude: 'avant' },
    bL: { cible: 'solL', m: 94, rac: 0.62, coude: 'avant' },
  }),
  assise: pose(ASSISE),
  tashahhud: pose({ ...ASSISE, index: 1 }),
  salam: pose({ ...ASSISE, regard: 1 }),
};
// Femme : mêmes positions ; prosternation plus ramassée (ar-Risāla : elle se ramasse en prosternation et en assise)
const FEMME: Partial<Record<NomPose, Partial<Pose>>> = {
  sujud: {
    tronc: 66,
    tete: 38,
    jP: [26, -104, -6, 1],
    jL: [26, -104, -6, 1],
    bP: { cible: 'solP', m: 96, rac: 0.55, coude: 'arriere' },
    bL: { cible: 'solL', m: 96, rac: 0.55, coude: 'arriere' },
  },
};

// ------------------------------------------------------------ squelette (coordonnées du corps, hanche en 0,0)
function jambe(H: Pt, j: Quad) {
  const K = pt(H, j[0], L.cuisse);
  const A = pt(K, j[1], L.tibia);
  const lp = L.pied * j[3];
  const sole = dir(j[2] - 90);
  let T = pt(A, j[2], lp);
  let Ta = pt(A, j[2] + 180, L.talon);
  T = [T[0] + sole[0] * 3.2, T[1] + sole[1] * 3.2];
  Ta = [Ta[0] + sole[0] * 3.6, Ta[1] + sole[1] * 3.6];
  return { K, A, T, Ta };
}
function corps(p: Pose | Etat) {
  const H: Pt = [0, 0];
  const S = pt(H, p.tronc, L.torse);
  const C0 = pt(S, p.tronc, L.cou * 0.55);
  const C = pt(C0, p.tete, L.tete + L.cou * 0.45);
  const jP = jambe(H, p.jP);
  const jL = jambe(H, p.jL);
  const contacts: Pt[] = [
    jP.T,
    jP.Ta,
    jL.T,
    jL.Ta,
    [jP.K[0], jP.K[1] + EP.tibia / 2],
    [jL.K[0], jL.K[1] + EP.tibia / 2],
    [C[0], C[1] + L.tete + 0.4],
    [0, p.assis ? 12.5 : 14],
  ];
  const sol = Math.max(...contacts.map((c) => c[1]));
  return { H, S, C0, C, jP, jL, sol, epaule: pt(S, p.tronc + 180, 3.5) };
}
/** cinématique inverse d'un bras à deux segments */
function ik(E0: Pt, cible: Pt, a: number, b: number, choix?: string): [number, number] {
  const d = Math.min(Math.max(dist(E0, cible), Math.abs(a - b) + 0.01), a + b - 0.01);
  const phi = ang(E0, cible);
  const al = Math.acos((a * a + d * d - b * b) / (2 * a * d)) / R;
  const s1 = phi + al;
  const s2 = phi - al;
  const e1 = pt(E0, s1, a);
  const e2 = pt(E0, s2, a);
  const pris =
    choix === 'avant'
      ? e1[0] > e2[0]
        ? s1
        : s2
      : choix === 'haut'
        ? e1[1] < e2[1]
          ? s1
          : s2
        : e1[0] < e2[0]
          ? s1
          : s2;
  const E = pt(E0, pris, a);
  return [pris, ang(E, cible)];
}
/** résout une position en angles purs (les cibles deviennent des angles de bras) */
function resoudre(p: Pose): Etat {
  const c = corps(p);
  const bras = (k: 'bP' | 'bL'): Quad => {
    const b = p[k];
    const rac = b.rac ?? 1;
    const la = L.bras * rac;
    const lb = L.avbras * rac;
    if (b.a) return [b.a[0], b.a[1], b.m ?? 0, rac];
    const proche = k === 'bP';
    let cible: Pt;
    if (b.cible === 'genouP' || b.cible === 'genouL') {
      const K = proche ? c.jP.K : c.jL.K;
      cible = [K[0] + 6, K[1] + 1];
    } else if (b.cible === 'solP' || b.cible === 'solL') {
      cible = [c.C[0] - (proche ? 3 : 7), c.sol - 3.6];
    } else {
      const j = proche ? c.jP : c.jL;
      const q = mixP(c.H, j.K, 0.7);
      cible = [q[0], q[1] - 8.5];
    }
    const poignet = pt(cible, (b.m ?? 0) + 180, L.main * 0.45);
    const s = ik(c.epaule, poignet, la, lb, b.coude);
    return [s[0], s[1], b.m ?? 0, rac];
  };
  return {
    tronc: p.tronc,
    tete: p.tete,
    regard: p.regard,
    index: p.index,
    assis: p.assis,
    jP: p.jP,
    jL: p.jL,
    bP: bras('bP'),
    bL: bras('bL'),
  };
}
const mixQ = (a: Quad, b: Quad, t: number): Quad => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
  mix(a[3], b[3], t),
];
function interpoler(a: Etat, b: Etat, t: number): Etat {
  return {
    tronc: mix(a.tronc, b.tronc, t),
    tete: mix(a.tete, b.tete, t),
    regard: mix(a.regard, b.regard, t),
    index: mix(a.index, b.index, t),
    assis: mix(a.assis, b.assis, t),
    jP: mixQ(a.jP, b.jP, t),
    jL: mixQ(a.jL, b.jL, t),
    bP: mixQ(a.bP, b.bP, t),
    bL: mixQ(a.bL, b.bL, t),
  };
}
/** « souffle » : lent au départ et à l'arrivée, ample, posé */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ------------------------------------------------------------ géométrie dans la scène
function geo(e: Etat, camera: string) {
  const c = corps(e);
  const bras = (b: Quad) => {
    const E = pt(c.epaule, b[0], L.bras * b[3]);
    const W = pt(E, b[1], L.avbras * b[3]);
    const M = pt(W, b[2], L.main);
    return { E, W, M, m: b[2] };
  };
  const bP = bras(e.bP);
  const bL = bras(e.bL);
  const dx = X0 - c.jP.T[0];
  const dy = SOL - c.sol;
  const tr = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  const trJ = (j: ReturnType<typeof jambe>) => ({
    K: tr(j.K),
    A: tr(j.A),
    T: tr(j.T),
    Ta: tr(j.Ta),
  });
  const trB = (b: ReturnType<typeof bras>) => ({ E: tr(b.E), W: tr(b.W), M: tr(b.M), m: b.m });
  const g = {
    H: tr(c.H),
    S: tr(c.S),
    C0: tr(c.C0),
    C: tr(c.C),
    ep: tr(c.epaule),
    jP: trJ(c.jP),
    jL: trJ(c.jL),
    bP: trB(bP),
    bL: trB(bL),
    min: 0,
    max: 0,
    cam: 0,
  };
  const xs = [
    g.C[0] - 12,
    g.C[0] + 12,
    g.jP.T[0],
    g.jP.Ta[0],
    g.jL.T[0],
    g.H[0] - 10,
    g.bP.M[0],
    g.jP.K[0] + 8,
  ];
  g.min = Math.min(...xs);
  g.max = Math.max(...xs);
  g.cam = camera === 'figure' ? 120 - (g.min + g.max) / 2 : 0;
  return g;
}

// ------------------------------------------------------------ dessin
const NS = 'http://www.w3.org/2000/svg';
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
/** capsule effilée de p0 (largeur w0) à p1 (largeur w1), arrondie aux deux bouts */
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
const chaine = (pts: Pt[], ws: number[]): string => {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) d += capsule(pts[i]!, pts[i + 1]!, ws[i]!, ws[i + 1]!);
  return d;
};
const pied = (j: { A: Pt; T: Pt; Ta: Pt }, ep: number) =>
  capsule(j.Ta, j.T, ep, ep * 0.8) + capsule(j.A, mixP(j.Ta, j.T, 0.3), ep * 1.1, ep);

let compteHalo = 0;

export interface OptsSilhouette {
  genre?: Genre;
  camera?: 'tapis' | 'figure';
  decor?: boolean;
  viewBox?: string;
  pose?: NomPose;
  /** pas d'animation (vignettes) */
  statique?: boolean;
}

export class Silhouette {
  svg: SVGSVGElement;
  genre: Genre;
  nom: NomPose;
  private camera: string;
  private decor: boolean;
  private statique: boolean;
  private etat: Etat;
  private t = 0;
  private anim = 0;
  private raf = 0;
  private gCam!: SVGElement;
  private gCorps!: SVGElement;
  private halo: SVGElement | null = null;
  private ombre: SVGElement | null = null;
  private p!: Record<string, SVGElement>;

  constructor(svg: SVGSVGElement, o: OptsSilhouette = {}) {
    this.svg = svg;
    this.genre = o.genre ?? 'homme';
    this.camera = o.camera ?? 'tapis';
    this.decor = o.decor !== false;
    this.statique = !!o.statique;
    svg.setAttribute('viewBox', o.viewBox ?? '0 0 240 230');
    svg.setAttribute('role', 'img');
    this.construire();
    this.nom = o.pose ?? 'debout';
    this.etat = resoudre(this.def(this.nom));
    this.dessiner(this.etat);
    this.boucle();
  }
  private def(nom: NomPose): Pose {
    const p = POSES[nom];
    return this.genre === 'femme' && FEMME[nom] ? { ...p, ...FEMME[nom] } : p;
  }
  /** index tendu du tashahhud : oscillation douce (jamais en mouvement réduit) */
  private boucle() {
    cancelAnimationFrame(this.raf);
    if (this.statique || reduit() || this.etat.index <= 0.01) return;
    const pas = (ts: number) => {
      this.t = ts / 1000;
      if (this.etat.index > 0.01 && !this.anim) this.dessiner(this.etat);
      this.raf = requestAnimationFrame(pas);
    };
    this.raf = requestAnimationFrame(pas);
  }
  detruire() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.anim);
    this.anim = 0;
    this.raf = 0;
  }
  private construire() {
    const s = this.svg;
    while (s.firstChild) s.removeChild(s.firstChild);
    const defs = mk(s, 'defs', {});
    const id = `hp${++compteHalo}`;
    const rg = mk(defs, 'radialGradient', { id });
    mk(rg, 'stop', { offset: '0', 'stop-color': 'var(--or)', 'stop-opacity': 0.32 });
    mk(rg, 'stop', { offset: '1', 'stop-color': 'var(--or)', 'stop-opacity': 0 });
    const cam = (this.gCam = mk(s, 'g', {}));
    if (this.decor) {
      // rosace de fond (étoile à 8 branches), halo de la parole, sol et tapis
      const ros = mk(cam, 'g', { class: 'rosace-fond', transform: 'translate(120 112)' });
      const rect = {
        x: -70,
        y: -70,
        width: 140,
        height: 140,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 0.8,
      };
      mk(ros, 'rect', rect);
      mk(ros, 'rect', { ...rect, transform: 'rotate(45)' });
      mk(ros, 'circle', { r: 48, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.6 });
      mk(ros, 'circle', { r: 99, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.5 });
      this.halo = mk(cam, 'ellipse', {
        class: 'halo',
        rx: 74,
        ry: 82,
        fill: `url(#${id})`,
        opacity: 0,
      });
      mk(cam, 'line', {
        x1: -40,
        x2: 280,
        y1: SOL + 3.5,
        y2: SOL + 3.5,
        stroke: 'var(--scene-sol)',
        'stroke-width': 1.2,
      });
      const tp = mk(cam, 'g', {});
      mk(tp, 'rect', {
        x: X0 - 52,
        y: SOL - 0.5,
        width: 176,
        height: 4.5,
        rx: 2,
        fill: 'var(--tapis)',
        stroke: 'var(--tapis-bord)',
        'stroke-width': 0.8,
      });
      for (let i = 0; i < 9; i++)
        mk(tp, 'rect', {
          x: X0 - 44 + i * 20,
          y: SOL + 0.9,
          width: 8,
          height: 1.6,
          fill: 'var(--tapis-motif)',
          opacity: 0.7,
        });
      for (let f = 0; f < 4; f++) {
        const y = SOL + 0.2 + f * 1.3;
        mk(tp, 'line', {
          x1: X0 - 52,
          x2: X0 - 56,
          y1: y,
          y2: y,
          stroke: 'var(--tapis-bord)',
          'stroke-width': 0.6,
        });
        mk(tp, 'line', {
          x1: X0 + 124,
          x2: X0 + 128,
          y1: y,
          y2: y,
          stroke: 'var(--tapis-bord)',
          'stroke-width': 0.6,
        });
      }
      // repère de la qibla : arc de miḥrāb doré, devant le tapis
      const q = mk(cam, 'g', { transform: `translate(${X0 + 136} ${SOL - 38})`, opacity: 0.85 });
      mk(q, 'path', {
        d: 'M-9 38V12C-9 4-3 -1 0 -4C3 -1 9 4 9 12V38',
        fill: 'none',
        stroke: 'var(--or)',
        'stroke-width': 1.4,
      });
      mk(q, 'path', {
        d: 'M-5 38V15C-5 10-2 7 0 5C2 7 5 10 5 15V38',
        fill: 'none',
        stroke: 'var(--or)',
        'stroke-width': 0.8,
      });
      const et = mk(q, 'g', { transform: 'translate(0 -10) scale(.32)' });
      const r7 = { x: -7, y: -7, width: 14, height: 14, fill: 'var(--or)' };
      mk(et, 'rect', r7);
      mk(et, 'rect', { ...r7, transform: 'rotate(45)' });
      this.ombre = mk(cam, 'ellipse', {
        cy: SOL + 1.5,
        ry: 3.2,
        fill: 'var(--sil-2)',
        opacity: 0.16,
      });
    }
    const c = (this.gCorps = mk(cam, 'g', { class: 'corps' }));
    const p: Record<string, SVGElement> = (this.p = {});
    const forme = (cls: string, trait = false) => {
      const e = mk(c, 'path', { class: cls });
      if (trait) {
        e.setAttribute('class', `${cls} t-trait`);
        e.setAttribute('stroke-width', '1.8');
        e.setAttribute('paint-order', 'stroke');
        e.setAttribute('stroke-linejoin', 'round');
      }
      return e;
    };
    p.jambeL = forme('sil-2');
    p.piedL = forme('sil-2');
    p.brasL = forme('sil-2');
    p.mainL = forme('sil-2');
    p.jambeP = forme('sil-1', true);
    p.piedP = forme('sil-3');
    p.robe = forme('sil-1');
    p.lisere = mk(c, 'path', {
      class: 't-or',
      fill: 'none',
      'stroke-width': 1.3,
      'stroke-linecap': 'round',
    });
    p.cape = forme('sil-voile');
    p.cou = forme('sil-3');
    p.tete = mk(c, 'g', {});
    p.voileFond = mk(p.tete, 'circle', { class: 'sil-voile', r: 15.2, cx: -1.2, cy: 0.6 });
    p.crane = mk(p.tete, 'circle', { class: 'sil-3', r: L.tete });
    p.visage = mk(p.tete, 'ellipse', { class: 'sil-visage' });
    p.calotte = mk(p.tete, 'path', {
      class: 'sil-calotte',
      d: 'M-11.4,-1.2A11.4,11.4 0 0 1 11.4,-1.2Q0,-6.4 -11.4,-1.2Z',
    });
    p.brasP = forme('sil-bras', true);
    p.mainP = forme('sil-3');
    p.index = mk(c, 'path', {
      class: 't-3',
      fill: 'none',
      'stroke-width': 3.2,
      'stroke-linecap': 'round',
    });
    this.appliquerGenre();
  }
  private appliquerGenre() {
    const f = this.genre === 'femme';
    const p = this.p;
    p.cape!.style.display = f ? '' : 'none';
    p.voileFond!.style.display = f ? '' : 'none';
    p.calotte!.style.display = f ? 'none' : '';
    p.crane!.style.display = f ? 'none' : '';
  }
  changerGenre(g: Genre) {
    this.genre = g;
    this.appliquerGenre();
    this.etat = resoudre(this.def(this.nom));
    this.dessiner(this.etat);
    this.boucle();
  }
  private dessiner(e: Etat) {
    const g = geo(e, this.camera);
    const p = this.p as Record<string, SVGElement>;
    const f = this.genre === 'femme';
    this.gCam.setAttribute('transform', `translate(${n(g.cam)} 0)`);
    if (this.ombre) {
      this.ombre.setAttribute('cx', String(n((g.min + g.max) / 2)));
      this.ombre.setAttribute('rx', String(n((g.max - g.min) / 2 + 6)));
    }
    if (this.halo) {
      this.halo.setAttribute('cx', String(n((g.min + g.max) / 2)));
      this.halo.setAttribute('cy', String(n(Math.min(g.C[1], g.H[1]) + 18)));
    }
    // jambes : cuisse et tibia effilés
    p.jambeL!.setAttribute('d', chaine([g.H, g.jL.K, g.jL.A], [17, 12.5, 8.5]));
    p.piedL!.setAttribute('d', pied(g.jL, 6.8));
    p.jambeP!.setAttribute('d', chaine([g.H, g.jP.K, g.jP.A], [17, 12.5, 8.5]));
    p.piedP!.setAttribute('d', pied(g.jP, 6.8));
    // bras lointain
    p.brasL!.setAttribute('d', chaine([g.ep, g.bL.E, g.bL.W], [10.5, 9, 7]));
    p.mainL!.setAttribute('d', capsule(g.bL.W, pt(g.bL.W, g.bL.m, L.main), 7.4, 6.2));
    // vêtement : buste, puis la robe qui suit hanche, genou et tibia, avec un ourlet évasé
    const bas = f ? 0.93 : 0.55;
    const O = mixP(g.jP.K, g.jP.A, bas);
    const Sb = mixP(g.S, g.H, 0.02);
    const dT = ang(g.jP.K, g.jP.A);
    const u = dir(dT);
    const v = dir(dT + 90);
    const lo = f ? 21 : 17.5;
    const ourlet: [Pt, Pt] = [
      [O[0] + v[0] * lo + u[0] * 2, O[1] + v[1] * lo + u[1] * 2],
      [O[0] - v[0] * lo + u[0] * 2, O[1] - v[1] * lo + u[1] * 2],
    ];
    const haut = mixP(g.jP.K, O, 0.25);
    const robe =
      chaine(
        [Sb, mixP(g.S, g.H, 0.45), g.H, g.jP.K, haut],
        f ? [24, 27, 29, 25, 26] : [23, 26, 27, 23, 23],
      ) +
      `M${P([haut[0] + v[0] * 12.5, haut[1] + v[1] * 12.5])}L${P(ourlet[0])}Q${P([O[0] + u[0] * 4.5, O[1] + u[1] * 4.5])} ${P(ourlet[1])}L${P([haut[0] - v[0] * 12.5, haut[1] - v[1] * 12.5])}Z`;
    p.robe!.setAttribute('d', robe);
    p.lisere!.setAttribute(
      'd',
      `M${P([ourlet[0][0] - u[0] * 2.6, ourlet[0][1] - u[1] * 2.6])}Q${P([O[0] + u[0] * 1.9, O[1] + u[1] * 1.9])} ${P([ourlet[1][0] - u[0] * 2.6, ourlet[1][1] - u[1] * 2.6])}`,
    );
    const aT = (((dT % 360) + 540) % 360) - 180;
    p.lisere!.style.opacity = String(n(Math.max(0, 1 - Math.abs(aT) / 30))); // liseré d'or visible seulement quand la robe tombe droit
    if (f) p.cape!.setAttribute('d', chaine([g.C, g.S, mixP(g.S, g.H, 0.52)], [27, 34, 33]));
    p.cou!.setAttribute('d', capsule(mixP(g.S, g.C0, 0.1), g.C0, 9.5, 8.6));
    // tête orientée ; le visage (ovale clair, sans aucun trait) glisse vers le spectateur quand la tête tourne à droite
    const rot = 180 - e.tete;
    const rg = e.regard;
    p.tete!.setAttribute('transform', `translate(${P(g.C)}) rotate(${n(rot)})`);
    p.visage!.setAttribute('cx', String(n(f ? mix(7.6, 0.8, rg) : mix(6.8, 0.8, rg))));
    p.visage!.setAttribute('cy', String(n(f ? 1.2 : 2.2)));
    p.visage!.setAttribute('rx', String(n(f ? mix(3.4, 7.6, rg) : mix(3.2, 7.4, rg))));
    p.visage!.setAttribute('ry', String(n(f ? 8.6 : 7.6)));
    // bras proche + main + index (tashahhud : tendu, bougé doucement de droite à gauche)
    p.brasP!.setAttribute('d', chaine([g.ep, g.bP.E, g.bP.W], [11, 9.6, 7.4]));
    const lm = mix(L.main, L.main * 0.7, e.index);
    const M = pt(g.bP.W, g.bP.m, lm);
    p.mainP!.setAttribute('d', capsule(g.bP.W, M, 7.8, 6.4));
    if (e.index > 0.02) {
      const osc = reduit() ? 0 : Math.sin(this.t * 5.2) * 9;
      p.index!.style.display = '';
      p.index!.setAttribute(
        'd',
        ligne([pt(M, g.bP.m + 180, 1.5), pt(M, g.bP.m + 4 + osc, 9 * e.index)]),
      );
    } else p.index!.style.display = 'none';
  }
  /** Passe à une position (durée en ms ; sans durée ou en mouvement réduit : tout de suite). */
  aller(nom: NomPose, duree = 0): Promise<void> {
    const de = this.etat;
    const vers = resoudre(this.def(nom));
    this.nom = nom;
    if (this.anim) cancelAnimationFrame(this.anim);
    if (reduit() || !duree) {
      this.etat = vers;
      this.dessiner(vers);
      this.anim = 0;
      this.boucle();
      return Promise.resolve();
    }
    return new Promise((ok) => {
      const t0 = performance.now();
      const pas = (ts: number) => {
        const t = Math.min(1, (ts - t0) / duree);
        this.etat = interpoler(de, vers, ease(t));
        this.t = ts / 1000;
        this.dessiner(this.etat);
        if (t < 1) this.anim = requestAnimationFrame(pas);
        else {
          this.anim = 0;
          this.etat = vers;
          this.boucle();
          ok();
        }
      };
      pas(t0);
    });
  }
  /** Halo doré de la parole : allumé quand on parle ou qu'on récite. */
  parle(oui: boolean) {
    if (this.halo) this.halo.style.opacity = oui ? '1' : '0';
  }
}
