<script lang="ts">
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import type { Span, VivBeat } from '@awform/content/vivante';

  /**
   * Chantier A21b — temps des nouveaux modèles (chargés À LA DEMANDE, seulement quand une animation en contient) :
   * racine et schème, conjugaison, nombres, heure. Toutes les chaînes viennent du livre (générateur
   * `@awform/content/vivante`) ; l'arabe reste du texte ; aucun son ici (la voix passe par le lecteur, au geste).
   */
  let { b, lettres = [] }: { b: VivBeat; lettres?: ReadonlyArray<{ l: string }> } = $props();

  /**
   * lettres de la racine balisées `[..]` pour l'affichage en couleur (<Ar>, comme le balisage des livres) ;
   * les lettres du mot ne sont pas modifiées
   */
  const marque = (s: string, at: readonly Span[]) => {
    let out = '';
    let k = 0;
    for (const [a, e] of [...at].sort((x, y) => x[0] - y[0])) {
      out += `${s.slice(k, a)}[${s.slice(a, e)}]`;
      k = e;
    }
    return out + s.slice(k);
  }; /** au-delà, la quantité n'est plus montrée par des points */
  const DOTS = 20;
</script>

{#if b.k === 'racine'}
  <div class="plus racine">
    <div class="rac" dir="rtl" lang="ar">
      {#each b.racine as l, j (j)}<span class="rl" style="--d: {j}"
          ><Bidi text={l} base="ar" /></span
        >{/each}
    </div>
    <span class="moule"><Ar text={marque(b.moule, b.mpos)} /></span>
    <span class="mot"><Ar text={marque(b.mot, b.pos)} /></span>
    {#if b.fr}<span class="fr"><Bidi text={b.fr} /></span>{/if}
  </div>
{:else if b.k === 'conj'}
  <div class="plus conj">
    {#each b.rows as r, j (j)}
      <div class="row" dir="rtl" style="--d: {j}">
        <span class="pr ar" lang="ar"><Bidi text={r.p} base="ar" /></span>
        <span class="w"><Ar text={r.w} {lettres} /></span>
      </div>
    {/each}
  </div>
{:else if b.k === 'nombre'}
  <div class="plus nombre">
    <span class="chiffre ar" lang="ar" dir="rtl"><Bidi text={b.chiffre} base="ar" /></span>
    {#if b.n > 0 && b.n <= DOTS}<div class="dots" aria-hidden="true">
        {#each Array.from({ length: b.n }) as _, j (j)}<i style="--d: {j}"></i>{/each}
      </div>{/if}
    <span class="mot" style="--n: {Math.min(b.n, DOTS)}"><Ar text={b.mot} {lettres} /></span>
  </div>
{:else if b.k === 'heure'}
  <div class="plus heure">
    <svg class="clock" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="54" />
      {#each Array.from({ length: 12 }) as _, j (j)}<line
          class="tick"
          x1="60"
          y1="10"
          x2="60"
          y2={j % 3 ? 15 : 19}
          transform="rotate({j * 30} 60 60)"
        />{/each}
      <line
        class="hand hh"
        x1="60"
        y1="60"
        x2="60"
        y2="32"
        style="--a: {((b.h % 12) + b.m / 60) * 30}deg"
      />
      <line class="hand mm" x1="60" y1="60" x2="60" y2="18" style="--a: {b.m * 6}deg" />
      <circle class="axe" cx="60" cy="60" r="4" />
    </svg>
    <span class="ph"><Ar text={b.ar} {lettres} /></span>
    {#if b.fr}<span class="fr"><Bidi text={b.fr} /></span>{/if}
  </div>
{/if}

<style>
  .plus {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: center;
    animation: rise 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .ar,
  .rac {
    font-family: var(--font-ar);
  }
  .fr {
    color: var(--ink2);
    font-size: 0.95rem;
    max-width: 34ch;
    animation: rise 500ms 3200ms both;
  }
  /* racine : les trois lettres arrivent, glissent dans le schème, le mot se forme */
  .rac {
    display: flex;
    gap: 12px;
    margin-top: 12px;
    font-size: calc(var(--ar-size) * 1.3);
  }
  /* racine en couleur : même couleur (or des livres) pour les lettres seules et dans le mot */
  .rl {
    color: var(--c3);
    background: var(--card);
    border-radius: 12px;
    padding: 0 12px;
    font-weight: 700;
    animation:
      pop 380ms calc(var(--d) * 300ms) both,
      drop 1600ms 1700ms ease-in-out;
  }
  .moule {
    font-size: calc(var(--ar-size) * 1.5);
    color: var(--ink2);
    animation: fade 400ms 1000ms both;
  }
  .moule :global(span[class^='c']) {
    animation: glow 900ms 2200ms both;
  }
  .mot {
    font-size: calc(var(--ar-size) * 1.9);
    line-height: 1.5;
    animation: pop 500ms 2700ms both;
  }
  /* conjugaison : ligne par ligne, le pronom, puis le radical, puis la terminaison du livre */
  .row {
    display: flex;
    gap: 14px;
    align-items: baseline;
    justify-content: center;
    font-size: calc(var(--ar-size) * 1.3);
    animation: rise 400ms calc(var(--d) * 1300ms) both;
  }
  .pr {
    color: var(--primary);
    font-weight: 700;
    min-width: 3.5em;
  }
  .w {
    animation: fade 400ms calc(var(--d) * 1300ms + 400ms) both;
  }
  .w :global(.ar > span[class^='c']) {
    animation: fade 500ms calc(var(--d) * 1300ms + 900ms) both;
  }
  /* nombres : le chiffre, la quantité, puis le mot */
  .chiffre {
    font-size: calc(var(--ar-size) * 2.6);
    line-height: 1.2;
    color: var(--c0);
    animation: pop 450ms both;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    max-width: 230px;
    direction: rtl;
  }
  .dots i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--c1);
    animation: pop 300ms calc(500ms + var(--d) * 140ms) both;
  }
  .nombre .mot {
    font-size: calc(var(--ar-size) * 1.5);
    animation: pop 450ms calc(700ms + var(--n) * 140ms) both;
  }
  /* heure : les aiguilles tournent jusqu'à l'heure de la traduction du livre */
  .clock {
    width: 132px;
    height: 132px;
  }
  .clock circle {
    fill: var(--card);
    stroke: var(--primary);
    stroke-width: 3;
  }
  .clock .tick {
    stroke: var(--ink2);
    stroke-width: 2;
  }
  .hand {
    stroke-linecap: round;
    transform-box: view-box;
    transform-origin: 60px 60px;
    animation: turn 1600ms 300ms cubic-bezier(0.3, 0.9, 0.3, 1) both;
  }
  .hh {
    stroke: var(--c0);
    stroke-width: 6;
  }
  .mm {
    stroke: var(--c1);
    stroke-width: 4;
  }
  .clock .axe {
    fill: var(--ink);
    stroke: none;
  }
  .ph {
    font-size: calc(var(--ar-size) * 1.3);
    animation: rise 500ms 1500ms both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  /* les lettres glissent dans le schème, puis reviennent en haut (racine visible jusqu'à la fin) */
  @keyframes drop {
    45% {
      opacity: 0;
      transform: translateY(46px) scale(0.7);
    }
    55% {
      opacity: 0;
      transform: none;
    }
  }
  @keyframes glow {
    50% {
      text-shadow: 0 0 14px color-mix(in srgb, var(--c3) 70%, transparent);
    }
  }
  @keyframes turn {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(var(--a));
    }
  }
</style>
