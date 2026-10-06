<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { LEGAL_PAGES } from '$lib/legal/content';
  import { LEGAL_FR, loadLegal } from '$lib/legal/pages';

  /** Aide (lot 14) : questions fréquentes ; textes dans $lib/legal/content.ts (français). */
  let L = $state(LEGAL_FR);
  onMount(async () => (L = await loadLegal()));
</script>

<svelte:head><title>{t('app.nom')} — {t('aide.titre')}</title></svelte:head>

<h1>{t('aide.titre')}</h1>
<p>{t('aide.intro')}</p>

{#each L.faq as bloc (bloc.titre)}
  <section class="card" lang={L.lang}>
    <h2><Bidi text={bloc.titre} /></h2>
    {#each bloc.items as it (it.q)}
      <details data-testid="faq">
        <summary><Bidi text={it.q} /></summary>
        <p><Bidi text={it.r} /></p>
      </details>
    {/each}
  </section>
{/each}

<section class="card">
  <h2>{t('aide.documents')}</h2>
  <ul>
    {#each LEGAL_PAGES as k (k)}
      <li><a href={resolve('/legal/[page]', { page: k })}><Bidi text={L.legal[k].titre} /></a></li>
    {/each}
    <li><a href={resolve('/garanties')}>{t('aide.garanties')}</a></li>
    <li><a href={resolve('/errata')}>{t('errata.titre')}</a></li>
  </ul>
</section>

<style>
  details {
    border-bottom: 1px solid var(--line);
    padding: 8px 0;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
</style>
