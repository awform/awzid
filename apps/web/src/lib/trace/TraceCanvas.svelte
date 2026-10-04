<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import {
    analyze,
    evaluate,
    startPoint,
    type Glyph,
    type Point,
    type Start,
    type Verdict,
  } from './evaluate';

  /**
   * Zone de tracé au doigt, au stylet ou à la souris (Pointer Events), lignes d'écriture du cahier.
   * Étapes : 1 repasser les pointillés, 2 tracer sur la lettre claire, 3 écrire seul. Le texte est
   * dessiné avec la police du cahier (Noto Naskh Arabic) : c'est lui qui sert de modèle et de couloir.
   */
  let {
    text,
    start = null,
    strict = true,
    step = 1,
    tol = 16,
    ondone,
  }: {
    text: string;
    start?: Start;
    strict?: boolean;
    step?: 1 | 2 | 3;
    tol?: number;
    ondone?: (v: Verdict, strokes: number) => void;
  } = $props();

  const W = 320;
  const H = 320;
  let guide: HTMLCanvasElement;
  let ink: HTMLCanvasElement;
  let glyph: Glyph | null = null;
  let strokes: Point[][] = [];
  let current: Point[] | null = null;
  let verdict = $state<Verdict | null>(null);
  let startAt = $state<Point | null>(null);
  let box = $state('');

  function fontFor(ctx: CanvasRenderingContext2D, size: number) {
    ctx.font = `${size}px 'Noto Naskh Arabic', serif`;
  }

  /** Dessine le texte hors écran, en déduit le masque de l'encre, puis le guide selon l'étape. */
  async function prepare() {
    await document.fonts?.load(`200px 'Noto Naskh Arabic'`, text).catch(() => {});
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d', { willReadFrequently: true })!;
    let size = text.length > 2 ? 120 : 200;
    fontFor(o, size);
    let m = o.measureText(text);
    const maxW = W * 0.86;
    if (m.width > maxW) {
      size = Math.floor((size * maxW) / m.width);
      fontFor(o, size);
      m = o.measureText(text);
    }
    o.direction = 'rtl';
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    const asc = m.actualBoundingBoxAscent;
    const desc = m.actualBoundingBoxDescent;
    const baseY = Math.round((H - (asc + desc)) / 2 + asc);
    o.fillStyle = '#000';
    o.fillText(text, W / 2, baseY);
    const img = o.getImageData(0, 0, W, H).data;
    const data = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) data[i] = img[i * 4 + 3]! > 110 ? 1 : 0;
    glyph = analyze({ w: W, h: H, data });
    startAt = strict ? startPoint(glyph, start) : null;
    box = glyph.body.length
      ? `${glyph.box.x0},${glyph.box.y0},${glyph.box.x1},${glyph.box.y1}`
      : '';

    const g = guide.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    // lignes du cahier : ligne de base et ligne haute pointillée
    g.strokeStyle = '#c9bfa8';
    g.lineWidth = 1;
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(8, baseY + 0.5);
    g.lineTo(W - 8, baseY + 0.5);
    g.stroke();
    g.setLineDash([4, 6]);
    g.beginPath();
    g.moveTo(8, baseY - asc * 0.55);
    g.lineTo(W - 8, baseY - asc * 0.55);
    g.stroke();
    fontFor(g, size);
    g.direction = 'rtl';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    if (step === 1) {
      g.setLineDash([3, 5]);
      g.lineWidth = 2;
      g.strokeStyle = '#8a8170';
      g.strokeText(text, W / 2, baseY);
    } else if (step === 2) {
      g.fillStyle = '#e4dccb';
      g.fillText(text, W / 2, baseY);
    }
    g.setLineDash([]);
    if (startAt && step < 3) {
      g.fillStyle = '#1b7f4b';
      g.beginPath();
      g.arc(startAt.x, startAt.y, 7, 0, Math.PI * 2);
      g.fill();
    }
    clear();
  }

  function clear() {
    strokes = [];
    current = null;
    verdict = null;
    ink?.getContext('2d')?.clearRect(0, 0, W, H);
  }

  function pos(e: PointerEvent): Point {
    const r = ink.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }
  function down(e: PointerEvent) {
    e.preventDefault();
    ink.setPointerCapture(e.pointerId);
    if (verdict) clear();
    current = [pos(e)];
    draw();
  }
  function move(e: PointerEvent) {
    if (!current) return;
    e.preventDefault();
    current.push(pos(e));
    draw();
  }
  function up() {
    if (!current) return;
    strokes.push(current);
    current = null;
  }
  function draw(color = '#1f4e79') {
    const c = ink.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 9;
    c.strokeStyle = color;
    for (const s of current ? [...strokes, current] : strokes) {
      c.beginPath();
      s.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      if (s.length === 1) c.lineTo(s[0]!.x + 0.1, s[0]!.y);
      c.stroke();
    }
  }
  function check() {
    if (!glyph) return;
    verdict = evaluate(glyph, strokes, { tol, start, strict, cover: step === 3 ? 0.5 : 0.6 });
    draw(verdict.ok ? '#1b7f4b' : '#b3261e');
    ondone?.(verdict, strokes.length);
  }

  onMount(() => {
    void prepare();
  });
  $effect(() => {
    void text;
    void step;
    if (guide) void prepare();
  });

  const message = $derived(
    !verdict
      ? ''
      : verdict.ok
        ? t('trace.bravo')
        : verdict.reason === 'points'
          ? t(`trace.points_${verdict.missing?.pos ?? 'haut'}`, { n: verdict.missing?.n ?? 1 })
          : t(`trace.${verdict.reason}`),
  );
</script>

<div class="zone">
  <canvas bind:this={guide} width={W} height={H} class="layer" aria-hidden="true"></canvas>
  <canvas
    bind:this={ink}
    width={W}
    height={H}
    class="layer ink"
    data-testid="trace"
    data-box={box}
    data-start={startAt ? `${startAt.x},${startAt.y}` : ''}
    aria-label={t('trace.zone', { lettre: text })}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  ></canvas>
</div>
<div class="row">
  <button type="button" class="primary" onclick={check} data-testid="verifier"
    >{t('trace.verifier')}</button
  >
  <button type="button" onclick={clear} data-testid="effacer">{t('trace.effacer')}</button>
</div>
{#if message}<p class="msg" class:good={verdict?.ok} role="status" data-testid="trace-message">
    <Bidi text={message} />
  </p>{/if}

<style>
  .zone {
    position: relative;
    width: 100%;
    max-width: 320px;
    aspect-ratio: 1;
    margin: 8px auto;
    background: #fffdf7;
    border: 2px solid var(--line);
    border-radius: 16px;
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .ink {
    touch-action: none;
    cursor: crosshair;
  }
  .row {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  .msg {
    text-align: center;
    font-weight: 700;
    color: var(--warn-ink);
  }
  .msg.good {
    color: var(--ok-ink);
  }
</style>
