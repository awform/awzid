<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { Ablution, NomGeste } from './ablution';
  import type { Genre } from './silhouette';

  /**
   * Geste des ablutions (vue de face, SANS VISAGE) : moteur chargé à la demande. `surCycle` compte les passages (le
   * « ×3 » se remplit goutte à goutte). Le grand lavage n'est jamais montré par un corps.
   */
  let {
    geste,
    genre = 'homme',
    surCycle,
  }: { geste: NomGeste; genre?: Genre; surCycle?: (c: number) => void } = $props();

  let svg: SVGSVGElement;
  let a = $state.raw<Ablution | null>(null);
  let courant: NomGeste | null = null;

  onMount(() => {
    let mort = false;
    let moteur: Ablution | null = null;
    void import('./ablution').then((m) => {
      if (mort) return;
      moteur = new m.Ablution(svg, { genre, geste, surCycle: (c) => surCycle?.(c) });
      courant = geste;
      a = moteur;
    });
    return () => {
      mort = true;
      moteur?.detruire();
    };
  });
  $effect(() => {
    const g = geste;
    if (a && courant !== g) {
      courant = g;
      a.geste(g);
    }
  });
  $effect(() => {
    if (a && a.genre !== genre) a.changerGenre(genre);
  });
</script>

<svg
  bind:this={svg}
  class="sil"
  role="img"
  aria-label={t(genre === 'femme' ? 'priere.abl_femme' : 'priere.abl_homme')}
></svg>
