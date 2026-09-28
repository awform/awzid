<script lang="ts">
  import { getContext } from 'svelte';
  import { sceneSvg, type SceneSpec } from '@awform/content/scene';

  /** Scène composée (portage de `scene()` du moteur des livres) : décor + personnages sans visage + objets. */
  let { spec, lettres = [] }: { spec: SceneSpec; lettres?: ReadonlyArray<{ l: string }> } =
    $props();
  const ill = getContext<() => Record<string, unknown>>('illustrations');
  const svg = $derived(sceneSvg(spec, lettres, (k) => !!ill?.()[k]));
</script>

<div class="scene">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG produit par notre code, texte échappé -->
  {@html svg}
</div>

<style>
  .scene :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 18px;
  }
  .scene {
    margin: 12px 0 6px;
  }
</style>
