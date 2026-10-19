<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';

  /** Refonte 19/10 : en-tête de section — titre vert profond suivi d'un filet d'or. */
  let {
    titre,
    id = undefined,
    discret = false,
  }: { titre: string; id?: string; discret?: boolean } = $props();
</script>

<div class="sec" class:discret>
  <h2 {id}><Bidi text={titre} /></h2>
  <span class="fil" aria-hidden="true"></span>
</div>

<style>
  .sec {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 28px 2px 12px;
  }
  h2 {
    font-size: 1.2rem;
  }
  .discret h2 {
    font-size: 1rem;
    color: var(--v4-doux);
  }
  .fil {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--v4-or), transparent);
    opacity: 0.8;
  }
  :global(:root[dir='rtl']) .fil {
    background: linear-gradient(270deg, var(--v4-or), transparent);
  }
</style>
