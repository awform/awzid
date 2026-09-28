<script lang="ts">
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { arabicSize, unitLabel } from '$lib/api';
  let { data } = $props();
</script>

<svelte:head><title>AWFORM — {data.level}</title></svelte:head>

<p><a href={resolve('/')}>← Mes livres</a></p>
<h1>Leçons — {data.level}</h1>
<ol class="units" style="--ar-size: {arabicSize(data.level)}px">
  {#each data.units as u (u.id)}
    <li class={u.kind}>
      <a href={resolve('/lecons/[id]', { id: u.id })} data-testid="unit">
        <span class="label">{unitLabel(u)}</span>
        <span class="fr">{u.titleFr}</span>
        <Ar text={u.titleAr} />
      </a>
    </li>
  {/each}
</ol>

<style>
  .units {
    list-style: none;
    padding: 0;
  }
  .units a {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    align-items: center;
    padding: 10px 14px;
    margin: 8px 0;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 14px;
    text-decoration: none;
    color: var(--ink);
  }
  .units :global(.ar) {
    grid-column: 1 / -1;
    text-align: right;
  }
  .label {
    font-weight: 700;
    color: var(--teal);
  }
  .bilan .label {
    color: var(--c3);
  }
</style>
