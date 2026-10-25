<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { decouper } from './donnees';

  /**
   * Texte français d'un livre : si une citation arabe s'y glisse, elle passe sur SA PROPRE ligne (règle de l'application :
   * jamais d'arabe sur la ligne du français). Le texte n'est jamais modifié.
   */
  let { txt }: { txt: string } = $props();
  const morceaux = $derived(decouper(txt));
</script>

{#each morceaux as m, i (i)}{#if 'ar' in m}<span class="ar cite quran-text" lang="ar" dir="rtl"
      >{m.ar}</span
    >{:else}<span class="fr-morceau"><Bidi text={m.fr} /></span>{/if}{/each}
