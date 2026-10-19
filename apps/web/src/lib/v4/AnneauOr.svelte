<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { anneau } from './donnees';

  /**
   * Refonte 19/10 : anneau doré de progression (la semaine : jours de travail sur l'objectif choisi). La valeur est
   * écrite au centre et dite par `label` (lecteurs d'écran) ; l'anneau lui-même est décoratif.
   */
  let {
    n,
    sur,
    unite,
    label,
    size = 92,
  }: { n: number; sur: number; unite: string; label: string; size?: number } = $props();
  const a = $derived(anneau(n, sur));
</script>

<div class="anneau" style="--t: {size}px" role="img" aria-label={label} data-testid="v4-anneau">
  <svg viewBox="0 0 112 112" aria-hidden="true" focusable="false"
    ><circle
      cx="56"
      cy="56"
      r="48"
      fill="none"
      stroke="var(--v4-carte-2)"
      stroke-width="9"
    /><circle
      cx="56"
      cy="56"
      r="48"
      fill="none"
      stroke="var(--v4-or)"
      stroke-width="9"
      stroke-linecap="round"
      stroke-dasharray="{a.trait} {a.tour}"
      opacity={a.trait ? 1 : 0}
    /></svg
  >
  <span class="val" aria-hidden="true"
    ><b><Bidi text={`${n} / ${sur}`} /></b><span><Bidi text={unite} /></span></span
  >
</div>

<style>
  .anneau {
    position: relative;
    width: var(--t);
    height: var(--t);
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .val {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
  }
  b {
    font: 600 1.35rem/1 var(--font-title);
    color: var(--v4-titre);
    direction: ltr;
  }
  .val span {
    font: 700 0.75rem var(--font-ui);
    color: var(--v4-doux);
  }
</style>
