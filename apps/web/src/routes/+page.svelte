<script lang="ts">
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  let { data } = $props();
</script>

<svelte:head><title>AWFORM — Arabe</title></svelte:head>

<h1>Mes livres d'arabe</h1>
{#if data.offline}<p class="card">
    Sans réseau : voici les niveaux téléchargés sur l'appareil.
  </p>{/if}
<ul class="levels">
  {#each data.levels as l (l.code)}
    <li>
      <a href={resolve('/niveaux/[code]', { code: l.code })} data-testid="level">
        <strong>{l.codeFr ?? l.code}</strong> — {l.titleFr}
        {#if l.titreAr}<Ar text={l.titreAr} />{/if}
        <small>{l.units} unités</small>
      </a>
    </li>
  {/each}
</ul>
<p class="edition">Édition du contenu : {data.edition}</p>

<style>
  .levels {
    list-style: none;
    padding: 0;
  }
  .levels a {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 12px;
    padding: 14px 16px;
    margin: 10px 0;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 16px;
    text-decoration: none;
    color: var(--ink);
  }
  small,
  .edition {
    color: var(--ink2);
  }
</style>
