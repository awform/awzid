/**
 * Tracé guidé des lettres (cahier des charges § 2.4) : vérifications SIMPLES et BIENVEILLANTES, jamais de
 * note. Le modèle est la lettre elle-même, dessinée avec la police du cahier (Noto Naskh Arabic) :
 *  - corps (grandes parties) et signes (points, petites marques) sont séparés par composantes connexes ;
 *  - le tracé doit rester dans un COULOIR autour de la lettre (tolérance réglable selon l'âge) ;
 *  - il doit couvrir assez du corps ;
 *  - on commence au bon endroit (à droite pour les lettres couchées, en haut pour alif, lām, kāf) ;
 *  - on pose les points à la fin, chacun à sa place (dessus ou dessous).
 * Fonctions pures (testées sans navigateur) : le masque vient d'un canvas dans l'application.
 */

export interface Mask {
  w: number;
  h: number;
  /** 1 = encre de la lettre */
  data: Uint8Array;
}

export interface Comp {
  size: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  /** indices des pixels */
  px: Int32Array;
}

export interface Point {
  x: number;
  y: number;
}

export type Start = 'droite' | 'haut' | null;

export type Reason = 'vide' | 'couloir' | 'incomplet' | 'depart' | 'points' | 'ordre';

export interface Verdict {
  ok: boolean;
  reason?: Reason;
  /** signes oubliés : nombre et place */
  missing?: { n: number; pos: 'haut' | 'bas' };
}

/** Composantes connexes (8 voisins) de l'encre. */
export function components(m: Mask): Comp[] {
  const seen = new Uint8Array(m.w * m.h);
  const out: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < m.data.length; i++) {
    if (!m.data[i] || seen[i]) continue;
    const px: number[] = [];
    stack.push(i);
    seen[i] = 1;
    let x0 = m.w,
      y0 = m.h,
      x1 = 0,
      y1 = 0,
      sx = 0,
      sy = 0;
    while (stack.length) {
      const j = stack.pop()!;
      px.push(j);
      const x = j % m.w;
      const y = (j - x) / m.w;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
          const k = ny * m.w + nx;
          if (m.data[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    out.push({
      size: px.length,
      x0,
      y0,
      x1,
      y1,
      cx: sx / px.length,
      cy: sy / px.length,
      px: Int32Array.from(px),
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

export interface Glyph {
  mask: Mask;
  body: Comp[];
  marks: Comp[];
  /** boîte du corps */
  box: { x0: number; y0: number; x1: number; y1: number; cy: number };
}

/** Sépare le corps (grandes composantes) des signes (points, petites marques). */
export function analyze(mask: Mask): Glyph {
  const comps = components(mask).filter((c) => c.size >= 4);
  const big = comps[0]?.size ?? 0;
  const body = comps.filter((c) => c.size >= big * 0.25);
  const marks = comps.filter((c) => c.size < big * 0.25);
  const box = {
    x0: Math.min(...body.map((c) => c.x0)),
    y0: Math.min(...body.map((c) => c.y0)),
    x1: Math.max(...body.map((c) => c.x1)),
    y1: Math.max(...body.map((c) => c.y1)),
    cy:
      body.reduce((s, c) => s + c.cy * c.size, 0) /
      Math.max(
        1,
        body.reduce((s, c) => s + c.size, 0),
      ),
  };
  return { mask, body, marks, box };
}

/** Dilatation carrée de rayon r (deux passes séparables). */
export function dilate(m: Mask, r: number): Uint8Array {
  const tmp = new Uint8Array(m.w * m.h);
  const out = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) {
    let last = -1e9;
    for (let x = 0; x < m.w; x++)
      if (m.data[y * m.w + x]) last = x;
      else if (x - last <= r) tmp[y * m.w + x] = 1;
    last = 1e9;
    for (let x = m.w - 1; x >= 0; x--) {
      const i = y * m.w + x;
      if (m.data[i]) {
        last = x;
        tmp[i] = 1;
      } else if (last - x <= r) tmp[i] = 1;
    }
  }
  for (let x = 0; x < m.w; x++) {
    let last = -1e9;
    for (let y = 0; y < m.h; y++)
      if (tmp[y * m.w + x]) last = y;
      else if (y - last <= r) out[y * m.w + x] = 1;
    last = 1e9;
    for (let y = m.h - 1; y >= 0; y--) {
      const i = y * m.w + x;
      if (tmp[i]) {
        last = y;
        out[i] = 1;
      } else if (last - y <= r) out[i] = 1;
    }
  }
  return out;
}

/** Pixels couverts par les tracés (disques de rayon r le long des segments). */
export function rasterize(
  w: number,
  h: number,
  strokes: readonly Point[][],
  r: number,
): Uint8Array {
  const out = new Uint8Array(w * h);
  const stamp = (cx: number, cy: number) => {
    for (let y = Math.max(0, Math.round(cy - r)); y <= Math.min(h - 1, Math.round(cy + r)); y++)
      for (let x = Math.max(0, Math.round(cx - r)); x <= Math.min(w - 1, Math.round(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out[y * w + x] = 1;
  };
  for (const s of strokes) {
    if (s.length === 1) stamp(s[0]!.x, s[0]!.y);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1]!;
      const b = s[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let k = 0; k <= n; k++) stamp(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    }
  }
  return out;
}

export interface Options {
  /** tolérance du couloir (pixels) */
  tol: number;
  start: Start;
  /** lettre : départ, points et ordre vérifiés ; mot : couloir et couverture seulement */
  strict: boolean;
  /** part du corps à couvrir */
  cover?: number;
}

export function evaluate(g: Glyph, strokes: readonly Point[][], o: Options): Verdict {
  const { w, h } = g.mask;
  const pts = strokes.flat();
  if (pts.length < 2) return { ok: false, reason: 'vide' };
  // 1. couloir
  const corridor = dilate(g.mask, o.tol);
  const inside = pts.filter((p) => {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    return x >= 0 && y >= 0 && x < w && y < h && corridor[y * w + x];
  }).length;
  if (inside / pts.length < 0.85) return { ok: false, reason: 'couloir' };
  // 2. corps couvert
  const drawn = rasterize(w, h, strokes, o.tol);
  let bodyPx = 0;
  let covered = 0;
  for (const c of g.body)
    for (const i of c.px) {
      bodyPx++;
      if (drawn[i]) covered++;
    }
  if (covered / Math.max(1, bodyPx) < (o.cover ?? 0.6)) return { ok: false, reason: 'incomplet' };
  if (!o.strict) return { ok: true };
  // classement des tracés : sur un signe (court) ou sur le corps
  const markZone = dilate(
    {
      w,
      h,
      data: (() => {
        const d = new Uint8Array(w * h);
        for (const m of g.marks) for (const i of m.px) d[i] = 1;
        return d;
      })(),
    },
    o.tol,
  );
  const isMark = strokes.map((s) => {
    const onMark = s.filter((p) => markZone[Math.round(p.y) * w + Math.round(p.x)]).length;
    return g.marks.length > 0 && onMark / s.length >= 0.5;
  });
  // 3. départ
  const first = strokes.findIndex((_, i) => !isMark[i]);
  if (first < 0) return { ok: false, reason: 'incomplet' };
  const p0 = strokes[first]![0]!;
  const { x0, y0, x1, y1 } = g.box;
  if (o.start === 'droite' && p0.x < x0 + (x1 - x0) * 0.5) return { ok: false, reason: 'depart' };
  if (o.start === 'haut' && p0.y > y0 + (y1 - y0) * 0.5) return { ok: false, reason: 'depart' };
  // 4. signes : chacun touché
  const missing = g.marks.filter((m) => {
    let hit = 0;
    for (const i of m.px) if (drawn[i]) hit++;
    return hit / m.size < 0.3;
  });
  if (missing.length) {
    const above = missing.filter((m) => m.cy < g.box.cy).length;
    return {
      ok: false,
      reason: 'points',
      missing: { n: missing.length, pos: above * 2 >= missing.length ? 'haut' : 'bas' },
    };
  }
  // 5. ordre : le corps d'abord, les signes à la fin
  const lastBody = isMark.lastIndexOf(false);
  if (isMark.some((m, i) => m && i < lastBody)) return { ok: false, reason: 'ordre' };
  return { ok: true };
}

/** Point de départ conseillé (pour la pastille verte). */
export function startPoint(g: Glyph, start: Start): Point | null {
  const c = g.body[0];
  if (!c) return null;
  let best = -1;
  let score = -Infinity;
  for (const i of c.px) {
    const x = i % g.mask.w;
    const y = (i - x) / g.mask.w;
    const s = start === 'haut' ? -y * 4 + x * 0.1 : x * 4 - y * 0.5;
    if (s > score) {
      score = s;
      best = i;
    }
  }
  const x = best % g.mask.w;
  return { x, y: (best - x) / g.mask.w };
}
