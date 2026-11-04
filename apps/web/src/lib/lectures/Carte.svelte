<script lang="ts">
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { fn } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
</script>

<nav class="lx-cartes" data-testid="lx-cartes">
  {#if fn('histoires')}
    <a class="card lx" href={resolve('/histoires')} data-testid="lx-histoires">
      <strong><Bidi text={t('lx.carte_histoires')} /></strong>
      <span class="muted"><Bidi text={t('lx.carte_histoires_aide')} /></span>
    </a>
  {/if}
  {#if fn('khalil')}
    <a class="card lx" href={resolve('/khalil')} data-testid="lx-khalil">
      <strong><Bidi text={t('lx.carte_khalil')} /></strong>
      <span class="muted"><Bidi text={t('lx.carte_khalil_aide')} /></span>
    </a>
  {/if}
</nav>

<style>
  .lx-cartes {
    display: grid;
    gap: 10px;
    margin-block: 12px;
  }
  .lx {
    display: grid;
    gap: 4px;
    min-height: 48px;
    text-decoration: none;
    color: inherit;
  }
</style>
