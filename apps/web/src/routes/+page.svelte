<script lang="ts">
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { t } from '$lib/i18n';
  let { data } = $props();
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.arabe')}</title></svelte:head>

<h1>{t('arabe.titre')}</h1>
{#if data.offline}<p class="card">{t('arabe.hors_ligne')}</p>{/if}
<ul class="levels">
  {#each data.levels as l (l.code)}
    <li>
      <a href={resolve('/niveaux/[code]', { code: l.code })} data-testid="level">
        <strong>{l.codeFr ?? l.code}</strong> — {l.titleFr}
        {#if l.titreAr}<Ar text={l.titreAr} />{/if}
        <small>{t('arabe.unites', { n: l.units })}</small>
      </a>
    </li>
  {/each}
</ul>
<p class="edition">{t('arabe.edition', { edition: data.edition })}</p>

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
