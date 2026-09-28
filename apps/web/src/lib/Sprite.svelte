<script lang="ts">
  /**
   * Symboles SVG des illustrations de la leçon (SVG validé par liste blanche à l'import : aucun script,
   * aucun lien, aucun texte ; personnages sans visage). Référencés par <use href="#i-clé">.
   */
  let { illustrations }: { illustrations: Record<string, { viewBox: string; svg: string }> } =
    $props();
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = $derived(
    Object.entries(illustrations)
      .map(([k, v]) => `<symbol id="i-${esc(k)}" viewBox="${esc(v.viewBox)}">${v.svg}</symbol>`)
      .join(''),
  );
</script>

<svg class="sprite" width="0" height="0" aria-hidden="true">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG validé à l'import (liste blanche) -->
  <defs>{@html html}</defs>
</svg>

<style>
  .sprite {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
</style>
