<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { LEGAL_PAGES } from '$lib/legal/content';
  import { faq, legalLang, legalPages } from '$lib/legal/pages';
  const LEGAL = legalPages();
  const FAQ = faq();

  /** Aide (lot 14) : questions fréquentes ; textes dans $lib/legal/content.ts (français). */
</script>

<svelte:head><title>{t('app.nom')} — {t('aide.titre')}</title></svelte:head>

<h1>{t('aide.titre')}</h1>
<p>{t('aide.intro')}</p>

{#each FAQ as bloc (bloc.titre)}
  <section class="card" lang={legalLang()}>
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
      <li><a href={resolve('/legal/[page]', { page: k })}><Bidi text={LEGAL[k].titre} /></a></li>
    {/each}
    <li><a href={resolve('/garanties')}>{t('aide.garanties')}</a></li>
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
