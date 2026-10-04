<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { LEGAL_PAGES, type LegalKey } from '$lib/legal/content';
  import { legalLang, legalPages } from '$lib/legal/pages';
  const LEGAL = legalPages();

  /** Pages légales (lot 14) : BROUILLONS à valider par un juriste ; textes dans $lib/legal/content.ts. */
  const key = $derived(page.params.page as LegalKey);
  const doc = $derived(LEGAL_PAGES.includes(key) ? LEGAL[key] : null);
</script>

<svelte:head><title>{t('app.nom')} — {doc?.titre ?? t('legal.titre')}</title></svelte:head>

<nav class="legalnav" aria-label={t('legal.titre')}>
  {#each LEGAL_PAGES as k (k)}
    <a href={resolve('/legal/[page]', { page: k })} aria-current={k === key ? 'page' : undefined}
      ><Bidi text={LEGAL[k].titre} /></a
    >
  {/each}
  <a href={resolve('/aide')}>{t('aide.titre')}</a>
</nav>

{#if doc}
  <article class="card" data-testid="page-legale" lang={legalLang()}>
    <p class="brouillon" role="note">{t('legal.brouillon')}</p>
    <h1><Bidi text={doc.titre} /></h1>
    <p class="muted small"><Bidi text={t('legal.maj', { date: doc.maj })} /></p>
    {#each doc.sections as s (s.titre)}
      <section>
        <h2><Bidi text={s.titre} /></h2>
        {#each s.paras as p, i (i)}<p><Bidi text={p} /></p>{/each}
      </section>
    {/each}
  </article>
{:else}
  <p class="card">{t('legal.introuvable')}</p>
{/if}

<style>
  .legalnav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 8px 0;
  }
  .legalnav a[aria-current='page'] {
    font-weight: 700;
  }
  .brouillon {
    background: var(--warn-bg);
    color: var(--ink);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    font-weight: 600;
  }
  h2 {
    font-size: 1.1rem;
    margin-top: 16px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
