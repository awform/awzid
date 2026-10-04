<script lang="ts">
  import { tanwinDisplay } from '@awform/content/text';
  import { runAttrs, type Run } from './tajwid';

  /**
   * Lot 29 — un mot (ou la basmala) en morceaux : chaque morceau garde les caractères Tanzil tels quels
   * (affichage du tanwin du Muṣḥaf seulement) ; la couleur est une enveloppe, jamais une modification.
   * Aucun espace n'est ajouté entre les morceaux (la liaison des lettres arabes est conservée).
   */
  let { runs }: { runs: Run[] } = $props();
</script>

{#each runs as p, i (i)}{#if p.r}<span class="tj" {...runAttrs(p.r)}>{tanwinDisplay(p.t)}</span
    >{:else}{tanwinDisplay(p.t)}{/if}{/each}
