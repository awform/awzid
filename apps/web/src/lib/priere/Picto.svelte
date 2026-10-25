<script lang="ts">
  /** Pictogramme du sprite (`Sprite.svelte`), décoratif : le texte voisin dit la même chose. */
  let { nom, classe = '' }: { nom: string; classe?: string } = $props();
</script>

<svg class="i {classe}" aria-hidden="true" focusable="false"><use href="#pr-{nom}" /></svg>
