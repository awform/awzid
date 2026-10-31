<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { formText } from '$lib/trace/letters';
  import {
    FORMES,
    VITESSES,
    aConfirmer,
    angleDepart,
    dureeTotale,
    etatA,
    etiquetteVitesse,
    ligneDuTemps,
    pointA,
    points,
    type FormeTrace,
    type Vitesse,
  } from './trace-anim';
  import { tt } from './trace-textes';

  /**
   * « Voir le tracé » (31/10/2026) — UNE forme d'une lettre (isolée, début, milieu, fin), tracée au ralenti : la plume
   * avance trait après trait dans l'ordre et le sens du fichier `/video/traits.json` (repris tel quel), le corps de
   * la lettre d'abord, puis les points et signes ; ligne de base visible ; flèche de départ et numéro de chaque trait ;
   * lecture, pause, rejouer et vitesse (0,5×, 0,75×, 1×, 1,5×). Chargé à la demande (groupe « vidéos vivantes »).
   * `prefers-reduced-motion` : aucun démarrage automatique, la lettre complète est montrée et « Lire » est en évidence.
   * Texte : seulement des libellés d'interface (5 langues), aucun contenu religieux.
   */
  let {
    l,
    f,
    forme,
    autoStart = true,
  }: { l: string; f: number; forme: FormeTrace; autoStart?: boolean } = $props();

  const F = 120;
  const nomForme = $derived(FORMES[f] ?? 'isolee');
  const texte = $derived(formText(l, nomForme));
  const ligne = $derived(ligneDuTemps(forme.t));
  const confirmer = $derived(aConfirmer(forme.s));

  // géométrie de la lettre dans le dessin (mesurée sur la police du cahier, comme les vidéos)
  let g = $state<{ W: number; H: number; B: number; gL: number; gR: number; A: number } | null>(
    null,
  );
  let t = $state(0); // ms écoulées, à la vitesse 1×
  let vitesse = $state<Vitesse>(1);
  let jouant = $state(false);
  let reduit = $state(false);
  const etat = $derived(etatA(ligne, t));
  const mid = `tr${Math.random().toString(36).slice(2, 8)}`;

  const pt = (x: number, y: number): [number, number] =>
    g ? [g.gL + (x / 100) * (g.gR - g.gL), g.B - (y / 100) * g.A] : [0, 0];
  const chemins = $derived(g ? forme.t.map((p) => points(p).map(([x, y]) => pt(x, y))) : []);
  const d = (c: Array<[number, number]>) =>
    c.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const plume = $derived(
    etat.courant >= 0 && chemins[etat.courant]
      ? pointA(chemins[etat.courant]!, etat.progres[etat.courant]!)
      : null,
  );
  const annonce = $derived(
    etat.courant >= 0
      ? tt('trait', { n: etat.courant + 1, total: forme.t.length })
      : etat.fini
        ? tt('fini')
        : etat.points > 0
          ? tt('points')
          : '',
  );

  let raf = 0;
  let dernier = 0;
  function boucle(now: number) {
    // un onglet resté en arrière-plan ne fait pas sauter l'animation
    t = Math.min(ligne.total, t + Math.min(100, now - dernier) * vitesse);
    dernier = now;
    if (t >= ligne.total) {
      jouant = false;
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(boucle);
  }
  function lire() {
    if (t >= ligne.total) t = 0;
    jouant = true;
    dernier = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(boucle);
  }
  function pause() {
    jouant = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }
  const basculer = () => (jouant ? pause() : lire());
  function rejouer() {
    t = 0;
    lire();
  }
  function clavier(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      basculer();
    } else if (e.key === 'r' || e.key === 'R') rejouer();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const i = VITESSES.indexOf(vitesse) + (e.key === 'ArrowUp' ? 1 : -1);
      vitesse = VITESSES[Math.min(VITESSES.length - 1, Math.max(0, i))]!;
    }
  }

  async function mesurer() {
    const font = `700 ${F}px "Noto Naskh Arabic"`;
    await document.fonts?.load(font, texte).catch(() => undefined);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) {
      g = { W: F * 1.4, H: F * 1.6, B: F, gL: F * 0.15, gR: F * 1.25, A: F * 0.7 };
      return;
    }
    ctx.font = font;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    const m = ctx.measureText(texte);
    const W = Math.max(F * 0.8, m.width + F * 0.3);
    const A = ctx.measureText('ا').actualBoundingBoxAscent || F * 0.7;
    g = {
      W,
      H: F * 1.6,
      B: F,
      gL: W / 2 - m.actualBoundingBoxLeft,
      gR: W / 2 + m.actualBoundingBoxRight,
      A,
    };
  }

  onMount(() => {
    reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    void mesurer().then(() => {
      if (reduit) t = ligne.total;
      else if (autoStart) lire();
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<div
  class="trace-lettre"
  class:calme={reduit}
  data-testid="trace-lettre"
  data-lettre={l}
  data-forme={nomForme}
  data-statut={forme.s}
  data-t={Math.round(t)}
  data-jouant={jouant}
  data-vitesse={vitesse}
  data-duree={dureeTotale(ligne, vitesse)}
>
  <div
    class="scene"
    role="button"
    tabindex="0"
    aria-label={`${tt('image', { l, forme: tt(nomForme), n: forme.t.length })} ${jouant ? tt('pause') : tt('lire')}`}
    aria-describedby={`${mid}-aide`}
    onclick={basculer}
    onkeydown={clavier}
  >
    {#if g}
      <svg
        viewBox={`0 0 ${g.W} ${g.H}`}
        style:width={`${((g.W / F) * 20).toFixed(2)}rem`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <mask id={mid} maskUnits="userSpaceOnUse" x="0" y="0" width={g.W} height={g.H}>
            {#each chemins as c, i (i)}
              <path
                d={d(c)}
                pathLength="1"
                class="masque"
                stroke-width={F * 0.17}
                style:stroke-dasharray="1 1"
                style:stroke-dashoffset={1 - (etat.progres[i] ?? 0)}
              />
            {/each}
            <!-- les points et signes apparaissent après le corps de la lettre -->
            <rect x="0" y="0" width={g.W} height={g.H} fill="#fff" opacity={etat.points} />
          </mask>
        </defs>
        <line class="base" x1="0" x2={g.W} y1={g.B} y2={g.B} data-testid="ligne-de-base" />
        <text class="base-nom" x="4" y={g.H - 6} font-size="8">{tt('base')}</text>
        <text
          class="fantome"
          x={g.W / 2}
          y={g.B}
          text-anchor="middle"
          direction="rtl"
          font-family="Noto Naskh Arabic, serif"
          font-weight="700"
          font-size={F}>{texte}</text
        >
        <text
          class="plein"
          mask={`url(#${mid})`}
          x={g.W / 2}
          y={g.B}
          text-anchor="middle"
          direction="rtl"
          font-family="Noto Naskh Arabic, serif"
          font-weight="700"
          font-size={F}>{texte}</text
        >
        {#each chemins as c, i (i)}
          {#if c[0]}
            <g
              class="depart"
              class:actif={etat.courant === i}
              transform={`translate(${c[0][0].toFixed(1)} ${c[0][1].toFixed(1)}) rotate(${angleDepart(c).toFixed(1)})`}
              data-testid="fleche-depart"
            >
              <path class="fleche" d="M3 -7 L19 0 L3 7 Z" />
            </g>
            {#if chemins.length > 1}
              <g transform={`translate(${c[0][0].toFixed(1)} ${(c[0][1] - 22).toFixed(1)})`}>
                <circle class="num-fond" r="9" />
                <text class="num" text-anchor="middle" y="4" font-size="12">{i + 1}</text>
              </g>
            {/if}
          {/if}
        {/each}
        {#if plume}<circle class="plume" cx={plume[0]} cy={plume[1]} r={F * 0.05} />{/if}
      </svg>
    {:else}
      <p class="muted" aria-busy="true"><Bidi text={tt('chargement')} /></p>
    {/if}
  </div>
  <p class="sr" role="status" aria-live="polite"><Bidi text={annonce} /></p>
  {#if confirmer}
    <p class="a-confirmer" data-testid="trace-a-confirmer"><Bidi text={tt('a_confirmer')} /></p>
  {/if}
  {#if reduit}<p class="muted small"><Bidi text={tt('calme')} /></p>{/if}
  <div class="controles">
    <button
      type="button"
      class="primary lire"
      class:evidence={reduit && !jouant}
      onclick={basculer}
      data-testid="trace-lire"
    >
      <span aria-hidden="true"><Bidi text={jouant ? '⏸' : '▶'} /></span>
      <Bidi text={jouant ? tt('pause') : tt('lire')} />
    </button>
    <button type="button" onclick={rejouer} data-testid="trace-rejouer">
      <span aria-hidden="true">↻</span>
      <Bidi text={tt('rejouer')} />
    </button>
  </div>
  <div class="vitesses" role="group" aria-label={tt('vitesse')}>
    <span class="muted small" aria-hidden="true"><Bidi text={tt('vitesse')} /></span>
    {#each VITESSES as v (v)}
      <button
        type="button"
        class:primary={v === vitesse}
        aria-pressed={v === vitesse}
        aria-label={`${tt('vitesse')} ${etiquetteVitesse(v)}`}
        onclick={() => (vitesse = v)}
        data-vitesse={v}><Bidi text={etiquetteVitesse(v)} /></button
      >
    {/each}
  </div>
  <p class="muted small" id={`${mid}-aide`}><Bidi text={tt('clavier')} /></p>
</div>

<style>
  .trace-lettre {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .scene {
    width: 100%;
    max-width: 22rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    background: var(--card);
    padding: 8px;
    min-height: 10rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .scene:focus-visible {
    outline: 3px solid var(--teal);
    outline-offset: 2px;
  }
  svg {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .base {
    stroke: var(--ink2);
    stroke-width: 1;
    stroke-dasharray: 5 4;
  }
  .base-nom {
    fill: var(--ink2);
  }
  .fantome {
    fill: var(--ink);
    opacity: 0.14;
  }
  .plein {
    fill: var(--ink);
  }
  .masque {
    fill: none;
    stroke: #fff;
    stroke-linecap: butt;
    stroke-linejoin: round;
  }
  .fleche {
    fill: var(--teal);
    stroke: var(--card);
    stroke-width: 1.2;
  }
  .depart {
    opacity: 0.75;
  }
  .depart.actif {
    opacity: 1;
  }
  .num-fond {
    fill: var(--teal);
  }
  .num {
    fill: var(--card);
    font-weight: 700;
  }
  .plume {
    fill: var(--teal);
    stroke: var(--card);
    stroke-width: 2;
  }
  .controles,
  .vitesses {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: center;
  }
  button {
    min-height: 44px;
    min-width: 44px;
  }
  .lire.evidence {
    outline: 3px solid var(--teal);
    outline-offset: 2px;
  }
  .a-confirmer {
    margin: 0;
    padding: 4px 10px;
    font-size: 0.9rem;
    color: var(--ink2);
    border: 1px dashed var(--line);
    border-radius: 8px;
    text-align: center;
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
    text-align: center;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    margin: 0;
  }
</style>
